import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { SIGNATURE_HEADER } from "./lib/hmac";
import { ADMIN_EMAIL, SECRET, createTool, day, insertLoan, setup, signIn, signedInit, type T } from "./test.helpers";

beforeEach(() => {
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAIL);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function overdueWorld(t: T) {
  const owner = await signIn(t, "Ana");
  const borrower = await signIn(t, "Bob");
  const toolId = await createTool(owner.as, "Hedge trimmer");
  const loanId = await insertLoan(t, {
    toolId,
    ownerId: owner.id,
    borrowerId: borrower.id,
    startDate: day(-5),
    endDate: day(-2),
    status: "approved",
  });
  return { owner, borrower, loanId, key: `${loanId}:${day(0)}` };
}

const post = async (t: T, path: string, data: unknown) => {
  const body = JSON.stringify(data);
  return t.fetch(path, await signedInit("POST", path, body));
};

describe("HTTP endpoints for n8n", () => {
  it("reject unsigned, forged, stale and cross-endpoint requests", async () => {
    const t = setup();
    expect((await t.fetch("/n8n/overdue-loans", { method: "GET" })).status).toBe(401);

    const forged = await signedInit("GET", "/n8n/overdue-loans");
    forged.headers[SIGNATURE_HEADER] = "sha256=" + "0".repeat(64);
    expect((await t.fetch("/n8n/overdue-loans", forged)).status).toBe(401);

    const stale = await signedInit("GET", "/n8n/overdue-loans", "", Date.now() - 10 * 60_000);
    expect((await t.fetch("/n8n/overdue-loans", stale)).status).toBe(401);

    const body = JSON.stringify({ eventKey: "k", kind: "workflow_error" });
    const forReminders = await signedInit("POST", "/n8n/reminders", body);
    expect((await t.fetch("/n8n/events", { ...forReminders, body })).status).toBe(401);
  });

  it("return overdue loans with only what a reminder needs", async () => {
    const t = setup();
    const { loanId, key } = await overdueWorld(t);

    const res = await t.fetch("/n8n/overdue-loans", await signedInit("GET", "/n8n/overdue-loans"));
    expect(res.status).toBe(200);
    const { loans } = await res.json();
    expect(loans).toEqual([
      {
        loanId,
        idempotencyKey: key,
        toolName: "Hedge trimmer",
        endDate: day(-2),
        borrower: { name: "Bob", email: "bob@example.com" },
      },
    ]);
  });

  it("reject malformed payloads with 400", async () => {
    const t = setup();
    expect((await post(t, "/n8n/reminders", { loanId: "x" })).status).toBe(400);
    expect((await post(t, "/n8n/events", { eventKey: "k", kind: "something_else" })).status).toBe(400);
    const notJson = "not json";
    expect((await t.fetch("/n8n/events", { ...(await signedInit("POST", "/n8n/events", notJson)), body: notJson })).status).toBe(400);
  });
});

describe("overdue reminders", () => {
  it("record one reminder per loan per day, however many times n8n retries", async () => {
    const t = setup();
    const { loanId, key, borrower } = await overdueWorld(t);
    const payload = { loanId, idempotencyKey: key, status: "sent", channel: "mock" };

    expect(await (await post(t, "/n8n/reminders", payload)).json()).toMatchObject({ ok: true, duplicate: false });
    expect(await (await post(t, "/n8n/reminders", payload)).json()).toMatchObject({ ok: true, duplicate: true });

    const reminders = await t.run((ctx) => ctx.db.query("reminders").collect());
    expect(reminders).toHaveLength(1);

    // Already reminded today: the next scheduled run skips it.
    const res = await t.fetch("/n8n/overdue-loans", await signedInit("GET", "/n8n/overdue-loans"));
    expect((await res.json()).loans).toEqual([]);

    // The borrower sees the activity on the loan.
    const [loan] = await borrower.as.query(api.loans.myRequests, {});
    expect(loan).toMatchObject({ overdue: true, lastActivity: { kind: "reminder_sent" } });
  });

  it("let a failed reminder be upgraded to sent, but never downgrade a success", async () => {
    const t = setup();
    const { loanId, key } = await overdueWorld(t);
    const send = (status: string) => post(t, "/n8n/reminders", { loanId, idempotencyKey: key, status });

    await send("failed");
    await send("sent");
    await send("failed");
    const [reminder] = await t.run((ctx) => ctx.db.query("reminders").collect());
    expect(reminder.status).toBe("sent");
  });

  it("skip loans the borrower reported as returned", async () => {
    const t = setup();
    const { loanId, borrower } = await overdueWorld(t);
    await borrower.as.mutation(api.loans.reportReturned, { loanId });
    const res = await t.fetch("/n8n/overdue-loans", await signedInit("GET", "/n8n/overdue-loans"));
    expect((await res.json()).loans).toEqual([]);
    expect((await borrower.as.query(api.loans.myRequests, {}))[0]).toMatchObject({ overdue: false, returnReported: true });
  });

  it("reject a key that belongs to another loan", async () => {
    const t = setup();
    const { loanId } = await overdueWorld(t);
    const res = await post(t, "/n8n/reminders", { loanId, idempotencyKey: `other:${day(0)}`, status: "sent" });
    expect(res.status).toBe(422);
  });
});

describe("workflow errors", () => {
  it("are recorded once and shown to admins only", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const admin = await signIn(t, "Admin", ADMIN_EMAIL);
    const event = { eventKey: "exec-42", kind: "workflow_error", detail: "Node 'Send' failed" };

    await post(t, "/n8n/events", event);
    await post(t, "/n8n/events", event);

    await expect(ana.as.query(api.automation.recentProblems, {})).rejects.toThrow(/Admins only/);
    const problems = await admin.as.query(api.automation.recentProblems, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "workflow_error", detail: "Node 'Send' failed" });
  });
});
