import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { currentUser, requireAdmin } from "./lib/auth";
import { bumpUsers } from "./lib/board";

// Clerk sends updated_at in seconds in tokens and in milliseconds in its API.
function toMs(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

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
    // Never derive a display name from the email: other neighbors see this name.
    const name = identity.name?.trim() || identity.nickname?.trim() || "Neighbor";
    const tokenProfileAt = toMs(identity.updatedAt);
    const existing = await currentUser(ctx);
    if (existing) {
      const patch: Record<string, unknown> = {};
      // Session tokens can be up to an hour old: only take their name if it is not older
      // than what refreshProfile already stored.
      const newer = (tokenProfileAt ?? 0) >= (existing.profileUpdatedAt ?? 0);
      if (newer && existing.name !== name) {
        patch.name = name;
        if (tokenProfileAt) patch.profileUpdatedAt = tokenProfileAt;
      }
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
      ...(tokenProfileAt ? { profileUpdatedAt: tokenProfileAt } : {}),
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

// A rename in Clerk only reaches session tokens when they are reissued (up to an hour
// with the current template). This reads the profile straight from Clerk's API with the
// server-side secret, so the new name shows up at once. The browser only triggers it:
// the data never comes from the client.
export const refreshProfile = action({
  args: {},
  handler: async (ctx): Promise<{ updated: boolean; reason?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { updated: false, reason: "CLERK_SECRET_KEY is not set" };
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(identity.subject)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { updated: false, reason: `Clerk responded ${res.status}` };
    const user = (await res.json()) as {
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
      updated_at?: number;
    };
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username?.trim() || "Neighbor";
    await ctx.runMutation(internal.users.applyProfile, {
      tokenIdentifier: identity.tokenIdentifier,
      name: name.slice(0, 80),
      profileUpdatedAt: toMs(user.updated_at) ?? Date.now(),
    });
    return { updated: true };
  },
});

export const applyProfile = internalMutation({
  args: { tokenIdentifier: v.string(), name: v.string(), profileUpdatedAt: v.number() },
  handler: async (ctx, { tokenIdentifier, name, profileUpdatedAt }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!user || (user.profileUpdatedAt ?? 0) > profileUpdatedAt) return;
    await ctx.db.patch(user._id, { name, profileUpdatedAt });
  },
});
