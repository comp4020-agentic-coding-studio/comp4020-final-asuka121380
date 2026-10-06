#!/usr/bin/env node
// Placement height and screen-relative moves (ADR 0005), driven through the
// real editor in the locally installed browser, against a running server.
//   node scripts/placement.ts [base-url] [out-dir] [browser]
// browser: "chrome" (default) or "webkit" (Playwright's WebKit build, the
// engine Safari uses; it is not Safari itself). Each run is a fresh visitor.
// The touch run is browser touch emulation, not a physical phone. State is
// read through the `?debug` hooks; `__orbit` moves only the camera.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/placement";
const engine = process.argv[4] ?? "chrome";
mkdirSync(out, { recursive: true });

type Result = { run: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
let run = "";
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ run, name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  [${run}] ${name}${d ? `  — ${d}` : ""}`);
}

type Placed = { id: string; partId: string; x: number; y: number; z: number; rot: number };
type Shown = { placement: Placed; rejection: { code: string; message: string } | null; fits: number[] } | null;

const parts = (page: Page): Promise<Placed[]> => page.evaluate(() => (window as any).__state().snapshot.parts);
const shown = (page: Page): Promise<Shown> => page.evaluate(() => (window as any).__preview());
const notice = (page: Page): Promise<string> => page.evaluate(() => (window as any).__state().notice?.text ?? "");
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);
const plates = (n: number) => n * 0.4;
/** The middle of grid cell (x, z) at a height in plates: on a part's top that's its stud's top face (0.18 up). */
const cell = (page: Page, x: number, z: number, h = 0) => project(page, x + 0.5, plates(h) + (h > 0 ? 0.18 : 0), z + 0.5);
/** The angle in degrees between a screen step and an intended screen direction. */
const off = (v: { x: number; y: number }, want: { x: number; y: number }) =>
  (Math.acos((v.x * want.x + v.y * want.y) / (Math.hypot(v.x, v.y) * Math.hypot(want.x, want.y))) * 180) / Math.PI;

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(350);
}

async function open(context: BrowserContext): Promise<{ page: Page; commands: () => number; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  let n = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) => r.url().endsWith("/api/command") && n++);
  await page.goto(`${base}/build/?debug`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__camera && (window as any).__orbit);
  await page.waitForTimeout(1200);
  return { page, commands: () => n, errors };
}

const tray = (page: Page, name: string) => page.locator(`.tray button[aria-label^="${name},"]`);
const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.png` });

async function hoverClick(page: Page, p: { x: number; y: number }): Promise<void> {
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
  await settle(page);
}

const launch = (): Promise<Browser> =>
  engine === "webkit" ? webkit.launch() : chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const browser = await launch();

// ---- desktop: heights, by mouse and keys ------------------------------------
{
  run = `${engine}-desktop-heights`;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, commands, errors } = await open(context);

  // an overhang: a 2×2 pillar at x 0–1, a 2×4 on it reaching over x 2–3
  await tray(page, "Brick 2×2").click();
  await hoverClick(page, await cell(page, 0, 0));
  await tray(page, "Brick 2×4").click();
  await hoverClick(page, await cell(page, 1, 0, 3));
  let ps = await parts(page);
  const overhang = ps.find((q) => q.partId === "brick-2x4");
  check("an overhang is built by pointing at the pillar's top", !!overhang && overhang.y === 3 && overhang.x === 0, ps.map((q) => `${q.partId}@${q.x},${q.y},${q.z}`));

  await tray(page, "Brick 2×2").click();
  // pointing at the plot under the overhang: the preview stays down there
  let p = await cell(page, 2, 0);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  let s = await shown(page);
  check("pointing at the plot under a higher part previews the lower spot", s?.placement.y === 0 && s.placement.x === 2 && !s.rejection, s?.placement);
  check("both heights that fit are offered", JSON.stringify(s?.fits) === "[0,6]", s?.fits);
  const readout = await page.locator(".height-readout").innerText();
  check("the height is said in words", /on the plot/.test(readout), readout);
  await shot(page, "desktop-lower-preview");

  // the visible buttons and the keys step through the same heights
  await page.getByRole("button", { name: /^Higher/ }).click();
  s = await shown(page);
  const up = s?.placement.y;
  await page.getByRole("button", { name: /^Lower/ }).click();
  s = await shown(page);
  check("Higher and Lower buttons step between the heights that fit", up === 6 && s?.placement.y === 0, `${up} → ${s?.placement.y}`);
  await page.keyboard.press("PageUp");
  const keyUp = (await shown(page))?.placement.y;
  await page.keyboard.press("PageDown");
  check("PageUp and PageDown do the same", keyUp === 6 && (await shown(page))?.placement.y === 0, `${keyUp} → ${(await shown(page))?.placement.y}`);

  // point at the overhang's top, choose the lower height, click without
  // moving: the click commits what's on screen and doesn't re-aim. (Hover
  // somewhere else first: while the preview is under it, the overhang is
  // faded and hover looks through it.)
  p = await cell(page, 8, 5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(100);
  p = await cell(page, 2, 0, 6);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  const onTop = (await shown(page))?.placement.y;
  await page.keyboard.press("PageDown");
  const before = (await shown(page))!.placement;
  await page.mouse.click(p.x, p.y);
  await settle(page);
  ps = await parts(page);
  const lower = ps.find((q) => q.partId === "brick-2x2" && q.x === before.x && q.z === before.z && q.y === before.y);
  check("pointing at the top previews on top", onTop === 6, onTop);
  check("a click commits the preview on screen (the lower one), not where the pointer is", !!lower && before.y === 0, before);
  await shot(page, "desktop-lower-placed");

  // after placing, the preview sits on the part just placed: here that's
  // inside the overhang, so it's refused and says why
  s = await shown(page);
  check("after placing, the preview moves onto the new part and says why it can't go there", s?.placement.y === 3 && s.rejection?.code === "collision", s?.rejection?.message);

  // a chosen height survives horizontal moves
  await page.keyboard.press("PageUp");
  const chosen = (await shown(page))?.placement.y;
  await page.keyboard.press("ArrowRight");
  s = await shown(page);
  check("a chosen height survives a horizontal move", chosen === 6 && s?.placement.y === 6 && s.placement.x === 3 && !s.rejection, s?.placement);
  await page.keyboard.press("ArrowRight");
  s = await shown(page);
  check("…even where it doesn't fit: kept and explained, not replaced", s?.placement.y === 6 && s.rejection?.code === "unsupported", s?.rejection?.message);
  await page.keyboard.press("PageDown");
  s = await shown(page);
  check("Lower then finds the plot", s?.placement.y === 0 && !s.rejection, s?.placement);
  await page.keyboard.press("Escape");

  // an invalid lower spot stays refused: a 2×4 only two plates up
  await tray(page, "Plate 2×2").click();
  await hoverClick(page, await cell(page, 12, 0));
  await hoverClick(page, await cell(page, 12, 0, 1));
  await tray(page, "Brick 2×4").click();
  await hoverClick(page, await cell(page, 13, 0, 2));
  ps = await parts(page);
  check("a low overhang is built on a stack of plates", ps.some((q) => q.partId === "brick-2x4" && q.x === 12 && q.y === 2), ps.map((q) => `${q.partId}@${q.x},${q.y},${q.z}`));
  await tray(page, "Brick 2×2").click();
  p = await cell(page, 14, 0);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  s = await shown(page);
  const hint = await page.locator(".context-hint").first().innerText();
  check("pointing under a gap too low previews it there, refused, in words", s?.placement.y === 0 && s.rejection?.code === "collision" && /✕/.test(hint), hint);
  const n = commands();
  const count = (await parts(page)).length;
  await page.mouse.click(p.x, p.y);
  await settle(page);
  check("clicking it sends nothing and places nothing", commands() === n && (await parts(page)).length === count, await notice(page));
  await page.keyboard.press("Escape");

  // ---- screen-relative moves from every side --------------------------------
  run = `${engine}-desktop-directions`;
  await tray(page, "Brick 2×2").click();
  await page.keyboard.press("Escape");
  await tray(page, "Brick 2×2").focus();
  await page.keyboard.press("Enter"); // keyboard pick-up: a preview in the middle of the plot
  const centre = async () => {
    const sh = (await shown(page))!;
    return project(page, sh.placement.x + 1, plates(sh.placement.y) + 0.6, sh.placement.z + 1);
  };
  const views: [string, number, number][] = [
    ["front", 0.2, 1.15],
    ["right side", Math.PI / 2, 1.15],
    ["back", Math.PI, 1.15],
    ["left side", -Math.PI / 2, 1.15],
    ["oblique 34°", 0.6, 1.0],
    ["oblique 214°", 0.6 + Math.PI, 1.0],
    ["top, front-up", 0.2, 0.02],
    ["top, back-up", Math.PI + 0.2, 0.02],
  ];
  for (const [name, az, polar] of views) {
    await page.evaluate(([a, b]) => (window as any).__orbit(a, b), [az, polar]);
    await page.waitForTimeout(250);
    const a0 = await centre();
    await page.keyboard.press("ArrowRight");
    const a1 = await centre();
    await page.keyboard.press("ArrowUp");
    const a2 = await centre();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowDown");
    const back = await centre();
    const right = { x: a1.x - a0.x, y: a1.y - a0.y };
    const away = { x: a2.x - a1.x, y: a2.y - a1.y };
    // one grid step along the nearest axis: within 60° of the screen
    // direction meant (a grid axis seen obliquely can look diagonal)
    const r = off(right, { x: 1, y: 0 });
    const u = off(away, { x: 0, y: -1 });
    check(
      `${name}: → moves right on screen, ↑ moves up on screen, and they undo`,
      r < 60 && u < 60 && Math.hypot(back.x - a0.x, back.y - a0.y) < 2,
      `→ (${right.x.toFixed(0)}, ${right.y.toFixed(0)}) px, ${r.toFixed(0)}° off; ↑ (${away.x.toFixed(0)}, ${away.y.toFixed(0)}) px, ${u.toFixed(0)}° off`,
    );
  }
  // the visible buttons use the same mapping as the keys
  await page.evaluate(() => (window as any).__orbit(Math.PI, 1.15));
  await page.waitForTimeout(250);
  await page.locator(".nudge summary").click();
  const k0 = (await shown(page))!.placement;
  await page.keyboard.press("ArrowRight");
  const k1 = (await shown(page))!.placement;
  await page.getByRole("button", { name: "Move preview left on screen" }).click();
  await page.getByRole("button", { name: "Move preview right on screen" }).click();
  const b1 = (await shown(page))!.placement;
  check("from the back, the → button and the → key make the same step", k1.x - k0.x === b1.x - k0.x && k1.z - k0.z === b1.z - k0.z && k1.x !== k0.x, `key ${k1.x - k0.x},${k1.z - k0.z}; button ${b1.x - k0.x},${b1.z - k0.z}`);
  // near a diagonal the mapping holds still until well past it
  const quad = async (az: number) => {
    await page.evaluate((a) => (window as any).__orbit(a, 1.15), az);
    return page.evaluate(() => (window as any).__quadrant());
  };
  const deg = [11, 43, 52, 57, 50, 40, 30];
  const q: number[] = [];
  for (const d of deg) q.push(await quad((d * Math.PI) / 180));
  check("near 45° the mapping doesn't flip: it switches past 55° and back only below 35°", JSON.stringify(q) === "[0,0,0,1,1,1,0]", `quadrants at ${deg.join("°, ")}°: ${q}`);
  check("no console errors", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

// ---- touch: the same heights by tapping -------------------------------------
{
  run = `${engine}-touch-emulated-390x844`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const { page, errors } = await open(context);
  const tap = async (p: { x: number; y: number }) => {
    await page.touchscreen.tap(p.x, p.y);
    await settle(page);
  };
  await page.evaluate(() => (window as any).__orbit(0.25, 1.2));
  await page.waitForTimeout(300);
  await tray(page, "Brick 2×2").tap();
  await tap(await cell(page, 0, 0));
  await tap(await cell(page, 0, 0));
  await tray(page, "Brick 2×4").tap();
  await tap(await cell(page, 1, 0, 3));
  await tap(await cell(page, 1, 0, 3));
  let ps = await parts(page);
  check("taps build the same overhang", ps.some((q) => q.partId === "brick-2x4" && q.y === 3 && q.x === 0), ps.map((q) => `${q.partId}@${q.x},${q.y},${q.z}`));
  await tray(page, "Brick 2×2").tap();
  // the preview starts where the last part went; tap the plot elsewhere first
  await tap(await cell(page, 7, 5));
  await tap(await cell(page, 2, 0, 6));
  let s = await shown(page);
  check("a tap on the overhang's top previews on top", s?.placement.y === 6, s?.placement);
  await page.getByRole("button", { name: /^Lower/ }).tap();
  s = await shown(page);
  check("the Lower button is there on a phone and reaches the plot", s?.placement.y === 0 && !s.rejection, s?.placement);
  await shot(page, "mobile-lower-preview");
  const before = s!.placement;
  await tap(await cell(page, 2, 0, 6));
  ps = await parts(page);
  check("a tap on the preview's footprint commits the shown (lower) preview", ps.some((q) => q.partId === "brick-2x2" && q.x === before.x && q.y === 0 && q.z === before.z), before);
  check("no console errors", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
writeFileSync(`${out}/results-${engine}.json`, JSON.stringify({ base, engine, at: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed; results in ${out}/results-${engine}.json`);
process.exit(failed ? 1 : 0);
