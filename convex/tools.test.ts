import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { ADMIN_EMAIL, createTool, day, insertLoan, setup, signIn } from "./test.helpers";

beforeEach(() => vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL));
afterEach(() => vi.unstubAllEnvs());

describe("public list", () => {
  it("shows only name and category, and hides tools that are with a borrower", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const drill = await createTool(ana.as, "Cordless drill");
    const tent = await createTool(ana.as, "Tent");
    await insertLoan(t, {
      toolId: tent,
      ownerId: ana.id,
      borrowerId: bob.id,
      startDate: day(-1),
      endDate: day(2),
      status: "approved",
    });

    const list = await t.query(api.tools.publicList, {});
    expect(list).toEqual([{ _id: drill, name: "Cordless drill", category: "power tools" }]);
  });
});

describe("signed-in list", () => {
  it("requires sign-in", async () => {
    const t = setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/Not signed in/);
  });

  it("shows when a lent tool comes back", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const tent = await createTool(ana.as, "Tent");
    await insertLoan(t, {
      toolId: tent,
      ownerId: ana.id,
      borrowerId: bob.id,
      startDate: day(-1),
      endDate: day(3),
      status: "approved",
    });

    const [tool] = await bob.as.query(api.tools.list, {});
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
