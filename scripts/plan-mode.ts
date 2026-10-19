#!/usr/bin/env node
// Plan mode (ADR 0011), driven through the real editor in two independent
// browser contexts (two cookie jars, two identities) against a running
// server: the mode control and P, clicking the scene in each mode, the
// created plan matching the preview shown before the click, planning demand
// on both screens over SSE, withdraw/realize changing it, realization with
// no real stock left, Escape, typing in a field, and a touch-emulated phone.
//   node scripts/plan-mode.ts [base-url] [out-dir]
// The phone run is Chrome's touch emulation at 390×844, not a physical device.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/plan-mode";
mkdirSync(out, { recursive: true });

type Result = { run: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
let run = "";
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ run, name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  [${run}] ${name}${d ? `  — ${d}` : ""}`);
}

const state = (page: Page) => page.evaluate(() => (window as any).__state());
const pv = (page: Page) => page.evaluate(() => (window as any).__preview());
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);
const cellAt = (page: Page, x: number, z: number) => project(page, x + 0.5, 0, z + 0.5);
const tray = (page: Page, name: string) => page.locator(`.tray button[aria-label^="${name},"]`);
const planned = (s: any, partId: string): number =>
  (s.snapshot.inventory[partId] ?? 0) - s.snapshot.plans.filter((p: any) => p.partId === partId).length;

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function waitFor(page: Page, predicate: (s: any) => boolean, timeoutMs = 3000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate(await state(page))) return Date.now() - start;
    await page.waitForTimeout(40);
  }
  return -1;
}

async function hover(page: Page, x: number, z: number): Promise<{ x: number; y: number }> {
  const p = await cellAt(page, x, z);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(120);
  return p;
}

const key = (q: any) => `${q.partId}@${q.x},${q.y},${q.z}r${q.rot}:${q.colour}`;

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });

// ---- desktop: two independent identities --------------------------------
run = "desktop-two-contexts";
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();
const errors: string[] = [];
for (const [n, pg] of [["A", pageA], ["B", pageB]] as const) {
  pg.on("pageerror", (e) => errors.push(`${n}: ${e}`));
  pg.on("console", (m) => m.type() === "error" && errors.push(`${n}: ${m.text()}`));
}

const label = `Plan mode check ${Date.now()}`;
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageA.fill('input[placeholder="e.g. Saturday build"]', label);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const roomId = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];

await pageB.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const row = pageB.locator(".room-row", { hasText: label });
await row.waitFor({ timeout: 5000 });
await row.getByRole("button", { name: /Join/ }).click();
await pageB.waitForURL(new RegExp(`/build/room/${roomId}.*debug`));
await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
await pageA.keyboard.press("t");
await pageB.keyboard.press("t");
await pageA.waitForTimeout(900);
await pageB.waitForTimeout(900);

let sA = await state(pageA);
check("A starts in Build mode, with the Build button pressed", sA.mode === "build" && (await pageA.getByRole("button", { name: "Build mode", exact: true }).getAttribute("aria-pressed")) === "true");
const kit24 = sA.snapshot.inventory["brick-2x4"];

// 1. Build mode: a click still places a real part
await tray(pageA, "Brick 2×4").click();
let p = await hover(pageA, 1, 0);
await pageA.mouse.click(p.x, p.y);
await settle(pageA);
sA = await state(pageA);
check("Build mode: a click on the scene places a real part and spends real stock", sA.snapshot.parts.length === 1 && sA.snapshot.plans.length === 0 && sA.snapshot.inventory["brick-2x4"] === kit24 - 1, { parts: sA.snapshot.parts.length, stock: sA.snapshot.inventory["brick-2x4"] });

// 2. the visible Plan button enters Plan mode; B's mode is untouched
await pageA.getByRole("button", { name: "Plan mode", exact: true }).click();
sA = await state(pageA);
let sB = await state(pageB);
check("the Plan button enters Plan mode, with pressed state and a text tag", sA.mode === "plan" && (await pageA.getByRole("button", { name: "Plan mode", exact: true }).getAttribute("aria-pressed")) === "true" && (await pageA.locator(".context .plan-tag").count()) === 1);
check("A's Plan mode is local: B stays in Build mode", sB.mode === "build", sB.mode);
check("the held part and its preview survive the switch", sA.held?.partId === "brick-2x4");
check("Place is replaced by Propose plan; there is no 'Propose instead' button", (await pageA.locator(".place-button").innerText()).startsWith("Propose plan") && (await pageA.getByRole("button", { name: "Propose instead" }).count()) === 0);

// 3. Plan mode: a click creates a plan exactly matching the visible preview
await pageA.locator('.context [role="radio"][aria-label="Sky blue"]').click().catch(() => {});
p = await hover(pageA, 9, 1);
const before = await pv(pageA);
await pageA.mouse.click(p.x, p.y);
await settle(pageA);
sA = await state(pageA);
const plan1 = sA.snapshot.plans[0];
check("Plan mode: a click on the scene creates a plan, not a real part", sA.snapshot.plans.length === 1 && sA.snapshot.parts.length === 1, { plans: sA.snapshot.plans.length, parts: sA.snapshot.parts.length });
check("the created plan is exactly the preview shown before the click", !!plan1 && key(plan1) === key(before.placement), { preview: key(before.placement), plan: plan1 && key(plan1) });
check("planning spends no real stock", sA.snapshot.inventory["brick-2x4"] === kit24 - 1, sA.snapshot.inventory["brick-2x4"]);
check("Plan mode stays on after proposing, with the part still held", sA.mode === "plan" && sA.held?.partId === "brick-2x4");

// 4. B sees the plan and the planning demand live
const t0 = Date.now();
const seen = await waitFor(pageB, (s) => s.snapshot.plans.length === 1);
check("B receives A's plan live over SSE", seen >= 0 && seen < 1000, `${seen}ms (${Date.now() - t0}ms wall)`);

// 5. an unsupported future position, reached with Higher in Plan mode
p = await hover(pageA, 9, 5);
for (let i = 0; i < 4; i++) {
  await pageA.getByRole("button", { name: /Higher:/ }).click();
  await pageA.waitForTimeout(60);
}
const high = await pv(pageA);
check("Plan mode: Higher climbs to a height nothing supports", high.placement.y > 0 && !!high.rejection && !high.planRejection, { y: high.placement.y, real: high.rejection?.code });
check("the preview says 'Plan here' in text", (await pageA.locator(".ghost-label").innerText()).includes("Plan here"));
await pageA.screenshot({ path: `${out}/a-plan-mode-unsupported.png` });
await pageA.keyboard.press("Enter");
await settle(pageA);
sA = await state(pageA);
const plan2 = sA.snapshot.plans.find((q: any) => q.id !== plan1.id);
check("Enter in Plan mode proposes that unsupported position exactly", !!plan2 && key(plan2) === key(high.placement) && sA.snapshot.parts.length === 1, plan2 && key(plan2));

// 6. P toggles back to Build; Higher no longer climbs into unsupported space, and a click is real again
await pageA.keyboard.press("p");
sA = await state(pageA);
check("P switches back to Build mode", sA.mode === "build");
await pageA.mouse.move(10, 10); // off the scene, so nothing re-aims
const inBuild = await pv(pageA);
const higherDisabled = await pageA.getByRole("button", { name: /Higher:/ }).isDisabled();
check("Build mode: Higher can't reach unsupported heights", inBuild.fits.every((f: number) => f <= inBuild.placement.y) ? higherDisabled : true, { y: inBuild.placement.y, fits: inBuild.fits, higherDisabled });
p = await hover(pageA, 5, 3);
const buildPreview = await pv(pageA);
await pageA.mouse.click(p.x, p.y);
await settle(pageA);
sA = await state(pageA);
check("after switching back, a click places a real part at the preview, not a plan", sA.snapshot.parts.length === 2 && sA.snapshot.plans.length === 2 && sA.snapshot.parts.some((q: any) => key(q) === key(buildPreview.placement)), { parts: sA.snapshot.parts.length, plans: sA.snapshot.plans.length });

// 7. planned remaining: shown in Plan mode on both screens, real count in Build mode
await pageA.keyboard.press("p");
const real24 = sA.snapshot.inventory["brick-2x4"];
const tileA = await tray(pageA, "Brick 2×4").getAttribute("aria-label");
check("A's tray in Plan mode shows planned remaining and the real count, named separately", tileA === `Brick 2×4, planned remaining ${real24 - 2}; ${real24} real left`, tileA);
await pageB.getByRole("button", { name: "Plan mode", exact: true }).click();
await waitFor(pageB, (s) => s.snapshot.parts.length === 2);
const tileB = await tray(pageB, "Brick 2×4").getAttribute("aria-label");
check("B's tray shows the same room-wide planned remaining", tileB === tileA, tileB);
await pageB.getByRole("button", { name: "Build mode", exact: true }).click();
const tileBuild = await tray(pageB, "Brick 2×4").getAttribute("aria-label");
check("in Build mode the tray shows only the real count", tileBuild === `Brick 2×4, ${real24} left`, tileBuild);

// 8. planned remaining goes negative: plan more 1×2 bricks than the room has
sA = await state(pageA);
const kit12 = sA.snapshot.inventory["brick-1x2"];
await tray(pageA, "Brick 1×2").click();
// cells well clear of the dock in top view; plans may overlap anything
const spots = [[0, 3], [2, 3], [0, 4], [2, 4], [12, 1], [14, 1], [12, 3], [14, 3]];
for (let i = 0; i < kit12 + 2; i++) {
  p = await hover(pageA, spots[i][0], spots[i][1]);
  await pageA.mouse.click(p.x, p.y);
  await settle(pageA);
}
sA = await state(pageA);
const short12 = planned(sA, "brick-1x2");
check("plans beyond the real stock are accepted, and planned remaining goes below zero", short12 === -2 && sA.snapshot.inventory["brick-1x2"] === kit12, { planned: short12, real: sA.snapshot.inventory["brick-1x2"] });
const badge = await tray(pageA, "Brick 1×2").locator(".count").innerText();
check("the tray badge shows the negative planned count", badge.includes("-2") || badge.includes("−2"), badge);
const negB = await waitFor(pageB, (s) => planned(s, "brick-1x2") === -2);
check("B's planning demand updates live to the same negative value", negB >= 0, `${negB}ms`);
await pageA.screenshot({ path: `${out}/a-planned-negative.png` });

// 9. negative demand never blocks B from building for real
await tray(pageB, "Brick 1×2").click();
p = await hover(pageB, 14, 0);
await pageB.mouse.click(p.x, p.y);
await settle(pageB);
sB = await state(pageB);
check("B can still place a real Brick 1×2 while planned remaining is negative", sB.snapshot.inventory["brick-1x2"] === kit12 - 1 && sB.snapshot.parts.some((q: any) => q.partId === "brick-1x2"), sB.notice?.text);
await pageB.keyboard.press("Escape");

// 10. withdrawing a plan restores planned remaining on both screens
const bPlans = (await state(pageB)).snapshot.plans.filter((q: any) => q.partId === "brick-1x2");
const toWithdraw = bPlans[0];
const before10 = planned(await state(pageB), "brick-1x2");
let tp = await project(pageB, toWithdraw.x + 1, 0.3, toWithdraw.z + 0.5);
await pageB.mouse.move(tp.x, tp.y, { steps: 3 });
await pageB.mouse.click(tp.x, tp.y);
await pageB.waitForFunction(() => (window as any).__state().selectedPlanId, null, { timeout: 2000 }).catch(() => {});
const selected = (await state(pageB)).selectedPlanId;
if (selected) {
  await pageB.getByRole("button", { name: "Withdraw" }).click();
  await settle(pageB);
}
const w = await waitFor(pageA, (s) => planned(s, "brick-1x2") === before10 + 1);
check("withdrawing a plan (by B, not its proposer) restores planned remaining by one, on A's screen too", !!selected && w >= 0, { selected: !!selected, ms: w });

// 11. realizing a plan consumes real stock once and removes its demand
await pageA.keyboard.press("Escape");
await pageA.keyboard.press("p"); // to Build: selecting plans is the same in either mode
sA = await state(pageA);
const target = sA.snapshot.plans.find((q: any) => q.partId === "brick-2x4" && q.y === 0);
const real0 = sA.snapshot.inventory["brick-2x4"];
const dem0 = planned(sA, "brick-2x4");
tp = await project(pageA, target.x + 2, 1.0, target.z + 1);
await pageA.mouse.move(tp.x, tp.y, { steps: 3 });
await pageA.mouse.click(tp.x, tp.y);
await pageA.waitForFunction(() => (window as any).__state().selectedPlanId, null, { timeout: 2000 }).catch(() => {});
await pageA.getByRole("button", { name: /Build this/ }).click();
await settle(pageA);
sA = await state(pageA);
check(
  "realizing a plan spends real stock exactly once and its demand disappears (planned remaining unchanged)",
  sA.snapshot.inventory["brick-2x4"] === real0 - 1 && planned(sA, "brick-2x4") === dem0 && !sA.snapshot.plans.some((q: any) => q.id === target.id),
  { real: `${real0} → ${sA.snapshot.inventory["brick-2x4"]}`, planned: `${dem0} → ${planned(sA, "brick-2x4")}` },
);

// 12. realization with no real stock left fails and leaves the plan open
sA = await state(pageA);
const left12 = sA.snapshot.inventory["brick-1x2"];
await tray(pageA, "Brick 1×2").click();
for (let i = 0; i < left12; i++) {
  p = await hover(pageA, i * 2, 2);
  await pageA.mouse.click(p.x, p.y);
  await settle(pageA);
}
await pageA.keyboard.press("Escape");
sA = await state(pageA);
const orphan = sA.snapshot.plans.find((q: any) => q.partId === "brick-1x2");
check("the room's real Brick 1×2 stock is used up", sA.snapshot.inventory["brick-1x2"] === 0, sA.snapshot.inventory["brick-1x2"]);
const res = await pageA.evaluate(
  async ([roomId, planId, rev]) => {
    const r = await fetch(`/api/rooms/${roomId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision: rev, command: { type: "realize-plan", planId } }),
    });
    return r.json();
  },
  [roomId, orphan.id, sA.snapshot.revision] as const,
);
check("realizing with no real stock is refused out_of_stock and the plan stays open", res.ok === false && res.code === "out_of_stock" && res.snapshot.plans.some((q: any) => q.id === orphan.id), res.code);

// 13. Escape puts the part down but keeps Plan mode; P while typing does nothing
await pageA.keyboard.press("p");
await tray(pageA, "Brick 2×2").click();
await pageA.keyboard.press("Escape");
sA = await state(pageA);
check("Escape puts the held part down and leaves the mode as chosen", sA.held === null && sA.mode === "plan");
await pageA.evaluate(() => {
  const i = document.createElement("input");
  i.id = "probe";
  document.body.append(i);
  i.focus();
});
await pageA.keyboard.type("pP");
sA = await state(pageA);
check("typing P in a text field is not a shortcut", sA.mode === "plan" && (await pageA.inputValue("#probe")) === "pP");
await pageA.evaluate(() => document.getElementById("probe")?.remove());
await pageA.screenshot({ path: `${out}/a-final.png` });
await pageB.screenshot({ path: `${out}/b-final.png` });
// step 12's deliberately refused realization is the only expected failed request
const unexpected = errors.filter((e) => !/status of 422/.test(e));
check("no console errors in either context, beyond the deliberately refused realization", unexpected.length === 0 && errors.length <= 1, errors.join(" | "));
await ctxA.close();
await ctxB.close();

// ---- phone, emulated touch ------------------------------------------------
{
  run = "touch-emulated-390x844";
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create and open" }).click();
  await page.waitForURL(/\/build\/room\//);
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
  await page.locator(".chip-button", { hasText: "Top view" }).tap();
  await page.waitForTimeout(900);
  const planBtn = page.getByRole("button", { name: "Plan mode", exact: true });
  const box = await planBtn.boundingBox();
  check("the Plan button is on screen and at least 40 px tall", !!box && box.x >= 0 && box.x + box.width <= 390 && box.height >= 40, box);
  await planBtn.tap();
  await tray(page, "Plate 2×2").tap();
  let s = await state(page);
  check("tapping Plan, then a part, holds it in Plan mode", s.mode === "plan" && s.held?.partId === "plate-2x2");
  const c = await cellAt(page, 4, 2);
  await page.touchscreen.tap(c.x, c.y);
  await settle(page);
  s = await state(page);
  check("the first tap previews; nothing is created", s.snapshot.plans.length === 0 && s.snapshot.parts.length === 0);
  const shown = await pv(page);
  await page.screenshot({ path: `${out}/mobile-plan-preview.png` });
  await page.touchscreen.tap(c.x, c.y);
  await settle(page);
  s = await state(page);
  check("the second tap on the preview proposes exactly that plan", s.snapshot.plans.length === 1 && s.snapshot.parts.length === 0 && key(s.snapshot.plans[0]) === key(shown.placement), s.snapshot.plans.map(key));
  const dock = await page.locator(".dock").boundingBox();
  check("the dock still fits the 390 px screen in Plan mode", !!dock && dock.x >= 0 && dock.x + dock.width <= 390.5, dock);
  await page.screenshot({ path: `${out}/mobile-plan-proposed.png` });
  check("no console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

await browser.close();
writeFileSync(`${out}/results.json`, `${JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed; results in ${out}/results.json`);
process.exit(failed.length ? 1 : 0);
