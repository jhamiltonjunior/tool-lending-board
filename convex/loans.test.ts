import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ADMIN_EMAIL, createTool, day, firstPage, setup, signIn, type T } from "./test.helpers";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  // No n8n URL in these tests: silence the "skipping notification" warning.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function world() {
  const t = setup();
  const owner = await signIn(t, "Ana");
  const borrower = await signIn(t, "Bob");
  const toolId = await createTool(owner.as);
  return { t, owner, borrower, toolId };
}

// Notifications go to the outbox in the same transaction: inspect what was queued.
async function scheduledNotifications(t: T): Promise<{ recipientId: Id<"users">; status: string }[]> {
  return t.run((ctx) => ctx.db.query("outbox").collect());
}

describe("requesting a tool", () => {
  it("rejects invalid date ranges", async () => {
    const { borrower, toolId } = await world();
    const req = (startDate: string, endDate: string) =>
      borrower.as.mutation(api.loans.request, { toolId, startDate, endDate });

    await expect(req("2026/01/01", day(2))).rejects.toThrow(/YYYY-MM-DD/);
    await expect(req(day(-1), day(2))).rejects.toThrow(/in the past/);
    await expect(req(day(3), day(2))).rejects.toThrow(/on or after/);
    await expect(req(day(1), day(62))).rejects.toThrow(/limited to 60 days/);
    await expect(req(day(400), day(401))).rejects.toThrow(/at most 365 days ahead/);
  });

  it("owners cannot borrow their own tool", async () => {
    const { owner, toolId } = await world();
    await expect(
      owner.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) }),
    ).rejects.toThrow(/your own tool/);
  });

  it("blocks a second pending request from the same borrower", async () => {
    const { borrower, toolId } = await world();
    await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await expect(
      borrower.as.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(6) }),
    ).rejects.toThrow(/already have a pending request/);
  });

  it("blocks dates that overlap an approved loan", async () => {
    const { t, owner, borrower, toolId } = await world();
    const carla = await signIn(t, "Carla");
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(5) });
    await owner.as.mutation(api.loans.approve, { loanId });

    await expect(
      carla.as.mutation(api.loans.request, { toolId, startDate: day(5), endDate: day(7) }),
    ).rejects.toThrow(/already lent out/);
    await carla.as.mutation(api.loans.request, { toolId, startDate: day(6), endDate: day(7) });
  });

  it("notifies the owner about a new request", async () => {
    const { t, owner, borrower, toolId } = await world();
    await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    expect(await scheduledNotifications(t)).toEqual([
      expect.objectContaining({ recipientId: owner.id, status: "pending" }),
    ]);
  });
});

describe("owner decisions", () => {
  it("only the owner can approve, decline or mark returned", async () => {
    const { t, borrower, toolId } = await world();
    const stranger = await signIn(t, "Carla");
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });

    for (const who of [borrower, stranger]) {
      await expect(who.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the tool owner/);
      await expect(who.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/Only the tool owner/);
      await expect(who.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only the tool owner/);
    }
  });

  it("walks a loan through approve and return, notifying the borrower each time", async () => {
    const { t, owner, borrower, toolId } = await world();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });

    await expect(owner.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only active loans/);
    await owner.as.mutation(api.loans.approve, { loanId });
    await expect(owner.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only pending/);
    await owner.as.mutation(api.loans.markReturned, { loanId });

    const [loan] = await borrower.as.query(api.loans.myRequests, {});
    expect(loan).toMatchObject({ status: "returned", toolName: "Cordless drill", ownerName: "Ana" });
    const sent = await scheduledNotifications(t);
    expect(sent.map((n) => [n.status, n.recipientId])).toEqual([
      ["pending", owner.id],
      ["approved", borrower.id],
      ["returned", borrower.id],
    ]);
  });

  it("declined requests cannot be approved later", async () => {
    const { owner, borrower, toolId } = await world();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await owner.as.mutation(api.loans.decline, { loanId });
    await expect(owner.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only pending/);
  });

  it("refuses to approve two overlapping requests", async () => {
    const { t, owner, borrower, toolId } = await world();
    const carla = await signIn(t, "Carla");
    const first = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(4) });
    const second = await carla.as.mutation(api.loans.request, { toolId, startDate: day(3), endDate: day(6) });

    await owner.as.mutation(api.loans.approve, { loanId: first });
    await expect(owner.as.mutation(api.loans.approve, { loanId: second })).rejects.toThrow(/overlaps/);
  });
});

describe("borrower cancellation", () => {
  it("only the borrower can cancel, and only while pending", async () => {
    const { t, owner, borrower, toolId } = await world();
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });

    await expect(owner.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only the borrower/);
    await borrower.as.mutation(api.loans.cancel, { loanId });
    await expect(borrower.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only pending/);

    const last = (await scheduledNotifications(t)).at(-1);
    expect(last).toMatchObject({ status: "cancelled", recipientId: owner.id });
  });
});

describe("views", () => {
  it("owners see incoming requests, borrowers see their own, only admins see all", async () => {
    const { t, owner, borrower, toolId } = await world();
    const admin = await signIn(t, "Admin", ADMIN_EMAIL);
    await borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });

    expect(await owner.as.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await owner.as.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await borrower.as.query(api.loans.myRequests, {})).toHaveLength(1);
    await expect(owner.as.query(api.loans.all, firstPage())).rejects.toThrow(/Admins only/);
    expect((await admin.as.query(api.loans.all, firstPage())).page).toHaveLength(1);
  });
});

describe("borrower reports the return", () => {
  it("lets the borrower say it is back, and the owner confirm or dispute it", async () => {
    const { t, owner, borrower, toolId } = await world();
    const stranger = await signIn(t, "Carla");
    const loanId = await borrower.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });

    await expect(borrower.as.mutation(api.loans.reportReturned, { loanId })).rejects.toThrow(/have right now/);
    await owner.as.mutation(api.loans.approve, { loanId });
    await expect(owner.as.mutation(api.loans.reportReturned, { loanId })).rejects.toThrow(/Only the borrower/);
    await expect(stranger.as.mutation(api.loans.disputeReturn, { loanId })).rejects.toThrow(/Only the tool owner/);

    await borrower.as.mutation(api.loans.reportReturned, { loanId });
    await expect(borrower.as.mutation(api.loans.reportReturned, { loanId })).rejects.toThrow(/already reported/);
    expect((await owner.as.query(api.loans.incoming, {}))[0]).toMatchObject({ status: "approved", returnReported: true });
    expect((await scheduledNotifications(t)).at(-1)).toMatchObject({ status: "return_reported", recipientId: owner.id });

    // Owner did not get it: the loan is open again and the borrower is told.
    await owner.as.mutation(api.loans.disputeReturn, { loanId });
    expect((await owner.as.query(api.loans.incoming, {}))[0]).toMatchObject({ returnReported: false });
    expect((await scheduledNotifications(t)).at(-1)).toMatchObject({ status: "return_disputed", recipientId: borrower.id });

    // Reported again and confirmed: the loan closes as usual.
    await borrower.as.mutation(api.loans.reportReturned, { loanId });
    await owner.as.mutation(api.loans.markReturned, { loanId });
    expect((await borrower.as.query(api.loans.myRequests, {}))[0]).toMatchObject({ status: "returned" });
  });
});
