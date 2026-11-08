import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { currentUser, requireAdmin } from "./lib/auth";
import { bumpUsers } from "./lib/board";

function isBootstrapAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// Called by the client after sign-in. The role is never taken from the client:
// it comes from ADMIN_EMAILS (Convex env) or from an admin promotion.
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");
    const email = identity.email ?? "";
    const name = identity.name ?? identity.nickname ?? email.split("@")[0] ?? "Neighbor";
    const existing = await currentUser(ctx);
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (existing.name !== name) patch.name = name;
      if (existing.email !== email) patch.email = email;
      if (existing.role !== "admin" && isBootstrapAdmin(email)) patch.role = "admin";
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    await bumpUsers(ctx, 1);
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: isBootstrapAdmin(email) ? "admin" : "user",
      trustedLender: false,
      timesLent: 0,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

export const listForAdmin = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("users").order("desc").paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        trustedLender: u.trustedLender,
      })),
    };
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

// Operator-only escape hatch: `npx convex run users:setRole '{"email":"...","role":"admin"}'`
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new ConvexError("User not found; they must sign in once first");
    await ctx.db.patch(user._id, { role });
  },
});
