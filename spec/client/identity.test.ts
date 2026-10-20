import { afterEach, beforeEach, expect, it, vi } from "vitest";

// state/identity.ts: one identity request per page, shared by every caller;
// a failure is never cached; `resetIdentity` makes the next caller ask again.
// Cross-tab ordering (Web Locks) is checked in a real browser by
// scripts/identity-race.ts, not here.

const me = (id: string) => ({ visitorId: id, account: null });
let calls = 0;
let reply: () => Promise<Response>;

beforeEach(() => {
  vi.resetModules();
  calls = 0;
  vi.stubGlobal("fetch", (url: string) => {
    expect(url).toBe("/api/me");
    calls++;
    return reply();
  });
});
afterEach(() => vi.unstubAllGlobals());

const ok = (id: string) => () => Promise.resolve(new Response(JSON.stringify(me(id)), { status: 200 }));

it("concurrent callers share one request and get the same identity", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  reply = () => gate.then(ok("v1"));
  const { ensureIdentity } = await import("../../src/client/state/identity.ts");
  const all = Promise.all([ensureIdentity(), ensureIdentity(), ensureIdentity()]);
  release();
  const results = await all;
  expect(calls).toBe(1);
  expect(results.map((r) => r.visitorId)).toEqual(["v1", "v1", "v1"]);
  // and later callers reuse it
  await ensureIdentity();
  expect(calls).toBe(1);
});

it("a failed request is not cached: the next call retries", async () => {
  reply = () => Promise.resolve(new Response("down", { status: 503 }));
  const { ensureIdentity, IdentityError } = await import("../../src/client/state/identity.ts");
  await expect(ensureIdentity()).rejects.toBeInstanceOf(IdentityError);
  reply = ok("v2");
  await expect(ensureIdentity()).resolves.toMatchObject({ visitorId: "v2" });
  expect(calls).toBe(2);
});

it("a network failure is reported as an IdentityError, not left pending", async () => {
  reply = () => Promise.reject(new TypeError("Failed to fetch"));
  const { ensureIdentity, IdentityError } = await import("../../src/client/state/identity.ts");
  await expect(ensureIdentity()).rejects.toBeInstanceOf(IdentityError);
});

it("resetIdentity makes the next caller ask the server again (after sign-in or sign-out)", async () => {
  reply = ok("guest");
  const { ensureIdentity, resetIdentity } = await import("../../src/client/state/identity.ts");
  expect((await ensureIdentity()).visitorId).toBe("guest");
  reply = ok("account");
  expect((await ensureIdentity()).visitorId).toBe("guest"); // cached
  resetIdentity();
  expect((await ensureIdentity()).visitorId).toBe("account");
  expect(calls).toBe(2);
});

it("uses a Web Lock when the browser has one, so tabs take turns", async () => {
  const held: string[] = [];
  vi.stubGlobal("navigator", {
    locks: { request: (name: string, cb: () => Promise<unknown>) => (held.push(name), cb()) },
  });
  reply = ok("v3");
  const { ensureIdentity } = await import("../../src/client/state/identity.ts");
  await ensureIdentity();
  expect(held).toEqual(["brick-identity"]);
});
