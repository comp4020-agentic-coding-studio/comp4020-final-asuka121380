#!/usr/bin/env node
// Drives the homepage's table (ADR 0014) in the locally installed Chrome,
// against a running server, and records screenshots and each check's result.
//   node scripts/tabletop.ts [base-url] [out-dir]
// Each run is a fresh browser context: a fresh visitor with no cookie.
// The mobile run is Chrome's device emulation at 390×844 (isMobile,
// hasTouch): it is not a physical phone. Reads the camera through `?debug`.
// Not part of `pnpm check`: it needs a desktop Chrome and writes files.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "doc/evidence/shots/tabletop";
mkdirSync(out, { recursive: true });

type Result = { run: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
let run = "";
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ run, name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  [${run}] ${name}${d ? `  — ${d}` : ""}`);
}

type Cam = { position: number[]; target: number[]; moving: boolean; destination: { position: number[]; target: number[] }; lastPathClear: boolean | null; lastPathLift: number | null };
const cam = (page: Page): Promise<Cam> => page.evaluate(() => (window as any).__tableCamera());
const url = (q = "") => `${base}/${q ? `?${q}&debug` : "?debug"}`;

async function ready(page: Page): Promise<void> {
  await page.waitForSelector('.table-page[data-status="ready"]', { timeout: 20000 });
  await page.waitForTimeout(400);
}

type Step = { ms: number; moving: boolean; position: number[]; dialog: boolean; path: string; status: string | null };
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

/**
 * One camera move, observed in animation time rather than wall time.
 *
 * Counting frames in wall time fails under software rendering: SwiftShader
 * can take longer than the whole 700 ms move to draw one frame, so the app
 * (rightly, being time-based) lands on its first frame and a sampler sees
 * no frame in between (evidence 0026, follow-up). Here the page's clock
 * (`page.clock`) is already installed and paused by motion(); the activation
 * is made and time is advanced 100 ms at a time, one frame per step. Every
 * step records the real camera pose, so `moving` alone can't pass: the
 * camera has to be seen part-way, getting nearer the pose that was asked
 * for, with no dialog, and then to land there. Under reduced motion there is
 * no move; see reducedMotion().
 * `closing`: a move back from an open panel, which starts with one open.
 */
async function travel(page: Page, activate: () => Promise<void>, closing = false): Promise<{ ok: boolean; detail: { stepsMoving: number; dialogWhileMoving: number; [k: string]: unknown }; steps: Step[] }> {
  const start = await cam(page);
  const startDialog = (await page.locator('[role="dialog"]').count()) > 0;
  const reduce = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const steps: Step[] = [];
  let dest: Cam["destination"] | null = null;
  let navigated = false;
  try {
    await activate();
    await page.waitForFunction(() => (window as any).__tableCamera().moving, null, { timeout: 4000, polling: 50 }).catch(() => {});
    dest = (await cam(page)).destination;
    for (let ms = 0; ms <= 1500; ms += 100) {
      if (ms > 0) await page.clock.fastForward(100);
      const s = await page
        .evaluate(() => {
          const c = (window as any).__tableCamera();
          return { moving: c.moving as boolean, position: c.position as number[], dialog: !!document.querySelector('[role="dialog"]'), path: location.pathname, status: document.querySelector(".table-intro")?.textContent ?? null };
        })
        .catch(() => null); // the booklet leaves for /readme/ on arrival
      if (!s) {
        navigated = true;
        break;
      }
      steps.push({ ms, ...s });
      if (!s.moving && ms > 0) break;
    }
  } catch (e) {
    if (!String(e).includes("context was destroyed")) throw e;
    navigated = true;
  }
  const d = dest!;
  const moving = steps.filter((s) => s.moving);
  // part-way: clearly away from where it started and from where it is going
  const between = moving.filter((s) => dist(s.position, start.position) > 0.5 && dist(s.position, d.position) > 0.5);
  const nearer = moving.every((s, i) => i === 0 || dist(s.position, d.position) <= dist(moving[i - 1].position, d.position) + 1e-3);
  const last = steps[steps.length - 1];
  const landed = navigated || (!last.moving && dist(last.position, d.position) < 0.01);
  const arrivedAt = navigated ? null : last.ms;
  const detail = {
    reduce,
    startMoving: start.moving,
    startDialog,
    startToDestination: +dist(start.position, d.position).toFixed(2),
    stepsMoving: moving.length,
    stepsPartWay: between.length,
    nearerEachStep: nearer,
    dialogWhileMoving: moving.filter((s) => s.dialog).length,
    arrivedAtMs: arrivedAt,
    landed,
    track: steps.map((s) => `${s.ms}:${s.moving ? "m" : "-"}${s.dialog ? "D" : ""}:${s.position.map((v) => v.toFixed(1)).join(",")}`),
  };
  const ok =
    !reduce && !start.moving && startDialog === closing && dist(start.position, d.position) > 5 &&
    between.length >= 3 && nearer && detail.dialogWhileMoving === 0 && landed &&
    (navigated || (arrivedAt! >= 600 && arrivedAt! <= 900));
  return { ok, detail, steps };
}

async function settled(page: Page): Promise<Cam> {
  await page.waitForFunction(() => (window as any).__tableCamera && !(window as any).__tableCamera().moving, null, { timeout: 5000 });
  return cam(page);
}

// For screenshots only: the panel fades in over 220 ms of animation time,
// which under swiftshader can take twice that in wall time, so a shot taken
// on a fixed delay can catch it half-transparent. Wait for its entry
// animation to finish (a no-op under reduced motion, where there is none).
async function panelShown(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const p = document.querySelector(".table-panel");
    return !!p && p.getAnimations().every((a) => a.playState === "finished");
  }, null, { timeout: 5000 });
}

const errorsOf = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // the browser's own /favicon.ico probe: no page here declares one, which predates ADR 0014
  page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  return errors;
};

async function signFaceCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(".sign-face").boundingBox();
  if (!box) throw new Error("no sign face");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function desktop(browser: Browser): Promise<void> {
  run = "desktop 1920×1080";
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));

  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);
  await page.screenshot({ path: `${out}/overview-desktop.png` });
  check("overview renders, no console errors", errors.length === 0, errors.join(" | "));
  check("viewing the homepage never asks /api/me (no visitor created)", !requests.includes("/api/me"), requests.filter((p) => p.startsWith("/api")));
  check("the sign reads Sign in for a fresh visitor", (await page.locator(".sign-face-label").textContent()) === "Sign in");
  const cookies = await ctx.cookies();
  check("no identity cookie after viewing", !cookies.some((c) => c.name === "brick_visitor"), cookies.map((c) => c.name));
  check("quick links present and collapsed", (await page.locator(".quick-links-toggle").getAttribute("aria-expanded")) === "false");
  const overview = await cam(page);

  // hover: the 3D hit area around the sign, on its stand below the face (the
  // face's box is axis-aligned round a turned sign, so step just past it)
  const face = await signFaceCentre(page);
  const faceBox = (await page.locator(".sign-face").boundingBox())!;
  const onPost = { x: face.x, y: faceBox.y + faceBox.height + 8 };
  const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, onPost);
  check("the probe point is outside the HTML face (it reaches the 3D hit area)", hitTarget === "CANVAS", hitTarget);
  await page.mouse.move(onPost.x, onPost.y);
  await page.waitForTimeout(350);
  check("hovering the sign's post lights the face", (await page.locator(".sign-face.is-active").count()) === 1);
  await page.screenshot({ path: `${out}/hover-desktop.png` });

  // click the physical sign (post, not the HTML face); the move itself, step
  // by step in animation time, is checked in motion()
  await page.mouse.click(onPost.x, onPost.y);
  const there = await settled(page);
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  check("camera arrived nearer the sign", Math.hypot(...there.position.map((v, i) => v - there.target[i])) < Math.hypot(...overview.position.map((v, i) => v - overview.target[i])) - 5, { from: overview.position, to: there.position });
  check("the camera's path kept clear of the house, board, shelf and sign", there.lastPathClear === true, { clear: there.lastPathClear, lift: there.lastPathLift });
  check("URL records the focused view", page.url().includes("focus=sign-in"), page.url());
  await page.waitForSelector(".account-scope .context-actions", { timeout: 8000 });
  await page.waitForTimeout(300);
  check("focus moved into the dialog heading", (await page.evaluate(() => document.activeElement?.id)) === "account-panel-title");
  const signVisible = await page.evaluate(() => {
    const r = document.querySelector(".sign-face")!.getBoundingClientRect();
    const p = document.querySelector(".table-panel")!.getBoundingClientRect();
    return { signRight: Math.round(r.right), panelLeft: Math.round(p.left), onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  check("the sign stays visible beside the panel", signVisible.onScreen && signVisible.signRight < signVisible.panelLeft, signVisible);
  await panelShown(page);
  await page.screenshot({ path: `${out}/focused-sign-in-desktop.png` });
  check("visiting the panel establishes identity (the first identity-dependent act)", (await ctx.cookies()).some((c) => c.name === "brick_visitor"));

  // focus stays in the dialog
  let escaped = false;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (!(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))) escaped = true;
  }
  check("Tab stays inside the dialog", !escaped);
  check("the table behind is inert", await page.evaluate(() => document.querySelector(".table-stage")!.hasAttribute("inert")));

  // register through the existing flow, then the sign changes without a reload
  await page.getByRole("button", { name: "Create an account" }).click();
  const username = `t${Date.now().toString(36)}`;
  await page.getByLabel("Username").fill(username);
  await page.getByLabel(/Display name/).fill("Table Tester");
  await page.getByLabel(/Password/).fill("a-table-password-1");
  await page.screenshot({ path: `${out}/register-desktop.png` });
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForSelector("text=Signed in as", { timeout: 8000 });
  check("registration completes in the panel", true);
  check("the sign now names the account, no reload", (await page.locator(".sign-face-label").textContent()) === "Table Tester", await page.locator(".sign-face-label").textContent());
  await page.screenshot({ path: `${out}/signed-in-desktop.png` });

  // Escape closes; focus returns to the sign
  await page.keyboard.press("Escape");
  await settled(page);
  await page.waitForTimeout(150);
  check("Escape closes the panel", (await page.locator('[role="dialog"]').count()) === 0);
  check("focus returns to the sign", await page.evaluate(() => document.activeElement?.classList.contains("sign-face") ?? false));
  check("URL returns to the plain homepage", !page.url().includes("focus="), page.url());
  const back = await cam(page);
  check("camera back at the overview", Math.abs(back.position[2] - overview.position[2]) < 0.05, back.position);

  // keyboard: Enter on the focused sign opens it again
  await page.keyboard.press("Enter");
  await settled(page);
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  check("Enter on the sign opens the panel", true);
  // browser Back closes, Forward reopens
  await page.goBack();
  await settled(page);
  await page.waitForTimeout(150);
  check("browser Back closes the focused view", (await page.locator('[role="dialog"]').count()) === 0 && !page.url().includes("focus="));
  await page.goForward();
  await settled(page);
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  check("browser Forward reopens it", page.url().includes("focus=sign-in"));
  // Back to table button, then sign out
  await page.waitForSelector('.account-scope button:has-text("Sign out")', { timeout: 8000 });
  await page.locator(".account-scope").getByRole("button", { name: "Sign out" }).click();
  await page.waitForSelector("text=Signed out", { timeout: 8000 });
  check("signing out updates the sign without a reload", (await page.locator(".sign-face-label").textContent()) === "Sign in");
  await page.getByRole("button", { name: /Back to table/ }).click();
  await settled(page);
  await page.waitForTimeout(150);
  check("Back to table closes the panel", (await page.locator('[role="dialog"]').count()) === 0);

  // a reload on the focused URL restores it straight away (no replay needed)
  await page.goto(url("focus=sign-in"), { waitUntil: "networkidle" });
  await ready(page);
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  check("direct link /?focus=sign-in opens the panel", true);

  // repeated activation and reversing mid-move
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);
  const f = await signFaceCentre(page);
  const before = await page.evaluate(() => history.length);
  await page.mouse.click(f.x, f.y);
  await page.mouse.click(f.x, f.y);
  const added = (await page.evaluate(() => history.length)) - before;
  await page.waitForTimeout(150);
  await page.goBack();
  await settled(page);
  await page.waitForTimeout(150);
  const rev = await cam(page);
  check("reversing mid-move settles at the overview, no panel", (await page.locator('[role="dialog"]').count()) === 0 && Math.abs(rev.position[2] - overview.position[2]) < 0.05, rev.position);
  check("a double click adds one history entry, not two", added === 1, added);

  // quick links
  await page.locator(".quick-links-toggle").click();
  await page.screenshot({ path: `${out}/quick-links-desktop.png` });
  const hrefs = await page.locator("#quick-links-list a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
  check("quick links list the lobby, friends, collection, showcase and README", ["/build/", "/build/#friends", "/build/?view=collection", "/build/?view=showcase", "/readme/"].every((h) => hrefs.includes(h)), hrefs);
  for (const h of hrefs) {
    const r = await page.request.get(`${base}${h}`);
    check(`quick link ${h} answers`, r.status() === 200, r.status());
  }
  await page.keyboard.press("Escape");
  check("Escape closes quick links", (await page.locator(".quick-links-toggle").getAttribute("aria-expanded")) === "false");
  await ctx.close();
}

async function mobile(browser: Browser): Promise<void> {
  run = "mobile 390×844 (emulated)";
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);
  await page.screenshot({ path: `${out}/overview-mobile.png` });
  check("overview renders, no console errors", errors.length === 0, errors.join(" | "));
  // what a finger can hit: the face, plus the screen-space pad over the sign
  const signPad = page.locator('.entrance-touch[data-entrance="sign-in"]');
  const pad = await signPad.boundingBox();
  check("the sign has a thumb-sized touch area (≥ 44px each way)", !!pad && pad.width >= 44 && pad.height >= 44, pad);
  check("the touch pad is hidden from assistive technology", (await signPad.getAttribute("aria-hidden")) === "true");
  const face = (await page.locator(".sign-face").boundingBox())!;
  const covers = !!pad && pad.x <= face.x + 1 && pad.x + pad.width >= face.x + face.width - 1;
  check("the pad covers the sign it stands for", covers, { pad, face });
  // tap the pad below the face, on the posts: the same action as the face
  await signPad.tap({ position: { x: pad!.width / 2, y: pad!.height - 8 } });
  const arrived = await settled(page);
  check("the camera's path kept clear of the objects", arrived.lastPathClear === true, { clear: arrived.lastPathClear, lift: arrived.lastPathLift });
  await page.waitForSelector(".account-scope .context-actions", { timeout: 8000 });
  await page.waitForTimeout(300);
  const layout = await page.evaluate(() => {
    const s = document.querySelector(".sign-face")!.getBoundingClientRect();
    const p = document.querySelector(".table-panel")!.getBoundingClientRect();
    const input = getComputedStyle(document.querySelector(".table-panel")!).fontSize;
    return { signBottom: Math.round(s.bottom), panelTop: Math.round(p.top), panelWidth: Math.round(p.width), fontSize: input, vw: innerWidth };
  });
  check("bottom sheet spans the width, sign visible above it", layout.panelWidth === layout.vw && layout.signBottom <= layout.panelTop + 4, layout);
  await panelShown(page);
  await page.screenshot({ path: `${out}/focused-sign-in-mobile.png` });
  await page.getByRole("button", { name: "Sign in", exact: true }).last().tap();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/sign-in-form-mobile.png` });
  const inputFont = await page.locator(".account-scope input").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("form inputs at ≥ 16px (no zoom-on-focus, readable)", inputFont >= 16, inputFont);
  await page.getByRole("button", { name: /Back to table/ }).tap();
  await settled(page);
  check("Back to table on touch closes it", (await page.locator('[role="dialog"]').count()) === 0);
  await page.locator(".quick-links-toggle").tap();
  await page.screenshot({ path: `${out}/quick-links-mobile.png` });
  check("quick links open on touch", (await page.locator(".quick-links-toggle").getAttribute("aria-expanded")) === "true");
  await ctx.close();
}

async function reducedMotion(browser: Browser): Promise<void> {
  run = "reduced motion";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);
  const start = await cam(page);
  const f = await signFaceCentre(page);
  await page.mouse.click(f.x, f.y);
  // the first state after the click: already at the sign, never moving
  await page.waitForFunction((p) => (window as any).__tableCamera().position.join() !== p, start.position.join(), { timeout: 3000, polling: 20 });
  const c = await cam(page);
  check("the camera cuts instead of travelling: at the sign at once, never moving", !c.moving && dist(c.position, c.destination.position) < 0.01 && dist(c.position, start.position) > 5, { moving: c.moving, position: c.position, destination: c.destination.position });
  await page.waitForSelector('[role="dialog"]', { timeout: 1500 });
  check("panel available at once", true);
  await page.keyboard.press("Escape");
  await page.waitForFunction((p) => (window as any).__tableCamera().position.join() !== p, c.position.join(), { timeout: 3000, polling: 20 });
  const r = await cam(page);
  check("return is a cut too: back at the overview at once", !r.moving && dist(r.position, start.position) < 0.01, { moving: r.moving, position: r.position });
  await ctx.close();
}

async function failures(browser: Browser): Promise<void> {
  run = "fallbacks";
  // no WebGL at all
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (String(type).startsWith("webgl")) return null;
      return (orig as any).call(this, type, ...rest);
    } as typeof orig;
  });
  const page = await ctx.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  // every script the fallback fetched, by content: three.js is identified by
  // its renderer, whatever the bundler named the chunk it landed in
  const scripts: Promise<{ path: string; three: boolean }>[] = [];
  page.on("response", (r) => {
    if (!new URL(r.url()).pathname.endsWith(".js")) return;
    scripts.push(r.text().then((t) => ({ path: new URL(r.url()).pathname, three: t.includes("WebGLRenderer") }), () => ({ path: new URL(r.url()).pathname, three: false })));
  });
  await page.goto(url(), { waitUntil: "networkidle" });
  await page.waitForSelector(".fallback", { timeout: 5000 });
  await page.screenshot({ path: `${out}/fallback-no-webgl.png` });
  const links = await page.locator(".fallback a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
  check("no WebGL: fallback lists account, lobby, friends, collection, showcase, README", ["/build/?view=account", "/build/", "/build/#friends", "/build/?view=collection", "/build/?view=showcase", "/readme/"].every((h) => links.includes(h)), links);
  check("no WebGL: the three.js chunk is never fetched", !requests.some((p) => /TableScene|PartMesh/.test(p)), requests.filter((p) => p.includes("assets")));
  const fetched = await Promise.all(scripts);
  check("no WebGL: no fetched script contains three.js (checked by content)", fetched.length > 0 && !fetched.some((f) => f.three), fetched);
  check("no WebGL: viewing still never asks /api/me", !requests.includes("/api/me"), requests.filter((p) => p.startsWith("/api")));
  await ctx.close();

  // the scene's chunk fails to load
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.route(/TableScene-.*\.js$/, (r) => r.abort());
  const p2 = await ctx2.newPage();
  await p2.goto(url(), { waitUntil: "networkidle" });
  await p2.waitForSelector(".fallback", { timeout: 8000 });
  check("lazy-load failure falls back to links", true);
  await ctx2.close();

  // the GPU context is lost after the table has drawn
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p3 = await ctx3.newPage();
  await p3.goto(url(), { waitUntil: "networkidle" });
  await ready(p3);
  await p3.evaluate(() => {
    const gl = (document.querySelector(".table-canvas canvas") as HTMLCanvasElement).getContext("webgl2") as WebGL2RenderingContext;
    gl.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await p3.waitForSelector(".fallback", { timeout: 5000 });
  check("WebGL context loss falls back to links", true);
  await ctx3.close();

  // no JavaScript at all
  const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const p4 = await ctx4.newPage();
  await p4.goto(`${base}/`, { waitUntil: "load" });
  await p4.screenshot({ path: `${out}/fallback-no-js.png` });
  const n = await p4.locator("noscript").count();
  const visible = await p4.locator(".fallback-card a").count();
  check("no JavaScript: the noscript links show", n === 1 && visible >= 6, { noscript: n, links: visible });
  await ctx4.close();
}

async function others(browser: Browser): Promise<void> {
  run = "other pages unchanged";
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  for (const [path, name] of [["/build/", "lobby"], ["/build/?view=account", "account"], ["/readme/", "readme"]] as const) {
    const errors = errorsOf(page);
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}-desktop.png` });
    check(`${path} loads without console errors`, errors.length === 0, errors.join(" | "));
  }
  const bg = await page.goto(`${base}/build/`, { waitUntil: "networkidle" }).then(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  check("lobby keeps its own paper background (home styles don't leak)", bg === "rgb(251, 245, 238)", bg);
  await page.goto(`${base}/build/#friends`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check("/build/#friends lands on the Friends card", await page.evaluate(() => !!document.getElementById("friends")));
  await ctx.close();
}

// ---- the other five entrances (scene tray, noticeboard, Friends, shelf, booklet) ----

type Entrance = "scenes" | "rooms" | "friends" | "shelf" | "about";
const PANEL: Record<Exclude<Entrance, "about">, { heading: string; content: string }> = {
  scenes: { heading: "Choose a scene", content: 'button:has-text("Build alone")' },
  rooms: { heading: "Join a room", content: '[role="tab"]:has-text("Public rooms")' },
  friends: { heading: "Friends and invitations", content: '[role="tab"]:has-text("Invitations")' },
  shelf: { heading: "Our creations", content: 'a:has-text("Open")' },
};

/** Every write this page makes to the API (method and path), to prove opening a panel changes nothing. */
function writesOf(page: Page): string[] {
  const writes: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/") && r.method() !== "GET") writes.push(`${r.method()} ${path}`);
  });
  return writes;
}

/** A point on the object's own 3D hit area: next to its label button, on the canvas, not on the HTML. */
async function hitPoint(page: Page, e: Entrance): Promise<{ x: number; y: number } | null> {
  const box = await page.locator(`.entrance-face[data-entrance="${e}"]`).boundingBox();
  if (!box) return null;
  const cx = box.x + box.width / 2;
  // try below, then above, the label: the first canvas point whose hover lights this entrance
  for (const dy of [12, 24, 40, -12, -24, -40]) {
    const y = dy > 0 ? box.y + box.height + dy : box.y + dy;
    const tag = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, { x: cx, y });
    if (tag !== "CANVAS") continue;
    await page.mouse.move(cx, y);
    await page.waitForTimeout(250);
    if ((await page.locator(`.entrance-face.is-active[data-entrance="${e}"]`).count()) === 1) return { x: cx, y };
  }
  return null;
}

async function api(page: Page, path: string, init?: { method?: string; body?: unknown }): Promise<any> {
  return page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(path, { method: init?.method ?? "GET", headers: init?.body ? { "content-type": "application/json" } : {}, body: init?.body ? JSON.stringify(init.body) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, init },
  );
}

async function entrances(browser: Browser): Promise<void> {
  run = "entrances, desktop 1920×1080";
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  const writes = writesOf(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);

  const faces = await page.locator(".entrance-face, .sign-face").evaluateAll((els) => els.map((el) => ({ e: el.getAttribute("data-entrance"), tag: el.tagName, label: el.getAttribute("aria-label"), popup: el.getAttribute("aria-haspopup") })));
  check(
    "six entrances, each a real labelled button",
    ["scenes", "rooms", "shelf", "friends", "about", "sign-in"].every((e) => faces.some((f) => f.e === e && f.tag === "BUTTON" && !!f.label)),
    faces,
  );
  check("no invitation count is shown for a visitor with none", (await page.locator(".invite-tag").count()) === 0);
  const overview = await cam(page);
  // what viewing alone asked for, before any entrance is chosen
  const meBeforeFirstPanel = requests.filter((r) => r === "GET /api/me").length;
  check("viewing the table peeks, and never asks /api/me", requests.includes("GET /api/me/peek") && meBeforeFirstPanel === 0, requests.filter((r) => r.includes("/api/")));
  check("no identity cookie before an entrance is chosen", !(await ctx.cookies()).some((c) => c.name === "brick_visitor"));

  for (const e of ["scenes", "rooms", "friends", "shelf"] as const) {
    const before = writes.length;
    // the object itself (the 3D hit area), by mouse, not its HTML label
    const p = await hitPoint(page, e);
    check(`${e}: hovering the object lights its label`, !!p, p);
    if (!p) continue;
    // the move itself, step by step in animation time, is checked in motion()
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('[role="dialog"]', { timeout: 6000 });
    const there = await settled(page);
    check(`${e}: the camera's path kept clear of the other objects`, there.lastPathClear === true, { clear: there.lastPathClear, lift: there.lastPathLift });
    const dialog = page.locator(`[role="dialog"][data-panel="${e}-panel"]`);
    await dialog.waitFor({ timeout: 4000 });
    check(`${e}: URL records the focused view`, page.url().includes(`focus=${e}`), page.url());
    check(`${e}: the dialog is named by its heading`, (await page.locator(`#${e}-panel-title`).textContent()) === PANEL[e].heading);
    await page.waitForSelector(`[role="dialog"] ${PANEL[e].content}`, { timeout: 8000 });
    check(`${e}: focus moved to the panel heading`, (await page.evaluate(() => document.activeElement?.id)) === `${e}-panel-title`);
    const geo = await page.evaluate((e) => {
      const f = document.querySelector(`[data-entrance="${e}"].entrance-face`)!.getBoundingClientRect();
      const p = document.querySelector(".table-panel")!.getBoundingClientRect();
      return { faceRight: Math.round(f.right), panelLeft: Math.round(p.left), onScreen: f.left >= 0 && f.top >= 0 && f.bottom <= innerHeight };
    }, e);
    check(`${e}: the object's label stays in view beside the panel`, geo.onScreen && geo.faceRight <= geo.panelLeft, geo);
    await panelShown(page);
    await page.screenshot({ path: `${out}/focused-${e}-desktop.png` });
    await page.waitForTimeout(600);
    check(`${e}: opening the panel wrote nothing (no room, link, join or answer)`, writes.length === before, writes.slice(before));
    // Escape closes; focus returns to the object's label
    await page.keyboard.press("Escape");
    await settled(page);
    await page.waitForTimeout(150);
    check(`${e}: Escape closes and the URL returns home`, (await page.locator('[role="dialog"]').count()) === 0 && !page.url().includes("focus="), page.url());
    check(`${e}: focus returns to the object's label`, await page.evaluate((e) => document.activeElement?.getAttribute("data-entrance") === e, e));
    const back = await cam(page);
    check(`${e}: camera back at the overview`, Math.abs(back.position[2] - overview.position[2]) < 0.05, back.position);
  }
  check("the overview only peeked; /api/me came once a panel opened", meBeforeFirstPanel === 0 && requests.includes("GET /api/me"), { meBeforeFirstPanel });

  // keyboard: Tab reaches each label in turn; Enter opens; Back and Forward
  await page.locator('.entrance-face[data-entrance="rooms"]').focus();
  await page.keyboard.press("Enter");
  await settled(page);
  await page.locator('[data-panel="rooms-panel"]').waitFor({ timeout: 4000 });
  check("rooms: Enter on the focused label opens it", true);
  // the tabs switch in place: the camera does not move for a step inside the panel
  const still = await cam(page);
  await page.getByRole("tab", { name: "Join by code" }).click();
  await page.waitForSelector('input[aria-label="Room id"]', { timeout: 3000 });
  const after = await cam(page);
  check("rooms: switching tabs keeps the camera where it is", !after.moving && after.position.every((v, i) => Math.abs(v - still.position[i]) < 1e-6));
  await page.getByRole("tab", { name: "Your rooms" }).click();
  await page.waitForTimeout(400);
  await page.waitForSelector('[role="dialog"] .empty-state, [role="dialog"] .kit-state, [role="dialog"] .room-row', { timeout: 5000 });
  check("rooms: Your rooms says so when there are none (a fresh visitor has joined nothing)", (await page.locator('[role="dialog"] .empty-state h2').textContent())?.trim() === "You haven't joined a room yet");
  await page.goBack();
  await settled(page);
  await page.waitForTimeout(150);
  check("browser Back closes the noticeboard", (await page.locator('[role="dialog"]').count()) === 0 && !page.url().includes("focus="));
  await page.goForward();
  await settled(page);
  await page.locator('[data-panel="rooms-panel"]').waitFor({ timeout: 4000 });
  check("browser Forward reopens it", page.url().includes("focus=rooms"));
  await page.getByRole("button", { name: /Back to table/ }).click();
  await settled(page);
  check("Back to table closes the noticeboard", (await page.locator('[role="dialog"]').count()) === 0);

  // direct links open each panel straight away
  for (const e of ["scenes", "rooms", "friends", "shelf"] as const) {
    await page.goto(url(`focus=${e}`), { waitUntil: "networkidle" });
    await ready(page);
    await page.locator(`[data-panel="${e}-panel"]`).waitFor({ timeout: 4000 });
    check(`direct link /?focus=${e} opens its panel`, true);
  }
  // an unknown focus is the plain table
  await page.goto(url("focus=nonsense"), { waitUntil: "networkidle" });
  await ready(page);
  check("an unknown ?focus= shows the overview, no panel", (await page.locator('[role="dialog"]').count()) === 0 && (await page.locator(".table-page").getAttribute("data-focus")) === "overview");

  // the scene tray: choose → shared settings → back keeps the values → forward again
  await page.goto(url("focus=scenes"), { waitUntil: "networkidle" });
  await ready(page);
  await page.locator('[data-panel="scenes-panel"]').waitFor({ timeout: 4000 });
  const tags = await page.locator(".scene-card .tag").allTextContents();
  const titles = await page.locator(".scene-card .scene-card-title").allTextContents();
  check(
    "scene tray: the playable scenes, each with its real player count and Playable",
    // ADR 0016 added Woodland Commons as the third, largest scene.
    titles.join("|") === "Beach Houses|Medieval Castle|Woodland Commons" &&
      ["Small", "Medium", "Large", "1–2 builders", "1–4 builders", "1–6 builders"].every((t) => tags.includes(t)) &&
      // ADR 0016: the chosen scene's plot and status follow the compact list
      ((await page.locator(".scene-summary .tag").allTextContents()).some((t) => /playable/i.test(t))),
    { titles, tags },
  );
  check("scene tray: Beach Houses is chosen first", (await page.locator('.scene-card[aria-checked="true"] .scene-card-title').textContent()) === "Beach Houses");
  // ADR 0016: both actions are on screen without scrolling, and stay where
  // they are whichever scene is chosen; the arrows move the choice
  const actionBoxes = async () => {
    const panel = (await page.locator(".table-panel").boundingBox())!;
    return Promise.all(["Build alone", "Set up a room"].map(async (n) => {
      const b = (await page.getByRole("button", { name: n, exact: true }).boundingBox())!;
      return { n, y: Math.round(b.y), inView: b.y >= panel.y && b.y + b.height <= Math.min(panel.y + panel.height, page.viewportSize()!.height) };
    }));
  };
  const actionsFirst = await actionBoxes();
  await page.locator('.scene-card[aria-checked="true"]').focus();
  await page.keyboard.press("ArrowDown");
  const afterOne = await page.locator('.scene-card[aria-checked="true"] .scene-card-title').textContent();
  await page.keyboard.press("ArrowDown");
  const afterTwo = await page.locator('.scene-card[aria-checked="true"] .scene-card-title').textContent();
  const focusedChosen = await page.evaluate(() => document.activeElement?.getAttribute("aria-checked"));
  const summary = await page.locator(".scene-summary .tag").allTextContents();
  const actionsWood = await actionBoxes();
  check("scene tray: the arrow keys move the choice and the focus, and only the chosen scene's plot is shown", afterOne === "Medieval Castle" && afterTwo === "Woodland Commons" && focusedChosen === "true" && summary.some((t) => /32×28/.test(t)), { afterOne, afterTwo, focusedChosen, summary });
  check("scene tray: Build alone and Set up a room are both in view, and don't move when the scene changes", actionsFirst.every((a) => a.inView) && actionsWood.every((a, i) => a.inView && a.y === actionsFirst[i].y), { actionsFirst, actionsWood });
  await page.keyboard.press("Home");
  check("scene tray: Home goes back to the first scene", (await page.locator('.scene-card[aria-checked="true"] .scene-card-title').textContent()) === "Beach Houses");
  const camBefore = await cam(page);
  await page.getByRole("button", { name: "Set up a room" }).click();
  await page.getByPlaceholder("e.g. Saturday build").fill("Table check room");
  await page.locator('input[name="table-visibility"]').nth(1).check();
  check("invite-only turns publishing off by default", !(await page.locator('[role="dialog"] .check-row input').isChecked()));
  await panelShown(page);
  await page.screenshot({ path: `${out}/scenes-shared-desktop.png` });
  await page.getByRole("button", { name: "Choose how to build", exact: true }).click();
  await page.getByRole("button", { name: "Set up a room" }).click();
  check(
    "stepping back and forward keeps the name and the visibility",
    (await page.getByPlaceholder("e.g. Saturday build").inputValue()) === "Table check room" && (await page.locator('input[name="table-visibility"]').nth(1).isChecked()),
  );
  const camSteps = await cam(page);
  check("steps inside the panel never move the camera", camSteps.position.every((v, i) => Math.abs(v - camBefore.position[i]) < 1e-6));
  check("nothing was created by choosing and stepping", !writes.some((w) => w === "POST /api/rooms"), writes);
  // create: one room, however often the button is pressed, then the editor
  const creates: string[] = [];
  page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/rooms" && creates.push(r.url()));
  const nav = page.waitForURL(/\/build\/room\/[0-9a-f-]{36}/, { timeout: 10000 });
  await page.getByRole("button", { name: "Create and open" }).dblclick();
  await nav;
  check("Create and open makes exactly one room and opens it in the editor", creates.length === 1, { creates: creates.length, url: page.url() });
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/)![1];
  await page.waitForFunction(() => (window as any).__state?.().snapshot, null, { timeout: 15000 }).catch(() => {});
  const mine = await api(page, "/api/my/rooms");
  const made = mine.body.find((r: any) => r.id === roomId);
  check("the room has the name and visibility chosen at the table", made?.label === "Table check room" && made?.visibility === "invite_only", made);

  // the shelf: after a real save, its preview shows that version, linked
  const saved = await api(page, `/api/rooms/${roomId}/save`, { method: "POST" });
  check("a real saved version exists (saved in the room)", saved.status === 200, saved.status);
  await page.goto(url("focus=shelf"), { waitUntil: "networkidle" });
  await ready(page);
  await page.locator('[data-panel="shelf-panel"]').waitFor({ timeout: 4000 });
  await page.waitForSelector(".shelf-item, .kit-state", { timeout: 8000 });
  const items = await page.locator(".shelf-item").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check("shelf: the preview shows the real saved version, linked to it", items.includes(`/build/?snapshot=${saved.body.id}`), items);
  await panelShown(page);
  await page.screenshot({ path: `${out}/focused-shelf-saved-desktop.png` });
  const shelfLinks = await page.locator('[role="dialog"] a.btn').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check("shelf: My collection and Public showcase lead to their pages", shelfLinks.includes("/build/?view=collection") && shelfLinks.includes("/build/?view=showcase"), shelfLinks);
  const btnColour = await page.locator('[role="dialog"] a.btn-red').evaluate((a) => getComputedStyle(a).color);
  check("shelf: the red link button keeps white text (link colour doesn't leak)", btnColour === "rgb(255, 255, 255)", btnColour);

  // the booklet: the camera goes to it, then the README replaces the approach in history
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);
  const leave = page.waitForURL(/\/readme\/$/, { timeout: 10000 });
  // the approach itself, step by step, is checked in motion()
  await page.locator('.entrance-face[data-entrance="about"]').click();
  await leave;
  check("booklet: arrives at /readme/", page.url().endsWith("/readme/"), page.url());
  // README.md's header now shares the same markup every dedicated page
  // uses (ui/pageHeader.ts, "Artistic identity pass" refinement), so its
  // way back is `.to-table`, not a README-only `.back` class; the page
  // also has a second, separate "Back to the table" link in its closing
  // scene (`.finale-table`) — this checks the header's own one specifically.
  const back = await page.locator(".page-beam .to-table").getAttribute("href");
  check("README: has a Back to the table link", back === "/" && (await page.locator(".page-beam .to-table").textContent())!.includes("Back to the table"));
  await page.screenshot({ path: `${out}/readme-desktop.png`, fullPage: false });
  await page.goBack();
  await ready(page);
  await page.waitForTimeout(300);
  check("Back from the README returns to the table, not the approach", !page.url().includes("focus=") && (await page.locator('[role="dialog"]').count()) === 0, page.url());
  check("no console errors across the entrances", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/**
 * Regression coverage for two missed-activation causes found and fixed
 * (evidence 0017), each dispatched directly rather than waited for with a
 * timing-dependent delay, so the test exercises the exact event sequence
 * that broke rather than hoping to catch a slow-rendering window.
 */
// ---- camera motion, in animation time (evidence 0026, follow-up) ----

/**
 * Every move to and from an object, stepped in animation time with
 * `page.clock`, so the check means the same under SwiftShader as on a GPU.
 * The clock lives only in this context: left installed across a long run it
 * stopped the page's frames (and so every later frame-polled wait) once the
 * test went back to real time, so the other sections keep the real clock.
 */
async function motion(browser: Browser): Promise<void> {
  run = "camera motion, desktop 1920×1080";
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  await page.clock.install();
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);
  const overview = await settled(page);
  // From here the page's clock stands still; time moves only by fastForward.
  // (Resumed, the installed clock's frame timers fell behind SwiftShader's
  // slow frames and the page stopped drawing, so it is never resumed here.)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const poll = { timeout: 4000, polling: 50 } as const;
  const panelNow = () => page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute("data-panel") ?? null);
  check("the table starts at the overview, still, with no dialog and normal motion", overview.destination.position.join() === overview.position.join() && (await page.locator('[role="dialog"]').count()) === 0 && !(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)));

  const closeToOverview = async () => {
    const back = await travel(page, () => page.keyboard.press("Escape"), true);
    const last = back.steps[back.steps.length - 1];
    return { ok: back.ok && !last.dialog && dist(last.position, overview.position) < 0.01, detail: back.detail };
  };

  // the four entrances with panels, by mouse on the object itself
  for (const e of ["scenes", "rooms", "friends", "shelf"] as const) {
    const p = await hitPoint(page, e);
    if (!p) {
      check(`${e}: the object can be pointed at`, false);
      continue;
    }
    const move = await travel(page, () => page.mouse.click(p.x, p.y));
    const last = move.steps[move.steps.length - 1];
    check(`${e}: clicking the object moves the camera, the panel waits for arrival`, move.ok && last.dialog && page.url().includes(`focus=${e}`), move.detail);
    const back = await closeToOverview();
    check(`${e}: Escape moves the camera back to the overview the same way`, back.ok && !page.url().includes("focus="), back.detail);
  }

  // the sign, by keyboard (Enter on its focused face)
  await page.locator(".sign-face").focus();
  const sign = await travel(page, () => page.keyboard.press("Enter"));
  check("sign-in: Enter on the focused sign moves the camera, the panel waits for arrival", sign.ok && sign.steps[sign.steps.length - 1].dialog && page.url().includes("focus=sign-in"), sign.detail);
  await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, poll).catch(() => {});
  check("sign-in: focus moved into the dialog once it opened", await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));

  // Back to table, then at once (the same tick) another object: the newer
  // choice wins, the camera goes there, and only its panel opens
  {
    await page.evaluate(() => {
      (document.querySelector(".back-to-table") as HTMLElement).click();
      (document.querySelector('.entrance-face[data-entrance="rooms"]') as HTMLElement).click();
    });
    await page.waitForFunction(() => (window as any).__tableCamera().moving, null, poll);
    const from = await cam(page);
    const track: string[] = [];
    let early = 0;
    for (let i = 0; i < 12; i++) {
      await page.clock.fastForward(100);
      const s = await page.evaluate(() => ({ c: (window as any).__tableCamera(), panel: document.querySelector('[role="dialog"]')?.getAttribute("data-panel") ?? null }));
      track.push(`${s.c.moving ? "m" : "-"}${s.panel ? "D" : ""}:${s.c.position.map((v: number) => v.toFixed(1))}`);
      if (s.c.moving && s.panel) early++;
      if (!s.c.moving) break;
    }
    const end = await cam(page);
    const panel = await panelNow();
    check(
      "Back to table and at once the noticeboard: the camera goes to the noticeboard and only its panel opens",
      track.length >= 4 && early === 0 && !end.moving && dist(end.position, end.destination.position) < 0.01 && dist(end.position, from.position) > 5 && panel === "rooms-panel" && page.url().includes("focus=rooms"),
      { track, panel, url: page.url() },
    );
    // browser Back from the focused noticeboard moves back to the overview
    const back = await travel(page, () => page.goBack().then(() => undefined), true);
    const last = back.steps[back.steps.length - 1];
    check("browser Back from a focused object moves the camera back and closes the panel", back.ok && !last.dialog && dist(last.position, overview.position) < 0.01 && !page.url().includes("focus="), { ...back.detail, url: page.url() });
    const fwd = await travel(page, () => page.goForward().then(() => undefined));
    check("browser Forward moves to it again and reopens the panel once there", fwd.ok && fwd.steps[fwd.steps.length - 1].dialog && page.url().includes("focus=rooms"), fwd.detail);
    await closeToOverview();
  }

  // A second choice mid-move retargets from wherever the camera is: 300 ms
  // into a move to the tray, choosing the noticeboard must continue from
  // that pose (no jump back or to the tray) and open only its panel.
  {
    await page.locator('.entrance-face[data-entrance="scenes"]').click();
    await page.waitForFunction(() => (window as any).__tableCamera().moving, null, poll);
    for (let i = 0; i < 3; i++) await page.clock.fastForward(100);
    const mid = await cam(page);
    await page.locator('.entrance-face[data-entrance="rooms"]').click({ force: true });
    await page.waitForFunction((d) => (window as any).__tableCamera().destination.position.join() !== d, mid.destination.position.join(), poll);
    const turned = await cam(page);
    await page.clock.fastForward(100);
    const next = await cam(page);
    const seen: string[] = [];
    for (let i = 0; i < 12 && (await cam(page)).moving; i++) {
      await page.clock.fastForward(100);
      seen.push((await panelNow()) ?? "-");
    }
    const end = await cam(page);
    const panel = await panelNow();
    check(
      "a second choice mid-move turns the camera from where it is, and only the newer panel opens",
      mid.moving && dist(turned.position, mid.position) < 0.5 && dist(next.position, mid.position) < 2 && dist(next.position, turned.destination.position) < dist(mid.position, turned.destination.position) &&
        !end.moving && dist(end.position, turned.destination.position) < 0.01 && panel === "rooms-panel" && !seen.includes("scenes-panel") && page.url().includes("focus=rooms"),
      { mid: mid.position, next: next.position, end: end.position, panel, seen },
    );
    await closeToOverview();
  }

  // the booklet: an approach, then the README
  const booklet = await travel(page, () => page.locator('.entrance-face[data-entrance="about"]').click());
  const approach = booklet.steps.find((s) => s.moving && s.ms > 0);
  check(
    "booklet: the camera approaches first, saying where it is going",
    booklet.ok && !!approach && approach.path === "/" && approach.status === "Opening the booklet…",
    { ...booklet.detail, path: approach?.path, status: approach?.status },
  );
  // on arrival the page asks for /readme/ (its load, under the paused clock,
  // isn't awaited here; the desktop run follows it through in real time)
  const asked = page.waitForRequest((r) => new URL(r.url()).pathname === "/readme/", { timeout: 4000 }).then(() => true, () => false);
  for (let i = 0; i < 5; i++) await page.clock.fastForward(100).catch(() => {});
  check("booklet: arriving asks for /readme/", (await asked) || page.url().endsWith("/readme/"), page.url());
  check("no console errors while moving", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

async function activation(browser: Browser): Promise<void> {
  run = "activation reliability";
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  await page.goto(url(), { waitUntil: "networkidle" });
  await ready(page);

  // Cause 1: the hover lift moves the label under the pointer, so a press
  // and release on different elements (button, then the canvas behind it)
  // must still choose — one press, one choice, decided on pointerdown.
  await page.evaluate(() => {
    const btn = document.querySelector('.entrance-face[data-entrance="rooms"]')!;
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const canvas = document.querySelector(".table-canvas canvas")!;
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 7 }));
    // the release lands on the canvas behind the (by then lifted-away) label
    canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 7 }));
  });
  await settled(page);
  await page.waitForSelector('[data-panel="rooms-panel"]', { timeout: 4000 });
  check("a press on the label and a release on the canvas behind it still chooses (the hover lift moved what was pressed)", true);
  await page.keyboard.press("Escape");
  await settled(page);

  // Cause 1b: a press that moves more than the slop distance before release
  // answers a different gesture, and must NOT choose (otherwise this would
  // be a plain "any pointerup anywhere activates" bug, not a fix for it).
  const before1b = await page.evaluate(() => document.querySelector(".table-page")!.getAttribute("data-focus"));
  await page.evaluate(() => {
    const btn = document.querySelector('.entrance-face[data-entrance="shelf"]')!;
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 8 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x + 200, clientY: y + 200, button: 0, pointerId: 8 }));
  });
  await page.waitForTimeout(200);
  const after1b = await page.evaluate(() => document.querySelector(".table-page")!.getAttribute("data-focus"));
  check("a press released far from where it started does not choose anything", after1b === before1b, { before: before1b, after: after1b });

  // Cause 2: closing a panel goes back through history; a choice made in the
  // instant after must win even though the resulting popstate from that
  // close has not fired yet. Fire both synchronously, before any event
  // loop turn, which is exactly the ordering that discarded the newer
  // choice before the fix.
  await page.locator('.entrance-face[data-entrance="shelf"]').evaluate((b: HTMLElement) => b.click());
  await settled(page);
  await page.waitForSelector('[data-panel="shelf-panel"]', { timeout: 4000 });
  await page.evaluate(() => {
    (document.querySelector(".back-to-table") as HTMLElement).click();
    // synchronously, in the same tick, before the close's popstate can fire
    (document.querySelector('.entrance-face[data-entrance="friends"]') as HTMLElement).click();
  });
  await settled(page);
  await page.waitForSelector('[data-panel="friends-panel"]', { timeout: 4000 });
  check("closing a panel and immediately choosing another, in the same tick, ends on the new choice (not undone by the close's deferred history event)", true);
  const focusAfter = await page.evaluate(() => document.querySelector(".table-page")!.getAttribute("data-focus"));
  check("…and the URL agrees", focusAfter === "friends", focusAfter);
  await page.keyboard.press("Escape");
  await settled(page);

  check("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** A real invitation from a friend shows a count on the Friends stand, then in its panel; answering is explicit. */
async function invitations(browser: Browser): Promise<void> {
  run = "invitation count";
  const host = await browser.newContext();
  const hp = await host.newPage();
  await hp.goto(`${base}/build/`, { waitUntil: "networkidle" });
  const guestCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const gp = await guestCtx.newPage();
  const errors = errorsOf(gp);
  await gp.goto(`${base}/build/`, { waitUntil: "networkidle" });
  // friendship through the real link flow, then an invitation to an invite-only room
  const { body: link } = await api(hp, "/api/friends/link", { method: "POST" });
  const { body: opened } = await api(gp, `/api/friends/link/${link.token}`);
  await api(gp, `/api/friends/requests/${opened.requestId}/respond`, { method: "POST", body: { accept: true } });
  const { body: guestMe } = await api(gp, "/api/me");
  const { body: room } = await api(hp, "/api/rooms", { method: "POST", body: { visibility: "invite_only", allowPublish: false, label: "Invitation check" } });
  const inv = await api(hp, `/api/rooms/${room.roomId}/invite`, { method: "POST", body: { to: guestMe.visitorId } });
  check("a real invitation was sent", inv.status === 200, inv.status);

  const writes = writesOf(gp);
  await gp.goto(url(), { waitUntil: "networkidle" });
  await ready(gp);
  await gp.waitForSelector(".invite-tag", { timeout: 5000 });
  check("the Friends stand shows the real count", (await gp.locator(".invite-tag").textContent()) === "1");
  check("the Friends label's name says how many are waiting", /1 room invitation waiting/.test((await gp.locator('.entrance-face[data-entrance="friends"]').getAttribute("aria-label")) ?? ""));
  await gp.screenshot({ path: `${out}/invitation-count-desktop.png` });
  await gp.locator('.entrance-face[data-entrance="friends"]').click();
  await settled(gp);
  await gp.locator('[data-panel="friends-panel"]').waitFor({ timeout: 4000 });
  await gp.waitForSelector('[role="dialog"] button:has-text("Accept")', { timeout: 8000 });
  await gp.waitForTimeout(500);
  check("the panel lists it, with Accept and Decline", (await gp.locator('[role="dialog"] button:has-text("Decline")').count()) === 1);
  check("opening the Friends panel answered nothing", writes.length === 0, writes);
  await panelShown(gp);
  await gp.screenshot({ path: `${out}/focused-friends-invited-desktop.png` });
  await gp.getByRole("tab", { name: "Friends" }).click();
  await gp.waitForTimeout(400);
  check("friends and invitations are separate tabs", (await gp.locator('[role="dialog"]').textContent())!.includes("Being friends never opens an invite-only room"));
  await gp.getByRole("tab", { name: /Invitations/ }).click();
  const nav = gp.waitForURL(new RegExp(`/build/room/${room.roomId}`), { timeout: 10000 });
  await gp.locator('[role="dialog"] button:has-text("Accept")').click();
  await nav;
  check("Accept admits the guest and opens the editor", true);
  await gp.goto(url(), { waitUntil: "networkidle" });
  await ready(gp);
  await gp.waitForTimeout(500);
  check("once answered, the count disappears", (await gp.locator(".invite-tag").count()) === 0);
  check("no console errors", errors.length === 0, errors.join(" | "));
  await host.close();
  await guestCtx.close();
}

/** Each entrance on a phone: a thumb-sized pad, the object above the sheet, a full-width sheet. */
async function mobileEntrances(browser: Browser): Promise<void> {
  run = "entrances, mobile 390×844 (emulated)";
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  for (const e of ["scenes", "rooms", "friends", "shelf"] as const) {
    await page.goto(url(), { waitUntil: "networkidle" });
    await ready(page);
    const pad = page.locator(`.entrance-touch[data-entrance="${e}"]`);
    const box = await pad.boundingBox();
    check(`${e}: a thumb-sized touch pad (≥ 44px each way)`, !!box && box.width >= 44 && box.height >= 44, box);
    await pad.tap();
    await settled(page);
    await page.locator(`[data-panel="${e}-panel"]`).waitFor({ timeout: 4000 });
    await page.waitForSelector(`[role="dialog"] ${PANEL[e].content}`, { timeout: 8000 });
    await page.waitForTimeout(300);
    const geo = await page.evaluate((e) => {
      const f = document.querySelector(`[data-entrance="${e}"].entrance-face`)!.getBoundingClientRect();
      const p = document.querySelector(".table-panel")!.getBoundingClientRect();
      return { labelTop: Math.round(f.top), labelBottom: Math.round(f.bottom), panelTop: Math.round(p.top), panelWidth: Math.round(p.width), vw: innerWidth, scrollW: document.documentElement.scrollWidth };
    }, e);
    check(`${e}: full-width sheet, the object's label visible above it, no sideways scroll`, geo.panelWidth === geo.vw && geo.labelTop >= 0 && geo.labelBottom <= geo.panelTop + 4 && geo.scrollW <= geo.vw, geo);
    await panelShown(page);
    await page.screenshot({ path: `${out}/focused-${e}-mobile.png` });
  }
  check("no console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

/** Intermediate sizes: each panel and its object fit, nothing overlaps or scrolls sideways. */
async function intermediate(browser: Browser): Promise<void> {
  for (const [w, h] of [
    [1280, 800],
    [768, 1024],
  ] as const) {
    run = `entrances ${w}×${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = errorsOf(page);
    for (const e of ["sign-in", "scenes", "rooms", "friends", "shelf"] as const) {
      await page.goto(url(`focus=${e}`), { waitUntil: "networkidle" });
      await ready(page);
      await page.waitForSelector('[role="dialog"]', { timeout: 4000 });
      await page.waitForTimeout(500);
      const geo = await page.evaluate((e) => {
        const f = document.querySelector(`[data-entrance="${e}"]:is(.entrance-face, .sign-face)`)!.getBoundingClientRect();
        const p = document.querySelector(".table-panel")!.getBoundingClientRect();
        const apart = f.right <= p.left || f.bottom <= p.top + 4;
        return { apart, onScreen: f.left >= 0 && f.top >= 0 && f.right <= innerWidth, panelInside: p.left >= 0 && p.right <= innerWidth && p.bottom <= innerHeight + 1, scrollW: document.documentElement.scrollWidth, vw: innerWidth };
      }, e);
      check(`${e}: object and panel both in view, not overlapping`, geo.apart && geo.onScreen && geo.panelInside && geo.scrollW <= geo.vw, geo);
      await panelShown(page);
      await page.screenshot({ path: `${out}/focused-${e}-${w}x${h}.png` });
    }
    check("no console errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
}

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const only = process.argv[4];
for (const [name, fn] of [
  ["desktop", desktop],
  ["mobile", mobile],
  ["reduced", reducedMotion],
  ["failures", failures],
  ["others", others],
  ["entrances", entrances],
  ["motion", motion],
  ["activation", activation],
  ["invitations", invitations],
  ["mobile-entrances", mobileEntrances],
  ["intermediate", intermediate],
] as const) {
  if (only && only !== name) continue;
  try {
    await fn(browser);
  } catch (e) {
    check(`run completed`, false, String(e).split("\n")[0] + " @ " + (String((e as Error).stack).split("\n").find((l) => l.includes("tabletop.ts")) ?? ""));
  }
}
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
