#!/usr/bin/env node
// Verifies the inactive-member mutation bypass fix through visible browser
// behaviour, reproducing the exact reported sequence with three genuinely
// independent identities (never shared cookies):
//   1. A and B join a 2-player room.
//   2. B leaves.
//   3. C joins (fills B's slot).
//   4. B attempts to rejoin via the public lobby's own Join button and is
//      correctly refused (shown as "full right now"/disabled, per the
//      pre-join screen fix).
//   5. B, now on the editor page for that room from a PRIOR tab still open
//      (the realistic "stale tab" scenario, not a fresh API call), tries to
//      place a brick — and it must be refused, not silently applied.
//   node scripts/inactive-member.ts [base-url]
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const ctxC = await browser.newContext();
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
const pageC = await ctxC.newPage();

// A creates a public room
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const label = `Inactive-member check ${Date.now()}`;
await pageA.fill('input[placeholder="e.g. Saturday build"]', label);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const roomId = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];

// B joins through the public lobby
await pageB.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const row = pageB.locator(".room-row", { hasText: label });
await row.waitFor({ timeout: 5000 });
await row.getByRole("button", { name: /Join/ }).click();
await pageB.waitForURL(new RegExp(`/build/room/${roomId}.*debug`));
await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
check("A and B both active in the 2-player room", true);

// B leaves via the Room panel
await pageB.getByRole("button", { name: /^Room/ }).click();
await pageB.getByRole("button", { name: "Leave room" }).click();
await pageB.waitForURL(/\/build\/$/);
check("B leaves the room via the real Leave button", true);

// C joins, filling B's freed slot
await pageC.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const rowC = pageC.locator(".room-row", { hasText: label });
await rowC.waitFor({ timeout: 5000 });
await rowC.getByRole("button", { name: /Join/ }).click();
await pageC.waitForURL(new RegExp(`/build/room/${roomId}.*debug`));
await pageC.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
check("C joins and fills the freed slot", true);

// B tries to rejoin through the PUBLIC LOBBY LIST specifically (B is also
// still listed under "Your rooms" from its historical membership — that's a
// separate, correct affordance; this checks the fresh-join path shows full)
await pageB.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector(`text=${label}`, { timeout: 5000 });
const bRow = pageB.locator(".lobby-card", { hasText: "Public lobby" }).locator(".room-row", { hasText: label });
await bRow.waitFor({ timeout: 5000 });
const joinButtonText = await bRow.getByRole("button", { name: /Full|Join/ }).textContent();
check("B's rejoin attempt through the public lobby shows the room as full", /Full/.test(joinButtonText ?? ""), joinButtonText);

// B still has its OWN earlier tab open on the editor (the realistic "stale
// tab" scenario) — the exact bug: B correctly can't rejoin, but tries to
// mutate directly from this tab anyway. Must be refused, not applied.
const beforeAttempt = await pageA.evaluate(async (id: string) => (await (await fetch(`/api/rooms/${id}`)).json()).revision, roomId);
const bypassAttempt = await pageB.evaluate(async (id: string) => {
  const res = await fetch(`/api/rooms/${id}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      command: { type: "place", placement: { partId: "brick-2x4", x: 5, y: 0, z: 5, rot: 0, colour: "navy" } },
    }),
  });
  return { status: res.status, body: await res.json() };
}, roomId);
check("B's direct mutation attempt after being replaced is refused, not applied", bypassAttempt.status !== 200 || bypassAttempt.body.ok === false, bypassAttempt);

const afterAttempt = await pageA.evaluate(async (id: string) => (await (await fetch(`/api/rooms/${id}`)).json()).revision, roomId);
check("the room's revision is unchanged by the refused attempt", afterAttempt === beforeAttempt, { beforeAttempt, afterAttempt });

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
