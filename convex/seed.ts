import { internalMutation } from "./_generated/server";

// Demo data for local testing, including one overdue loan so the reminder
// workflow has something to do. Internal only: `npx convex run seed:demo`.
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const ana = await ctx.db.insert("users", {
      tokenIdentifier: "seed|ana",
      name: "Ana (demo)",
      email: "ana@example.com",
      role: "user",
      trustedLender: true,
    });
    const bruno = await ctx.db.insert("users", {
      tokenIdentifier: "seed|bruno",
      name: "Bruno (demo)",
      email: "bruno@example.com",
      role: "user",
      trustedLender: false,
    });
    const drill = await ctx.db.insert("tools", {
      ownerId: ana,
      name: "Cordless drill",
      category: "power tools",
      condition: "good",
      description: "18V, two batteries.",
    });
    await ctx.db.insert("tools", {
      ownerId: ana,
      name: "Camping tent (4p)",
      category: "camping",
      condition: "fair",
      description: "",
    });
    const overdue = await ctx.db.insert("loans", {
      toolId: drill,
      ownerId: ana,
      borrowerId: bruno,
      startDate: day(-7),
      endDate: day(-2),
      status: "approved",
    });
    return { overdueLoanId: overdue };
  },
});
