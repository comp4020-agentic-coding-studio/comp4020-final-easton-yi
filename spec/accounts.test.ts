// AUTH-01, SYNC-07, AT-06: accounts, sessions and same-origin protection,
// checked against the running app.
import { describe, expect, it } from "vitest";
import { Client, sessionOf, shared, uniqueHandle } from "./helpers.ts";

describe("accounts and sessions", () => {
  it("registers, reports the session, logs out and logs back in", async () => {
    const c = await new Client().register("Ada");
    expect(c.recoveryCode.length).toBeGreaterThan(30);
    const s = await c.req("GET", "/api/session");
    expect(s.body.user.handle).toBe(c.user!.handle);
    expect(s.body.user).not.toHaveProperty("pwHash");

    expect((await c.req("POST", "/api/auth/logout")).status).toBe(200);
    expect((await c.req("GET", "/api/session")).body.user).toBe(null);
    expect((await c.req("GET", "/api/works")).status).toBe(401);

    const again = new Client();
    expect((await again.login(c.user!.handle, "wrong password here")).status).toBe(401);
    expect((await again.login(c.user!.handle, "correct horse battery")).status).toBe(200);
    expect((await again.req("GET", "/api/works")).status).toBe(200);
  });

  it("an old session cookie stops working after logout", async () => {
    const c = await sessionOf(await shared("Session holder"));
    const stolen = c.cookie;
    await c.req("POST", "/api/auth/logout");
    const replay = new Client();
    replay.cookie = stolen;
    expect((await replay.req("GET", "/api/works")).status).toBe(401);
  });

  it("rejects duplicate handles, short passwords and bad handles", async () => {
    const a = await shared("Session holder");
    const dup = await new Client().req("POST", "/api/auth/register", { handle: a.user!.handle, displayName: "X", password: "another long password" });
    expect(dup.status).toBe(409);
    const short = await new Client().req("POST", "/api/auth/register", { handle: uniqueHandle(), displayName: "X", password: "short" });
    expect(short.status).toBe(422);
    const bad = await new Client().req("POST", "/api/auth/register", { handle: "no spaces!", displayName: "X", password: "a long enough password" });
    expect(bad.status).toBe(422);
  });

  it("recovers with the one-use code, rotates it and revokes old sessions", async () => {
    const c = await new Client().register();
    const handle = c.user!.handle;
    const oldCookie = c.cookie;
    const r = new Client();
    const rec = await r.req("POST", "/api/auth/recover", { handle, recoveryCode: c.recoveryCode, newPassword: "a brand new password" });
    expect(rec.status).toBe(200);
    expect(rec.body.recoveryCode).not.toBe(c.recoveryCode);
    // the used code no longer works
    const reuse = await new Client().req("POST", "/api/auth/recover", { handle, recoveryCode: c.recoveryCode, newPassword: "yet another password" });
    expect(reuse.status).toBe(401);
    // previous sessions were revoked
    const old = new Client();
    old.cookie = oldCookie;
    expect((await old.req("GET", "/api/works")).status).toBe(401);
    expect((await new Client().login(handle, "a brand new password")).status).toBe(200);
  });

  it("requires same-origin and the CSRF token for mutations", async () => {
    const c = await shared("Session holder");
    const noOrigin = await c.req("POST", "/api/works", { title: "x" }, { origin: "https://evil.example" });
    expect(noOrigin.status).toBe(403);
    const noCsrf = await c.req("POST", "/api/works", { title: "x" }, { "x-csrf-token": "nope" });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe("CSRF");
    expect((await c.req("POST", "/api/works", { title: "fine" })).status).toBe(200);
  });

  it("never returns credentials or recovery digests", async () => {
    const c = await shared("Session holder");
    const id = await c.createWork();
    const w = await c.req("GET", `/api/works/${id}`);
    const text = JSON.stringify(w.body);
    expect(text).not.toMatch(/scrypt|pw_hash|recovery/i);
  });
});
