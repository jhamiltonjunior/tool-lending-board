import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { canonical, sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";

export const SECRET = "test-secret-0123456789-abcdefghijklmnop";
export const ADMIN_EMAIL = "admin@example.com";

export function setup() {
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

// Signs in through the same mutation the app calls after Clerk sign-in.
export async function signIn(t: T, name: string, email = `${name.toLowerCase()}@example.com`) {
  const as = t.withIdentity({ name, email, subject: email });
  const id = await as.mutation(api.users.store, {});
  return { as, id };
}

// YYYY-MM-DD relative to today (UTC).
export function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

export async function createTool(as: Awaited<ReturnType<typeof signIn>>["as"], name = "Cordless drill") {
  return as.mutation(api.tools.create, {
    name,
    category: "power tools",
    condition: "good",
    description: "18V with two batteries",
  });
}

export async function insertLoan(
  t: T,
  loan: {
    toolId: Id<"tools">;
    ownerId: Id<"users">;
    borrowerId: Id<"users">;
    startDate: string;
    endDate: string;
    status: "pending" | "approved" | "declined" | "cancelled" | "returned";
  },
) {
  return t.run((ctx) => ctx.db.insert("loans", loan));
}

export async function signedInit(method: "GET" | "POST", path: string, body = "", ts = Date.now()) {
  const timestamp = String(ts);
  const signature = await sign(SECRET, canonical(timestamp, method, path, body));
  return {
    method,
    headers: { "content-type": "application/json", [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
    ...(method === "GET" ? {} : { body }),
  };
}
