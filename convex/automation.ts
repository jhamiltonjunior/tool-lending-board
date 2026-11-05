import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const PROBLEM_KINDS = new Set(["workflow_error", "notification_failed", "reminder_failed"]);

// Admin view of failed automation runs, so nothing fails silently.
export const recentProblems = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const events = await ctx.db.query("automationEvents").order("desc").take(300);
    return events
      .filter((e) => PROBLEM_KINDS.has(e.kind))
      .slice(0, 20)
      .map((e) => ({ _id: e._id, kind: e.kind, detail: e.detail, at: e._creationTime }));
  },
});

// Overdue = approved (tool is with the borrower) and the end date has passed.
// Only the fields needed to send one reminder leave Convex.
export const overdueLoans = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .collect();
    const out = [];
    for (const loan of loans) {
      const key = `${loan._id}:${today}`;
      const already = await ctx.db.query("reminders").withIndex("by_key", (q) => q.eq("idempotencyKey", key)).unique();
      if (already?.status === "sent") continue; // already reminded today
      const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
      if (!borrower) continue;
      out.push({
        loanId: loan._id,
        idempotencyKey: key,
        toolName: tool?.name ?? "a tool",
        endDate: loan.endDate,
        borrower: { name: borrower.name, email: borrower.email },
      });
    }
    return out;
  },
});

// Idempotent write-back: the same (loan, day) key never creates a second row,
// so n8n retries and re-runs of the schedule are safe.
export const recordReminder = internalMutation({
  args: {
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return { ok: false as const, reason: "unknown_loan" };
    if (!args.idempotencyKey.startsWith(`${args.loanId}:`)) return { ok: false as const, reason: "key_mismatch" };

    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    const day = args.idempotencyKey.slice(args.loanId.length + 1);
    if (existing) {
      // A failed attempt may later succeed; a success is never downgraded.
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch(existing._id, { status: "sent", channel: args.channel });
      } else {
        return { ok: true as const, duplicate: true };
      }
    } else {
      await ctx.db.insert("reminders", {
        loanId: args.loanId,
        day,
        idempotencyKey: args.idempotencyKey,
        status: args.status,
        channel: args.channel,
      });
    }

    const eventKey = `reminder:${args.idempotencyKey}:${args.status}`;
    const seen = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("eventKey", eventKey)).unique();
    if (!seen) {
      await ctx.db.insert("automationEvents", {
        loanId: args.loanId,
        eventKey,
        kind: args.status === "sent" ? "reminder_sent" : "reminder_failed",
        detail: `Overdue reminder ${args.status} via ${args.channel} (${day})`,
      });
    }
    return { ok: true as const, duplicate: false };
  },
});

export const recordEvent = internalMutation({
  args: {
    eventKey: v.string(),
    loanId: v.optional(v.id("loans")),
    kind: v.union(
      v.literal("notification_sent"),
      v.literal("notification_failed"),
      v.literal("workflow_error"),
    ),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("eventKey", args.eventKey)).unique();
    if (existing) return { ok: true as const, duplicate: true };
    if (args.loanId && !(await ctx.db.get(args.loanId))) return { ok: false as const, reason: "unknown_loan" };
    await ctx.db.insert("automationEvents", args);
    return { ok: true as const, duplicate: false };
  },
});
