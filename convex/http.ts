import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireSecret, SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./lib/hmac";
import { todayUTC } from "./lib/auth";

const http = httpRouter();

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Every n8n -> Convex call must carry a fresh HMAC signature over method, path and body.
async function authenticate(req: Request): Promise<{ ok: true; body: string } | { ok: false; res: Response }> {
  const body = req.method === "GET" ? "" : await req.text();
  const valid = await verify(requireSecret(), {
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
    method: req.method,
    path: new URL(req.url).pathname,
    body,
  });
  if (!valid) return { ok: false, res: json(401, { error: "invalid signature" }) };
  return { ok: true, body };
}

function parse(body: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx: ActionCtx, req) => {
    const auth = await authenticate(req);
    if (!auth.ok) return auth.res;
    const day = todayUTC();
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { today: day });
    return json(200, { day, loans });
  }),
});

http.route({
  path: "/n8n/reminders",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req);
    if (!auth.ok) return auth.res;
    const data = parse(auth.body);
    const loanId = str(data?.loanId, 64);
    const idempotencyKey = str(data?.idempotencyKey, 100);
    const status = data?.status === "sent" || data?.status === "failed" ? data.status : null;
    const channel = str(data?.channel, 40) ?? "mock";
    if (!loanId || !idempotencyKey || !status) return json(400, { error: "loanId, idempotencyKey and status are required" });
    try {
      const result = await ctx.runMutation(internal.automation.recordReminder, {
        loanId: loanId as Id<"loans">,
        idempotencyKey,
        status,
        channel,
      });
      return json(result.ok ? 200 : 422, result);
    } catch {
      return json(400, { error: "invalid loanId" });
    }
  }),
});

http.route({
  path: "/n8n/events",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req);
    if (!auth.ok) return auth.res;
    const data = parse(auth.body);
    const eventKey = str(data?.eventKey, 150);
    const kind = data?.kind === "notification_sent" || data?.kind === "workflow_error" ? data.kind : null;
    const detail = (str(data?.detail, 300) ?? "").slice(0, 300);
    const loanId = str(data?.loanId, 64);
    if (!eventKey || !kind) return json(400, { error: "eventKey and kind are required" });
    try {
      const result = await ctx.runMutation(internal.automation.recordEvent, {
        eventKey,
        kind,
        detail,
        ...(loanId ? { loanId: loanId as Id<"loans"> } : {}),
      });
      return json(result.ok ? 200 : 422, result);
    } catch {
      return json(400, { error: "invalid loanId" });
    }
  }),
});

export default http;
