#!/usr/bin/env node
// Drives the real app in the locally installed Chrome through every
// interaction the author listed (CLAUDE.md, "Interaction" and "Scene and
// camera"), against a running server, and records each check's result.
//   node scripts/interaction.ts [base-url] [out-dir]
// Each run is a fresh browser context, so a fresh visitor and an empty build.
// The touch run is Chrome's touch emulation (isMobile, hasTouch, CDP touch
// events) at 390×844: it is not a physical phone.
// Reads state through the `?debug` hooks (src/client/main.tsx, Workbench.tsx).
// Not part of `pnpm check`: it needs a desktop Chrome and writes files.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/interaction";
mkdirSync(out, { recursive: true });

type Result = { run: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
let run = "";
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ run, name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  [${run}] ${name}${d ? `  — ${d}` : ""}`);
}

type Part = { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string };
type View = {
  held: { partId: string; rot: number; anchor: { x: number; z: number } | null; lift: number } | null;
  selectedId: string | null;
  deleting: boolean;
  targetId: string | null;
  save: string;
  notice: string;
  revision: number;
  parts: Part[];
  inventory: Record<string, number>;
};
type Cam = { position: number[]; target: number[]; distance: number; polar: number; azimuth: number };

const state = (page: Page): Promise<View> =>
  page.evaluate(() => {
    const s = (window as any).__state();
    return {
      held: s.held,
      selectedId: s.selectedId,
      deleting: s.deleting,
      targetId: s.targetId,
      save: s.save.status,
      notice: s.notice?.text ?? "",
      revision: s.snapshot?.revision ?? -1,
      parts: s.snapshot?.parts ?? [],
      inventory: s.snapshot?.inventory ?? {},
    };
  });
const cam = (page: Page): Promise<Cam> => page.evaluate(() => (window as any).__camera());
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);

/** Wait for any command in flight to finish, then for the camera's damping to settle. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(450);
}

async function open(context: BrowserContext): Promise<{ page: Page; commands: () => number; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  let n = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) => r.url().endsWith("/api/command") && n++);
  await page.goto(`${base}/build/?debug`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__camera && (window as any).__project);
  await page.waitForTimeout(1200);
  return { page, commands: () => n, errors };
}

const plateY = (plates: number) => plates * 0.4;
/** Page pixels of the middle of grid cell (x, z) at height `plates`. */
const cellAt = (page: Page, x: number, z: number, plates = 0) => project(page, x + 0.5, plateY(plates), z + 0.5);
/** The anchor cell that makes the preview's footprint start at (fx, fz) (store.ts preview()). */
const anchorFor = (fx: number, fz: number, w: number, d: number) => ({ x: fx + Math.floor((w - 1) / 2), z: fz + Math.floor((d - 1) / 2) });

async function aimAndClick(page: Page, x: number, z: number, plates = 0): Promise<void> {
  const p = await cellAt(page, x, z, plates);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(80);
  await page.mouse.click(p.x, p.y);
  await settle(page);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, button: "left" | "right" = "left"): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up({ button });
  await page.waitForTimeout(500);
}

const tray = (page: Page, name: string) => page.locator(`.tray button[aria-label^="${name},"]`);
const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.png` });

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });

// ---- desktop, mouse ------------------------------------------------------
{
  run = "desktop-mouse";
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, commands, errors } = await open(context);
  let s = await state(page);
  check("fresh visitor starts with an empty plot", s.parts.length === 0, `${s.parts.length} parts`);
  await shot(page, "desktop-idle");

  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  let c = await cam(page);
  check("T gives a top view", c.polar < 0.1, `polar ${c.polar.toFixed(3)}`);

  // hold a part, preview, place, keep holding
  await tray(page, "Brick 2×4").click();
  s = await state(page);
  check("choosing a tray part holds it", s.held?.partId === "brick-2x4", s.held);
  const kit24 = s.inventory["brick-2x4"];
  let a = anchorFor(0, 0, 4, 2);
  let p = await cellAt(page, a.x, a.z);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  const hint = await page.locator(".context-hint").first().innerText();
  check("hovering shows a snapped preview that says it fits, in text", /Fits/.test(hint), hint);
  await shot(page, "desktop-holding");
  await page.mouse.click(p.x, p.y);
  await settle(page);
  s = await state(page);
  check(
    "a click places the held part where the preview was",
    s.parts.some((q) => q.partId === "brick-2x4" && q.x === 0 && q.z === 0 && q.y === 0),
    s.parts.map((q) => `${q.partId}@${q.x},${q.y},${q.z}`),
  );
  check("the part stays held for the next one", s.held?.partId === "brick-2x4");
  check("stock goes down by one", s.inventory["brick-2x4"] === kit24 - 1, `${kit24} → ${s.inventory["brick-2x4"]}`);
  check("the save chip says Saved after the server commits", (await page.locator(".chip-ok").count()) === 1);
  a = anchorFor(6, 0, 4, 2);
  await aimAndClick(page, a.x, a.z);
  a = anchorFor(10, 3, 4, 2);
  await aimAndClick(page, a.x, a.z);
  s = await state(page);
  check("repeated placement without re-choosing", s.parts.filter((q) => q.partId === "brick-2x4").length === 3, `${s.parts.length} parts`);

  await page.keyboard.press("Escape");
  s = await state(page);
  check("Esc puts the held part down", s.held === null);
  await tray(page, "Brick 2×4").click();
  await tray(page, "Brick 2×4").click();
  s = await state(page);
  check("choosing the same tray part again puts it down", s.held === null);

  // select, recolour, rotate
  const second = s.parts.find((q) => q.x === 6 && q.z === 0)!;
  p = await project(page, 8, plateY(3), 1);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  s = await state(page);
  check("clicking a placed part selects it", s.selectedId === second.id, s.selectedId);
  const title = await page.locator(".context-title").first().innerText();
  check("the selection is identified by name and code", /Brick 2×4/.test(title) && /B24/.test(title), title);
  await shot(page, "desktop-selected");
  let rev = s.revision;
  await page.locator('.context [role="radio"][aria-label="Brick red"]').click();
  await settle(page);
  s = await state(page);
  check("recolouring goes through the server", s.parts.find((q) => q.id === second.id)?.colour === "brick-red" && s.revision === rev + 1, `revision ${rev} → ${s.revision}`);

  // focus is now on a swatch: the R key must still work
  rev = s.revision;
  let before = commands();
  await page.keyboard.press("r");
  await settle(page);
  s = await state(page);
  const unturned = s.parts.find((q) => q.id === second.id)!;
  check(
    "R after clicking a swatch reaches the rotate action (this one is refused: turning would leave the plot)",
    /Can't turn it there/.test(s.notice) && unturned.rot === 0 && s.revision === rev && commands() === before,
    s.notice,
  );

  const third = s.parts.find((q) => q.x === 10 && q.z === 3)!;
  p = await project(page, 12, plateY(3), 4);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  await page.locator(".context-actions button", { hasText: "Rotate" }).click();
  await settle(page);
  s = await state(page);
  let t = s.parts.find((q) => q.id === third.id)!;
  check("a valid rotation is a server command, turning about the centre", t.rot === 1 && t.x === 11 && t.z === 2, t);
  check("a button clicked with the mouse doesn't keep focus", await page.evaluate(() => document.activeElement === document.body));
  // Rotate focused from the keyboard: Enter is the button's, so exactly one turn
  rev = s.revision;
  await page.locator(".context-actions button", { hasText: "Rotate" }).focus();
  await page.keyboard.press("Enter");
  await settle(page);
  s = await state(page);
  t = s.parts.find((q) => q.id === third.id)!;
  check("Enter on a focused button acts once (one turn, one revision)", t.rot === 0 && t.x === 10 && t.z === 3 && s.revision === rev + 1, `rot ${t.rot}, revision ${rev} → ${s.revision}`);
  check(
    "the button keeps keyboard focus through the save",
    await page.evaluate(() => document.activeElement?.textContent?.startsWith("Rotate") ?? false),
  );
  // [ and ] have visible buttons too: they step the selection and change nothing
  rev = s.revision;
  await page.getByRole("button", { name: "Next part" }).click();
  await page.waitForTimeout(100);
  const stepped = await state(page);
  await page.getByRole("button", { name: "Previous part" }).click();
  await page.waitForTimeout(100);
  s = await state(page);
  check(
    "the Next and Previous part buttons step the selection",
    stepped.selectedId !== third.id && !!stepped.selectedId && s.selectedId === third.id && s.revision === rev,
    `${third.id.slice(0, 8)} → ${stepped.selectedId?.slice(0, 8)} → ${s.selectedId?.slice(0, 8)}`,
  );
  await page.keyboard.press("Escape");

  // stack a brick on the first, then try to delete the bottom one
  await tray(page, "Brick 2×4").click();
  p = await project(page, 1.5, plateY(3), 0.5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y);
  await settle(page);
  s = await state(page);
  const top = s.parts.find((q) => q.y === 3);
  check("clicking a placed part while holding one stacks onto its studs", !!top && top.x === 0 && top.z === 0, top);
  await page.keyboard.press("Escape");
  const bottom = s.parts.find((q) => q.x === 0 && q.z === 0 && q.y === 0)!;

  await page.locator(".delete-tool").click();
  s = await state(page);
  check("the delete tool button turns the tool on", s.deleting);
  // hover the top brick's top face: the target is named before anything happens
  p = await project(page, 2, plateY(6), 1);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  s = await state(page);
  const deleteHint = await page.locator(".context-hint").first().innerText();
  check("hovering with the delete tool names the target", s.targetId === top?.id && /Brick 2×4/.test(deleteHint), deleteHint);
  await shot(page, "desktop-delete-tool");
  // keyboard, straight after clicking the tool's button: step the target to
  // the bottom brick, and Enter asks the server
  for (let i = 0; i < 8 && (await state(page)).targetId !== bottom.id; i++) await page.keyboard.press("]");
  const inv = (await state(page)).inventory["brick-2x4"];
  // the mouse stays still: moving it over the scene would re-aim the tool
  await page.keyboard.press("Enter");
  await settle(page);
  s = await state(page);
  check(
    "Enter after clicking the tool's button reaches the delete action; removing a part that holds another up is refused, nothing cascades",
    s.deleting && /Can't remove/.test(s.notice) && s.parts.some((q) => q.id === bottom.id) && s.parts.some((q) => q.id === top?.id) && s.inventory["brick-2x4"] === inv,
    s.notice,
  );
  p = await project(page, 2, plateY(6), 1);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.click(p.x, p.y);
  await settle(page);
  s = await state(page);
  check("clicking with the delete tool removes the part", !s.parts.some((q) => q.id === top?.id));
  check("the removed part goes back in the kit", s.inventory["brick-2x4"] === inv + 1, `${inv} → ${s.inventory["brick-2x4"]}`);
  check("the delete tool stays on until turned off", s.deleting);
  await page.keyboard.press("Escape");
  s = await state(page);
  check("Esc turns the delete tool off", !s.deleting);
  await page.keyboard.press("d");
  s = await state(page);
  check("D turns it on", s.deleting);
  await tray(page, "Brick 1×2").click();
  s = await state(page);
  check("choosing a part leaves the delete tool", !s.deleting && s.held?.partId === "brick-1x2");

  // a camera drag never edits: holding, nothing held, delete tool
  const count = s.parts.length;
  let c0 = await cam(page);
  p = await cellAt(page, 4, 5);
  await drag(page, p, 160, 40);
  s = await state(page);
  c = await cam(page);
  check("drag while holding a part moves the camera and places nothing", s.parts.length === count && Math.abs(c.azimuth - c0.azimuth) > 0.05, `${count} → ${s.parts.length} parts; azimuth ${c0.azimuth.toFixed(2)} → ${c.azimuth.toFixed(2)}`);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  c = await cam(page);
  check("Home after a camera drag resets the view", Math.abs(c.polar - 1.32) < 0.03, `polar ${c.polar.toFixed(3)}`);
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  p = await project(page, 8, plateY(3), 1);
  await drag(page, p, -140, 30);
  s = await state(page);
  check("drag starting on a part with nothing held selects nothing", s.selectedId === null, s.selectedId);
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  await page.keyboard.press("d");
  p = await project(page, 8, plateY(3), 1);
  await drag(page, p, 150, -30);
  s = await state(page);
  check("drag starting on a part with the delete tool removes nothing", s.parts.some((q) => q.id === second.id) && s.parts.length === count);
  await page.keyboard.press("Escape");

  // orbit all the way round, then the ground and zoom limits
  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  let unwrapped = 0;
  let last = (await cam(page)).azimuth;
  for (let i = 0; i < 10 && Math.abs(unwrapped) < 2 * Math.PI + 0.2; i++) {
    await drag(page, { x: 960, y: 300 }, 420, 0);
    const az = (await cam(page)).azimuth;
    let d = az - last;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    unwrapped += d;
    last = az;
  }
  check("the camera orbits a full 360° horizontally", Math.abs(unwrapped) >= 2 * Math.PI, `${((Math.abs(unwrapped) * 180) / Math.PI).toFixed(0)}° turned`);
  for (let i = 0; i < 4; i++) await drag(page, { x: 960, y: 200 }, 0, -500);
  c = await cam(page);
  check("dragging down to the ground stops above it", c.polar <= 1.361 && c.position[1] > 0, `polar ${c.polar.toFixed(3)}, camera y ${c.position[1].toFixed(2)}`);
  await page.mouse.move(960, 400);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(800);
  const near = (await cam(page)).distance;
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800);
  const far = (await cam(page)).distance;
  check("zoom is bounded both ways", near >= 13.9 && far <= 95.1, `nearest ${near.toFixed(1)}, farthest ${far.toFixed(1)}`);
  for (let i = 0; i < 4; i++) await drag(page, { x: 960, y: 400 }, -700, -300, "right");
  c = await cam(page);
  const [tx, ty, tz] = c.target;
  check("panning keeps the target near the plot", tx >= -6.01 && tx <= 22.01 && ty >= -0.01 && ty <= 8.01 && tz >= -5.01 && tz <= 14.01, c.target.map((v) => v.toFixed(1)));
  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  await shot(page, "desktop-after-orbit-reset");

  // decorative parts, stock running out
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  await tray(page, "Window 1×2×2").click();
  a = anchorFor(4, 5, 2, 1);
  await aimAndClick(page, a.x, a.z);
  await tray(page, "Fence 1×4×1").click();
  a = anchorFor(8, 7, 4, 1);
  await aimAndClick(page, a.x, a.z);
  await tray(page, "Planter with flowers").click();
  for (const fx of [0, 2, 4]) {
    a = anchorFor(fx, 7, 2, 1);
    await aimAndClick(page, a.x, a.z);
  }
  s = await state(page);
  check(
    "window, fence and planters place as ordinary parts",
    ["window-1x2x2", "fence-1x4x1"].every((id) => s.parts.some((q) => q.partId === id)) && s.parts.filter((q) => q.partId === "planter-1x2").length === 3,
    s.parts.map((q) => q.partId),
  );
  check("the planter runs out after three", s.inventory["planter-1x2"] === 0);
  check("the tray shows it as empty", (await tray(page, "Planter with flowers").getAttribute("class"))?.includes("empty") ?? false);
  before = commands();
  const n = s.parts.length;
  a = anchorFor(12, 7, 2, 1);
  await aimAndClick(page, a.x, a.z);
  s = await state(page);
  check("placing with none left is refused before any request", s.parts.length === n && commands() === before, s.notice);
  await shot(page, "desktop-decor");
  await page.keyboard.press("Escape");

  // the target reference
  await page.locator(".target button").click();
  check("the target card opens", await page.locator(".target-card img").isVisible());
  await shot(page, "desktop-target");
  await page.locator(".target button").click();

  // reload: everything comes back from the server
  const saved = (await state(page)).parts.map((q) => `${q.id}:${q.partId}@${q.x},${q.y},${q.z}r${q.rot}:${q.colour}`).sort();
  const savedInv = JSON.stringify((await state(page)).inventory);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as any).__state?.().snapshot);
  s = await state(page);
  const loaded = s.parts.map((q) => `${q.id}:${q.partId}@${q.x},${q.y},${q.z}r${q.rot}:${q.colour}`).sort();
  check("after a reload the build is exactly as left", JSON.stringify(loaded) === JSON.stringify(saved), `${loaded.length} parts`);
  check("after a reload the kit is exactly as left", JSON.stringify(s.inventory) === savedInv);

  // resize while holding a part
  await page.waitForTimeout(800);
  await tray(page, "Brick 1×2").click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(600);
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  a = anchorFor(12, 0, 2, 1);
  await aimAndClick(page, a.x, a.z);
  s = await state(page);
  const dockBox = await page.locator(".dock").boundingBox();
  check(
    "after resizing to 1280×720 the part is still held, places where aimed, and the dock fits",
    s.held?.partId === "brick-1x2" && s.parts.some((q) => q.partId === "brick-1x2" && q.x === 12 && q.z === 0) && !!dockBox && dockBox.y + dockBox.height <= 720,
    dockBox,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const narrowDock = await page.locator(".dock").boundingBox();
  check("narrowing to 390 px keeps the dock on screen", !!narrowDock && narrowDock.x >= 0 && narrowDock.x + narrowDock.width <= 390.5, narrowDock);
  check("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---- keyboard only -------------------------------------------------------
{
  run = "keyboard-only";
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, errors } = await open(context);
  let reached = false;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (label.startsWith("Brick 2×2,")) {
      reached = true;
      break;
    }
  }
  check("Tab reaches a tray part", reached);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  check("the focused control shows a focus ring", ring !== "none", ring);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  let s = await state(page);
  const onPlace = await page.evaluate(() => document.activeElement?.classList.contains("place-button") ?? false);
  check("Enter on a tray part holds it, starts a preview and moves focus to Place", s.held?.partId === "brick-2x2" && !!s.held.anchor && onPlace, s.held);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  s = await state(page);
  check("arrow keys move the preview", s.held?.anchor?.x === 6 && s.held.anchor.z === 3, s.held?.anchor);
  await page.keyboard.press("Enter");
  await settle(page);
  s = await state(page);
  check("Enter on Place places it, once", s.parts.length === 1 && s.parts[0].x === 6 && s.parts[0].z === 3 && s.parts[0].y === 0, s.parts);
  await page.keyboard.press("Enter");
  await settle(page);
  s = await state(page);
  check("a second Enter stacks the next one on top", s.parts.length === 2 && s.parts.some((q) => q.y === 3), s.parts.map((q) => q.y));
  await page.keyboard.press("Escape");
  await page.keyboard.press("[");
  s = await state(page);
  check("[ selects a placed part", s.selectedId !== null);
  for (let i = 0; i < 3 && s.parts.find((q) => q.id === s.selectedId)?.y !== 0; i++) {
    await page.keyboard.press("]");
    s = await state(page);
  }
  await page.keyboard.press("Delete");
  await settle(page);
  s = await state(page);
  check("Delete on the bottom one is refused", s.parts.length === 2, s.notice);
  await page.keyboard.press("]");
  await page.keyboard.press("Delete");
  await settle(page);
  s = await state(page);
  check("Delete on the top one removes it", s.parts.length === 1 && s.parts[0].y === 0);
  await page.keyboard.press("d");
  await page.keyboard.press("]");
  await page.keyboard.press("Enter");
  await settle(page);
  s = await state(page);
  check("D, ] and Enter remove with the delete tool", s.parts.length === 0 && s.deleting);
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  const top = (await cam(page)).polar;
  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  check("T and Home move the camera", top < 0.1 && Math.abs((await cam(page)).polar - 1.32) < 0.03);
  // typing in an editable field is never a shortcut (the app has none, so add one)
  await page.evaluate(() => {
    const i = document.createElement("input");
    i.id = "probe";
    document.body.append(i);
    i.focus();
  });
  await page.keyboard.type("dt");
  s = await state(page);
  check("letters typed in a text field aren't shortcuts", !s.deleting && (await page.inputValue("#probe")) === "dt");
  check("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// ---- touch, emulated -----------------------------------------------------
{
  run = "touch-emulated-390x844";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const { page, errors } = await open(context);
  const cdp = await context.newCDPSession(page);
  const touch = async (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
  const tapAt = async (p: { x: number; y: number }) => {
    await page.touchscreen.tap(p.x, p.y);
    await settle(page);
  };
  await shot(page, "mobile-idle");
  const tall = (await page.locator(".dock").boundingBox())!.height;
  await page.locator(".fold").tap();
  await page.waitForTimeout(300);
  const short = (await page.locator(".dock").boundingBox())!.height;
  check("the dock folds to its top row", short < tall * 0.6, `${tall.toFixed(0)} → ${short.toFixed(0)} px`);
  await shot(page, "mobile-folded");
  await page.locator(".fold").tap();
  await page.locator(".chip-button", { hasText: "Top view" }).tap();
  await page.waitForTimeout(900);
  await tray(page, "Plate 2×2").tap();
  let s = await state(page);
  check("tapping a tray part holds it", s.held?.partId === "plate-2x2");
  const cell = await cellAt(page, 4, 2);
  await tapAt(cell);
  s = await state(page);
  check("the first tap on the plot previews without placing", s.parts.length === 0 && s.held?.anchor?.x === 4);
  await shot(page, "mobile-preview");
  await tapAt(cell);
  s = await state(page);
  check("a second tap on the preview places", s.parts.length === 1, s.parts);
  const placedCount = s.parts.length;
  const c0 = await cam(page);
  const from = await cellAt(page, 10, 4);
  await touch("touchStart", [from]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [{ x: from.x + i * 14, y: from.y + i * 4 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(600);
  s = await state(page);
  let c = await cam(page);
  check("a one-finger drag orbits and places nothing", s.parts.length === placedCount && Math.abs(c.azimuth - c0.azimuth) > 0.05, `azimuth ${c0.azimuth.toFixed(2)} → ${c.azimuth.toFixed(2)}`);
  const d0 = c.distance;
  // well above the dock: a pinch on the dock would zoom the page, not the scene
  await touch("touchStart", [{ x: 170, y: 260 }, { x: 220, y: 260 }]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [{ x: 170 - i * 10, y: 260 }, { x: 220 + i * 10, y: 260 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(600);
  c = await cam(page);
  s = await state(page);
  check("a two-finger pinch zooms and places nothing", c.distance < d0 - 1 && s.parts.length === placedCount, `distance ${d0.toFixed(1)} → ${c.distance.toFixed(1)}`);
  await page.locator(".context-actions button", { hasText: "Cancel" }).tap();
  await page.locator(".chip-button", { hasText: "Top view" }).tap();
  await page.waitForTimeout(900);
  await tapAt(await project(page, 5, plateY(1), 3));
  s = await state(page);
  check("tapping a placed part selects it", !!s.selectedId && s.selectedId === s.parts[0]?.id);
  await shot(page, "mobile-selected");
  await page.locator(".delete-tool").tap();
  const part = await project(page, 5, plateY(1), 3);
  await tapAt(part);
  s = await state(page);
  check("with the delete tool the first tap only names the target", s.parts.length === 1 && !!s.targetId && s.targetId === s.parts[0].id);
  await shot(page, "mobile-delete-target");
  const named = s.targetId;
  await tapAt(part);
  s = await state(page);
  check("the second tap removes it", !!named && s.parts.length === 0, s.notice);
  check("no console errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(`${out}/results.json`, `${JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`\n${results.length - failed.length}/${results.length} passed; results in ${out}/results.json`);
process.exit(failed.length ? 1 : 0);
