import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import { GIVE_UP_AFTER_MS, LEASE_MS } from "./notifications";
import { ADMIN_EMAIL, SECRET, createTool, day, setup, signIn, type T } from "./test.helpers";

const WEBHOOK = "http://n8n.test/webhook/lendloop-loan-events";

// A fake n8n whose answer the test controls.
function fakeN8n() {
  const n8n = { status: 200, calls: [] as { url: string; init: RequestInit }[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      n8n.calls.push({ url, init });
      if (n8n.status === 0) throw new Error("connect ECONNREFUSED");
      return new Response("", { status: n8n.status });
    }),
  );
  return n8n;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
  vi.stubEnv("N8N_LOAN_EVENTS_WEBHOOK_URL", WEBHOOK);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function world(t: T) {
  const owner = await signIn(t, "Ana");
  const borrower = await signIn(t, "Bob");
  const toolId = await createTool(owner.as);
  const request = () => borrower.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
  return { owner, borrower, toolId, request };
}

const rows = (t: T) => t.run((ctx) => ctx.db.query("outbox").collect());
const circuit = (t: T) =>
  t.run((ctx) => ctx.db.query("singletons").withIndex("by_key", (q) => q.eq("key", "delivery")).unique());
const runScheduled = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);
// One run of the cron worker, plus the attempts it schedules.
async function workerTick(t: T, advanceMs = 60_000) {
  vi.advanceTimersByTime(advanceMs);
  const result = await t.mutation(internal.notifications.dispatchDue, {});
  await runScheduled(t);
  return result;
}

describe("notification outbox", () => {
  it("delivers a signed, minimal payload right after the change", async () => {
    const n8n = fakeN8n();
    const t = setup();
    const { request } = await world(t);
    const loanId = await request();
    await runScheduled(t);

    expect(n8n.calls).toHaveLength(1);
    const { url, init } = n8n.calls[0];
    expect(url).toBe(WEBHOOK);
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    const valid = await verify(SECRET, {
      timestamp: headers[TIMESTAMP_HEADER],
      signature: headers[SIGNATURE_HEADER],
      method: "POST",
      path: "/webhook/lendloop-loan-events",
      body,
    });
    expect(valid).toBe(true);
    const payload = JSON.parse(body);
    expect(Object.keys(payload).sort()).toEqual(
      ["endDate", "eventKey", "loanId", "recipient", "startDate", "status", "toolName", "type"].sort(),
    );
    expect(payload).toMatchObject({ loanId, status: "pending", eventKey: `${loanId}:pending` });
    expect(await rows(t)).toEqual([expect.objectContaining({ state: "delivered", attempts: 1 })]);
  });

  it("keeps the event when n8n is down and sends it once n8n is back", async () => {
    const n8n = fakeN8n();
    n8n.status = 0;
    const t = setup();
    const { request } = await world(t);
    await request();
    await runScheduled(t);

    expect(await rows(t)).toEqual([expect.objectContaining({ state: "pending", attempts: 1 })]);
    expect(await circuit(t)).toMatchObject({ n8nDown: true });

    n8n.status = 200;
    await workerTick(t, 60_000); // first backoff is 30 s
    expect(await rows(t)).toEqual([expect.objectContaining({ state: "delivered", attempts: 2 })]);
    expect(await circuit(t)).toMatchObject({ n8nDown: false });
  });

  it("survives an attempt that dies halfway, e.g. during a deploy", async () => {
    const n8n = fakeN8n();
    const t = setup();
    const { request } = await world(t);
    await request();
    // Drop the scheduled attempt as if the process running it had been killed.
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
        if (job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
      }
    });
    expect(n8n.calls).toHaveLength(0);

    expect(await workerTick(t, 10_000)).toMatchObject({ dispatched: 0 }); // still leased
    await workerTick(t, LEASE_MS); // lease ran out: the worker picks it up
    expect(n8n.calls).toHaveLength(1);
    expect(await rows(t)).toEqual([expect.objectContaining({ state: "delivered" })]);
  });

  it("sends one probe at a time while n8n is down, then flushes the backlog", async () => {
    const n8n = fakeN8n();
    n8n.status = 503;
    const t = setup();
    const { toolId } = await world(t);
    for (const name of ["Carla", "Dani", "Edu"]) {
      const who = await signIn(t, name);
      await who.as.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    }
    await runScheduled(t);
    expect(n8n.calls).toHaveLength(3); // each new event tries once

    n8n.calls.length = 0;
    await workerTick(t, 20 * 60_000); // all three are due again
    expect(n8n.calls).toHaveLength(1); // circuit open: a single probe

    n8n.status = 200;
    await workerTick(t, 20 * 60_000);
    expect((await rows(t)).every((r) => r.state === "delivered")).toBe(true);
  });

  it("gives up on events n8n rejects, and lets an admin resend them", async () => {
    const n8n = fakeN8n();
    n8n.status = 400;
    const t = setup();
    const { request } = await world(t);
    const admin = await signIn(t, "Admin", ADMIN_EMAIL);
    const loanId = await request();
    await runScheduled(t);

    const [row] = await rows(t);
    expect(row).toMatchObject({ state: "dead", attempts: 1 });
    expect(await circuit(t)).toBeNull(); // a rejected event says nothing about n8n's health
    const [problem] = await admin.as.query(api.automation.recentProblems, {});
    expect(problem).toMatchObject({ kind: "notification_failed", outboxId: row._id, outboxState: "dead" });
    expect(problem.detail).toMatch(/n8n responded 400/);

    // The loan change itself is never rolled back by a failed notification.
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe("pending");

    const borrower = await signIn(t, "Bob");
    await expect(borrower.as.mutation(api.notifications.resend, { outboxId: row._id })).rejects.toThrow(/Admins only/);
    n8n.status = 200;
    await admin.as.mutation(api.notifications.resend, { outboxId: row._id });
    await runScheduled(t);
    expect(await rows(t)).toEqual([expect.objectContaining({ state: "delivered" })]);
    await expect(admin.as.mutation(api.notifications.resend, { outboxId: row._id })).rejects.toThrow(
      /Only failed notifications/,
    );
  });

  it("marks the event dead after 24 hours of failures", async () => {
    const n8n = fakeN8n();
    n8n.status = 503;
    const t = setup();
    const { request } = await world(t);
    await request();
    await runScheduled(t);

    vi.advanceTimersByTime(GIVE_UP_AFTER_MS);
    await workerTick(t);
    const [row] = await rows(t);
    expect(row.state).toBe("dead");
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events).toEqual([expect.objectContaining({ kind: "notification_failed", outboxId: row._id })]);
  });

  it("drops events whose loan was deleted before delivery", async () => {
    fakeN8n();
    const t = setup();
    const { request } = await world(t);
    const loanId = await request();
    await t.run((ctx) => ctx.db.delete(loanId));
    await runScheduled(t);
    expect(await rows(t)).toEqual([expect.objectContaining({ state: "dropped" })]);
  });
});
