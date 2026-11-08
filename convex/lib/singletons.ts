import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { todayUTC } from "./auth";

export type SingletonKey = "today" | "board" | "delivery";
type Fields = Partial<Omit<Doc<"singletons">, "_id" | "_creationTime" | "key">>;

export async function getSingleton(ctx: QueryCtx, key: SingletonKey) {
  return ctx.db
    .query("singletons")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export async function patchSingleton(ctx: MutationCtx, key: SingletonKey, fields: Fields) {
  const row = await getSingleton(ctx, key);
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("singletons", { key, ...fields });
}

// The current day for queries. Convex caches query results and only re-runs them when
// the data they read changes, so a query that called Date.now() would keep yesterday's
// answer. Reading the day from the database makes every such query refresh when the
// clock cron advances it. Mutations use todayUTC() directly.
export async function storedToday(ctx: QueryCtx): Promise<string> {
  return (await getSingleton(ctx, "today"))?.today ?? todayUTC();
}
