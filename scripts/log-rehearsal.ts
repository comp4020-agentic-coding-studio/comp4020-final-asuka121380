#!/usr/bin/env node
// A scripted, local rehearsal of the Crit 10 permission procedure (ADR 0013,
// "Procedure A"), driven through the visible UI in two independent browser
// contexts, followed by the server log lines that run produced. It checks
// that the log alone can tell the story; it is NOT a two-person test and
// says nothing about whether newcomers can find their way unassisted.
//
// Start a local server with its stdout captured to a file, then run:
//   DATA_DIR=/tmp/rehearsal PORT=8395 node src/server/index.ts > /tmp/rehearsal/server.log
//   node scripts/log-rehearsal.ts http://localhost:8395 /tmp/rehearsal/server.log <out-dir>
//
// Procedure A: A creates an invite-only room; B tries the link and is
// refused; they become friends; A invites B; B accepts and joins; both
// build, B proposes a plan, A builds it. Never run against the deployed app.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8395";
const logPath = process.argv[3];
const out = process.argv[4] ?? "/tmp/brick-log-rehearsal";
if (!logPath) throw new Error("usage: node scripts/log-rehearsal.ts <base-url> <server-stdout-file> [out-dir]");
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(base)) throw new Error("local servers only: this script writes rooms and accounts");
mkdirSync(out, { recursive: true });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const startedAt = new Date().toISOString();
const state = (page: Page) => page.evaluate(() => (window as any).__state());
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(300);
}
async function clickCell(page: Page, x: number, z: number, y = 0): Promise<void> {
  const p = await project(page, x + 0.5, y, z + 0.5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
  await settle(page);
}
const selfId = (page: Page): Promise<string> => page.evaluate(async () => (await (await fetch("/api/me")).json()).visitorId);

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

// Both arrive with nothing but the URL. A first page load sends several
// requests before any cookie exists, and each creates a visitor; the browser
// keeps whichever cookie came back last (visible in the log as several
// visitor.new lines at once). Read each identity only once that has settled.
await pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageB.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
for (const pg of [pageA, pageB]) {
  await pg.waitForTimeout(1500);
  await pg.reload({ waitUntil: "domcontentloaded" });
}
const idA = await selfId(pageA);
const idB = await selfId(pageB);
check("two independent visitors", idA !== idB, `${idA.slice(0, 8)} / ${idB.slice(0, 8)}`);

// 1. A creates an invite-only room
await pageA.fill('input[placeholder="e.g. Saturday build"]', "Rehearsal");
await pageA.locator('input[name="visibility"]').nth(1).check();
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\//);
const roomId = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];

// 2. B opens the room's link without an invitation and is refused
await pageB.goto(`${base}/build/room/${roomId}/`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector("text=isn't open to you", { timeout: 10000 }).catch(() => {});
check("B is refused without an invitation", (await pageB.textContent("body"))?.includes("isn't open to you") ?? false);

// 3. they become friends through A's link (invitations go only to friends)
await pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageA.getByText("Get a friend-request link").click();
const linkInput = pageA.locator('input[aria-label="Your friend-request link"]');
await linkInput.waitFor();
const token = new URL(await linkInput.inputValue()).searchParams.get("friend")!;
await pageB.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageB.fill('input[placeholder="Paste a friend' + "'" + 's link token"]', token);
await pageB.getByRole("button", { name: "Use it" }).click();
await pageB.waitForSelector("text=Friend request accepted.");

// 4. A invites B from the room panel
await pageA.goto(`${base}/build/room/${roomId}/`, { waitUntil: "domcontentloaded" });
await pageA.getByRole("button", { name: /^Room/ }).click();
await pageA.locator('select[aria-label="Friend to invite"]').selectOption(idB);
await pageA.getByRole("button", { name: "Invite", exact: true }).click();
await pageA.waitForSelector("text=Invitation sent.");
await pageA.keyboard.press("Escape");

// 5. B accepts in the lobby, which admits B to the room
await pageB.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
const row = pageB.locator(".room-row", { hasText: "Rehearsal" });
await row.waitFor({ timeout: 5000 });
await row.getByRole("button", { name: "Accept" }).click();
await pageB.waitForURL(new RegExp(`/build/room/${roomId}`), { timeout: 5000 });

// 6. both build: A places a brick, B proposes a plan on it, A builds B's plan
await pageA.goto(`${base}/build/room/${roomId}/?debug`, { waitUntil: "domcontentloaded" });
await pageB.goto(`${base}/build/room/${roomId}/?debug`, { waitUntil: "domcontentloaded" });
for (const pg of [pageA, pageB]) await pg.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
await pageA.locator('.tray button[aria-label^="Brick 2×4,"]').click();
await clickCell(pageA, 2, 2);
check("A places a real brick", (await state(pageA)).snapshot.parts.length === 1);
await pageA.keyboard.press("Escape");

await pageB.waitForFunction(() => (window as any).__state().snapshot.parts.length === 1);
await pageB.getByRole("button", { name: "Plan mode", exact: true }).click();
await pageB.locator('.tray button[aria-label^="Brick 2×4,"]').click();
await clickCell(pageB, 2, 2, 1.2); // over A's brick: the preview sits on its top
const sB = await state(pageB);
check("B proposes a plan on A's brick", sB.snapshot.plans.length === 1, sB.snapshot.plans.map((p: any) => `${p.x},${p.y},${p.z}`));
await pageB.keyboard.press("Escape");

await pageA.waitForFunction(() => (window as any).__state().snapshot.plans.length === 1);
const plan = (await state(pageA)).snapshot.plans[0];
const tp = await project(pageA, plan.x + 2, (plan.y + 1.5) * 0.4, plan.z + 2);
await pageA.mouse.move(tp.x, tp.y, { steps: 3 });
await pageA.mouse.click(tp.x, tp.y);
await pageA.waitForFunction(() => (window as any).__state().selectedPlanId, null, { timeout: 3000 }).catch(() => {});
await pageA.getByRole("button", { name: /Build this/ }).click();
await settle(pageA);
check("A builds B's plan", (await state(pageA)).snapshot.parts.length === 2 && (await state(pageA)).snapshot.plans.length === 0);

// 7. B tries to remove A's lower brick, which now holds up the built plan's brick: refused by the server
await pageB.waitForFunction(() => (window as any).__state().snapshot.parts.length === 2);
const lower = (await state(pageB)).snapshot.parts.find((p: any) => p.y === 0);
const refused = await pageB.evaluate(async ([roomId, part]) => {
  const res = await fetch(`/api/rooms/${roomId}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision: 0, command: { type: "remove", placedId: part.id, expectedRev: part.rev } }),
  });
  return res.status;
}, [roomId, lower] as const);
// (the editor refuses this locally before sending; the direct request shows the server's own check)
check("the server refuses removing a sole support", refused === 422, refused);

await browser.close();
await new Promise((r) => setTimeout(r, 300));

const lines = readFileSync(logPath, "utf8")
  .split("\n")
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l) as Record<string, unknown>)
  .filter((e) => typeof e.t === "string" && e.t >= startedAt);
const ofRun = lines.filter((e) => e.room === roomId || e.actor === idA.slice(0, 8) || e.actor === idB.slice(0, 8));
writeFileSync(`${out}/log-excerpt.jsonl`, ofRun.map((e) => JSON.stringify(e)).join("\n") + "\n");
writeFileSync(`${out}/results.json`, JSON.stringify({ base, startedAt, roomId, actors: { A: idA.slice(0, 8), B: idB.slice(0, 8) }, results }, null, 2) + "\n");

const has = (pred: (e: Record<string, unknown>) => boolean) => ofRun.some(pred);
const a = idA.slice(0, 8);
const b = idB.slice(0, 8);
// the editor asks for the pre-join preview first and is refused there, before any join is attempted
check("log: B refused at the room's door", has((e) => (e.event === "room.preview" || e.event === "room.join") && e.actor === b && e.outcome === "denied" && e.reason === "no_invitation"));
check("log: A invited B", has((e) => e.event === "room.invite" && e.actor === a && e.peer === b && e.outcome === "changed"));
check("log: B accepted", has((e) => e.event === "room.invite_response" && e.actor === b && e.reason === "accepted"));
check("log: A placed", has((e) => e.event === "command" && e.type === "place" && e.actor === a && e.outcome === "changed"));
check("log: B proposed", has((e) => e.event === "command" && e.type === "propose-plan" && e.actor === b && e.outcome === "changed"));
check("log: A built B's plan", has((e) => e.event === "command" && e.type === "realize-plan" && e.actor === a && e.author === b));
check("log: B's removal refused", has((e) => e.event === "command" && e.type === "remove" && e.actor === b && e.reason === "would_unsupport" && e.author === a));

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed; ${ofRun.length} log lines in ${out}/log-excerpt.jsonl`);
process.exit(pass === results.length ? 0 : 1);
