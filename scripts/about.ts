// The About page (/readme/) checked in a real browser (ADR 0014, About
// page pass, 8 Nov 2026). Usage:
//   node scripts/about.ts <url> <out-dir> [README.md]
// - the server's HTML holds every README heading, in order, every sentence
//   and every link;
// - natural wheel scrolling plays each chapter's motion once, as it enters
//   view; nothing below the fold has played before it is reached;
// - with JavaScript off, and under reduced motion, every scene is finished
//   and nothing animates;
// - focus order, focus rings, sticky-header clearance, overflow and links,
//   at 1920x1080 and 390x844, with a screenshot of every chapter;
// - an unknown README section renders as a plain chapter (renderReadme on
//   temporary README copies; the real README.md is only read).
// Run it against a local server only.
import { chromium, type Page } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marked } from "marked";
import { renderReadme, treatmentFor } from "../src/server/readme.ts";

const base = process.argv[2] ?? "http://localhost:8440";
const out = process.argv[3] ?? "doc/evidence/shots/about";
const readmePath = process.argv[4] ?? "README.md";
mkdirSync(out, { recursive: true });
const results: Record<string, unknown> = {};
const fail: string[] = [];
const ok = (name: string, cond: boolean, detail?: unknown) => {
  results[name] = { pass: cond, detail };
  if (!cond) fail.push(name);
};

// ---- 1. server response holds the full README -------------------------------
const md = readFileSync(readmePath, "utf8");
const raw = await (await fetch(`${base}/readme/`)).text();
const norm = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, (e) => ({ "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" })[e] ?? " ").replace(/\s+/g, " ").trim();
const rawText = norm(raw);
const headings = [...md.matchAll(/^#{1,2}\s+(.+)$/gm)].map((m) => m[1].trim());
let pos = -1, inOrder = true;
for (const h of headings) { const i = raw.indexOf(h, pos + 1); if (i < 0 || i < pos) inOrder = false; pos = i; }
ok("readme.headings-in-order", inOrder, headings);
const paras = norm(marked.parse(md, { async: false }) as string).split(/(?<=[.:])\s+/).filter((x) => x.length > 20);
const missing = paras.filter((p) => !rawText.includes(p));
ok("readme.all-sentences-present", missing.length === 0, { sentences: paras.length, missing });
const links = [...md.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
ok("readme.links-present", links.every((l) => raw.includes(`href="${l}"`)), links);
ok("art.aria-hidden", !/<svg(?![^>]*aria-hidden="true")/.test(raw.replace(/<svg class="finale-art"[^>]*>/, "")), null);

const b = await chromium.launch({ channel: "chrome" });

async function layerState(p: Page) {
  return p.evaluate(() => {
    const op = (sel: string) => { const e = document.querySelector(sel); return e ? +getComputedStyle(e).opacity : -1; };
    const tf = (sel: string) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).transform : "missing"; };
    return {
      inView: [...document.querySelectorAll("[data-anim]")].map((e) => e.classList.contains("in-view")),
      heroBuild: op(".hero .layer-build"), plan: op(".ch-proposal .layer-plan"), real: op(".ch-proposal .layer-real"),
      next: op(".ch-proposal .layer-next"), capReal: op(".cap-real"), creation: op(".ch-kept .layer-creation"),
      intention: op(".ch-intention-art"), glow: op(".ch-table .layer-glow"), tableScene: tf(".ch-table .scene"),
    };
  });
}
const finished = (s: Awaited<ReturnType<typeof layerState>>) =>
  s.heroBuild === 1 && s.plan === 0 && s.real === 1 && s.next === 1 && s.capReal === 1 && s.creation === 1 && s.intention === 1 && s.glow === 1 && (s.tableScene === "none" || s.tableScene === "matrix(1, 0, 0, 1, 0, 0)");

for (const [name, vp, mobile] of [["desktop", { width: 1920, height: 1080 }, false], ["mobile", { width: 390, height: 844 }, true]] as const) {
  // ---- 2. motion with natural scrolling -------------------------------------
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${base}/readme/`, { waitUntil: "networkidle" });
  const atTop = await layerState(p);
  // below-the-fold chapters must still be in their start state before scrolling
  ok(`${name}.below-fold-waits`, atTop.inView.slice(2).every((v) => !v) && atTop.creation === 0 && atTop.intention === 0, atTop);
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  // scroll down in wheel steps; mid-way through the proposal chapter, sample the plan
  let sampledPlan: number | null = null;
  for (let y = 0; y < h; y += 240) {
    await p.mouse.wheel(0, 240);
    await p.waitForTimeout(70);
    if (sampledPlan === null) {
      const st = await p.evaluate(() => document.querySelector(".ch-proposal")!.classList.contains("in-view"));
      if (st) { await p.waitForTimeout(250); sampledPlan = await p.evaluate(() => +getComputedStyle(document.querySelector(".ch-proposal .layer-plan")!).opacity); }
    }
  }
  await p.waitForTimeout(2200);
  const afterScroll = await layerState(p);
  ok(`${name}.plan-visible-during-motion`, sampledPlan !== null && sampledPlan > 0.5, sampledPlan);
  ok(`${name}.all-in-view-after-scroll`, afterScroll.inView.every(Boolean), afterScroll.inView);
  ok(`${name}.finished-after-scroll`, finished(afterScroll), afterScroll);
  // once only: scroll back up and down; in-view stays (no replay)
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  const replay = await layerState(p);
  ok(`${name}.plays-once`, replay.inView.every(Boolean) && finished(replay), replay.inView);
  // overflow
  const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(`${name}.no-horizontal-overflow`, ov.sw <= ov.cw, ov);
  // sticky-header clearance: jump to each h2 by hash and check it sits below the beam
  const ids = await p.evaluate(() => [...document.querySelectorAll("section.chapter")].map((e) => e.id));
  const clear: unknown[] = [];
  for (const id of ids) {
    await p.evaluate((i) => { location.hash = ""; location.hash = i; }, id);
    await p.waitForTimeout(150);
    const r = await p.evaluate((i) => ({ beam: document.querySelector(".page-beam")!.getBoundingClientRect().bottom, top: document.getElementById(i)!.querySelector("h2")!.getBoundingClientRect().top }), id);
    clear.push({ id, ...r });
  }
  ok(`${name}.sticky-header-clearance`, ids.length === 4 && clear.every((c: any) => c.top >= c.beam), clear);
  // nav pages reachable and wrapped (mobile): every nav link fully in viewport width or scrollable container
  const nav = await p.evaluate(() => {
    const n = document.querySelector(".page-nav")!; const links = [...n.querySelectorAll("a")];
    return { scrollable: n.scrollWidth > n.clientWidth, overflowX: getComputedStyle(n).overflowX, links: links.map((a) => ({ text: a.textContent, href: a.getAttribute("href") })) };
  });
  results[`${name}.nav`] = nav;
  // focus order: tab through the page, record focused element and whether its outline shows and is visible on screen
  // fresh load so the sequential-focus starting point is the top (hash jumps above moved it)
  await p.goto(`${base}/readme/`, { waitUntil: "networkidle" });
  const focus: unknown[] = [];
  for (let i = 0; i < 20; i++) {
    await p.keyboard.press("Tab");
    const f = await p.evaluate(() => {
      const e = document.activeElement as HTMLElement; if (!e || e === document.body) return null;
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      const beam = document.querySelector(".page-beam")!.getBoundingClientRect().bottom;
      const inBeam = !!e.closest(".page-beam");
      return { text: (e.textContent ?? "").trim().slice(0, 40), href: e.getAttribute("href"), finale: e.classList.contains("finale-table"), outline: cs.outlineStyle + " " + cs.outlineWidth, visible: r.bottom > 0 && r.top < innerHeight && (inBeam || r.top >= beam - 2) };
    });
    if (!f) break; focus.push(f);
    if ((f as any).finale) break;
  }
  ok(`${name}.focus-visible-and-unobscured`, focus.length === 10 && (focus.at(-1) as any).finale && focus.every((f: any) => f.outline.startsWith("solid") && f.visible), focus);
  ok(`${name}.no-page-errors`, errors.length === 0, errors);
  // per-chapter shots (finished state): scroll every chapter into view once, let it play out
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200);
  for (let y = 0; y < h; y += 240) { await p.mouse.wheel(0, 240); await p.waitForTimeout(70); }
  await p.waitForTimeout(2500);
  const pre = await layerState(p);
  ok(`${name}.finished-before-shots`, finished(pre), pre);
  const sels = [".hero", ".ch-table", ".ch-proposal", ".ch-kept", ".ch-intention", ".finale"];
  for (const [i, sel] of sels.entries()) {
    await p.locator(sel).scrollIntoViewIfNeeded();
    await p.evaluate((s) => { const e = document.querySelector(s)!; const y = e.getBoundingClientRect().top + scrollY - document.querySelector(".page-beam")!.getBoundingClientRect().height - 8; scrollTo(0, Math.max(0, y)); }, sel);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/${name}-${i}-${sel.replace(/^\./, "")}.png` });
  }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  await ctx.close();

  // ---- 3. no JavaScript: finished static state ---------------------------------
  const nojs = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, javaScriptEnabled: false });
  const q = await nojs.newPage();
  await q.goto(`${base}/readme/`);
  const ns = await layerState(q);
  ok(`${name}.nojs-finished`, finished(ns), ns);
  await q.screenshot({ path: `${out}/${name}-nojs-full.png`, fullPage: true });
  await nojs.close();

  // ---- 4. reduced motion: finished at once, nothing animating -------------------
  const rm = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: "reduce" });
  const r = await rm.newPage();
  await r.goto(`${base}/readme/`, { waitUntil: "networkidle" });
  const rs = await layerState(r);
  const anims = await r.evaluate(() => document.getAnimations().length);
  ok(`${name}.reduced-motion-finished`, finished(rs) && anims === 0, { ...rs, animations: anims });
  await r.close(); await rm.close();
}

// ---- 5. links: back to the table and nav targets answer 200 -------------------
const hrefs = [...new Set([...raw.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]))];
const codes: Record<string, number> = {};
for (const href of hrefs) codes[href] = (await fetch(`${base}${href}`, { redirect: "manual" })).status;
ok("links.internal-200", Object.values(codes).every((c) => c === 200), codes);
ok("links.back-to-table", raw.includes('class="finale-table" href="/"'), null);
ok("signature", raw.includes("Made with love") && raw.includes("by Asuka121380") && raw.includes("Not made, sponsored or endorsed by the LEGO Group"), null);

await b.close();

// ---- 6. unknown and reshaped README sections (temporary copies only) ---------
const tmp = mkdtempSync(join(tmpdir(), "about-readme-"));
const extraPath = join(tmp, "README.extra.md");
writeFileSync(extraPath, md + "\n## A future section\n\nSome later words, with a [link](https://example.org/).\n\n- a list item\n");
const extra = renderReadme(extraPath);
const plain = /<section class="chapter ch-plain"[\s\S]*?<\/section>/.exec(extra)?.[0] ?? "";
ok("fallback.unknown-heading-has-no-treatment", treatmentFor("A future section") === undefined);
ok("fallback.case-and-punctuation-tolerant", treatmentFor("a TABLE, before a menu!") === "table");
ok("fallback.plain-chapter", /^<section class="chapter ch-plain" id="a-future-section">\s*<div class="ch-plain-copy"><h2>A future section<\/h2>/.test(plain) && !plain.includes("<svg"));
ok("fallback.words-and-link", extra.includes("Some later words") && extra.includes('href="https://example.org/"') && extra.includes("<li>a list item</li>"));
ok("fallback.known-chapters-keep-art", ["ch-table", "ch-proposal", "ch-kept", "ch-intention"].every((c) => extra.includes(`chapter ${c}`)));
const noH1Path = join(tmp, "README.noh1.md");
writeFileSync(noH1Path, md.replace(/^# .+\n/m, ""));
const noH1 = renderReadme(noH1Path);
ok("fallback.no-title-preamble-opens", noH1.includes('class="hero"') && !noH1.includes("<h1>") && noH1.includes("chapter ch-table"));
const h2FirstPath = join(tmp, "README.h2first.md");
writeFileSync(h2FirstPath, md.slice(md.indexOf("\n## ") + 1));
const h2First = renderReadme(h2FirstPath);
ok("fallback.h2-first-all-chapters", !h2First.includes('class="hero"') && (h2First.match(/<section class="chapter /g) ?? []).length === 4);
// the extra section in a browser, for a look
{
  const b2 = await chromium.launch({ channel: "chrome" });
  for (const [n, vp] of [["desktop", { width: 1920, height: 1080 }], ["mobile", { width: 390, height: 844 }]] as const) {
    const p = await b2.newPage({ viewport: vp });
    await p.goto(`${base}/readme/`);
    await p.setContent(extra);
    await p.evaluate(() => document.querySelectorAll("[data-anim]").forEach((e) => e.classList.add("in-view")));
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const e = document.querySelector(".ch-plain")!; scrollTo(0, e.getBoundingClientRect().top + scrollY - 500); });
    await p.waitForTimeout(200);
    ok(`fallback.${n}-no-overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await p.screenshot({ path: `${out}/${n}-unknown-section.png` });
  }
  await b2.close();
}

writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(Object.entries(results).filter(([, v]: any) => v && "pass" in v).map(([k, v]: any) => `${v.pass ? "PASS" : "FAIL"} ${k}`).join("\n"));
console.log(fail.length ? `FAILED: ${fail.join(", ")}` : "ALL PASS");
process.exit(fail.length ? 1 : 0);
