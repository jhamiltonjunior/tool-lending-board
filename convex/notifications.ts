// Loan notifications to n8n through a transactional outbox.
//
// 1. The loan mutation inserts an outbox row in the same transaction as the status
//    change, so the event exists if and only if the change was committed.
// 2. A delivery attempt is scheduled right away. If the attempt dies halfway (deploy,
//    restart, timeout), the row is still pending and its lease runs out.
// 3. A cron (crons.ts) picks up every pending row that is due, every minute.
// 4. When n8n is down, a circuit breaker sends a single probe per minute instead of
//    the whole backlog; the first success closes it and flushes the backlog at once.
// 5. After 24 hours without success the row is marked dead and admins can resend it.
//
// Delivery is at least once: the eventKey stays the same across attempts, so the
// write-back to Convex is deduplicated and a real channel can use it as an
// idempotency key.
import { v, ConvexError } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { canonical, requireSecret, sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import { requireAdmin } from "./lib/auth";
import { getSingleton, patchSingleton } from "./lib/singletons";

export const LEASE_MS = 2 * 60_000;
export const REQUEST_TIMEOUT_MS = 30_000;
export const GIVE_UP_AFTER_MS = 24 * 60 * 60_000;
export const BATCH = 50;
const FLUSH_LIMIT = 200;
const backoffMs = (attempts: number) => Math.min(30_000 * 2 ** (attempts - 1), 15 * 60_000);

// Called by the loan mutations, inside their transaction.
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  event: { loanId: Id<"loans">; recipientId: Id<"users">; status: Doc<"loans">["status"]; eventKey: string },
) {
  const now = Date.now();
  const outboxId = await ctx.db.insert("outbox", {
    ...event,
    state: "pending",
    attempts: 0,
    nextAttemptAt: now + LEASE_MS, // leased by the attempt scheduled below
    since: now,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { outboxId });
}

// Data minimisation: n8n only receives what it needs to notify one person.
// No owner/borrower ids, no addresses, no other users' data.
export const loadForDelivery = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.state !== "pending") return { kind: "skip" as const };
    const [loan, recipient] = await Promise.all([ctx.db.get(row.loanId), ctx.db.get(row.recipientId)]);
    if (!loan || !recipient) return { kind: "gone" as const };
    const tool = await ctx.db.get(loan.toolId);
    return {
      kind: "send" as const,
      body: {
        type: "loan.status_changed",
        eventKey: row.eventKey,
        loanId: row.loanId,
        status: row.status,
        recipient: { name: recipient.name, email: recipient.email },
        toolName: tool?.name ?? "a tool",
        startDate: loan.startDate,
        endDate: loan.endDate,
      },
    };
  },
});

export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const job = await ctx.runQuery(internal.notifications.loadForDelivery, { outboxId });
    if (job.kind === "skip") return;
    if (job.kind === "gone") {
      await ctx.runMutation(internal.notifications.recordAttempt, { outboxId, outcome: "gone" });
      return;
    }

    const url = process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
    let outcome: "ok" | "transient" | "permanent" = "ok";
    let error: string | undefined;
    if (!url) {
      outcome = "transient";
      error = "N8N_LOAN_EVENTS_WEBHOOK_URL is not set";
    } else {
      const body = JSON.stringify(job.body);
      const timestamp = String(Date.now());
      const signature = await sign(requireSecret(), canonical(timestamp, "POST", new URL(url).pathname, body));
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
          body,
          // Ends well before the lease, so the cron never re-sends an attempt still in flight.
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          error = `n8n responded ${res.status}`;
          // 4xx means n8n rejected this event (bad signature, bad payload): retrying will not help.
          const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
          outcome = retryable ? "transient" : "permanent";
        }
      } catch (e) {
        outcome = "transient";
        error = e instanceof Error ? e.message : String(e);
      }
    }
    await ctx.runMutation(internal.notifications.recordAttempt, { outboxId, outcome, error });
  },
});

async function markDead(ctx: MutationCtx, row: Doc<"outbox">, attempts: number, reason: string) {
  await ctx.db.patch(row._id, { state: "dead", attempts, lastError: reason });
  // Never fail silently: the failure shows on the loan's activity and in the admin panel.
  await ctx.db.insert("automationEvents", {
    loanId: row.loanId,
    outboxId: row._id,
    eventKey: `${row.eventKey}:dead:${attempts}`,
    kind: "notification_failed",
    detail: `Notification for "${row.status}" failed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${reason}`,
  });
}

export const recordAttempt = internalMutation({
  args: {
    outboxId: v.id("outbox"),
    outcome: v.union(v.literal("ok"), v.literal("transient"), v.literal("permanent"), v.literal("gone")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { outboxId, outcome, error }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.state !== "pending") return;
    const now = Date.now();
    const attempts = row.attempts + 1;
    const circuit = await getSingleton(ctx, "delivery");

    if (outcome === "gone") {
      // The loan or the recipient was deleted in the meantime: nothing to notify.
      await ctx.db.patch(outboxId, { state: "dropped", attempts });
      return;
    }

    if (outcome === "ok") {
      await ctx.db.patch(outboxId, { state: "delivered", attempts, deliveredAt: now, lastError: undefined });
      if (circuit?.n8nDown) {
        // n8n is back: close the circuit and send the backlog now instead of waiting for backoffs.
        await patchSingleton(ctx, "delivery", { n8nDown: false, n8nDownSince: undefined });
        const waiting = await ctx.db
          .query("outbox")
          .withIndex("by_state_next", (q) => q.eq("state", "pending").gt("nextAttemptAt", now + LEASE_MS))
          .take(FLUSH_LIMIT);
        for (const w of waiting) await ctx.db.patch(w._id, { nextAttemptAt: now });
        await ctx.scheduler.runAfter(0, internal.notifications.dispatchDue, {});
      }
      return;
    }

    const reason = error ?? "unknown error";
    if (outcome === "permanent") {
      await markDead(ctx, row, attempts, reason);
      return;
    }
    if (!circuit?.n8nDown) await patchSingleton(ctx, "delivery", { n8nDown: true, n8nDownSince: now });
    if (now - row.since >= GIVE_UP_AFTER_MS) {
      await markDead(ctx, row, attempts, reason);
      return;
    }
    await ctx.db.patch(outboxId, { attempts, lastError: reason, nextAttemptAt: now + backoffMs(attempts) });
  },
});

// The worker, run every minute by crons.ts. Leases each due row before scheduling its
// attempt, so overlapping runs never send the same row twice at the same time.
export const dispatchDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const n8nDown = (await getSingleton(ctx, "delivery"))?.n8nDown ?? false;
    const due = await ctx.db
      .query("outbox")
      .withIndex("by_state_next", (q) => q.eq("state", "pending").lte("nextAttemptAt", now))
      .take(n8nDown ? 1 : BATCH);
    for (const row of due) {
      await ctx.db.patch(row._id, { nextAttemptAt: now + LEASE_MS });
      await ctx.scheduler.runAfter(0, internal.notifications.deliver, { outboxId: row._id });
    }
    return { dispatched: due.length, probing: n8nDown };
  },
});

// Admin: try a dead notification again, with a fresh 24-hour window.
export const resend = mutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(outboxId);
    if (!row) throw new ConvexError("Notification not found");
    if (row.state !== "dead") throw new ConvexError("Only failed notifications can be resent");
    const now = Date.now();
    await ctx.db.patch(outboxId, { state: "pending", since: now, nextAttemptAt: now + LEASE_MS });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { outboxId });
  },
});
