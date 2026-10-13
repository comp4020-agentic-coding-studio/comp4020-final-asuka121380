#!/usr/bin/env node
// Two independent browser identities, driven entirely through the real
// website (the lobby at /build/ and the editor at /build/room/:id), proving
// the end-to-end room flow the phase 2 brief asks for: creating a room,
// joining it as a second, separately-cookied visitor, both placing, editing
// and removing real bricks, proposing and realizing a plan, marking it for
// each other, and reconnecting — never by injecting room membership or
// calling the API directly to set up state a visitor couldn't reach by
// clicking.
//   node scripts/multiplayer.ts [base-url] [out-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/multiplayer";
mkdirSync(out, { recursive: true });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const state = (page: Page) => page.evaluate(() => (window as any).__state());
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);
const cell = (page: Page, x: number, z: number, plates = 0) => project(page, x + 0.5, plates * 0.4 + (plates > 0 ? 0.18 : 0), z + 0.5);

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(350);
}

async function place(page: Page, x: number, z: number, partLabel = "Brick 2×4"): Promise<void> {
  await page.locator(`.tray button[aria-label^="${partLabel},"]`).click();
  const p = await cell(page, x, z);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y);
  await settle(page);
  await page.keyboard.press("Escape"); // put the part down so a second actor's click isn't aimed through it
}

/** Waits until `predicate(await state(page))` is true, polling fast; returns the elapsed ms, or -1 on timeout. */
async function waitForConvergence(page: Page, predicate: (s: any) => boolean, timeoutMs = 3000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate(await state(page))) return Date.now() - start;
    await page.waitForTimeout(40);
  }
  return -1;
}

const browser = await chromium.launch({ channel: "chrome" });

// ---- two independent identities: two browser contexts, two cookie jars ----
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
const errorsA: string[] = [];
const errorsB: string[] = [];
pageA.on("pageerror", (e) => errorsA.push(String(e)));
pageA.on("console", (m) => m.type() === "error" && errorsA.push(m.text()));
pageB.on("pageerror", (e) => errorsB.push(String(e)));
pageB.on("console", (m) => m.type() === "error" && errorsB.push(m.text()));

// A creates a public room through the lobby UI. ?debug carries through the
// lobby's own navigation (LobbyApp.goTo keeps location.search), so the
// editor it opens already has the debug hooks installed.
const label = `Multiplayer check ${Date.now()}`; // unique per run, so a prior run's leftover public room is never matched
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Create and open");
await pageA.fill('input[placeholder="e.g. Saturday build"]', label);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
await pageA.waitForFunction(() => (window as any).__state?.().snapshot);
const roomUrl = pageA.url();
const roomId = roomUrl.match(/\/build\/room\/([^/?]+)/)![1];
check("A creates a room through the lobby and it's a fresh, empty room", (await state(pageA)).snapshot.parts.length === 0, roomUrl);

// B discovers and joins the SAME room through the public lobby list, as a
// completely independent visitor (a fresh context has never had a cookie)
await pageB.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector("text=Public lobby");
const row = pageB.locator(".room-row", { hasText: label });
await row.waitFor({ timeout: 5000 });
await row.getByRole("button", { name: /Join/ }).click();
await pageB.waitForURL(new RegExp(`/build/room/${roomId}.*debug`));
await pageB.waitForFunction(() => (window as any).__state?.().snapshot);
check("B joins the same room by browsing the public lobby, not by an injected membership", (await state(pageB)).snapshot.roomId === roomId);

const idA = (await state(pageA)).selfId;
const idB = (await state(pageB)).selfId;
check("A and B are distinct identities", idA && idB && idA !== idB, `${idA} / ${idB}`);

// both are now listed as current members on EACH OTHER's screen
await pageA.waitForFunction(() => (window as any).__state().snapshot.members.length === 2, null, { timeout: 3000 }).catch(() => {});
let sA = await state(pageA);
check("A's own screen shows both members once B has joined", sA.snapshot.members.length === 2, sA.snapshot.members.map((m: any) => m.visitorId));

// ---- real building changes propagate, not just plan marks -----------------
// A places a real brick; measure how long until B's own live snapshot shows it
const beforeB = (await state(pageB)).snapshot.revision;
const tPlaceStart = Date.now();
await place(pageA, 2, 2);
const elapsedPlace = await waitForConvergence(pageB, (s) => s.snapshot.revision > beforeB && s.snapshot.parts.length === 1);
check(
  `B's screen shows A's placement within about a second (no reload)`,
  elapsedPlace >= 0 && elapsedPlace < 1000,
  `${elapsedPlace}ms`,
);
void tPlaceStart;

// B recolours the part A placed; measure propagation back to A. Selecting it
// is a real click at the part's projected screen position — a 2×4 brick
// sitting on the plot, so its top face is a safe, unambiguous click target.
const placedPart = (await state(pageB)).snapshot.parts[0];
const partScreen = await project(pageB, placedPart.x + 2, 1.0, placedPart.z + 1); // near the top of a brick-2x4 (3 plates, 1.2 tall)
await pageB.mouse.move(partScreen.x, partScreen.y, { steps: 3 });
await pageB.waitForTimeout(100);
await pageB.mouse.click(partScreen.x, partScreen.y);
await pageB.waitForFunction(() => (window as any).__state().selectedId, null, { timeout: 2000 }).catch(() => {});
const selectedOnB = (await state(pageB)).selectedId;
// captured BEFORE the recolour commits, so the convergence check below can
// never race against an SSE push that already landed by the time it reads
const beforeA = (await state(pageA)).snapshot.revision;
if (selectedOnB) {
  const swatch = pageB.locator('.swatch-run button[aria-label="Turquoise"]');
  await swatch.waitFor({ state: "visible", timeout: 2000 });
  await swatch.click();
  await settle(pageB);
}
const colourChanged = selectedOnB
  ? await waitForConvergence(pageA, (s) => s.snapshot.parts[0]?.colour === "turquoise" && s.snapshot.revision > beforeA)
  : -1;
check("A's screen shows B's recolour of the same part", colourChanged >= 0 && colourChanged < 1000, `${colourChanged}ms`);

// A removes it; measure propagation to B
if (selectedOnB) {
  await pageA.mouse.move(partScreen.x, partScreen.y, { steps: 3 });
  await pageA.waitForTimeout(100);
  await pageA.mouse.click(partScreen.x, partScreen.y); // select on A's own screen
  await pageA.waitForFunction(() => (window as any).__state().selectedId, null, { timeout: 2000 }).catch(() => {});
}
const selectedOnA = (await state(pageA)).selectedId;
if (selectedOnA) {
  await pageA.keyboard.press("Delete");
  await settle(pageA);
}
const removed = selectedOnA ? await waitForConvergence(pageB, (s) => s.snapshot.parts.length === 0) : -1;
check("B's screen shows A's removal of the part", removed >= 0 && removed < 1000, `${removed}ms`);

// ---- independent simultaneous placements both succeed (ADR 0008) ----------
const beforeBothA = (await state(pageA)).snapshot.parts.length;
await Promise.all([place(pageA, 0, 0, "Brick 2×2"), place(pageB, 6, 4, "Brick 2×2")]);
await pageA.waitForFunction((n: number) => (window as any).__state().snapshot.parts.length >= n, beforeBothA + 2, { timeout: 3000 }).catch(() => {});
const bothSettled = await waitForConvergence(pageB, (s) => s.snapshot.parts.length === beforeBothA + 2);
check("two simultaneous placements in different spots both succeed and both screens converge", bothSettled >= 0, `${bothSettled}ms`);

// ---- plans and marks, in the real editor (ADR 0009) ------------------------
await pageA.locator(`.tray button[aria-label^="Brick 2×4,"]`).click();
const planCell = await cell(pageA, 10, 1);
await pageA.mouse.move(planCell.x, planCell.y, { steps: 3 });
await pageA.waitForTimeout(150);
await pageA.locator('button:has-text("Propose instead")').click();
await settle(pageA);
await pageA.keyboard.press("Escape");
const planConverged = await waitForConvergence(pageB, (s) => s.snapshot.plans.length === 1);
check("B sees A's proposed plan appear live", planConverged >= 0 && planConverged < 1000, `${planConverged}ms`);

const plan = (await state(pageB)).snapshot.plans[0];
const planScreen = await project(pageB, plan.x + 2, 1.0, plan.z + 1); // a brick-2x4 plan, same top-face target as above
await pageB.mouse.move(planScreen.x, planScreen.y, { steps: 3 });
await pageB.waitForTimeout(100);
await pageB.mouse.click(planScreen.x, planScreen.y);
await pageB.waitForFunction(() => (window as any).__state().selectedPlanId, null, { timeout: 2000 }).catch(() => {});
const bSelectedPlan = (await state(pageB)).selectedPlanId;
check("B can select A's plan", !!bSelectedPlan);
if (bSelectedPlan) {
  await pageA.mouse.move(planScreen.x, planScreen.y, { steps: 3 });
  await pageA.waitForTimeout(100);
  await pageA.mouse.click(planScreen.x, planScreen.y); // A looks at the same spot too
  await pageB.locator('button:has-text("Mark for everyone")').click();
  const markConverged = await waitForConvergence(pageA, (s) => Object.keys(s.marks).includes(plan.id));
  check("A sees B's live mark on the plan", markConverged >= 0 && markConverged < 1000, `${markConverged}ms`);

  await pageB.locator('button:has-text("Build this")').click();
  await settle(pageB);
  const realizeConverged = await waitForConvergence(pageA, (s) => s.snapshot.plans.length === 0 && s.snapshot.parts.some((p: any) => p.x === plan.x && p.z === plan.z));
  check("A sees B's realized plan become a real part", realizeConverged >= 0 && realizeConverged < 1000, `${realizeConverged}ms`);
}

// ---- reconnection restores authoritative state (ADR 0008) ------------------
const beforeReload = (await state(pageB)).snapshot.parts.length;
await pageB.reload({ waitUntil: "domcontentloaded" });
await pageB.waitForFunction(() => (window as any).__state?.().snapshot, null, { timeout: 10000 });
const afterReload = (await state(pageB)).snapshot.parts.length;
check("B's reload restores the authoritative room state, not an empty or stale one", afterReload === beforeReload, `${beforeReload} → ${afterReload}`);

// ---- screenshots -------------------------------------------------------
await pageA.screenshot({ path: `${out}/a-final.png` });
await pageB.screenshot({ path: `${out}/b-final.png` });

check("no console errors on A", errorsA.length === 0, errorsA.join(" | "));
check("no console errors on B", errorsB.length === 0, errorsB.join(" | "));

await browser.close();

writeFileSync(`${out}/results.json`, JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed; results in ${out}/results.json`);
process.exit(pass === results.length ? 0 : 1);
