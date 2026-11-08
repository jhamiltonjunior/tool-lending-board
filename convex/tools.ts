import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireUser } from "./lib/auth";
import { bumpCategory } from "./lib/board";
import { getSingleton } from "./lib/singletons";
import { categories, conditions } from "./schema";

const LIMITS = { name: 80, description: 500 };
const PUBLIC_LIMIT = 50;

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

// Public, unauthenticated: name and category only. No owner, condition or description.
// Reads no identity, so Convex serves one cached result to every visitor.
export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_lent", (q) => q.eq("lentUntil", undefined))
      .order("desc")
      .take(PUBLIC_LIMIT);
    return tools.map((t) => ({ _id: t._id, name: t.name, category: t.category }));
  },
});

async function withOwner(ctx: QueryCtx, t: Doc<"tools">, viewerId: Id<"users">) {
  const byStatus = (status: "approved" | "pending") =>
    ctx.db.query("loans").withIndex("by_tool_status", (q) => q.eq("toolId", t._id).eq("status", status)).collect();
  const [owner, approved, pending] = await Promise.all([ctx.db.get(t.ownerId), byStatus("approved"), byStatus("pending")]);
  const mine = pending.find((l) => l.borrowerId === viewerId);
  return {
    _id: t._id,
    name: t.name,
    category: t.category,
    condition: t.condition,
    description: t.description,
    ownerId: t.ownerId,
    ownerName: owner?.name ?? "Unknown",
    ownerTrusted: owner?.trustedLender ?? false,
    ownerTimesLent: owner?.timesLent ?? 0,
    available: t.activeLoanId === undefined,
    // When the tool is due back (YYYY-MM-DD), only while it is lent out.
    backOn: t.lentUntil ?? null,
    // Approved loans still open, so borrowers can pick free dates up front.
    booked: approved
      .map((l) => ({ startDate: l.startDate, endDate: l.endDate }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    // The viewer's own pending request, so the board keeps showing it after a reload.
    myRequest: mine ? { startDate: mine.startDate, endDate: mine.endDate } : null,
  };
}

// The board, one page at a time. Search runs on the server (full-text index on the
// name, prefix-matched), optionally narrowed to one category.
export const list = query({
  args: { paginationOpts: paginationOptsValidator, category: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, { paginationOpts, category, search }) => {
    const user = await requireUser(ctx);
    const term = search?.trim().slice(0, 80);
    const page = term
      ? await ctx.db
          .query("tools")
          .withSearchIndex("search_name", (q) => {
            const s = q.search("name", term);
            return category ? s.eq("category", category) : s;
          })
          .paginate(paginationOpts)
      : category
        ? await ctx.db
            .query("tools")
            .withIndex("by_category", (q) => q.eq("category", category))
            .order("desc")
            .paginate(paginationOpts)
        : await ctx.db.query("tools").order("desc").paginate(paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((t) => withOwner(ctx, t, user._id))) };
  },
});

// Header numbers for the board, from counters instead of counting tools.
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const board = await getSingleton(ctx, "board");
    const byCategory = board?.toolsByCategory ?? {};
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    return { total, free: Math.max(0, total - (board?.lentOut ?? 0)), byCategory };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    return Promise.all(tools.map((t) => withOwner(ctx, t, user._id)));
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
    const tool = validateTool(args);
    await bumpCategory(ctx, tool.category, 1);
    return await ctx.db.insert("tools", { ownerId: user._id, ...tool });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolArgs },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId !== user._id) throw new ConvexError("You can only edit your own listings");
    const next = validateTool(args);
    if (next.category !== tool.category) {
      await bumpCategory(ctx, tool.category, -1);
      await bumpCategory(ctx, next.category, 1);
    }
    await ctx.db.patch(toolId, next);
  },
});

async function deleteToolAndOpenRequests(ctx: MutationCtx, tool: Doc<"tools">) {
  const byStatus = (status: "approved" | "pending") =>
    ctx.db.query("loans").withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", status)).collect();
  if ((await byStatus("approved")).length > 0) {
    throw new ConvexError("This tool is currently lent out; mark it returned first");
  }
  for (const l of await byStatus("pending")) await ctx.db.patch(l._id, { status: "cancelled" });
  await bumpCategory(ctx, tool.category, -1);
  await ctx.db.delete(tool._id);
}

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    if (tool.ownerId !== user._id) throw new ConvexError("You can only delete your own listings");
    await deleteToolAndOpenRequests(ctx, tool);
  },
});

export const adminRemove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found");
    await deleteToolAndOpenRequests(ctx, tool);
  },
});
