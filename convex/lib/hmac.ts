// HMAC-SHA256 signing shared by both directions (Convex -> n8n and n8n -> Convex).
// Signed string: `${timestamp}.${METHOD}.${path}.${rawBody}` so a signature cannot be
// replayed against another endpoint, method or body. Timestamps older than the
// tolerance are rejected to limit replay.

const encoder = new TextEncoder();
export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const TOLERANCE_MS = 5 * 60 * 1000;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function canonical(timestamp: string, method: string, path: string, body: string) {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

export async function sign(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(message));
  return `sha256=${toHex(sig)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verify(
  secret: string,
  opts: { timestamp: string | null; signature: string | null; method: string; path: string; body: string },
  now = Date.now(),
): Promise<boolean> {
  const { timestamp, signature } = opts;
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TOLERANCE_MS) return false;
  const expected = await sign(secret, canonical(timestamp, opts.method, opts.path, opts.body));
  return timingSafeEqual(expected, signature);
}

export function requireSecret(): string {
  const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("LENDLOOP_WEBHOOK_SECRET must be set (32+ chars) in the Convex environment");
  }
  return secret;
}
