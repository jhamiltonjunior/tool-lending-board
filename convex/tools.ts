import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireUser, todayUTC } from "./lib/auth";
import { categories, conditions } from "./schema";

const LIMITS = { name: 80, description: 500 };

function validateTool(input: { name: string; category: string; condition: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > LIMITS.name) throw new ConvexError(`Name must be 1-${LIMITS.name} characters`);
  if (description.length > LIMITS.description)
    throw new ConvexError(`Description must be at most ${LIMITS.description} characters`);
  if (!(categories as readonly string[]).includes(input.category)) throw new ConvexError("Unknown category");
  if (!(conditions as readonly string[]).includes(input.condition)) throw new ConvexError("Unknown condition");
  return { name, description, category: input.category, condition: input.condition };
}

async function isOnLoan(ctx: QueryCtx, toolId: Id<"tools">, today: string): Promise<boolean> {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return loans.some((l) => l.status === "approved" && l.startDate <= today);
}

// Public, unauthenticated: name and category only. No owner, condition or description.
export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUTC();
    const tools = await ctx.db.query("tools").order("desc").take(200);
    const out: { _id: Id<"tools">; name: string; category: string }[] = [];
    for (const t of tools) {
      if (!(await isOnLoan(ctx, t._id, today))) out.push({ _id: t._id, name: t.name, category: t.category });
    }
    return out;
  },
});

async function withOwner(ctx: QueryCtx, t: Doc<"tools">, today: string) {
  const owner = await ctx.db.get(t.ownerId);
  return {
    _id: t._id,
    name: t.name,
    category: t.category,
    condition: t.condition,
    description: t.description,
    ownerId: t.ownerId,
    ownerName: owner?.name ?? "Unknown",
    ownerTrusted: owner?.trustedLender ?? false,
    available: !(await isOnLoan(ctx, t._id, today)),
  };
}

export const list = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, { category }) => {
    await requireUser(ctx);
    const today = todayUTC();
    const tools = category
      ? await ctx.db.query("tools").withIndex("by_category", (q) => q.eq("category", category)).collect()
      : await ctx.db.query("tools").order("desc").collect();
    return Promise.all(tools.map((t) => withOwner(ctx, t, today)));
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const today = todayUTC();
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    return Promise.all(tools.map((t) => withOwner(ctx, t, today)));
  },
});

const toolArgs = {
  name: v.string(),
  category: v.string(),
  condition: v.string(),
  description: v.string(),
};

export const create = mutation({
  args: toolArgs,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", { ownerId: user._id, ...validateTool(args) });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolArgs },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId !== user._id) throw new ConvexError("You can only edit your own listings");
    await ctx.db.patch(toolId, validateTool(args));
  },
});

async function deleteToolAndOpenRequests(ctx: MutationCtx, toolId: Id<"tools">) {
  const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
  if (loans.some((l) => l.status === "approved")) {
    throw new ConvexError("This tool is currently lent out; mark it returned first");
  }
  for (const l of loans) {
    if (l.status === "pending") await ctx.db.patch(l._id, { status: "cancelled" });
  }
  await ctx.db.delete(toolId);
}

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId !== user._id) throw new ConvexError("You can only delete your own listings");
    await deleteToolAndOpenRequests(ctx, toolId);
  },
});

export const adminRemove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    await deleteToolAndOpenRequests(ctx, toolId);
  },
});
