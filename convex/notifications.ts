import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { canonical, requireSecret, sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import { loanStatus } from "./schema";

const MAX_ATTEMPTS = 5;
const backoffMs = (attempt: number) => Math.min(5_000 * 2 ** (attempt - 1), 5 * 60_000);

// Data minimisation: n8n only receives what it needs to notify one person.
// No owner/borrower ids, no addresses, no other users' data.
export const loanEventPayload = internalQuery({
  args: { loanId: v.id("loans"), recipientId: v.id("users") },
  handler: async (ctx, { loanId, recipientId }) => {
    const [loan, recipient] = await Promise.all([ctx.db.get(loanId), ctx.db.get(recipientId)]);
    if (!loan || !recipient) return null;
    const tool = await ctx.db.get(loan.toolId);
    return {
      recipient: { name: recipient.name, email: recipient.email },
      toolName: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

export const sendLoanEvent = internalAction({
  args: {
    loanId: v.id("loans"),
    recipientId: v.id("users"),
    status: loanStatus,
    eventKey: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const url = process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
    if (!url) {
      console.warn("N8N_LOAN_EVENTS_WEBHOOK_URL not set; skipping notification", args.eventKey);
      return;
    }
    const data = await ctx.runQuery(internal.notifications.loanEventPayload, {
      loanId: args.loanId,
      recipientId: args.recipientId,
    });
    if (!data) return; // loan or user was deleted in the meantime: nothing to notify

    const body = JSON.stringify({
      type: "loan.status_changed",
      eventKey: args.eventKey,
      loanId: args.loanId,
      status: args.status,
      ...data,
    });
    const timestamp = String(Date.now());
    const path = new URL(url).pathname;
    const signature = await sign(requireSecret(), canonical(timestamp, "POST", path, body));

    let error: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
        body,
      });
      if (!res.ok) error = `n8n responded ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (!error) return;

    if (args.attempt < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(backoffMs(args.attempt), internal.notifications.sendLoanEvent, {
        ...args,
        attempt: args.attempt + 1,
      });
      return;
    }
    // Never fail silently: the failure shows up on the loan's activity.
    await ctx.runMutation(internal.automation.recordEvent, {
      eventKey: `${args.eventKey}:failed`,
      loanId: args.loanId,
      kind: "notification_failed",
      detail: `Notification for "${args.status}" failed after ${MAX_ATTEMPTS} attempts: ${error}`,
    });
  },
});
