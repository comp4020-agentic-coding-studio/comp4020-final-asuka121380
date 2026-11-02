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

type Cam = { position: number[]; target: number[]; moving: boolean };
const cam = (page: Page): Promise<Cam> => page.evaluate(() => (window as any).__tableCamera());
const url = (q = "") => `${base}/${q ? `?${q}&debug` : "?debug"}`;

async function ready(page: Page): Promise<void> {
  await page.waitForSelector('.table-page[data-status="ready"]', { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function settled(page: Page): Promise<Cam> {
  await page.waitForFunction(() => (window as any).__tableCamera && !(window as any).__tableCamera().moving, null, { timeout: 5000 });
  return cam(page);
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

  // hover: the 3D hit area around the sign (beside the face, on the post)
  const face = await signFaceCentre(page);
  const faceBox = (await page.locator(".sign-face").boundingBox())!;
  await page.mouse.move(face.x, faceBox.y + faceBox.height + 30);
  await page.waitForTimeout(350);
  check("hovering the sign's post lights the face", (await page.locator(".sign-face.is-active").count()) === 1);
  await page.screenshot({ path: `${out}/hover-desktop.png` });

  // click the physical sign (post, not the HTML face)
  await page.mouse.click(face.x, faceBox.y + faceBox.height + 30);
  await page.waitForTimeout(120);
  const mid = await cam(page);
  check("clicking the sign's post starts a camera move", mid.moving, mid);
  check("the panel waits for the camera to arrive", (await page.locator('[role="dialog"]').count()) === 0);
  const there = await settled(page);
  await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
  check("camera arrived nearer the sign", there.position[2] < overview.position[2] - 5, { from: overview.position, to: there.position });
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
  const pad = await page.locator(".sign-touch").boundingBox();
  check("the sign has a thumb-sized touch area (≥ 44px each way)", !!pad && pad.width >= 44 && pad.height >= 44, pad);
  check("the touch pad is hidden from assistive technology", (await page.locator(".sign-touch").getAttribute("aria-hidden")) === "true");
  const face = (await page.locator(".sign-face").boundingBox())!;
  const covers = !!pad && pad.x <= face.x + 1 && pad.x + pad.width >= face.x + face.width - 1;
  check("the pad covers the sign it stands for", covers, { pad, face });
  // tap the pad below the face, on the posts: the same action as the face
  await page.tap(".sign-touch", { position: { x: pad!.width / 2, y: pad!.height - 8 } });
  await settled(page);
  await page.waitForSelector(".account-scope .context-actions", { timeout: 8000 });
  await page.waitForTimeout(300);
  const layout = await page.evaluate(() => {
    const s = document.querySelector(".sign-face")!.getBoundingClientRect();
    const p = document.querySelector(".table-panel")!.getBoundingClientRect();
    const input = getComputedStyle(document.querySelector(".table-panel")!).fontSize;
    return { signBottom: Math.round(s.bottom), panelTop: Math.round(p.top), panelWidth: Math.round(p.width), fontSize: input, vw: innerWidth };
  });
  check("bottom sheet spans the width, sign visible above it", layout.panelWidth === layout.vw && layout.signBottom <= layout.panelTop + 4, layout);
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
  const f = await signFaceCentre(page);
  await page.mouse.click(f.x, f.y);
  await page.waitForTimeout(60);
  const c = await cam(page);
  check("the camera cuts instead of travelling", !c.moving);
  await page.waitForSelector('[role="dialog"]', { timeout: 1500 });
  check("panel available at once", true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check("return is a cut too", !(await cam(page)).moving);
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
  await page.goto(url(), { waitUntil: "networkidle" });
  await page.waitForSelector(".fallback", { timeout: 5000 });
  await page.screenshot({ path: `${out}/fallback-no-webgl.png` });
  const links = await page.locator(".fallback a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
  check("no WebGL: fallback lists account, lobby, friends, collection, showcase, README", ["/build/?view=account", "/build/", "/build/#friends", "/build/?view=collection", "/build/?view=showcase", "/readme/"].every((h) => links.includes(h)), links);
  check("no WebGL: the three.js chunk is never fetched", !requests.some((p) => /TableScene|PartMesh/.test(p)), requests.filter((p) => p.includes("assets")));
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
  check("lobby keeps its own paper background (home styles don't leak)", bg === "rgb(255, 250, 241)", bg);
  await page.goto(`${base}/build/#friends`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check("/build/#friends lands on the Friends card", await page.evaluate(() => !!document.getElementById("friends")));
  await ctx.close();
}

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const only = process.argv[4];
for (const [name, fn] of [["desktop", desktop], ["mobile", mobile], ["reduced", reducedMotion], ["failures", failures], ["others", others]] as const) {
  if (only && only !== name) continue;
  try {
    await fn(browser);
  } catch (e) {
    check(`run completed`, false, String(e).split("\n")[0]);
  }
}
await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
