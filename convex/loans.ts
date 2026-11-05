import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdmin, requireUser, todayUTC } from "./lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOAN_DAYS = 60;

function validateRange(startDate: string, endDate: string) {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) throw new ConvexError("Dates must be YYYY-MM-DD");
  if (startDate < todayUTC()) throw new ConvexError("Start date cannot be in the past");
  if (endDate < startDate) throw new ConvexError("End date must be on or after the start date");
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
  if (days > MAX_LOAN_DAYS) throw new ConvexError(`Loans are limited to ${MAX_LOAN_DAYS} days`);
}

const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;

// Notify only the person who needs to act or to know. The payload is minimised in
// notifications.ts; here we only decide who the recipient is.
async function notify(ctx: MutationCtx, loan: Doc<"loans">, recipient: "owner" | "borrower") {
  await ctx.scheduler.runAfter(0, internal.notifications.sendLoanEvent, {
    loanId: loan._id,
    recipientId: recipient === "owner" ? loan.ownerId : loan.borrowerId,
    status: loan.status,
    // Unique per state change so n8n write-backs and redeliveries stay idempotent.
    eventKey: `${loan._id}:${loan.status}:${Date.now()}`,
    attempt: 1,
  });
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    validateRange(startDate, endDate);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId === user._id) throw new ConvexError("You cannot borrow your own tool");

    const existing = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
    if (existing.some((l) => l.status === "approved" && overlaps(l, { startDate, endDate }))) {
      throw new ConvexError("The tool is already lent out for part of that period");
    }
    if (existing.some((l) => l.status === "pending" && l.borrowerId === user._id)) {
      throw new ConvexError("You already have a pending request for this tool");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
    });
    await notify(ctx, (await ctx.db.get(loanId))!, "owner");
    return loanId;
  },
});

async function loadForOwner(ctx: MutationCtx, loanId: Id<"loans">) {
  const user = await requireUser(ctx);
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("Request not found");
  if (loan.ownerId !== user._id) throw new ConvexError("Only the tool owner can do this");
  return loan;
}

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadForOwner(ctx, loanId);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be approved");
    const others = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", loan.toolId)).collect();
    if (others.some((l) => l._id !== loan._id && l.status === "approved" && overlaps(l, loan))) {
      throw new ConvexError("Another approved loan overlaps these dates");
    }
    await ctx.db.patch(loanId, { status: "approved" });
    await notify(ctx, { ...loan, status: "approved" }, "borrower");
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadForOwner(ctx, loanId);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be declined");
    await ctx.db.patch(loanId, { status: "declined" });
    await notify(ctx, { ...loan, status: "declined" }, "borrower");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadForOwner(ctx, loanId);
    if (loan.status !== "approved") throw new ConvexError("Only active loans can be marked returned");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await notify(ctx, { ...loan, status: "returned" }, "borrower");
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Request not found");
    if (loan.borrowerId !== user._id) throw new ConvexError("Only the borrower can cancel a request");
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be cancelled");
    await ctx.db.patch(loanId, { status: "cancelled" });
    await notify(ctx, { ...loan, status: "cancelled" }, "owner");
  },
});

async function present(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, owner, borrower, events] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
    ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loan._id)).collect(),
  ]);
  const lastActivity = events.sort((a, b) => b._creationTime - a._creationTime)[0];
  return {
    _id: loan._id,
    toolName: tool?.name ?? "(removed tool)",
    ownerName: owner?.name ?? "Unknown",
    ownerTrusted: owner?.trustedLender ?? false,
    borrowerName: borrower?.name ?? "Unknown",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < todayUTC(),
    lastActivity: lastActivity
      ? { kind: lastActivity.kind, at: lastActivity._creationTime, detail: lastActivity.detail }
      : null,
  };
}

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).order("desc").collect();
    return Promise.all(loans.map((l) => present(ctx, l)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).order("desc").collect();
    return Promise.all(loans.map((l) => present(ctx, l)));
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(500);
    return Promise.all(loans.map((l) => present(ctx, l)));
  },
});
