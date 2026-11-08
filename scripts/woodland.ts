#!/usr/bin/env node
// Woodland Commons (ADR 0016), end to end in real Chrome against a running
// server, through the website's own controls:
// - the homepage's scene tray shows three scenes, smallest to largest, and
//   choosing Woodland Commons there creates a real tree-house room;
// - the lobby offers all three; a shared Woodland room admits six
//   independent visitors (six browser contexts, six cookie jars) and its
//   pre-join screen refuses a seventh;
// - building on the tree: a part on a fixed platform, refused inside the
//   trunk (no height offered there), stairs on the ground, a plan on the
//   crown deck; each change reaching the others live through one shared kit;
// - "Hide leaves" by keyboard and by tap is local: it hides the canopy for
//   one viewer, nobody else's view, and changes no rule;
// - Focus raises the orbit centre to a selected part on the crown deck;
//   Reset brings it back; the top view stays over the plot;
// - reload, a saved snapshot and continuing it keep the scene; Build alone
//   opens a Woodland solo plot beside the others;
// - screenshots: empty site and the reference, desktop and mobile, leaves
//   shown and hidden, the homepage tray;
// - while the environment loads, a status line and no unlit, black plot.
//   node scripts/woodland.ts <base-url> <out-dir>
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/0025";
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name: string, ok: unknown, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const state = (page: Page) => page.evaluate(() => (window as any).__state());
const camera = (page: Page) => page.evaluate(() => (window as any).__camera());
const project = (page: Page, x: number, y: number, z: number): Promise<{ x: number; y: number }> =>
  page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), [x, y, z]);

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state().save.status !== "saving", null, { timeout: 10000 });
  await page.waitForTimeout(250);
}

async function editorReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project && (window as any).__orbit, null, { timeout: 30000 });
  await page.waitForTimeout(800);
}

async function topView(page: Page): Promise<void> {
  await page.keyboard.press("Home");
  await page.keyboard.press("t");
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).__settleCamera());
}

/**
 * Holds a tray part and aims at (x, z) on the surface `plates` up, stepping
 * with Higher if the pointer lands lower, then clicks to commit exactly the
 * preview. Returns whether a part of that type now stands exactly there.
 */
async function place(page: Page, partName: string, x: number, z: number, plates = 0, size: [number, number] = [1, 1], plan = false): Promise<boolean> {
  const s0 = await state(page);
  const before = plan ? s0.snapshot.plans.length : s0.snapshot.parts.length;
  await page.locator(`.tray button[aria-label^="${partName},"]`).click();
  const ax = x + Math.floor((size[0] - 1) / 2);
  const az = z + Math.floor((size[1] - 1) / 2);
  const p = await project(page, ax + 0.5, plates * 0.4 + 0.18, az + 0.5);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(150);
  for (let i = 0; i < 20; i++) {
    const y = await page.evaluate(() => (window as any).__preview((window as any).__state())?.placement.y ?? -1);
    if (y >= plates) break;
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(50);
  }
  const pv = await page.evaluate(() => (window as any).__preview((window as any).__state()));
  await page.mouse.click(p.x, p.y);
  await settle(page);
  await page.keyboard.press("Escape");
  const s = (await state(page)).snapshot;
  const list = plan ? s.plans.filter((q: any) => q.status === "open") : s.parts;
  const landed = (plan ? list.length > 0 && s.plans.length === before + 1 : list.length === before + 1) && list.some((q: any) => q.x === x && q.z === z && q.y === plates);
  if (!landed) console.log("   (preview was)", JSON.stringify(pv?.placement), pv?.modeRejection?.message ?? "");
  return landed;
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
const SCENE = "treehouse-01";

// ---- 1. the homepage tray: three scenes, smallest to largest; it creates a real room
const home = await newVisitor(browser);
const homeRequests: string[] = [];
home.on("request", (r) => homeRequests.push(new URL(r.url()).pathname));
await home.goto(`${base}/`, { waitUntil: "domcontentloaded" });
await home.getByRole("button", { name: /Scene tray/ }).first().waitFor({ timeout: 20000 });
await home.waitForTimeout(2500);
await home.getByRole("button", { name: /Scene tray/ }).first().click();
await home.locator(".scene-card").first().waitFor();
await home.waitForTimeout(1800);
const cards = await home.locator(".scene-card-title").allTextContents();
check("the homepage tray panel lists three scenes, smallest to largest", cards.join("|") === "Beach Houses|Medieval Castle|Woodland Commons", cards);
const cardFacts = await home.locator(".scene-card .tag").allTextContents();
check("the cards state Small/2, Medium/4, Large/6", ["Small", "1–2 builders", "Medium", "1–4 builders", "Large", "1–6 builders"].every((f) => cardFacts.some((c) => c.toLowerCase() === f.toLowerCase())), cardFacts);
const cover = home.locator('.scene-card img[src="/scenes/woodland-commons.webp"]');
check("the Woodland card shows its cover, rendered from the scene", (await cover.count()) === 1 && (await cover.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)));
check("the homepage loaded no editor or scene environment chunk", !homeRequests.some((r) => /Workbench|Environment|\/build\/room/.test(r)), homeRequests.filter((r) => /assets/.test(r)).slice(0, 12));
await home.screenshot({ path: `${out}/home-tray-desktop.png` });
await home.locator(".scene-card", { hasText: "Woodland Commons" }).click();
check("choosing Woodland Commons shows its plot, 32×28 studs, as the one scene's details", (await home.locator(".scene-summary .tag").allTextContents()).some((t) => /^Plot 32×28 studs$/i.test(t)));
await home.screenshot({ path: `${out}/home-tray-woodland-desktop.png` });
check("the panel's shared-room line says up to 6 people", /Up to 6 people/.test((await home.locator(".choice-list").textContent()) ?? ""));
await home.getByRole("button", { name: "Build alone" }).click();
await home.waitForURL(/\/build\/room\//, { timeout: 15000 });
await home.goto(home.url() + (home.url().includes("?") ? "&" : "?") + "debug", { waitUntil: "domcontentloaded" });
await editorReady(home);
let s = await state(home);
check("Build alone from the homepage tray opens an empty Woodland solo plot", s.snapshot.sceneId === SCENE && s.snapshot.parts.length === 0 && s.snapshot.maxPlayers === 6, { scene: s.snapshot.sceneId });
check("the editor's title names Woodland Commons and the default colour is nougat", (await home.locator(".chip-title").textContent()) === "Woodland Commons" && s.colour === "nougat");
const trayNames = await home.locator(".tray button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")?.split(",")[0]));
check("the tray holds the 22 kit types, with the stairs and no castle-only part", trayNames.length === 22 && trayNames.includes("Stairs 2×4×4") && !trayNames.includes("Arch 1×8×2"), trayNames.length);
await home.screenshot({ path: `${out}/empty-site-desktop.png` });

// ---- 2. the lobby offers three scenes; a shared Woodland room for six
const host = await newVisitor(browser);
await host.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await host.locator(".scene-option").first().waitFor();
const options = await host.locator(".scene-option strong").allTextContents();
check("the lobby offers all three scenes", options.join("|") === "Beach Houses|Medieval Castle|Woodland Commons", options);
await host.locator(".scene-option", { hasText: "Woodland Commons" }).click();
await host.locator(".start-plot-shared").click();
const label = `Woodland check ${Date.now()}`;
await host.fill('input[placeholder="e.g. Saturday build"]', label);
check("the shared tile says up to 6 builders", /Up to 6 people/.test((await host.locator(".start-plot-shared").textContent()) ?? ""));
await host.screenshot({ path: `${out}/lobby-scenes-desktop.png` });
await host.getByRole("button", { name: "Create and open: Woodland Commons" }).click();
await host.waitForURL(/\/build\/room\/.*debug/);
await editorReady(host);
const roomId = host.url().match(/\/build\/room\/([^/?]+)/)![1];
s = await state(host);
check("the new room is an empty Woodland room with its kit", s.snapshot.sceneId === SCENE && s.snapshot.parts.length === 0 && s.snapshot.inventory["stairs-2x4"] === 6 && s.snapshot.maxPlayers === 6);

const others: Page[] = [];
for (let i = 0; i < 5; i++) {
  const p = await newVisitor(browser);
  await p.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  const row = p.locator(".room-card-tile, .room-row", { hasText: label }).first();
  await row.waitFor({ timeout: 8000 });
  if (i === 0) check("the lobby row names Woodland Commons and shows 6 places", /Woodland Commons/.test((await row.textContent()) ?? "") && /1\/6 here/.test((await row.textContent()) ?? ""), await row.textContent());
  await row.getByRole("button", { name: /Join/ }).click();
  await p.waitForURL(new RegExp(`/build/room/${roomId}`));
  await editorReady(p);
  others.push(p);
}
const builders = [host, ...others];
const ids = await Promise.all(builders.map(async (p) => (await state(p)).selfId));
check("six distinct visitors are in the Woodland room", new Set(ids).size === 6);
await host.waitForFunction(() => (window as any).__state().snapshot.members.filter((m: any) => m.active).length === 6, null, { timeout: 6000 }).catch(() => {});
check("the host sees six active members", (await state(host)).snapshot.members.filter((m: any) => m.active).length === 6);

const seventh = await newVisitor(browser);
await seventh.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" });
await seventh.getByRole("heading", { name: label }).waitFor({ timeout: 8000 });
const preJoin = (await seventh.locator(".access-card").textContent()) ?? "";
check("a seventh visitor's pre-join screen says Woodland Commons, 6/6, full", /Woodland Commons/.test(preJoin) && /6\/6/.test(preJoin) && /already full/.test(preJoin), preJoin.slice(0, 200));
await seventh.screenshot({ path: `${out}/seventh-refused-desktop.png` });

// ---- 3. building on the tree, live, through the shared kit
const waitParts = (p: Page, n: number) => p.waitForFunction((n) => (window as any).__state().snapshot.parts.length === n, n, { timeout: 5000 }).then(() => true, () => false);
await Promise.all(builders.map(topView));
check("visitor 2: a 1×2 brick on the left platform (top 12)", await place(others[0], "Brick 1×2", 2, 6, 12, [2, 1]));
check("everyone sees it live", (await Promise.all(builders.map((p) => waitParts(p, 1)))).every(Boolean));
check("visitor 3: stairs on the ground in front of the left platform", await place(others[1], "Stairs 2×4×4", 3, 12, 0, [2, 4]));
check("visitor 4: a 2×2 plate on the right platform (top 24)", await place(others[2], "Plate 2×2", 24, 6, 24, [2, 2]));
// over the trunk no height fits: holding a part there offers nothing, and a click places nothing
await others[3].locator('.tray button[aria-label^="Brick 1×1,"]').click();
const overTrunk = await project(others[3], 15.5, 35 * 0.4 + 0.2, 5.5);
await others[3].mouse.move(overTrunk.x, overTrunk.y, { steps: 3 });
await others[3].waitForTimeout(200);
const pvTrunk = await others[3].evaluate(() => (window as any).__preview((window as any).__state()));
check("aiming at the trunk's crown deck offers its top, never a height inside the trunk", pvTrunk && pvTrunk.fits.every((y: number) => y >= 36 || y === 0 ? true : false), pvTrunk?.fits);
await others[3].keyboard.press("Escape");
const inTrunk = await others[3].evaluate(async (roomId) => {
  const r = await fetch(`/api/rooms/${roomId}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision: (window as any).__state().snapshot.revision, command: { type: "place", placement: { partId: "brick-1x1", x: 15, y: 9, z: 4, rot: 0, colour: "nougat" } } }),
  });
  return r.json();
}, roomId);
check("the server refuses a part inside the trunk, naming it", inTrunk.ok === false && inTrunk.code === "collision" && /trunk/.test(inTrunk.message), inTrunk.message);
// a plan on the crown deck, in Plan mode
await others[4].keyboard.press("p");
check("visitor 6: a plan on the crown deck (top 36)", await place(others[4], "Plate 2×4", 12, 7, 36, [4, 2], true));
await others[4].keyboard.press("p");
check("everyone converges on three parts", (await Promise.all(builders.map((p) => waitParts(p, 3)))).every(Boolean));
s = await state(host);
check("one shared kit: held + placed = allocated (43−1, 6−1, 162−1)", s.snapshot.inventory["brick-1x2"] === 42 && s.snapshot.inventory["stairs-2x4"] === 5 && s.snapshot.inventory["plate-2x2"] === 161, s.snapshot.inventory);
check("the plan is seen by the host, and costs no stock", s.snapshot.plans.filter((p: any) => p.status === "open").length === 1 && s.snapshot.inventory["plate-2x4"] === 91);

// ---- 4. Hide leaves: local, by key and by tap; Focus raises the centre to the crown
// the canopy mounts with the lazily loaded environment, a moment after the editor
const canopyVisible = async (p: Page) => {
  await p.waitForFunction(() => typeof (window as any).__canopyVisible === "function", null, { timeout: 15000 }).catch(() => {});
  return p.evaluate(() => (window as any).__canopyVisible?.());
};
await host.keyboard.press("Home");
await host.waitForTimeout(500);
check("leaves are shown at first", (await host.locator('button[aria-label="Hide leaves"]').getAttribute("aria-pressed")) === "false" && (await canopyVisible(host)) === true);
await host.screenshot({ path: `${out}/leaves-shown-desktop.png` });
await host.keyboard.press("l");
await host.waitForTimeout(300);
check("L hides the leaves for the host", (await host.locator('button[aria-label="Hide leaves"]').getAttribute("aria-pressed")) === "true" && (await canopyVisible(host)) === false);
check("nobody else's leaves change", (await Promise.all(others.map(canopyVisible))).every((v) => v === true));
check("the room is untouched: same revision, parts and kit", (await state(host)).snapshot.revision === s.snapshot.revision);
await host.screenshot({ path: `${out}/leaves-hidden-desktop.png` });
await host.locator('button[aria-label="Hide leaves"]').click();
await host.waitForTimeout(300);
check("the button shows them again", (await canopyVisible(host)) === true);

// Focus: select the plate on the right platform, F raises the orbit centre to it
const before = await camera(host);
await topView(host);
const plate = (await state(host)).snapshot.parts.find((p: any) => p.partId === "plate-2x2");
const at = await project(host, plate.x + 1, (plate.y + 1) * 0.4 + 0.1, plate.z + 1);
await host.mouse.click(at.x, at.y);
await host.waitForTimeout(200);
const selected = (await state(host)).selectedId === plate.id;
await host.keyboard.press("f");
await host.waitForTimeout(400);
await host.evaluate(() => (window as any).__settleCamera());
const focused = await camera(host);
check("Focus raises the orbit centre to the selected part on the right platform", selected && focused.target[1] > 9 && focused.target[1] < 11 && Math.abs(focused.target[0] - (plate.x + 1)) < 0.6, { selected, target: focused.target });
await host.keyboard.press("Escape");
await host.keyboard.press("Home");
await host.waitForTimeout(400);
await host.evaluate(() => (window as any).__settleCamera());
const reset = await camera(host);
check("Reset brings the view back to the scene's own opening frame", Math.abs(reset.target[1] - before.target[1]) < 0.01 && Math.abs(reset.polar - 1.3) < 0.01, reset.target);
// orbiting round behind, close in, would put the camera inside the trunk:
// it is kept out, on the target's side of the bark (scene/obstacles.ts)
await host.mouse.move(800, 400);
// up to 80 steps: each wheel step is about 5 %, from ~106 (topClear, 8 Nov)
for (let i = 0; i < 80 && (await camera(host)).distance > 9; i++) {
  await host.mouse.wheel(0, -400);
  await host.waitForTimeout(40);
}
await host.evaluate(() => (window as any).__settleCamera());
await host.evaluate(() => (window as any).__orbit(Math.PI, 1.4));
const behind = await camera(host);
const [cx, cy, cz] = behind.position;
const cameraInTrunk = [
  [13, 0, 1, 19, 35 * 0.4, 11],
  [13, 35 * 0.4, 1, 19, 72 * 0.4, 5],
].some(([x0, y0, z0, x1, y1, z1]) => cx > x0 && cx < x1 && cy > y0 && cy < y1 && cz > z0 && cz < z1);
check("orbiting close behind the tree never leaves the camera inside the trunk", behind.distance < 10 && !cameraInTrunk, { position: behind.position, distance: behind.distance });
await host.keyboard.press("Home");
await host.waitForTimeout(400);
await host.keyboard.press("t");
await host.waitForTimeout(500);
await host.evaluate(() => (window as any).__settleCamera());
const top = await camera(host);
check("the top view looks straight down over the plot", top.polar < 0.05 && top.position[1] > 60, { polar: top.polar, y: top.position[1] });
await host.screenshot({ path: `${out}/construction-top-desktop.png` });

// ---- 5. reload, snapshot, continue
await others[1].reload({ waitUntil: "domcontentloaded" });
await editorReady(others[1]);
s = await state(others[1]);
check("a reload reopens the Woodland room with every part and the plan", s.snapshot.sceneId === SCENE && s.snapshot.parts.length === 3 && s.snapshot.plans.length === 1);
check("after a reload the leaves are shown again (the setting is per page view)", (await canopyVisible(others[1])) === true);
const saved = await host.evaluate(async (roomId) => (await fetch(`/api/rooms/${roomId}/save`, { method: "POST" })).json(), roomId);
check("a saved snapshot records Woodland Commons", saved.sceneId === SCENE);
await host.goto(`${base}/build/?snapshot=${saved.id}`, { waitUntil: "domcontentloaded" });
await host.locator(".snapshot-viewer canvas").waitFor({ timeout: 15000 });
await host.waitForTimeout(3000);
check("the saved version's page names Woodland Commons", /Woodland Commons/.test((await host.locator(".snapshot-info").textContent()) ?? ""));
await host.screenshot({ path: `${out}/snapshot-view-desktop.png` });
const continued = await host.evaluate(
  async (id) => (await fetch(`/api/snapshots/${id}/continue`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility: "invite_only" }) })).json(),
  saved.id,
);
check("continuing it creates an independent Woodland room with the same parts", continued.sceneId === SCENE && continued.roomId !== roomId && continued.parts.length === 3 && continued.maxPlayers === 6);

// ---- 6. the other scenes are unchanged
const solo = await newVisitor(browser);
await solo.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await solo.locator(".start-plot-solo").click();
await solo.getByRole("button", { name: "Build alone: Beach Houses" }).click();
await solo.waitForURL(/\/build\/room\//);
await editorReady(solo);
const beach = await state(solo);
check("Beach Houses is still the default and unchanged: 2 places, 14 part types, no Hide leaves", beach.snapshot.sceneId === "street-01" && beach.snapshot.maxPlayers === 2 && (await solo.locator(".tray button").count()) === 14 && (await solo.locator('button[aria-label="Hide leaves"]').count()) === 0);
await solo.keyboard.press("l");
check("L does nothing in Beach Houses", (await solo.locator(".notice").textContent().catch(() => "")) !== "Leaves hidden, for you only.");

// ---- 7. mobile: the empty site, the reference, the Hide leaves button by tap
const phone = await newVisitor(browser, true);
await phone.goto(`${base}/build/room/?local&scene=${SCENE}&debug`, { waitUntil: "domcontentloaded" });
await editorReady(phone);
await phone.screenshot({ path: `${out}/empty-site-mobile.png` });
await phone.goto(`${base}/build/room/?local&scene=${SCENE}&reference&debug`, { waitUntil: "domcontentloaded" });
await editorReady(phone);
await phone.screenshot({ path: `${out}/reference-mobile.png` });
const leavesBtn = phone.locator('button[aria-label="Hide leaves"]');
const box = await leavesBtn.boundingBox();
const topBox = await phone.locator('button[aria-label="Top view"]').boundingBox();
check("on a phone the Hide leaves button is on screen, as tall as the other view buttons and at least 24px", !!box && !!topBox && box.height >= 24 && box.height >= topBox.height - 0.5 && box.y >= 0 && box.x + box.width <= 390, { box, topBox });
await leavesBtn.tap();
await phone.waitForTimeout(300);
check("a tap hides the leaves", (await canopyVisible(phone)) === false);
await phone.screenshot({ path: `${out}/reference-leaves-hidden-mobile.png` });
const desk = await newVisitor(browser);
await desk.setViewportSize({ width: 1920, height: 1080 });
await desk.goto(`${base}/build/room/?local&scene=${SCENE}&reference&debug`, { waitUntil: "domcontentloaded" });
await editorReady(desk);
await desk.screenshot({ path: `${out}/reference-desktop.png` });
const homePhone = await newVisitor(browser, true);
await homePhone.goto(`${base}/`, { waitUntil: "domcontentloaded" });
await homePhone.getByRole("button", { name: /Scene tray/ }).first().waitFor({ timeout: 20000 });
await homePhone.waitForTimeout(2500);
await homePhone.getByRole("button", { name: /Scene tray/ }).first().tap();
await homePhone.waitForTimeout(2000);
await homePhone.screenshot({ path: `${out}/home-tray-mobile.png` });

// ---- 7b. the inspiration card in every scene and at every width: its
// heading is never under another control, the controls hint makes way, the
// card fits between the toggle and the dock and scrolls inside, the toggle
// stays usable, and the tree-house picture shows the tree (ADR 0016)
const LABELS: Record<string, string> = { "street-01": "House inspiration", "castle-01": "Castle inspiration", [SCENE]: "Tree-house inspiration" };
const WIDTHS = [
  { name: "1920", vp: { width: 1920, height: 1080 }, mobile: false },
  { name: "1280", vp: { width: 1280, height: 800 }, mobile: false },
  { name: "1024", vp: { width: 1024, height: 768 }, mobile: false },
  { name: "390", vp: { width: 390, height: 844 }, mobile: true },
  { name: "360", vp: { width: 360, height: 740 }, mobile: true },
];
const cardProblems: unknown[] = [];
for (const [sceneId, label] of Object.entries(LABELS)) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: w.vp, isMobile: w.mobile, hasTouch: w.mobile, deviceScaleFactor: w.mobile ? 2 : 1 });
    const page = await ctx.newPage();
    await page.goto(`${base}/build/room/?local&scene=${sceneId}&debug`, { waitUntil: "domcontentloaded" });
    await editorReady(page);
    const toggle = page.getByRole("button", { name: label, exact: true });
    if ((await toggle.count()) !== 1 || (await toggle.getAttribute("aria-expanded")) !== "false") cardProblems.push({ sceneId, w: w.name, problem: "no closed toggle named " + label });
    await toggle.click();
    await page.locator(".target-card img").waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const card = document.querySelector(".target-card") as HTMLElement;
      const head = card.querySelector(".target-head") as HTMLElement;
      const body = card.querySelector(".target-body") as HTMLElement;
      const button = document.querySelector(".target > button") as HTMLElement;
      const dock = document.querySelector(".dock") as HTMLElement;
      const hb = head.getBoundingClientRect();
      const cb = card.getBoundingClientRect();
      const bb = button.getBoundingClientRect();
      // sample the heading's whole row: every point must be the heading itself
      const covered: string[] = [];
      for (let i = 1; i < 10; i++) {
        for (const y of [hb.top + 3, hb.top + hb.height / 2, hb.bottom - 3]) {
          const el = document.elementFromPoint(hb.left + (hb.width * i) / 10, y);
          if (!el || !head.contains(el)) covered.push(el ? `${el.tagName}.${el.className}` : "nothing");
        }
      }
      const atButton = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
      body.scrollTop = body.scrollHeight;
      const caption = card.querySelector("figcaption")!.getBoundingClientRect();
      return {
        covered,
        hint: !!document.querySelector(".camera-hint"),
        inView: cb.left >= 0 && cb.right <= innerWidth && cb.top >= 0,
        aboveDock: cb.bottom <= dock.getBoundingClientRect().top + 1,
        captionReachable: caption.bottom <= cb.bottom + 1 && caption.top >= cb.top,
        toggleFree: !!atButton && button.contains(atButton),
        expanded: button.getAttribute("aria-expanded"),
        labelled: card.getAttribute("aria-label"),
      };
    });
    const ok = r.covered.length === 0 && !r.hint && r.inView && r.aboveDock && r.captionReachable && r.toggleFree && r.expanded === "true" && r.labelled === label;
    if (!ok) cardProblems.push({ sceneId, w: w.name, ...r, covered: r.covered.slice(0, 4) });
    await page.locator(".target-body").evaluate((el) => (el.scrollTop = 0));
    if (sceneId === SCENE && (w.name === "1280" || w.name === "390")) await page.screenshot({ path: `${out}/inspiration-${w.name}.png` });
    if (sceneId === SCENE && w.name === "1280") {
      // the picture has the tree: its top third holds the canopy and the
      // crown (the castle's or a house's picture has nothing up there)
      const upper = await page.locator(".target-card img").evaluate(async (img: HTMLImageElement) => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, Math.floor(c.height / 3)).data;
        let solid = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 200) solid++;
        return solid / (d.length / 4);
      });
      check("the tree-house picture shows the tree above the cabins (its top third is not empty)", upper > 0.15, upper.toFixed(2));
    }
    await page.getByRole("button", { name: "Hide inspiration" }).click();
    check(`${sceneId} at ${w.name}: Hide inspiration closes the card again`, (await page.locator(".target-card").count()) === 0 && (await page.locator(".target > button").textContent()) === label);
    await ctx.close();
  }
}
check("the inspiration card's heading is never covered, the hint makes way, and the card fits above the dock and scrolls inside, in all three scenes at 1920, 1280, 1024, 390 and 360", cardProblems.length === 0, cardProblems);

// ---- 8. loading: with the environment held back, the canvas shows a
// status line on the page background, never an unlit (black) plot
const slow = await newVisitor(browser);
// the scene's environment chunk is held until the check below has looked,
// not for a fixed time, so a slow start can't let it through early
let release: () => void = () => {};
const held = new Promise<void>((ok) => (release = ok));
await slow.route(/Environment-[^/]*\.js$/, async (r) => {
  await held;
  await r.continue();
});
await slow.goto(`${base}/build/room/?local&scene=${SCENE}&debug`, { waitUntil: "domcontentloaded" });
await slow.waitForFunction(() => (window as any).__state?.().snapshot, null, { timeout: 30000 });
await slow.waitForTimeout(800);
const waiting = await slow.evaluate(() => {
  // the WebGL canvas is drawn with preserveDrawingBuffer, so its pixels can be read
  const c = document.querySelector(".stage canvas") as HTMLCanvasElement | null;
  const gl = c?.getContext("webgl2") as WebGL2RenderingContext | null;
  let drawn = -1;
  if (gl) {
    const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px);
    drawn = 0;
    for (let i = 3; i < px.length; i += 4 * 97) if (px[i] > 0) drawn++;
  }
  return { status: document.querySelector(".scene-loading")?.textContent ?? null, drawn };
});
await slow.screenshot({ path: `${out}/loading-desktop.png` });
check("while the environment loads, a status line shows and the canvas draws nothing (no unlit plot)", waiting.status === "Loading the scene…" && waiting.drawn === 0, waiting);
release();
await editorReady(slow);
await slow.waitForTimeout(3000);
check("once it has loaded the status line is gone", (await slow.locator(".scene-loading").count()) === 0);

// the one 422 is the deliberate in-trunk command above, refused as it should be
const unexpected = errors.filter((e) => !/status of 422/.test(e));
check("no console errors in any page, beyond the deliberately refused command", unexpected.length === 0 && errors.length - unexpected.length <= 1, errors.slice(0, 5));
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
