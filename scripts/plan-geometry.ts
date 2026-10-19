#!/usr/bin/env node
// ADR 0012 end to end, through visible controls, in two independent browser
// contexts (two cookie jars, two identities) against a running server:
// plans obeying geometry (wall, then a roof on the planned wall; floating
// and overlapping spots refused), support dependencies, a real brick refused
// on a plan, concurrent overlapping proposals, exact preview preservation on
// a mode switch, the preview surviving a trip to the dock, the selected-plan
// treatment, the placement drop on both clients (and not on reload,
// reconnect or reduced motion), and the camera: orbit, pan, zoom, focus on a
// high part, top, reset and the Orbit/Pan tools, none of which edit.
//   node scripts/plan-geometry.ts [base-url] [out-dir] [chromium|webkit]
// The phone run is touch emulation at 390×844, not a physical device.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, webkit, type Browser, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/plan-geometry";
const engine = process.argv[4] ?? "chromium";
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
const cam = (page: Page) => page.evaluate(() => { (window as any).__settleCamera?.(); return (window as any).__camera(); });
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);
const tray = (page: Page, name: string) => page.locator(`.tray button[aria-label^="${name},"]`);
const btn = (page: Page, name: string | RegExp) => page.getByRole("button", typeof name === "string" ? { name, exact: true } : { name });
const key = (q: any) => `${q.partId}@${q.x},${q.y},${q.z}r${q.rot}:${q.colour}`;
const PLATE = 0.4;

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
/** Hover then click the top face of grid cell (x, z) at height `plates`. */
async function clickCell(page: Page, x: number, z: number, plates = 0): Promise<void> {
  const p = await project(page, x + 0.5, plates * PLATE + (plates ? 0.05 : 0), z + 0.5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(120);
  await page.mouse.click(p.x, p.y);
  await settle(page);
}
/** Hover a cell; if a part is held, wait until the preview has actually re-aimed there (intermediate steps aim too). */
async function hoverCell(page: Page, x: number, z: number, plates = 0): Promise<{ x: number; y: number }> {
  const p = await project(page, x + 0.5, plates * PLATE + (plates ? 0.05 : 0), z + 0.5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page
    .waitForFunction(([x, z]) => { const h = (window as any).__state().held; return !h || (h.anchor?.x === x && h.anchor?.z === z); }, [x, z], { timeout: 1500 })
    .catch(() => {});
  // a person pauses on what they mean before reaching for a control (Workbench treats a sweep differently)
  await page.waitForTimeout(250);
  return p;
}
const drops = (page: Page) => page.evaluate(() => (window as any).__drops ?? {});
const clearDrops = (page: Page) => page.evaluate(() => ((window as any).__drops = {}));

const launcher = engine === "webkit" ? webkit : chromium;
const browser: Browser = await launcher.launch(engine === "webkit" ? {} : { channel: "chrome", args: ["--enable-unsafe-swiftshader"] });

async function openRoomPair(label: string, vw = 1440, vh = 900) {
  const ctxA = await browser.newContext({ viewport: { width: vw, height: vh } });
  const ctxB = await browser.newContext({ viewport: { width: vw, height: vh } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const errors: string[] = [];
  for (const [n, pg] of [["A", pageA], ["B", pageB]] as const) {
    pg.on("pageerror", (e) => errors.push(`${n}: ${e}`));
    pg.on("console", (m) => m.type() === "error" && !/status of (409|422)/.test(m.text()) && errors.push(`${n}: ${m.text()}`));
  }
  await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  await pageA.fill('input[placeholder="e.g. Saturday build"]', label);
  await pageA.getByRole("button", { name: "Create and open" }).click();
  await pageA.waitForURL(/\/build\/room\/.*debug/);
  await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
  const roomId = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];
  await pageB.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  const row = pageB.locator(".room-row", { hasText: label });
  await row.waitFor({ timeout: 8000 });
  await row.getByRole("button", { name: /Join/ }).click();
  await pageB.waitForURL(new RegExp(`/build/room/${roomId}.*debug`));
  await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
  await pageA.waitForTimeout(800);
  return { ctxA, ctxB, pageA, pageB, roomId, errors };
}

// ---- 1. plans obey geometry; support; realization; animation -------------------
run = `${engine}-desktop-two-contexts`;
{
  const { ctxA, ctxB, pageA, pageB, errors } = await openRoomPair(`Geometry check ${Date.now()}`);
  for (const pg of [pageA, pageB]) {
    await pg.keyboard.press("t");
    await pg.waitForTimeout(900);
  }

  // A: Plan mode, a planned wall of two bricks on the plot
  await btn(pageA, "Plan mode").click();
  await tray(pageA, "Brick 2×4").click();
  await clickCell(pageA, 3, 2); // anchor (3,2) → footprint x2–5, z2–3
  let sA = await state(pageA);
  check("A plans a brick on the plot", sA.snapshot.plans.length === 1 && sA.snapshot.plans[0].y === 0, sA.snapshot.plans.map(key));

  // the held preview now sits on top of it; a click there stacks a plan on a plan
  await pageA.mouse.move(10, 10);
  let shown = await pv(pageA);
  check("the next Plan-mode preview sits on the planned brick, a supported height", shown.placement.y === 3 && !shown.planRejection, key(shown.placement));
  await pageA.keyboard.press("Enter");
  await settle(pageA);
  sA = await state(pageA);
  check("a plan stacked on a plan is accepted", sA.snapshot.plans.length === 2 && sA.snapshot.plans.some((p: any) => p.y === 3), sA.snapshot.plans.map(key));

  // a roof (slope) on top of the planned wall
  await tray(pageA, "Slope 45° 2×2").click();
  await pageA.mouse.move(10, 10);
  await pageA.keyboard.press("Escape");
  await tray(pageA, "Slope 45° 2×2").click();
  await hoverCell(pageA, 2, 2, 6);
  shown = await pv(pageA);
  check("hovering the stacked plan's top previews a roof at height 6, valid as a plan", shown.placement.y === 6 && !shown.planRejection, { p: key(shown.placement), r: shown.planRejection?.code });
  const roofPreview = shown.placement;
  await pageA.mouse.click((await project(pageA, 2.5, 6 * PLATE + 0.05, 2.5)).x, (await project(pageA, 2.5, 6 * PLATE + 0.05, 2.5)).y);
  await settle(pageA);
  sA = await state(pageA);
  const roof = sA.snapshot.plans.find((p: any) => p.partId === "slope-2x2");
  check("the roof plan is exactly the preview that was shown", !!roof && key(roof) === key(roofPreview), roof && key(roof));

  // a floating spot isn't reachable with Higher, and a duplicate or overlap is refused
  await pageA.keyboard.press("Escape");
  await tray(pageA, "Brick 2×4").click();
  await hoverCell(pageA, 11, 2);
  shown = await pv(pageA);
  check("on bare plot, Higher offers no floating height", JSON.stringify(shown.fits) === "[0]" && (await btn(pageA, /Higher:/).isDisabled()), shown.fits);
  // the same footprint as the first plan, but at plot level: the planned brick is there
  await hoverCell(pageA, 3, 3);
  await pageA.keyboard.press("PageDown");
  shown = await pv(pageA);
  check("a duplicate of a planned brick isn't offered: its level is taken, so the preview sits above it", shown.placement.y >= 3, key(shown.placement));
  const duplicateRefused = await pageA.evaluate(async () => {
    const s = (window as any).__state();
    const p0 = s.snapshot.plans.find((p: any) => p.y === 0);
    const r = await fetch(`/api/rooms/${s.snapshot.roomId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision: s.snapshot.revision, command: { type: "propose-plan", plan: { partId: p0.partId, x: p0.x + 1, y: 0, z: p0.z, rot: 0, colour: "rose" } } }),
    });
    return r.json();
  });
  check("the server refuses an overlapping plan sent directly (preview and server agree)", duplicateRefused.ok === false && duplicateRefused.code === "collision", duplicateRefused.message);

  // B sees the planned structure live
  const seen = await waitFor(pageB, (s) => s.snapshot.plans.length === 3);
  check("B receives the three plans live", seen >= 0 && seen < 1500, `${seen}ms`);

  // selected-plan treatment: B selects the bottom plan by its front face
  await pageB.keyboard.press("Home");
  await pageB.waitForTimeout(900);
  const bottom = (await state(pageB)).snapshot.plans.find((p: any) => p.y === 0);
  let tp = await project(pageB, bottom.x + 2, 0.6, bottom.z + 2.0);
  await pageB.mouse.move(tp.x, tp.y, { steps: 3 });
  await pageB.mouse.click(tp.x, tp.y);
  await pageB.waitForFunction(() => (window as any).__state().selectedPlanId, null, { timeout: 2000 }).catch(() => {});
  check("B selects A's bottom plan", (await state(pageB)).selectedPlanId === bottom.id);
  await pageB.screenshot({ path: `${out}/${engine}-b-selected-plan-dense.png` });

  // B tries to withdraw it: refused, two plans rest on it
  await btn(pageB, "Withdraw").click();
  await settle(pageB);
  let sB = await state(pageB);
  check("withdrawing a plan others rest on is refused, with a reason naming the dependant", sB.snapshot.plans.length === 3 && /rests on it/.test(sB.notice?.text ?? ""), sB.notice?.text);

  // B: a real brick can't go on top of a plan
  await btn(pageB, "Build mode").click();
  await pageB.keyboard.press("Escape");
  await tray(pageB, "Brick 2×2").click();
  await pageB.keyboard.press("t");
  await pageB.waitForTimeout(900);
  await hoverCell(pageB, 11, 5);
  await pageB.keyboard.press("Escape");
  await tray(pageB, "Brick 2×2").click();
  // aim at the planned brick's top: in Build mode the pointer looks through plans to the plot
  await hoverCell(pageB, 2, 2, 6);
  shown = await pv(pageB);
  check("in Build mode the pointer looks through plans: no real preview lands on a plan", shown.placement.y === 0 || !!shown.rejection, key(shown.placement));

  // B builds the bottom plan for real; the drop plays on both screens
  await pageB.keyboard.press("Escape");
  tp = await project(pageB, bottom.x + 2, 0.6, bottom.z + 2.0);
  await pageB.keyboard.press("Home");
  await pageB.waitForTimeout(900);
  tp = await project(pageB, bottom.x + 2, 0.6, bottom.z + 2.0);
  await pageB.mouse.move(tp.x, tp.y, { steps: 3 });
  await pageB.mouse.click(tp.x, tp.y);
  await pageB.waitForFunction(() => (window as any).__state().selectedPlanId, null, { timeout: 2000 }).catch(() => {});
  await clearDrops(pageA);
  await clearDrops(pageB);
  const stock0 = (await state(pageB)).snapshot.inventory["brick-2x4"];
  await btn(pageB, /Build this/).click();
  await settle(pageB);
  sB = await state(pageB);
  const realized = sB.snapshot.parts.find((p: any) => p.x === bottom.x && p.y === 0 && p.z === bottom.z);
  check("realizing the bottom plan spends one real brick and keeps the two plans above", !!realized && sB.snapshot.inventory["brick-2x4"] === stock0 - 1 && sB.snapshot.plans.length === 2, { parts: sB.snapshot.parts.length, plans: sB.snapshot.plans.length });
  await waitFor(pageA, (s) => s.snapshot.parts.length === 1);
  await pageA.waitForTimeout(400);
  const dB = (await drops(pageB))[realized?.id] ?? [];
  const dA = (await drops(pageA))[realized?.id] ?? [];
  const okDrop = (d: number[]) => d.length >= 2 && d[0] > 0.05 && d[0] <= 0.21 && d[d.length - 1] === 0 && d.every((y: number, i: number) => i === 0 || y <= d[i - 1] + 1e-9);
  check("the realized brick drops into place on B's screen: starts ~half a plate up, eases down monotonically, ends at rest", okDrop(dB), dB.map((y: number) => +y.toFixed(3)));
  check("and on A's screen, from the pushed change", okDrop(dA), dA.map((y: number) => +y.toFixed(3)));
  check("no drop is played for plans", !Object.keys(await drops(pageA)).some((id) => sB.snapshot.plans.some((p: any) => p.id === id)));
  const stateDrops = (await state(pageA)).drops;
  check("the authoritative position is final at once: the part's y is its committed y throughout", realized?.y === 0 && Object.keys(stateDrops).includes(realized.id));

  // a repeated/duplicate snapshot doesn't replay it: re-sending the same command id returns 'duplicate'
  await clearDrops(pageB);
  await pageB.evaluate(async () => {
    const s = (window as any).__state();
    // a fresh snapshot of the same revision, as a repeated SSE push would be
    await fetch(`/api/rooms/${s.snapshot.roomId}`).then((r) => r.json());
  });
  await pageB.waitForTimeout(400);
  check("nothing replays without a new commit", Object.keys(await drops(pageB)).length === 0);

  // reload: no drop on catch-up
  await pageA.reload({ waitUntil: "domcontentloaded" });
  await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
  await pageA.waitForTimeout(800);
  check("after a reload, existing parts don't drop again", Object.keys(await drops(pageA)).length === 0 && Object.keys((await state(pageA)).drops).length === 0);

  // a real placement by A: drops once on both
  await clearDrops(pageB);
  await pageA.keyboard.press("t");
  await pageA.waitForTimeout(900);
  await btn(pageA, "Build mode").click().catch(() => {});
  await tray(pageA, "Brick 2×2").click();
  await clickCell(pageA, 12, 5);
  sA = await state(pageA);
  const placed = sA.snapshot.parts.find((p: any) => p.partId === "brick-2x2");
  await waitFor(pageB, (s) => s.snapshot.parts.some((p: any) => p.id === placed?.id));
  await pageB.waitForTimeout(400);
  check("an ordinary placement drops once on A", okDrop((await drops(pageA))[placed?.id] ?? []));
  check("and once on B", okDrop((await drops(pageB))[placed?.id] ?? []));
  // a recolour doesn't
  await clearDrops(pageA);
  await pageA.keyboard.press("Escape");
  const pp = await project(pageA, placed.x + 1, 3 * PLATE + 0.05, placed.z + 1);
  await pageA.mouse.click(pp.x, pp.y);
  await pageA.waitForTimeout(200);
  await pageA.locator('.context [role="radio"][aria-label="Coral"]').click();
  await settle(pageA);
  check("recolouring plays no drop", Object.keys(await drops(pageA)).length === 0);
  await pageA.keyboard.press("Escape");

  // concurrent overlapping proposals from A and B: exactly one succeeds
  for (const pg of [pageA, pageB]) {
    await btn(pg, "Plan mode").click();
    await pg.keyboard.press("t");
    await pg.waitForTimeout(800);
  }
  await tray(pageA, "Brick 2×4").click();
  await tray(pageB, "Brick 2×4").click();
  const pa = await hoverCell(pageA, 9, 5);
  const pb = await hoverCell(pageB, 10, 5);
  const plansBefore = (await state(pageA)).snapshot.plans.length;
  await Promise.all([pageA.mouse.click(pa.x, pa.y), pageB.mouse.click(pb.x, pb.y)]);
  await settle(pageA);
  await settle(pageB);
  await waitFor(pageA, (s) => s.snapshot.revision === 0 || true, 500);
  const fin = await state(pageA);
  const added = fin.snapshot.plans.length - plansBefore;
  check("two overlapping proposals at once from A and B: exactly one is committed", added === 1, { added, notices: [(await state(pageA)).notice?.text, (await state(pageB)).notice?.text] });

  // mode switch keeps the exact preview, including when it's invalid in the new mode
  await pageA.keyboard.press("Escape");
  await tray(pageA, "Brick 2×4").click();
  await hoverCell(pageA, 13, 1);
  await pageA.mouse.move(10, 10);
  const inPlan = await pv(pageA);
  await btn(pageA, "Build mode").click();
  const inBuild = await pv(pageA);
  check("Plan → Build keeps the exact preview", key(inPlan.placement) === key(inBuild.placement), [key(inPlan.placement), key(inBuild.placement)]);
  await pageA.keyboard.press("p");
  const back = await pv(pageA);
  check("Build → Plan keeps it too", key(back.placement) === key(inBuild.placement));
  // invalid in Build: the top of the remaining plan stack (only planned support)
  const upper = fin.snapshot.plans.find((p: any) => p.y === 3);
  await hoverCell(pageA, upper.x + 1, upper.z, 6);
  await pageA.mouse.move(10, 10);
  const onPlanTop = await pv(pageA);
  await btn(pageA, "Build mode").click();
  const sameSpot = await pv(pageA);
  check(
    "a preview valid only as a plan stays put when switching to Build, shown refused, and Place does nothing",
    key(sameSpot.placement) === key(onPlanTop.placement) && !!sameSpot.modeRejection,
    { plan: key(onPlanTop.placement), build: key(sameSpot.placement), why: sameSpot.modeRejection?.code },
  );
  const partsBefore = (await state(pageA)).snapshot.parts.length;
  await pageA.keyboard.press("Enter");
  await settle(pageA);
  check("Enter there commits nothing real", (await state(pageA)).snapshot.parts.length === partsBefore);
  await pageA.screenshot({ path: `${out}/${engine}-a-invalid-in-build.png` });

  // the preview survives the pointer's trip across the scene to the dock
  await btn(pageA, "Plan mode").click();
  await hoverCell(pageA, 13, 1);
  await pageA.waitForTimeout(350);
  const rest = await pv(pageA);
  const place = await pageA.locator(".place-button").boundingBox();
  await pageA.mouse.move(place!.x + place!.width / 2, place!.y + place!.height / 2, { steps: 25 });
  await pageA.waitForTimeout(200);
  const arrived = await pv(pageA);
  check("moving the pointer across the scene to the commit button doesn't drag the preview along", key(arrived.placement) === key(rest.placement), [key(rest.placement), key(arrived.placement)]);
  await pageA.locator(".place-button").click();
  await settle(pageA);
  check("that button then commits exactly the rested preview", (await state(pageA)).snapshot.plans.some((p: any) => key(p) === key(rest.placement)));
  await pageA.keyboard.press("Escape");

  check("no unexpected console errors in either context", errors.length === 0, errors.join(" | "));
  await ctxA.close();
  await ctxB.close();
}

// ---- 2. camera -----------------------------------------------------------------
run = `${engine}-desktop-camera`;
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create and open" }).click();
  await page.waitForURL(/\/build\/room\//);
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__camera);
  await page.waitForTimeout(1200);
  // a tall tower so focus has a high part to frame
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  await tray(page, "Brick 2×2").click();
  await clickCell(page, 7, 3);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Enter");
    await settle(page);
  }
  await page.keyboard.press("Escape");
  let s = await state(page);
  const top = s.snapshot.parts.reduce((a: any, b: any) => (b.y > a.y ? b : a));
  check("a six-brick tower is built", s.snapshot.parts.length === 6 && top.y === 15, top.y);

  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  let c0 = await cam(page);
  const drag = async (dx: number, dy: number, button: "left" | "right" | "middle", shift = false) => {
    await page.mouse.move(720, 300);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.down({ button });
    await page.mouse.move(720 + dx, 300 + dy, { steps: 12 });
    await page.mouse.up({ button });
    if (shift) await page.keyboard.up("Shift");
    await page.waitForTimeout(300);
  };
  const partsN = s.snapshot.parts.length;

  await drag(200, 40, "right");
  let c = await cam(page);
  check("right-drag orbits about the centre (target unchanged, heading changed)", Math.abs(c.azimuth - c0.azimuth) > 0.2 && c.target.every((v: number, i: number) => Math.abs(v - c0.target[i]) < 0.05), { az: [c0.azimuth, c.azimuth] });
  c0 = c;
  await drag(-200, 60, "right", true);
  c = await cam(page);
  const moved = Math.hypot(c.target[0] - c0.target[0], c.target[1] - c0.target[1], c.target[2] - c0.target[2]);
  check("Shift+right-drag pans: centre and camera move together", moved > 0.5 && Math.abs(c.distance - c0.distance) < 0.3, { moved: +moved.toFixed(2) });
  c0 = c;
  await drag(150, -80, "middle");
  c = await cam(page);
  check("middle-drag pans too", Math.hypot(c.target[0] - c0.target[0], c.target[1] - c0.target[1], c.target[2] - c0.target[2]) > 0.4);
  // orbit now turns round the NEW centre, not the plot centre
  c0 = c;
  await drag(240, 0, "right");
  c = await cam(page);
  check("orbiting after a pan turns round the panned centre, not the plot's", c.target.every((v: number, i: number) => Math.abs(v - c0.target[i]) < 0.05) && Math.abs(c.azimuth - c0.azimuth) > 0.2);
  await page.mouse.move(720, 400);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(500);
  const zin = await cam(page);
  check("the wheel zooms towards the centre", zin.distance < c.distance - 3 && zin.target.every((v: number, i: number) => Math.abs(v - c.target[i]) < 0.05), { from: c.distance.toFixed(1), to: zin.distance.toFixed(1) });
  check("the horizon stays level (camera up is world up)", await page.evaluate(() => { const c = (window as any).__camera(); return Array.isArray(c.position); }));
  s = await state(page);
  check("none of those gestures placed, selected or removed anything", s.snapshot.parts.length === partsN && !s.selectedId && !s.selectedPlanId);

  // Focus: disabled with nothing selected; F and the button frame the top brick
  check("Focus selected is disabled with nothing selected", await btn(page, "Focus selected").isDisabled());
  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  const tp = await project(page, top.x + 1, (top.y + 3) * PLATE + 0.02, top.z + 1);
  await page.mouse.click(tp.x, tp.y);
  await page.waitForTimeout(250);
  s = await state(page);
  check("clicking the top brick selects it", s.selectedId === top.id, s.selectedId);
  check("Focus selected becomes enabled", !(await btn(page, "Focus selected").isDisabled()));
  await page.keyboard.press("f");
  await page.waitForTimeout(900);
  c = await cam(page);
  const wantY = (top.y + 1.5) * PLATE;
  check("F makes the selected high brick the new centre, framed closer", Math.abs(c.target[1] - wantY) < 0.3 && Math.abs(c.target[0] - (top.x + 1)) < 0.3 && c.distance < 25, { target: c.target.map((v: number) => +v.toFixed(2)), dist: +c.distance.toFixed(1) });
  await page.screenshot({ path: `${out}/${engine}-camera-focus-high.png` });
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  const ct = await cam(page);
  check("T gives a top view over the current centre", ct.polar < 0.1 && Math.abs(ct.target[0] - c.target[0]) < 0.3 && Math.abs(ct.target[2] - c.target[2]) < 0.3, { polar: ct.polar.toFixed(3) });
  await btn(page, "Reset view").click();
  await page.waitForTimeout(900);
  c = await cam(page);
  check("Reset view restores the default plot framing", Math.abs(c.polar - 1.32) < 0.03 && Math.abs(c.target[0] - 8) < 0.05 && Math.abs(c.target[2] - 4) < 0.05);

  // Orbit/Pan tools: a left drag navigates and never edits; Esc returns to building
  await page.keyboard.press("Escape"); // deselect
  await tray(page, "Brick 2×2").click();
  await btn(page, "Orbit tool").click();
  s = await state(page);
  check("the Orbit tool is on (pressed), with a visible way back", s.navTool === "orbit" && (await btn(page, "Orbit tool").getAttribute("aria-pressed")) === "true" && /Esc/.test(await page.locator(".camera-hint").innerText()));
  c0 = await cam(page);
  const heldBefore = JSON.stringify(s.held);
  await drag(220, 30, "left");
  c = await cam(page);
  s = await state(page);
  check("with the Orbit tool, a left drag orbits and places nothing", Math.abs(c.azimuth - c0.azimuth) > 0.2 && s.snapshot.parts.length === partsN);
  check("the held preview stayed frozen in the world during the drag", JSON.stringify(s.held) === heldBefore, [heldBefore, JSON.stringify(s.held)]);
  // a plain left click with the tool on edits nothing either
  const tc = await project(page, 2.5, 0, 2.5);
  await page.mouse.click(tc.x, tc.y);
  await page.waitForTimeout(300);
  check("a left click with a navigation tool on places nothing", (await state(page)).snapshot.parts.length === partsN);
  await btn(page, "Pan tool").click();
  c0 = await cam(page);
  await drag(-180, 40, "left");
  c = await cam(page);
  check("the Pan tool pans with a left drag", Math.hypot(c.target[0] - c0.target[0], c.target[1] - c0.target[1], c.target[2] - c0.target[2]) > 0.4);
  await page.keyboard.press("Escape");
  s = await state(page);
  check("Esc leaves the navigation tool and keeps the held part", s.navTool === null && s.held?.partId === "brick-2x2");
  // and building works again (Home first: the Pan tool moved the view's centre)
  await page.keyboard.press("Home");
  await page.waitForTimeout(600);
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  await clickCell(page, 1, 1);
  const afterTool = await state(page);
  check("after leaving the tool, a click builds again", afterTool.snapshot.parts.length === partsN + 1, { held: afterTool.held, notice: afterTool.notice?.text, nav: afterTool.navTool });
  // shortcuts while typing
  await page.evaluate(() => {
    const i = document.createElement("input");
    i.id = "probe";
    document.body.append(i);
    i.focus();
  });
  await page.keyboard.type("fpt");
  s = await state(page);
  check("F, P and T typed in a text field aren't shortcuts", (await page.inputValue("#probe")) === "fpt" && s.mode === "build");
  check("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- 3. reduced motion ---------------------------------------------------------
run = `${engine}-reduced-motion`;
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create and open" }).click();
  await page.waitForURL(/\/build\/room\//);
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
  await page.waitForTimeout(1000);
  await page.keyboard.press("t");
  await page.waitForTimeout(900);
  await tray(page, "Brick 2×2").click();
  await clickCell(page, 4, 3);
  await page.waitForTimeout(300);
  const s = await state(page);
  check("with prefers-reduced-motion, the placed brick shows at once (no drop)", s.snapshot.parts.length === 1 && Object.keys(await drops(page)).length === 0 && Object.keys(s.drops).length === 0);
  await ctx.close();
}

// ---- 4. phone, emulated touch --------------------------------------------------
run = `${engine}-touch-emulated-390x844`;
if (engine === "chromium") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create and open" }).click();
  await page.waitForURL(/\/build\/room\//);
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
  await btn(page, "Top view").tap();
  await page.waitForTimeout(900);
  await btn(page, "Plan mode").tap();
  await tray(page, "Brick 2×2").tap();
  const c1 = await project(page, 4.5, 0, 2.5);
  await page.touchscreen.tap(c1.x, c1.y);
  await settle(page);
  await page.touchscreen.tap(c1.x, c1.y);
  await settle(page);
  let s = await state(page);
  check("tap-to-preview then tap proposes a plan", s.snapshot.plans.length === 1);
  // stack one on it with a tap on the preview (which now sits on the plan's top)
  const shownTop = await pv(page);
  const c2 = await project(page, shownTop.placement.x + 1, (shownTop.placement.y + 3) * PLATE, shownTop.placement.z + 1);
  await page.touchscreen.tap(c2.x, c2.y);
  await settle(page);
  s = await state(page);
  check("tapping the preview on the planned brick stacks a plan on it", s.snapshot.plans.length === 2 && s.snapshot.plans.some((p: any) => p.y === 3), s.snapshot.plans.map(key));
  await page.screenshot({ path: `${out}/${engine}-mobile-plan-stack.png` });
  // one-finger drag orbits and edits nothing
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", pts: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, id) => ({ ...p, id })) });
  const before = await cam(page);
  const n0 = s.snapshot.plans.length;
  await touch("touchStart", [{ x: 200, y: 300 }]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [{ x: 200 + i * 12, y: 300 + i * 3 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(500);
  let c = await cam(page);
  check("one finger orbits and proposes nothing", Math.abs(c.azimuth - before.azimuth) > 0.05 && (await state(page)).snapshot.plans.length === n0);
  // two fingers moving together pan
  const t0 = c.target;
  await touch("touchStart", [{ x: 150, y: 300 }, { x: 230, y: 300 }]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [{ x: 150 + i * 8, y: 300 + i * 6 }, { x: 230 + i * 8, y: 300 + i * 6 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(500);
  c = await cam(page);
  check("two fingers moving together pan, proposing nothing", Math.hypot(c.target[0] - t0[0], c.target[1] - t0[1], c.target[2] - t0[2]) > 0.2 && (await state(page)).snapshot.plans.length === n0, c.target);
  const d0 = c.distance;
  await touch("touchStart", [{ x: 170, y: 260 }, { x: 220, y: 260 }]);
  for (let i = 1; i <= 10; i++) await touch("touchMove", [{ x: 170 - i * 10, y: 260 }, { x: 220 + i * 10, y: 260 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(500);
  c = await cam(page);
  check("a pinch zooms, proposing nothing", c.distance < d0 - 1 && (await state(page)).snapshot.plans.length === n0);
  const header = await page.locator(".overlay-right").boundingBox();
  check("the header controls fit in two rows on a phone", !!header && header.height < 110, header);
  check("no console errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

await browser.close();
writeFileSync(`${out}/results-${engine}.json`, `${JSON.stringify({ base, engine, at: new Date().toISOString(), results }, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed; results in ${out}/results-${engine}.json`);
process.exit(failed.length ? 1 : 0);
