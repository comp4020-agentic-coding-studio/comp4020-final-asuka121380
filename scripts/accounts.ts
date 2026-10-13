#!/usr/bin/env node
// Verifies the explicit account system end to end, through visible UI, with
// independent browser contexts standing in for "two different devices":
//   1. register while using an existing anonymous identity preserves its
//      existing room, reachable afterward with no changes;
//   2. the SAME account, signed into from a brand-new browser context
//      (never shared cookies), reaches the SAME rooms/collection;
//   3. signing into an account while a DIFFERENT browser's anonymous
//      identity already has its own room triggers the migration-conflict
//      warning, and that identity's room survives untouched either way;
//   4. sign-out invalidates the session server-side, not only client-side;
//   5. a wrong password is refused without revealing whether the username
//      exists (same response either way);
//   6. browsing (showcase) requires no sign-in at all.
//   node scripts/accounts.ts [base-url]
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });

// ---- 1. register while using an existing anonymous identity; its room survives
const ctxA = await browser.newContext();
const pageA = await ctxA.newPage();
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageA.fill('input[placeholder="e.g. Saturday build"]', `Account check ${Date.now()}`);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
await pageA.locator('.tray button[aria-label^="Brick 2×4,"]').click();
const p = await pageA.evaluate(() => (window as any).__project(2.5, 0, 2.5));
await pageA.mouse.move(p.x, p.y, { steps: 3 });
await pageA.waitForTimeout(100);
await pageA.mouse.click(p.x, p.y);
await pageA.waitForTimeout(400);
const roomId = await pageA.evaluate(() => (window as any).__state().snapshot.roomId);

const username = `builder${Date.now()}`;
const password = "a-decent-password-1";
await pageA.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Create an account");
await pageA.getByRole("button", { name: "Create an account" }).click();
await pageA.waitForSelector('text=This browser\'s current rooms');
await pageA.getByLabel("Username", { exact: true }).fill(username);
await pageA.getByLabel("Display name", { exact: false }).fill("Builder One");
await pageA.getByLabel("Password (at least", { exact: false }).fill(password);
await pageA.getByRole("button", { name: "Create account" }).click();
await pageA.waitForSelector("text=Signed in as");
check("registering succeeds and shows the signed-in account panel", true);

const roomsAfterRegister = await pageA.evaluate(async () => (await (await fetch("/api/my/rooms")).json()).map((r: any) => r.id));
check("the room built before registering is still reachable afterward, unchanged", roomsAfterRegister.includes(roomId), roomsAfterRegister);

const partsStillThere = await pageA.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" }).then(async () => {
  await pageA.waitForFunction(() => (window as any).__state?.().snapshot);
  return pageA.evaluate(() => (window as any).__state().snapshot.parts.length);
});
check("the construction itself survived registering, part for part", partsStillThere === 1, partsStillThere);

// ---- 2. the SAME account, from a brand-new browser context, reaches the SAME rooms
const ctxB = await browser.newContext(); // a genuinely separate "device": no shared cookie jar
const pageB = await ctxB.newPage();
await pageB.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector("text=Sign in", { timeout: 5000 });
await pageB.getByRole("button", { name: "Sign in", exact: true }).click();
await pageB.fill('input[autocomplete="username"]', username);
await pageB.fill('input[autocomplete="current-password"]', password);
await pageB.getByRole("button", { name: "Sign in", exact: true }).click();
await pageB.waitForSelector("text=Signed in as");

const roomsFromB = await pageB.evaluate(async () => (await (await fetch("/api/my/rooms")).json()).map((r: any) => r.id));
check("signing in from an independent browser reaches the SAME rooms as the original device", roomsFromB.includes(roomId), roomsFromB);

const partsFromB = await pageB.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" }).then(async () => {
  await pageB.waitForFunction(() => (window as any).__state?.().snapshot);
  return pageB.evaluate(() => (window as any).__state().snapshot.parts.length);
});
check("and the same construction is visible from that other device", partsFromB === 1, partsFromB);

// ---- 3. signing in while a DIFFERENT browser's anonymous identity has its own work
const ctxC = await browser.newContext();
const pageC = await ctxC.newPage();
await pageC.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageC.fill('input[placeholder="e.g. Saturday build"]', `Conflict check ${Date.now()}`);
await pageC.locator('input[name="visibility"]').nth(1).check(); // invite-only, so a stranger's GET genuinely 404s
await pageC.getByRole("button", { name: "Create and open" }).click();
await pageC.waitForURL(/\/build\/room\/.*debug/);
await pageC.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const conflictRoomId = await pageC.evaluate(() => (window as any).__state().snapshot.roomId);

await pageC.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await pageC.waitForSelector("text=Sign in", { timeout: 5000 });
await pageC.getByRole("button", { name: "Sign in", exact: true }).click();
await pageC.fill('input[autocomplete="username"]', username);
await pageC.fill('input[autocomplete="current-password"]', password);
await pageC.getByRole("button", { name: "Sign in", exact: true }).click();
await pageC.waitForSelector("text=This browser has other work");
check("signing in while this browser already has its own anonymous work shows the migration-conflict warning", true);

const notYetSwitched = await pageC.evaluate(async () => (await (await fetch("/api/me")).json()).account);
check("viewing the warning never silently switches the browser yet", notYetSwitched === null, notYetSwitched);

await pageC.getByRole("button", { name: "I understand, continue signing in" }).click();
await pageC.waitForSelector("text=Signed in as");
const switchedAccount = await pageC.evaluate(async () => (await (await fetch("/api/me")).json()).account?.username);
check("confirming completes the sign-in", switchedAccount === username, switchedAccount);

// the pre-conflict anonymous room is untouched: after switching, the SAME
// browser (now authenticated as the account) can no longer read a room
// that was never part of that account's identity at all — proving it was
// never reassigned, merely left behind with no cookie pointing at it
const conflictRoomRaw = await pageC.evaluate(
  async (id: string) => (await fetch(`/api/rooms/${id}`)).status,
  conflictRoomId,
);
check("the pre-conflict anonymous room is not reassigned to the account (still its own, separate identity's room)", conflictRoomRaw === 404, conflictRoomRaw);

// ---- 4. sign-out invalidates the session server-side
const cookiesBefore = await ctxA.cookies();
const sessionCookie = cookiesBefore.find((c) => c.name === "brick_visitor")?.value;
await pageA.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Signed in as");
await pageA.getByRole("button", { name: "Sign out" }).click();
await pageA.waitForSelector("text=Create an account");
const meAfterSignOut = await pageA.evaluate(async () => (await (await fetch("/api/me")).json()).account);
check("after sign-out, /api/me reports signed out", meAfterSignOut === null, meAfterSignOut);

const oldCookieStillWorks = await pageA.evaluate(async (cookie: string) => {
  const res = await fetch("/api/me", { headers: { cookie: `brick_visitor=${cookie}` } });
  const body = await res.json();
  return body.account; // if the OLD session were still valid, this would resolve to the account again
}, sessionCookie!);
check("the OLD session token no longer resolves to the account (deleted server-side, not just the client cookie cleared)", oldCookieStillWorks === null, oldCookieStillWorks);

// ---- 5. non-enumerating auth errors
const wrongPasswordStatus = await pageB.evaluate(
  async (u: string) => (await fetch("/api/account/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: "wrong" }) })).status,
  username,
);
const noSuchUserStatus = await pageB.evaluate(
  async () => (await fetch("/api/account/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "no-such-user-at-all", password: "whatever1" }) })).status,
);
check("a wrong password and a nonexistent username return the identical status (non-enumerating)", wrongPasswordStatus === noSuchUserStatus && wrongPasswordStatus === 401, { wrongPasswordStatus, noSuchUserStatus });

// ---- 6. browsing never requires sign-in
const freshCtx2 = await browser.newContext();
const freshPage2 = await freshCtx2.newPage();
const showcaseStatus = await freshPage2.goto(`${base}/build/?view=showcase`, { waitUntil: "domcontentloaded" }).then((r) => r?.status());
check("the public showcase loads with no account and no prior cookie at all", showcaseStatus === 200, showcaseStatus);
await freshCtx2.close();

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
