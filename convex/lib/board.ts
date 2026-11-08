// Denormalized board state, kept in step by the mutations that change it so that
// list queries read one document per tool instead of scanning loans.
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getSingleton, patchSingleton } from "./singletons";

async function counters(ctx: MutationCtx) {
  const row = await getSingleton(ctx, "board");
  return { users: row?.users ?? 0, lentOut: row?.lentOut ?? 0, toolsByCategory: row?.toolsByCategory ?? {} };
}

export async function bumpUsers(ctx: MutationCtx, delta: number) {
  const c = await counters(ctx);
  await patchSingleton(ctx, "board", { users: Math.max(0, c.users + delta) });
}

export async function bumpCategory(ctx: MutationCtx, category: string, delta: number) {
  const c = await counters(ctx);
  const next = Math.max(0, (c.toolsByCategory[category] ?? 0) + delta);
  await patchSingleton(ctx, "board", { toolsByCategory: { ...c.toolsByCategory, [category]: next } });
}

async function bumpLentOut(ctx: MutationCtx, delta: number) {
  const c = await counters(ctx);
  await patchSingleton(ctx, "board", { lentOut: Math.max(0, c.lentOut + delta) });
}

// Points the tool at the loan it is currently out on, or clears it. The loan that
// counts is the earliest approved one that has started: if a borrower is late, the
// next borrower's loan does not take over until the tool comes back.
export async function refreshToolLoan(ctx: MutationCtx, toolId: Id<"tools">, today: string) {
  const tool = await ctx.db.get(toolId);
  if (!tool) return;
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  const active = approved
    .filter((l) => l.startDate <= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  if (tool.activeLoanId === active?._id && tool.lentUntil === active?.endDate) return;
  await ctx.db.patch(toolId, { activeLoanId: active?._id, lentUntil: active?.endDate });
  const was = tool.activeLoanId !== undefined;
  const is = active !== undefined;
  if (was !== is) await bumpLentOut(ctx, is ? 1 : -1);
}

// Rebuilds every counter from scratch: used by the seed and as a repair or migration tool.
export async function recomputeBoard(ctx: MutationCtx, today: string) {
  const users = await ctx.db.query("users").collect();
  const tools = await ctx.db.query("tools").collect();
  const loans = await ctx.db.query("loans").collect();

  const toolsByCategory: Record<string, number> = {};
  for (const t of tools) toolsByCategory[t.category] = (toolsByCategory[t.category] ?? 0) + 1;

  const lent = new Map<string, number>();
  for (const l of loans) {
    if (l.status === "approved" || l.status === "returned") lent.set(l.ownerId, (lent.get(l.ownerId) ?? 0) + 1);
  }
  for (const u of users) {
    const timesLent = lent.get(u._id) ?? 0;
    if (u.timesLent !== timesLent) await ctx.db.patch(u._id, { timesLent });
  }

  await patchSingleton(ctx, "board", { users: users.length, lentOut: 0, toolsByCategory });
  for (const t of tools) {
    await ctx.db.patch(t._id, { activeLoanId: undefined, lentUntil: undefined });
    await refreshToolLoan(ctx, t._id, today);
  }
}
