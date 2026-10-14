#!/usr/bin/env node
// Verifies the pre-join confirmation screen through visible browser
// behaviour, with two genuinely independent identities:
//   1. A direct room link, for a visitor who has never been in that room,
//      shows the pre-join screen (name, scene, capacity, visibility,
//      publication) BEFORE joining — not after.
//   2. The screen never joins on its own: a visitor who loads the link and
//      does nothing else is not admitted (not a member, no slot consumed).
//   3. Explicit confirmation actually joins and opens the editor.
//   4. A returning/already-admitted player reloading the same room does
//      NOT see the pre-join screen again.
//   5. Joining by pasted code in the lobby also shows the terms and
//      disables confirmation until the preview resolves.
//   6. A full room's pre-join screen says so and disables joining.
//   node scripts/pre-join.ts [base-url]
import { chromium, type Locator, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

/** Polls a locator's own aria-disabled attribute until it reads "false", or throws past the timeout. */
async function expectEnabled(locator: Locator, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await locator.getAttribute("aria-disabled")) === "false") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("button never became enabled");
}

const browser = await chromium.launch({ channel: "chrome" });
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

// A creates a public, publishable room through the lobby (hosting your own
// room never shows the pre-join screen — there's nothing to confirm)
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const label = `Pre-join check ${Date.now()}`;
await pageA.fill('input[placeholder="e.g. Saturday build"]', label);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const roomUrl = pageA.url();
const roomId = roomUrl.match(/\/build\/room\/([^/?]+)/)![1];

// ---- 1 & 2: a stranger's FIRST visit to the direct link shows the terms, joins nothing by itself
await pageB.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector(`text=${label}`, { timeout: 5000 });
const screenText = await pageB.locator(".access-card").textContent();
check("the pre-join screen shows the room's name", (screenText ?? "").includes(label), screenText?.slice(0, 200));
check("...the scene", /Scene:/.test(screenText ?? ""));
check("...the visibility", /Visibility:/.test(screenText ?? ""));
check("...the capacity", /Capacity:/.test(screenText ?? ""));
check("...whether publishing is allowed", /Publishing:/.test(screenText ?? ""));

const confirmButton = pageB.getByRole("button", { name: /^Join this room/ });
await confirmButton.waitFor();
const stillUnjoined = await pageA.evaluate(async (id: string) => {
  const res = await fetch(`/api/rooms/${id}`);
  const body = await res.json();
  return body.members.length;
}, roomId);
check("merely viewing the pre-join screen (no click yet) admits no one — still 1 member", stillUnjoined === 1, stillUnjoined);

// ---- 3: explicit confirmation actually joins
await confirmButton.click();
await pageB.waitForFunction(() => (window as any).__state?.().snapshot, null, { timeout: 5000 });
const afterConfirm = await pageA.evaluate(async (id: string) => {
  const res = await fetch(`/api/rooms/${id}`);
  const body = await res.json();
  return body.members.length;
}, roomId);
check("explicit confirmation actually admits the visitor", afterConfirm === 2, afterConfirm);

// ---- 4: a returning/admitted player reloading sees no pre-join screen again
await pageB.reload({ waitUntil: "domcontentloaded" });
await pageB.waitForFunction(() => (window as any).__state?.().snapshot, null, { timeout: 5000 });
const sawPreJoinAgain = await pageB.locator(".access-card", { hasText: label }).count();
check("reloading as an already-admitted member skips the pre-join screen entirely", sawPreJoinAgain === 0, sawPreJoinAgain);

// ---- 5: joining by pasted code in the lobby shows terms, disables confirm until ready
// (a FRESH room, created with capacity to spare — the first room is already
// at its 2-player limit from steps 1-4, which is itself tested separately below)
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const label2 = `Pre-join check 2 ${Date.now()}`;
await pageA.fill('input[placeholder="e.g. Saturday build"]', label2);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
const roomId2 = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];

const ctxC = await browser.newContext();
const pageC = await ctxC.newPage();
await pageC.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
const joinByCodeButton = pageC.locator(".lobby-card", { hasText: "Join a room by its code" }).getByRole("button", { name: "Join", exact: true });
await pageC.fill('input[aria-label="Room id"]', roomId2);
// immediately after typing, before the async preview resolves, confirming
// must still be disabled (the brief: "disable confirmation while loading")
const disabledWhileTyping = await joinByCodeButton.getAttribute("aria-disabled");
check("the Join-by-code button is disabled before the preview resolves", disabledWhileTyping === "true", disabledWhileTyping);
await pageC.locator('input[aria-label="Room id"]').blur();
await pageC.waitForSelector(`text=${label2}`, { timeout: 5000 });
await expectEnabled(joinByCodeButton, 5000);
check("joining by code shows the room's terms before confirming, then enables the button", true);
await joinByCodeButton.click();
await pageC.waitForURL(/\/build\/room\//, { timeout: 5000 });
check("confirming from the join-by-code flow reaches the room", true);

// ---- 6: a full room's pre-join screen says so and disables joining
const ctxD = await browser.newContext();
const pageD = await ctxD.newPage();
await pageD.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" }); // the FIRST room, already full (A + B)
await pageD.waitForSelector(`text=${label}`, { timeout: 5000 });
const fullScreenText = await pageD.locator(".access-card").textContent();
check("a full room's pre-join screen says so", /full/i.test(fullScreenText ?? ""), fullScreenText?.slice(0, 200));
const fullConfirmButton = pageD.getByRole("button", { name: /^Join this room/ });
const fullDisabled = await fullConfirmButton.getAttribute("aria-disabled");
check("the confirm button is disabled when the room is full", fullDisabled === "true", fullDisabled);

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
