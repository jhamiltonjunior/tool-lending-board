import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { createTool, day, firstPage, lend, setup, signIn } from "./test.helpers";

const NOON = new Date("2026-03-10T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now: NOON });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const nextDay = () => vi.advanceTimersByTime(24 * 60 * 60_000);

describe("board clock", () => {
  it("hands the tool to the borrower on the day the loan starts", async () => {
    const t = setup();
    await t.mutation(internal.clock.tick, {});
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await createTool(ana.as);
    await lend(ana, bob, toolId, day(1), day(3));

    const tool = async () => (await bob.as.query(api.tools.list, firstPage())).page[0];
    expect(await tool()).toMatchObject({ available: true, backOn: null });
    expect(await t.query(api.tools.publicList, {})).toHaveLength(1);

    nextDay();
    await t.mutation(internal.clock.tick, {});
    expect(await tool()).toMatchObject({ available: false, backOn: day(2) });
    expect(await t.query(api.tools.publicList, {})).toHaveLength(0);
    expect(await bob.as.query(api.tools.stats, {})).toMatchObject({ total: 1, free: 0 });
  });

  it("flags a loan as late once the day after its end date begins", async () => {
    const t = setup();
    await t.mutation(internal.clock.tick, {});
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const toolId = await createTool(ana.as);
    await lend(ana, bob, toolId, day(0), day(0));

    const loan = async () => (await bob.as.query(api.loans.myRequests, {}))[0];
    expect(await loan()).toMatchObject({ overdue: false, started: true });

    nextDay();
    // Until the clock ticks, cached queries keep the stored day...
    expect(await loan()).toMatchObject({ overdue: false });
    await t.mutation(internal.clock.tick, {});
    // ...and the tick is what makes them refresh.
    expect(await loan()).toMatchObject({ overdue: true });
  });

  it("keeps a late tool with its borrower until it is returned", async () => {
    const t = setup();
    await t.mutation(internal.clock.tick, {});
    const ana = await signIn(t, "Ana");
    const bob = await signIn(t, "Bob");
    const carla = await signIn(t, "Carla");
    const toolId = await createTool(ana.as);
    const late = await lend(ana, bob, toolId, day(0), day(1));
    await lend(ana, carla, toolId, day(3), day(4));

    for (let i = 0; i < 3; i++) nextDay();
    await t.mutation(internal.clock.tick, {}); // Carla's loan starts, but Bob still has it
    const tool = async () => (await carla.as.query(api.tools.list, firstPage())).page[0];
    expect(await tool()).toMatchObject({ available: false, backOn: day(-2) });

    await ana.as.mutation(api.loans.markReturned, { loanId: late });
    expect(await tool()).toMatchObject({ available: false, backOn: day(1) });
  });
});
