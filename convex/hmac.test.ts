import { describe, expect, it } from "vitest";
import { canonical, sign, verify, TOLERANCE_MS } from "./lib/hmac";

const SECRET = "s".repeat(32);

async function signed(body = '{"a":1}', ts = Date.now()) {
  const timestamp = String(ts);
  const signature = await sign(SECRET, canonical(timestamp, "POST", "/n8n/events", body));
  return { timestamp, signature, method: "POST", path: "/n8n/events", body };
}

describe("hmac", () => {
  it("accepts a fresh, correct signature", async () => {
    expect(await verify(SECRET, await signed())).toBe(true);
  });

  it("rejects a missing timestamp or signature", async () => {
    const s = await signed();
    expect(await verify(SECRET, { ...s, signature: null })).toBe(false);
    expect(await verify(SECRET, { ...s, timestamp: null })).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const s = await signed();
    expect(await verify(SECRET, { ...s, body: '{"a":2}' })).toBe(false);
  });

  it("rejects a signature replayed on another path or method", async () => {
    const s = await signed();
    expect(await verify(SECRET, { ...s, path: "/n8n/reminders" })).toBe(false);
    expect(await verify(SECRET, { ...s, method: "GET" })).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const s = await signed(undefined, Date.now() - TOLERANCE_MS - 1_000);
    expect(await verify(SECRET, s)).toBe(false);
  });

  it("rejects a signature made with another secret", async () => {
    const s = await signed();
    expect(await verify("x".repeat(32), s)).toBe(false);
  });
});
