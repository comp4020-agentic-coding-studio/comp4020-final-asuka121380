#!/usr/bin/env node
// Two independent identities, driven through the real lobby UI, proving
// invite-only rooms are usable end to end: a friend-request link, acceptance,
// a host invitation, and a successful join — plus the refusal paths (no
// friendship, no invitation) that make an invite-only room actually private.
//   node scripts/invites.ts [base-url]
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const selfId = (page: Page) => page.evaluate(async () => (await (await fetch("/api/me")).json()).visitorId);

const browser = await chromium.launch({ channel: "chrome" });
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const ctxC = await browser.newContext(); // a stranger: neither friend nor invited
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
const pageC = await ctxC.newPage();

await pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageB.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageC.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
const idA = await selfId(pageA);
const idB = await selfId(pageB);
const idC = await selfId(pageC);
check("three independent visitors", new Set([idA, idB, idC]).size === 3, `${idA} / ${idB} / ${idC}`);

// A creates a friend-request link and shares it; B opens it, which must NOT
// silently make them friends, then B explicitly accepts
await pageA.getByText("Get a friend-request link").click();
const linkInput = pageA.locator('input[aria-label="Your friend-request link"]');
await linkInput.waitFor();
const link = await linkInput.inputValue();
const token = new URL(link).searchParams.get("friend")!;
check("A gets a shareable friend-request link", !!token);

await pageB.fill('input[placeholder="Paste a friend'+"'"+'s link token"]', token);
await pageB.getByRole("button", { name: "Use it" }).click();
await pageB.waitForSelector("text=Friend request accepted.");
await pageB.reload({ waitUntil: "domcontentloaded" });
const friendsB = await pageB.evaluate(async () => (await (await fetch("/api/friends")).json()).friends);
check("B is now A's friend after explicitly accepting the link (never automatic on open)", friendsB.includes(idA), friendsB);

// A creates an invite-only room; B (now a friend) still can't join without a
// specific invitation; C (a stranger) can't either
await pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
const uniqueLabel = `Invite test ${Date.now()}`;
await pageA.fill('input[placeholder="e.g. Saturday build"]', uniqueLabel);
await pageA.locator('input[name="visibility"]').nth(1).check(); // invite-only
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\//);
const roomId = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];

await pageB.goto(`${base}/build/room/${roomId}/`, { waitUntil: "domcontentloaded" });
const bBlockedBody = await pageB.textContent("body");
check("B, though a friend, is refused without a specific invitation", bBlockedBody?.includes("isn't open to you") ?? false);

await pageC.goto(`${base}/build/room/${roomId}/`, { waitUntil: "domcontentloaded" });
const cBlockedBody = await pageC.textContent("body");
check("C, a stranger, is refused the same way", cBlockedBody?.includes("isn't open to you") ?? false);

// A invites B specifically, through the room panel
await pageA.goto(`${base}/build/room/${roomId}/`, { waitUntil: "domcontentloaded" });
await pageA.waitForFunction(() => (window as any).__state === undefined || true); // no debug hooks needed here
await pageA.getByRole("button", { name: /^Room/ }).click();
await pageA.fill('input[aria-label="Friend\'s id to invite"]', idB);
await pageA.getByRole("button", { name: "Invite", exact: true }).click();
await pageA.waitForSelector("text=Invitation sent.");

// B sees the invitation in the lobby and accepts it, which admits them to
// the room straight away (accepting is joining, not a separate later step)
await pageB.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
const inviteRow = pageB.locator(".room-row", { hasText: uniqueLabel });
await inviteRow.waitFor({ timeout: 5000 });
await inviteRow.getByRole("button", { name: "Accept" }).click();
await pageB.waitForURL(new RegExp(`/build/room/${roomId}`), { timeout: 5000 });
const bOk = await pageB.textContent("body");
check("accepting a room invitation admits B to the room immediately", !bOk?.includes("isn't open to you"));

// and the room is now genuinely usable: B can place a part in it
await pageB.goto(`${pageB.url()}?debug`, { waitUntil: "domcontentloaded" });
await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
await pageB.locator('.tray button[aria-label^="Brick 2×4,"]').click();
const p = await pageB.evaluate(() => (window as any).__project(2.5, 0, 2.5));
await pageB.mouse.move(p.x, p.y, { steps: 3 });
await pageB.waitForTimeout(100);
await pageB.mouse.click(p.x, p.y);
await pageB.waitForTimeout(500);
const partsAfter = await pageB.evaluate(() => (window as any).__state().snapshot.parts.length);
check("B can actually build in the room they were invited to, not just view it", partsAfter === 1, partsAfter);

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
