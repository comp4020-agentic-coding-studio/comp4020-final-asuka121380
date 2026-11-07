#!/usr/bin/env node
// The Medieval Castle scene (ADR 0015), end to end in real Chrome against a
// running server, through the website's own controls:
// - choosing the castle in the lobby, creating a shared room, and joining it
//   as three more independent visitors (four browser contexts, four cookie
//   jars); a fifth is refused;
// - building with the new parts (arch on two legs, an inverted slope on a
//   wall, a round brick), with each placement reaching the others live;
// - reload, a saved snapshot, its read-only view and continuing it all keep
//   the castle; Build alone opens a castle solo plot beside the Beach Houses
//   one; Beach Houses still opens Beach Houses;
// - screenshots of the empty site and a construction, desktop and mobile.
//   node scripts/castle.ts <base-url> <out-dir>
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/castle";
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name: string, ok: unknown, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const state = (page: Page) => page.evaluate(() => (window as any).__state());
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(250);
}

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project && (window as any).__orbit, null, { timeout: 20000 });
  await page.waitForTimeout(600);
}

/**
 * Holds a tray part, aims so its footprint's corner lands at (x, z) on a
 * surface `plates` up, clicks to commit exactly the preview, and says
 * whether a part of that type now stands exactly there.
 */
async function place(page: Page, partName: string, x: number, z: number, plates = 0, size: [number, number] = [1, 1]): Promise<boolean> {
  const before = (await state(page)).snapshot.parts.length;
  await page.locator(`.tray button[aria-label^="${partName},"]`).click();
  // the editor centres a held part's footprint on the aimed cell (rounding down)
  const ax = x + Math.floor((size[0] - 1) / 2);
  const az = z + Math.floor((size[1] - 1) / 2);
  const p = await project(page, ax + 0.5, plates * 0.4 + 0.18, az + 0.5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(120);
  // over an arch's opening the pointer falls through to the ground: step up with Higher, as a player would
  for (let i = 0; i < 12; i++) {
    const y = await page.evaluate(() => (window as any).__preview((window as any).__state())?.placement.y ?? -1);
    if (y >= plates) break;
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(60);
  }
  const pv = await page.evaluate(() => (window as any).__preview((window as any).__state()));
  await page.mouse.click(p.x, p.y);
  await settle(page);
  await page.keyboard.press("Escape");
  const parts = (await state(page)).snapshot.parts;
  const landed = parts.length === before + 1 && parts.some((q: any) => q.x === x && q.z === z && q.y === plates);
  if (!landed) console.log("   (preview was)", JSON.stringify(pv?.placement), pv?.rejection?.message ?? "");
  return landed;
}

async function topView(page: Page): Promise<void> {
  await page.keyboard.press("Home");
  await page.keyboard.press("t");
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).__settleCamera());
}

async function newVisitor(browser: Browser, mobile = false): Promise<Page> {
  const ctx = await browser.newContext(
    mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1600, height: 1000 } },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return page;
}

const errors: string[] = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });

// ---- 1. the lobby offers both scenes; choosing the castle creates a castle room
const host = await newVisitor(browser);
await host.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await host.locator(".scene-option").first().waitFor();
const options = await host.locator(".scene-option strong").allTextContents();
// ADR 0016 added Woodland Commons as a third option, after these two
check("the lobby offers Beach Houses and Medieval Castle", options.slice(0, 2).join("|") === "Beach Houses|Medieval Castle", options);
const facts = await host.locator(".scene-option .tag").allTextContents();
check("each scene states its real player count and plot", facts.includes("1–2 builders") && facts.includes("1–4 builders") && facts.includes("Plot 32×26 studs") && facts.includes("Plot 16×8 studs"), facts);
check("Beach Houses is chosen by default", (await host.locator('input[name="start-scene"]:checked').getAttribute("value")) === "street-01");
await host.screenshot({ path: `${out}/lobby-scenes-desktop.png` });
await host.locator(".scene-option", { hasText: "Medieval Castle" }).click();
await host.locator(".start-plot-shared").click();
const label = `Castle check ${Date.now()}`;
await host.fill('input[placeholder="e.g. Saturday build"]', label);
check("the shared tile says up to 4 builders for the castle", /Up to 4 people/.test((await host.locator(".start-plot-shared").textContent()) ?? ""));
await host.getByRole("button", { name: "Create and open: Medieval Castle" }).click();
await host.waitForURL(/\/build\/room\/.*debug/);
await editorReady(host);
const roomId = host.url().match(/\/build\/room\/([^/?]+)/)![1];
let s = await state(host);
check("the new room is a castle room, empty, with the castle's kit", s.snapshot.sceneId === "castle-01" && s.snapshot.parts.length === 0 && s.snapshot.inventory["arch-1x4"] === 21, {
  scene: s.snapshot.sceneId,
  parts: s.snapshot.parts.length,
});
check("the editor's title names the castle", (await host.locator(".chip-title").textContent()) === "Medieval Castle" && (await host.title()).startsWith("Medieval Castle"));
const trayNames = await host.locator(".tray button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")?.split(",")[0]));
check("the tray holds the castle's 20 part types and no Beach Houses-only part", trayNames.length === 20 && trayNames.includes("Arch 1×8×2") && !trayNames.includes("Flower"), trayNames);
check("the default colour is stone grey", s.colour === "stone");

// ---- 2. three more visitors join through the public lobby; a fifth is refused
const others: Page[] = [];
for (let i = 0; i < 3; i++) {
  const p = await newVisitor(browser);
  await p.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  const row = p.locator(".room-card-tile, .room-row", { hasText: label }).first();
  await row.waitFor({ timeout: 8000 });
  if (i === 0) check("the lobby row names the castle and shows 4 places", /Medieval Castle/.test((await row.textContent()) ?? "") && /1\/4 here/.test((await row.textContent()) ?? ""), await row.textContent());
  await row.getByRole("button", { name: /Join/ }).click();
  await p.waitForURL(new RegExp(`/build/room/${roomId}`));
  await editorReady(p);
  others.push(p);
}
const ids = await Promise.all([host, ...others].map(async (p) => (await state(p)).selfId));
check("four distinct visitors are in the castle room", new Set(ids).size === 4, ids.map((i: string) => i.slice(0, 8)));
await host.waitForFunction(() => (window as any).__state().snapshot.members.filter((m: any) => m.active).length === 4, null, { timeout: 5000 }).catch(() => {});
check("the host sees four active members", (await state(host)).snapshot.members.filter((m: any) => m.active).length === 4);

const fifth = await newVisitor(browser);
await fifth.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" });
await fifth.getByRole("heading", { name: label }).waitFor({ timeout: 8000 });
const preJoin = (await fifth.locator(".access-card").textContent()) ?? "";
check("a fifth visitor's pre-join screen says Medieval Castle, 4/4, full", /Medieval Castle/.test(preJoin) && /4\/4/.test(preJoin) && /already full/.test(preJoin), preJoin.slice(0, 200));
await fifth.screenshot({ path: `${out}/fifth-refused-desktop.png` });

// ---- 3. building with the new parts; each placement reaches the others live
await Promise.all([host, ...others].map(topView));
const builders = [host, ...others];
const waitParts = (p: Page, n: number) => p.waitForFunction((n) => (window as any).__state().snapshot.parts.length === n, n, { timeout: 4000 }).then(() => true, () => false);
check("host: a 1×1 brick leg at (10, 12)", await place(host, "Brick 1×1", 10, 12));
check("visitor 2: a second leg at (13, 12)", await place(others[0], "Brick 1×1", 13, 12));
check("everyone sees both legs live", (await Promise.all(builders.map((p) => waitParts(p, 2)))).every(Boolean));
check("visitor 3: an arch 1×4 resting on the two legs", await place(others[1], "Arch 1×4", 10, 12, 3, [4, 1]));
const arch = (await state(others[1])).snapshot.parts.find((p: any) => p.partId === "arch-1x4");
check("the arch sits on the legs, one brick up", arch && arch.y === 3 && arch.x === 10 && arch.z === 12, arch);
check("visitor 4: a round brick on top of the arch, over its opening", await place(others[2], "Round brick 1×1", 11, 12, 6));
check("visitor 4: a wall brick 1×2 at (20, 12)", await place(others[2], "Brick 1×2", 20, 12, 0, [2, 1]));
check("host: an inverted slope resting on that wall", await place(host, "Inverted slope 45° 2×2", 20, 12, 3, [2, 2]));
check("everyone converges on the same six parts", (await Promise.all(builders.map((p) => waitParts(p, 6)))).every(Boolean));
s = await state(others[0]);
const kit = s.snapshot.inventory;
check("one shared kit: held + placed = allocated for the parts used", kit["brick-1x1"] === 227 && kit["arch-1x4"] === 20 && kit["round-brick-1x1"] === 94 && kit["inv-slope-2x2"] === 38 && kit["brick-1x2"] === 196, kit);

// removals that would strand a part are refused, through the real Delete tool
async function tryDelete(page: Page, x: number, y: number, z: number): Promise<string> {
  await page.keyboard.press("d");
  const at = await project(page, x, y, z);
  await page.mouse.move(at.x, at.y, { steps: 2 });
  await page.mouse.click(at.x, at.y);
  await settle(page);
  const notice = (await page.locator(".notice").textContent()) ?? "";
  await page.keyboard.press("Escape");
  return notice;
}
// from above, the arch's top: it alone holds the round brick
const archRefusal = await tryDelete(host, 12.5, 2.4, 12.5);
check("removing the arch under the round brick is refused", (await state(host)).snapshot.parts.length === 6 && /Round brick 1×1/.test(archRefusal), archRefusal);
// from a low front view, the leg's own front face: it alone holds that side of the arch
await host.evaluate(() => (window as any).__orbit(0, 1.3));
await host.evaluate(() => (window as any).__settleCamera());
await host.waitForTimeout(300);
const firstLeg = await tryDelete(host, 10.5, 0.6, 13.02);
check("removing one leg is allowed: the arch still stands on the other", (await state(host)).snapshot.parts.length === 5 && /Removed Brick 1×1/.test(firstLeg), firstLeg);
const lastLeg = await tryDelete(host, 13.5, 0.6, 13.02);
check("removing the remaining leg is refused: it's now the arch's only support", (await state(host)).snapshot.parts.length === 5 && /Arch 1×4/.test(lastLeg), lastLeg);
const kept = (await state(host)).snapshot.parts.length;
await topView(host);

// ---- 4. reload, snapshot, view, continue
await others[1].reload({ waitUntil: "domcontentloaded" });
await editorReady(others[1]);
s = await state(others[1]);
check("a reload reopens the castle room with every part", s.snapshot.sceneId === "castle-01" && s.snapshot.parts.length === kept, kept);
await topView(host);
await host.screenshot({ path: `${out}/construction-top-desktop.png` });
await host.keyboard.press("Home");
await host.waitForTimeout(500);
await host.screenshot({ path: `${out}/construction-desktop.png` });

const saved = await host.evaluate(async (roomId) => (await fetch(`/api/rooms/${roomId}/save`, { method: "POST" })).json(), roomId);
check("a saved snapshot records the castle", saved.sceneId === "castle-01", saved.sceneId);
await host.goto(`${base}/build/?snapshot=${saved.id}`, { waitUntil: "domcontentloaded" });
await host.locator(".snapshot-viewer canvas").waitFor({ timeout: 15000 });
await host.waitForTimeout(2500);
check("the saved version's page names the castle", /Medieval Castle/.test((await host.locator(".snapshot-info").textContent()) ?? ""));
await host.screenshot({ path: `${out}/snapshot-view-desktop.png` });
const continued = await host.evaluate(
  async (id) => (await fetch(`/api/snapshots/${id}/continue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility: "invite_only" }) })).json(),
  saved.id,
);
check("continuing it creates an independent castle room with the same parts", continued.sceneId === "castle-01" && continued.roomId !== roomId && continued.parts.length === kept && continued.maxPlayers === 4);
await host.goto(`${base}/build/room/${continued.roomId}?debug`, { waitUntil: "domcontentloaded" });
await editorReady(host);
check("the continued room opens in the castle editor", (await state(host)).snapshot.sceneId === "castle-01" && (await host.locator(".chip-title").textContent()) === "Medieval Castle");

// ---- 5. solo plots per scene; Beach Houses unchanged
const solo = await newVisitor(browser);
await solo.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await solo.locator(".scene-option", { hasText: "Medieval Castle" }).click();
await solo.locator(".start-plot-solo").click();
await solo.getByRole("button", { name: "Build alone: Medieval Castle" }).click();
await solo.waitForURL(/\/build\/room\//);
await editorReady(solo);
const soloCastle = await state(solo);
check("Build alone with the castle chosen opens an empty castle solo plot", soloCastle.snapshot.sceneId === "castle-01" && soloCastle.snapshot.parts.length === 0 && soloCastle.snapshot.maxPlayers === 4);
await solo.screenshot({ path: `${out}/empty-site-desktop.png` });
await solo.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await solo.locator(".start-plot-solo").click();
await solo.getByRole("button", { name: "Build alone: Beach Houses" }).click();
await solo.waitForURL(/\/build\/room\//);
await editorReady(solo);
const soloBeach = await state(solo);
check(
  "Build alone with Beach Houses (the default) opens a different, Beach Houses plot",
  soloBeach.snapshot.sceneId === "street-01" && soloBeach.snapshot.roomId !== soloCastle.snapshot.roomId && soloBeach.snapshot.maxPlayers === 2,
);
check("the Beach Houses editor is unchanged: its own title, target, and 14 part types", (await solo.locator(".chip-title").textContent()) === "Beach Houses" && (await solo.getByRole("button", { name: "Target house" }).count()) === 1 && (await solo.locator(".tray button").count()) === 14);
await solo.screenshot({ path: `${out}/beach-unchanged-desktop.png` });

// ---- 6. mobile: the empty castle site and the construction, front view clear
const phone = await newVisitor(browser, true);
await phone.goto(`${base}/build/room/?local&scene=castle-01&debug`, { waitUntil: "domcontentloaded" });
await editorReady(phone);
await phone.screenshot({ path: `${out}/empty-site-mobile.png` });
await phone.goto(`${base}/build/room/?local&scene=castle-01&reference&debug`, { waitUntil: "domcontentloaded" });
await editorReady(phone);
await phone.screenshot({ path: `${out}/reference-mobile.png` });
const desk = await newVisitor(browser);
await desk.setViewportSize({ width: 1920, height: 1080 });
await desk.goto(`${base}/build/room/?local&scene=castle-01&reference&debug`, { waitUntil: "domcontentloaded" });
await editorReady(desk);
await desk.screenshot({ path: `${out}/reference-desktop.png` });

check("no console errors in any page", errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
