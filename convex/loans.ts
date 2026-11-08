import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireUser, todayUTC } from "./lib/auth";
import { refreshToolLoan } from "./lib/board";
import { storedToday } from "./lib/singletons";
import { enqueueLoanEvent } from "./notifications";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A person's own lists show their most recent loans; older history stays in the database.
const PER_USER_LIMIT = 200;
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

// Notify only the person who needs to act or to know. The event goes to the outbox in
// this same transaction; notifications.ts delivers it and minimises the payload.
async function notify(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  recipient: "owner" | "borrower",
  event: Doc<"outbox">["status"] = loan.status,
) {
  const repeatable = event === "return_reported" || event === "return_disputed";
  await enqueueLoanEvent(ctx, {
    loanId: loan._id,
    recipientId: recipient === "owner" ? loan.ownerId : loan.borrowerId,
    status: event,
    // One key per event, the same across retries, so redeliveries stay idempotent.
    // A return can be reported and disputed more than once, so those keys get a timestamp.
    eventKey: repeatable ? `${loan._id}:${event}:${Date.now()}` : `${loan._id}:${event}`,
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

    const [approved, pending] = await Promise.all(
      (["approved", "pending"] as const).map((status) =>
        ctx.db.query("loans").withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", status)).collect(),
      ),
    );
    if (approved.some((l) => overlaps(l, { startDate, endDate }))) {
      throw new ConvexError("The tool is already lent out for part of that period");
    }
    if (pending.some((l) => l.borrowerId === user._id)) {
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
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "approved"))
      .collect();
    if (approved.some((l) => overlaps(l, loan))) {
      throw new ConvexError("Another approved loan overlaps these dates");
    }
    await ctx.db.patch(loanId, { status: "approved" });
    const owner = await ctx.db.get(loan.ownerId);
    if (owner) await ctx.db.patch(owner._id, { timesLent: (owner.timesLent ?? 0) + 1 });
    await refreshToolLoan(ctx, loan.toolId, todayUTC()); // a loan starting today is out right away
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
    await refreshToolLoan(ctx, loan.toolId, todayUTC());
    await notify(ctx, { ...loan, status: "returned" }, "borrower");
  },
});

// The borrower says the tool is back. The loan stays open until the owner confirms it,
// but overdue reminders stop and the owner is notified.
export const reportReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new ConvexError("Request not found");
    if (loan.borrowerId !== user._id) throw new ConvexError("Only the borrower can report a return");
    if (loan.status !== "approved" || loan.startDate > todayUTC()) {
      throw new ConvexError("Only a tool you have right now can be reported as returned");
    }
    if (loan.returnReportedAt) throw new ConvexError("You already reported this return");
    await ctx.db.patch(loanId, { returnReportedAt: Date.now() });
    await notify(ctx, loan, "owner", "return_reported");
  },
});

// The owner did not get it back: the loan is open again and reminders resume.
export const disputeReturn = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadForOwner(ctx, loanId);
    if (loan.status !== "approved" || !loan.returnReportedAt) {
      throw new ConvexError("There is no reported return to dispute");
    }
    await ctx.db.patch(loanId, { returnReportedAt: undefined });
    await notify(ctx, loan, "borrower", "return_disputed");
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

async function present(ctx: QueryCtx, loan: Doc<"loans">, today: string) {
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
    toolCategory: tool?.category ?? "other",
    // approved but not started yet vs. already with the borrower
    started: loan.startDate <= today,
    ownerName: owner?.name ?? "Unknown",
    ownerTrusted: owner?.trustedLender ?? false,
    borrowerName: borrower?.name ?? "Unknown",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && !loan.returnReportedAt && loan.endDate < today,
    returnReported: loan.status === "approved" && loan.returnReportedAt !== undefined,
    lastActivity: lastActivity
      ? { kind: lastActivity.kind, at: lastActivity._creationTime, detail: lastActivity.detail }
      : null,
  };
}

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(PER_USER_LIMIT);
    const today = await storedToday(ctx);
    return Promise.all(loans.map((l) => present(ctx, l, today)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(PER_USER_LIMIT);
    const today = await storedToday(ctx);
    return Promise.all(loans.map((l) => present(ctx, l, today)));
  },
});

// Admin view of every loan, one page at a time.
export const all = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("loans").order("desc").paginate(paginationOpts);
    const today = await storedToday(ctx);
    return { ...page, page: await Promise.all(page.page.map((l) => present(ctx, l, today))) };
  },
});
