#!/usr/bin/env node
// Sends a request signed exactly like Convex and n8n sign each other's calls.
// Useful to test the integration by hand:
//   LENDLOOP_WEBHOOK_SECRET=... node scripts/signed-request.mjs GET http://127.0.0.1:3211/n8n/overdue-loans
//   LENDLOOP_WEBHOOK_SECRET=... node scripts/signed-request.mjs POST http://localhost:5678/webhook/lendloop-loan-events '{"type":"loan.status_changed",...}'
import { createHmac } from "node:crypto";

const [method = "GET", url, body = ""] = process.argv.slice(2);
const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
if (!url || !secret) {
  console.error("usage: LENDLOOP_WEBHOOK_SECRET=... node scripts/signed-request.mjs <METHOD> <URL> [JSON_BODY]");
  process.exit(1);
}
const timestamp = String(Date.now());
const path = new URL(url).pathname;
const signature =
  "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${method.toUpperCase()}.${path}.${body}`).digest("hex");

const res = await fetch(url, {
  method,
  headers: {
    "content-type": "application/json",
    "x-lendloop-timestamp": timestamp,
    "x-lendloop-signature": signature,
  },
  body: method.toUpperCase() === "GET" ? undefined : body,
});
console.log(res.status, await res.text());
