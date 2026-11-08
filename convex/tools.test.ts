import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ADMIN_EMAIL, createTool, day, firstPage, insertLoan, lend, setup, signIn } from "./test.helpers";

beforeEach(() => vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL));
afterEach(() => vi.unstubAllEnvs());

describe("public list", () => {
  it("shows only name and category, and hides tools that are with a borrower", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const drill = await createTool(ana.as, "Cordless drill");
    const tent = await createTool(ana.as, "Tent");
    await lend(ana, bob, tent, day(0), day(2));

    const list = await t.query(api.tools.publicList, {});
    expect(list).toEqual([{ _id: drill, name: "Cordless drill", category: "power tools" }]);
  });
});

describe("signed-in list", () => {
  it("requires sign-in", async () => {
    const t = setup();
    await expect(t.query(api.tools.list, firstPage())).rejects.toThrow(/Not signed in/);
  });

  it("shows when a lent tool comes back", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const tent = await createTool(ana.as, "Tent");
    await lend(ana, bob, tent, day(0), day(3));

    const [tool] = (await bob.as.query(api.tools.list, firstPage())).page;
    expect(tool).toMatchObject({ available: false, backOn: day(3), ownerName: "Ana", ownerTimesLent: 1 });
  });
});

describe("creating and editing listings", () => {
  it("validates name, category and condition", async () => {
    const t = setup();
    const { as } = await signIn(t, "Ana");
    const base = { name: "Drill", category: "power tools", condition: "good", description: "" };

    await expect(as.mutation(api.tools.create, { ...base, name: "   " })).rejects.toThrow(/Name must be/);
    await expect(as.mutation(api.tools.create, { ...base, name: "x".repeat(81) })).rejects.toThrow(/Name must be/);
    await expect(as.mutation(api.tools.create, { ...base, category: "weapons" })).rejects.toThrow(/Unknown category/);
    await expect(as.mutation(api.tools.create, { ...base, condition: "broken" })).rejects.toThrow(/Unknown condition/);
    await expect(as.mutation(api.tools.create, { ...base, description: "x".repeat(501) })).rejects.toThrow(
      /Description must be/,
    );
  });

  it("anonymous visitors cannot create listings", async () => {
    const t = setup();
    await expect(
      t.mutation(api.tools.create, { name: "Drill", category: "power tools", condition: "good", description: "" }),
    ).rejects.toThrow(/Not signed in/);
  });

  it("only the owner can edit or delete a listing", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await createTool(ana.as);
    const edit = { toolId, name: "Hacked", category: "other", condition: "worn", description: "" };

    await expect(bob.as.mutation(api.tools.update, edit)).rejects.toThrow(/your own listings/);
    await expect(bob.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/your own listings/);

    await ana.as.mutation(api.tools.update, { ...edit, name: "Drill v2" });
    expect((await ana.as.query(api.tools.mine, {}))[0]).toMatchObject({ name: "Drill v2" });
    await ana.as.mutation(api.tools.remove, { toolId });
    expect(await ana.as.query(api.tools.mine, {})).toHaveLength(0);
  });

  it("deleting a tool cancels its pending requests, but not while it is lent out", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await createTool(ana.as);
    const loan = { toolId, ownerId: ana.id, borrowerId: bob.id, startDate: day(1), endDate: day(2) };

    const approved = await insertLoan(t, { ...loan, status: "approved" });
    await expect(ana.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/currently lent out/);

    await t.run((ctx) => ctx.db.patch(approved, { status: "returned" }));
    const pending = await insertLoan(t, { ...loan, status: "pending" });
    await ana.as.mutation(api.tools.remove, { toolId });
    expect(await t.run((ctx) => ctx.db.get(pending))).toMatchObject({ status: "cancelled" });
  });
});

describe("admin removal", () => {
  it("only admins can remove someone else's listing", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const admin = await signIn(t, "Admin", ADMIN_EMAIL);
    const toolId = await createTool(ana.as);

    await expect(bob.as.mutation(api.tools.adminRemove, { toolId })).rejects.toThrow(/Admins only/);
    await admin.as.mutation(api.tools.adminRemove, { toolId });
    expect(await t.query(api.tools.publicList, {})).toHaveLength(0);
  });

  it("admins cannot edit other people's listings either", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const admin = await signIn(t, "Admin", ADMIN_EMAIL);
    const toolId = await createTool(ana.as);
    await expect(
      admin.as.mutation(api.tools.update, { toolId, name: "x", category: "other", condition: "good", description: "" }),
    ).rejects.toThrow(/your own listings/);
  });
});

describe("board pages, search and counters", () => {
  async function board() {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const create = (name: string, category: string) =>
      ana.as.mutation(api.tools.create, { name, category, condition: "good", description: "" });
    const drill = await create("Cordless drill", "power tools");
    const sander = await create("Orbital sander", "power tools");
    const tent = await create("Tent for 4", "camping");
    return { t, ana, bob, drill, sander, tent };
  }

  it("caps the page size on the server", async () => {
    const { t, bob } = await board();
    await t.run(async (ctx) => {
      const owner = (await ctx.db.query("users").collect()).find((u) => u.name === "Ana")!;
      for (let i = 0; i < 110; i++) {
        await ctx.db.insert("tools", { ownerId: owner._id, name: `Tool ${i}`, category: "other", condition: "good", description: "" });
      }
    });
    const page = await bob.as.query(api.tools.list, firstPage(100_000));
    expect(page.page).toHaveLength(100);
    expect(page.isDone).toBe(false);
  });

  it("pages through the board", async () => {
    const { bob } = await board();
    const first = await bob.as.query(api.tools.list, firstPage(2));
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const rest = await bob.as.query(api.tools.list, { paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(rest.page).toHaveLength(1);
    expect(rest.isDone).toBe(true);
  });

  it("searches by name on the server, optionally within a category", async () => {
    const { bob } = await board();
    const names = async (args: { search?: string; category?: string }) =>
      (await bob.as.query(api.tools.list, { ...firstPage(), ...args })).page.map((t) => t.name).sort();

    expect(await names({ search: "drill" })).toEqual(["Cordless drill"]);
    expect(await names({ search: "tent", category: "power tools" })).toEqual([]);
    expect(await names({ category: "power tools" })).toEqual(["Cordless drill", "Orbital sander"]);
  });

  it("keeps the header counters in step with every change", async () => {
    const { t, ana, bob, drill, tent } = await board();
    const stats = () => bob.as.query(api.tools.stats, {});
    expect(await stats()).toEqual({ total: 3, free: 3, byCategory: { "power tools": 2, camping: 1 } });

    await ana.as.mutation(api.tools.update, { toolId: tent, name: "Tent", category: "other", condition: "good", description: "" });
    await lend(ana, bob, drill, day(0), day(2));
    expect(await stats()).toEqual({ total: 3, free: 2, byCategory: { "power tools": 2, camping: 0, other: 1 } });

    // Rebuilding from raw data gives the same numbers as the incremental updates.
    const before = await stats();
    await t.mutation(internal.stats.recompute, {});
    expect(await stats()).toMatchObject({ total: before.total, free: before.free });
  });

  it("shows booked dates and the viewer's own pending request", async () => {
    const { t, ana, bob, drill } = await board();
    const carla = await signIn(t, "Carla");
    await lend(ana, bob, drill, day(3), day(5));
    await carla.as.mutation(api.loans.request, { toolId: drill, startDate: day(7), endDate: day(8) });

    const seen = async (who: typeof bob) =>
      (await who.as.query(api.tools.list, firstPage())).page.find((x) => x._id === drill)!;
    expect(await seen(carla)).toMatchObject({
      booked: [{ startDate: day(3), endDate: day(5) }],
      myRequest: { startDate: day(7), endDate: day(8) },
    });
    // Other people's pending requests are not shown, and they don't block dates.
    expect(await seen(bob)).toMatchObject({ myRequest: null });
  });

  it("counts how many times an owner has lent", async () => {
    const { ana, bob, drill, tent } = await board();
    await lend(ana, bob, drill, day(0), day(1));
    await lend(ana, bob, tent, day(2), day(3));
    const tools = (await bob.as.query(api.tools.list, firstPage())).page;
    expect(tools.every((t) => t.ownerTimesLent === 2)).toBe(true);
  });
});
