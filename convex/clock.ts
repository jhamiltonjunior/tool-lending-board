import { internalMutation } from "./_generated/server";
import { todayUTC } from "./lib/auth";
import { refreshToolLoan } from "./lib/board";
import { getSingleton, patchSingleton } from "./lib/singletons";

// Runs from crons.ts. Advances the stored day (which refreshes every query that
// depends on it) and hands tools to borrowers whose approved loan starts today.
// Idempotent, so running it often or late is harmless.
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayUTC();
    if ((await getSingleton(ctx, "today"))?.today !== today) await patchSingleton(ctx, "today", { today });

    const started = await ctx.db
      .query("loans")
      .withIndex("by_status_start", (q) => q.eq("status", "approved").lte("startDate", today))
      .collect();
    for (const toolId of new Set(started.map((l) => l.toolId))) await refreshToolLoan(ctx, toolId, today);
  },
});
