import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const SEED_PREFIX = "seed|";

const NEIGHBORS = [
  { key: "ana", name: "Ana Souza", email: "ana.souza@example.com", trusted: true },
  { key: "marcos", name: "Marcos Lima", email: "marcos.lima@example.com", trusted: false },
  { key: "julia", name: "Júlia Reis", email: "julia.reis@example.com", trusted: false },
  { key: "carla", name: "Carla Nunes", email: "carla.nunes@example.com", trusted: false },
  { key: "rafael", name: "Rafael Dias", email: "rafael.dias@example.com", trusted: true },
] as const;

const TOOLS = [
  { owner: "ana", name: "Cordless drill", category: "power tools", condition: "good", description: "18V, two batteries and a charger." },
  { owner: "ana", name: "Tent for 4", category: "camping", condition: "fair", description: "The rainfly has a small patch." },
  { owner: "marcos", name: "Extension ladder, 6 m", category: "other", condition: "good", description: "Aluminum, takes two to carry." },
  { owner: "julia", name: "Pressure washer", category: "cleaning", condition: "good", description: "1,800 W, hose and two nozzles." },
  { owner: "marcos", name: "Hedge trimmer", category: "garden", condition: "good", description: "Electric, 10 m cord." },
  { owner: "carla", name: "Stand mixer", category: "kitchen", condition: "new", description: "Dough hook, whisk and paddle." },
  { owner: "rafael", name: "Claw hammer and nails", category: "hand tools", condition: "good", description: "Mixed nails, 20 to 75 mm." },
] as const;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function clearSeed(ctx: MutationCtx) {
  const users = (await ctx.db.query("users").collect()).filter((u) => u.tokenIdentifier.startsWith(SEED_PREFIX));
  const ids = new Set(users.map((u) => u._id as string));
  for (const loan of await ctx.db.query("loans").collect()) {
    if (ids.has(loan.ownerId) || ids.has(loan.borrowerId)) {
      for (const r of await ctx.db.query("reminders").withIndex("by_loan", (q) => q.eq("loanId", loan._id)).collect()) await ctx.db.delete(r._id);
      for (const e of await ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loan._id)).collect()) await ctx.db.delete(e._id);
      await ctx.db.delete(loan._id);
    }
  }
  for (const tool of await ctx.db.query("tools").collect()) if (ids.has(tool.ownerId)) await ctx.db.delete(tool._id);
  for (const u of users) await ctx.db.delete(u._id);
}

// Demo neighborhood for local testing. Idempotent: it replaces previous demo data.
// Includes one tool lent out, one overdue loan (for the reminder workflow), a pending
// request and some history. Internal only: `npx convex run seed:demo`.
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clearSeed(ctx);
    const user: Record<string, Id<"users">> = {};
    for (const n of NEIGHBORS) {
      user[n.key] = await ctx.db.insert("users", {
        tokenIdentifier: `${SEED_PREFIX}${n.key}`,
        name: n.name,
        email: n.email,
        role: "user",
        trustedLender: n.trusted,
      });
    }
    const tool: Record<string, Id<"tools">> = {};
    for (const t of TOOLS) {
      tool[t.name] = await ctx.db.insert("tools", {
        ownerId: user[t.owner],
        name: t.name,
        category: t.category,
        condition: t.condition,
        description: t.description,
      });
    }
    const loan = (name: string, owner: string, borrower: string, start: number, end: number, status: "pending" | "approved" | "returned") =>
      ctx.db.insert("loans", {
        toolId: tool[name],
        ownerId: user[owner],
        borrowerId: user[borrower],
        startDate: day(start),
        endDate: day(end),
        status,
        ...(status === "returned" ? { returnedAt: Date.now() + end * 86_400_000 } : {}),
      });

    await loan("Tent for 4", "ana", "carla", -3, 4, "approved"); // lent out, back in 4 days
    const overdue = await loan("Hedge trimmer", "marcos", "julia", -9, -2, "approved"); // 2 days late
    await loan("Cordless drill", "ana", "rafael", 2, 4, "pending");
    await loan("Cordless drill", "ana", "marcos", -30, -27, "returned");
    await loan("Cordless drill", "ana", "julia", -20, -18, "returned");
    await loan("Claw hammer and nails", "rafael", "ana", -15, -14, "returned");
    return { overdueLoanId: overdue };
  },
});

// Removes every demo user with their tools, loans, reminders and events.
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clearSeed(ctx);
  },
});
