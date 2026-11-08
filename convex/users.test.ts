import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { ADMIN_EMAIL, firstPage, setup, signIn } from "./test.helpers";

beforeEach(() => vi.stubEnv("ADMIN_EMAILS", ` ${ADMIN_EMAIL.toUpperCase()} , other-admin@example.com`));
afterEach(() => vi.unstubAllEnvs());

describe("users", () => {
  it("creates a regular user on first sign-in", async () => {
    const t = setup();
    const { as } = await signIn(t, "Ana");
    expect(await as.query(api.users.me, {})).toMatchObject({ name: "Ana", role: "user", trustedLender: false });
  });

  it("promotes emails listed in ADMIN_EMAILS, case-insensitively", async () => {
    const t = setup();
    const { as } = await signIn(t, "Admin", ADMIN_EMAIL);
    expect(await as.query(api.users.me, {})).toMatchObject({ role: "admin" });
  });

  it("does not create a second row when the same person signs in again", async () => {
    const t = setup();
    const first = await signIn(t, "Ana");
    const second = await signIn(t, "Ana");
    expect(second.id).toBe(first.id);
  });

  it("returns null for anonymous visitors and rejects anonymous store", async () => {
    const t = setup();
    expect(await t.query(api.users.me, {})).toBeNull();
    await expect(t.mutation(api.users.store, {})).rejects.toThrow(/Not signed in/);
  });

  it("only admins can list users and mark Trusted Lenders", async () => {
    const t = setup();
    const ana = await signIn(t, "Ana");
    const admin = await signIn(t, "Admin", ADMIN_EMAIL);

    await expect(ana.as.query(api.users.listForAdmin, firstPage())).rejects.toThrow(/Admins only/);
    await expect(ana.as.mutation(api.users.setTrustedLender, { userId: ana.id, trusted: true })).rejects.toThrow(
      /Admins only/,
    );

    await admin.as.mutation(api.users.setTrustedLender, { userId: ana.id, trusted: true });
    expect(await ana.as.query(api.users.me, {})).toMatchObject({ trustedLender: true });
    expect((await admin.as.query(api.users.listForAdmin, firstPage())).page).toHaveLength(2);
  });
});
