import { internalMutation, query } from "./_generated/server";
import { requireAdmin, todayUTC } from "./lib/auth";
import { recomputeBoard } from "./lib/board";
import { getSingleton, storedToday } from "./lib/singletons";

// Admin header numbers, from counters and the overdue index (never a full scan).
export const admin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const board = await getSingleton(ctx, "board");
    const today = await storedToday(ctx);
    const late = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .collect();
    const delivery = await getSingleton(ctx, "delivery");
    return {
      neighbors: board?.users ?? 0,
      tools: Object.values(board?.toolsByCategory ?? {}).reduce((a, b) => a + b, 0),
      lentOut: board?.lentOut ?? 0,
      late: late.filter((l) => !l.returnReportedAt).length,
      n8nDownSince: delivery?.n8nDown ? (delivery.n8nDownSince ?? null) : null,
    };
  },
});

// Rebuilds counters and per-tool loan state from the raw data.
// Run once after deploying this version on existing data: `npx convex run stats:recompute`
export const recompute = internalMutation({
  args: {},
  handler: async (ctx) => {
    await recomputeBoard(ctx, todayUTC());
  },
});
