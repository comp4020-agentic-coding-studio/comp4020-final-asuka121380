// Rough performance and loading notes for the three scenes (ADR 0016).
//
//   node scripts/scene-perf.ts <url> <out-dir> [--headed] [--empty]
//
// For each scene it opens a `?local` preview with the adapted reference
// (the largest build each scene has a fixture for) at 1920×1080, and:
// - screenshots the page as fast as it can (about every 100–200 ms) from navigation until the
//   environment is drawn, and reports the share of near-black pixels in
//   each, so a black or half-initialised scene during loading would show;
// - reports the time from navigation to the first frame with the
//   environment, the last frame's draw calls and triangles (shadow passes
//   included) from `?debug`'s `__renderInfo`, and the mean and 95th
//   percentile frame interval over 4 s of slow orbiting.
// It changes nothing on the server. `--headed` runs Chrome with a window,
// on the machine's GPU; without it, headless Chrome on SwiftShader.

import { chromium, type Page } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, "");
const out = process.argv[3] ?? "/tmp/scene-perf";
const headed = process.argv.includes("--headed");
// `--empty` measures the scenes with nothing built, so the environment's own share shows
const empty = process.argv.includes("--empty");
mkdirSync(out, { recursive: true });

const SCENES = [
  { id: "street-01", name: "Beach Houses" },
  { id: "castle-01", name: "Medieval Castle" },
  { id: "treehouse-01", name: "Woodland Commons" },
];

const browser = await chromium.launch({ channel: "chrome", headless: !headed, args: headed ? [] : ["--enable-unsafe-swiftshader"] });

async function darkShare(page: Page): Promise<number> {
  const png = await page.screenshot({ type: "png" });
  // decode in the page, so this script needs no image library
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 192;
    c.height = 108;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 192, 108);
    const d = ctx.getImageData(0, 0, 192, 108).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 60) dark++;
    return dark / (d.length / 4);
  }, png.toString("base64"));
}

const results: Record<string, unknown>[] = [];
for (const s of SCENES) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${base}/build/room/?local&scene=${s.id}${empty ? "" : "&reference"}&debug`, { waitUntil: "commit" });
  const frames: { ms: number; dark: number }[] = [];
  let envAt = -1;
  for (let i = 0; i < 60; i++) {
    const ms = Date.now() - t0;
    const dark = await darkShare(page).catch(() => -1);
    frames.push({ ms, dark });
    if (i < 6) await page.screenshot({ path: `${out}/${s.id}-load-${i}.png` }).catch(() => {});
    const ready = await page.evaluate(() => {
      const info = (window as any).__renderInfo?.();
      // nothing is drawn until the environment, plot and parts can all be
      // lit (one Suspense boundary), and the smallest environment is now
      // about 19 calls (Woodland, batched by vertex colour; ADR 0016)
      return !!info && info.calls > 10;
    });
    if (ready && envAt < 0) envAt = Date.now() - t0;
    if (envAt >= 0 && Date.now() - t0 > envAt + 1500) break;
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => (window as any).__renderInfo());
  const leaves = await page.evaluate(() => typeof (window as any).__canopyVisible === "function");
  // frame intervals while orbiting slowly (the canvas renders continuously)
  const intervals: number[] = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        let az = 0.3;
        const start = last;
        const tick = (t: number) => {
          out.push(t - last);
          last = t;
          az += 0.004;
          (window as any).__orbit?.(az, 1.0);
          if (t - start < 4000) requestAnimationFrame(tick);
          else resolve(out.slice(5));
        };
        requestAnimationFrame(tick);
      }),
  );
  intervals.sort((a, b) => a - b);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const p95 = intervals[Math.floor(intervals.length * 0.95)];
  await page.screenshot({ path: `${out}/${s.id}-orbit.png` });
  const r = {
    scene: s.name,
    renderer: info.renderer,
    msToEnvironment: envAt,
    darkestLoadingFrame: Math.max(...frames.filter((f) => f.dark >= 0).map((f) => f.dark)),
    loadingFrames: frames.map((f) => `${f.ms}ms:${(f.dark * 100).toFixed(1)}%`),
    drawCalls: info.calls,
    triangles: info.triangles,
    geometries: info.geometries,
    textures: info.textures,
    meanFrameMs: +mean.toFixed(2),
    p95FrameMs: +p95.toFixed(2),
    leavesToggle: leaves,
  };
  results.push(r);
  console.log(JSON.stringify(r));
  await ctx.close();
}
writeFileSync(`${out}/results.json`, JSON.stringify({ headed, empty, base, results }, null, 2));
await browser.close();
