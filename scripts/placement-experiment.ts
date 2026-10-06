#!/usr/bin/env node
// The first placement experiment, driven through the real UI in the local
// Chrome: a plate, a brick on its studs and a slope on the brick by keyboard,
// one part by mouse, and an out-of-stock attempt that must cost nothing.
//   node scripts/placement-experiment.ts <base-url> <out-dir>
// Against `?local` nothing is saved; against the server it really builds.
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const [base, out = "doc/evidence/shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const notice = (p: Page) => p.locator(".notice").innerText();
const count = async (p: Page, code: string) =>
  (await p.locator(".part", { hasText: code }).locator(".count").innerText()).trim();
async function choose(code: string): Promise<void> {
  await page.locator(".part", { hasText: code }).click();
  await page.locator("main.stage").focus();
}
async function key(...keys: string[]): Promise<void> {
  for (const k of keys) await page.keyboard.press(k);
  await page.waitForTimeout(150);
}

const log: string[] = [];
await choose("P22");
await key("ArrowDown", "Enter");
log.push(`plate: ${await notice(page)} | P22 ${await count(page, "P22")}`);

await choose("B24");
await key("ArrowLeft", "Enter");
log.push(`brick on the plate: ${await notice(page)} | B24 ${await count(page, "B24")}`);

await choose("S22");
await key("r", "Enter");
log.push(`slope on the brick: ${await notice(page)} | S22 ${await count(page, "S22")}`);

await choose("D46");
await key("ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowUp", "Enter");
log.push(`door: ${await notice(page)} | D46 ${await count(page, "D46")}`);
await key("ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight");
const before = await count(page, "D46");
await page.locator("main.stage").focus();
await key("Enter");
log.push(`second door (none left): ${await notice(page)} | D46 ${before} -> ${await count(page, "D46")}`);

// mouse: hover the plot right of the slope and click once
await choose("B12");
const canvas = await page.locator("canvas").boundingBox();
const at = { x: canvas!.x + canvas!.width * 0.62, y: canvas!.y + canvas!.height * 0.68 };
await page.mouse.move(at.x, at.y);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/experiment-hover.png` });
await page.mouse.click(at.x, at.y);
await page.waitForTimeout(300);
log.push(`mouse click: ${await notice(page)} | B12 ${await count(page, "B12")}`);

// select the newest part, recolour it, remove it; then try to remove the
// plate everything else stands on, which must be refused
await page.locator("main.stage").focus();
await key("s", "]");
log.push(`select: ${await notice(page)}`);
await page.getByRole("radio", { name: "Rose pink" }).click();
await page.waitForTimeout(250);
log.push(`recolour: ${await notice(page)} | ${await page.locator("#select-heading + p").innerText()}`);
await page.locator("main.stage").focus();
await key("Delete");
log.push(`remove: ${await notice(page)} | B12 ${await count(page, "B12").catch(() => "(tray hidden in select mode)")}`);
await key("[");
log.push(`select first: ${await notice(page)}`);
await key("Delete");
log.push(`remove the plate under the brick: ${await notice(page)}`);
await key("b");

await page.mouse.move(10, 10);
await page.screenshot({ path: `${out}/experiment-result.png` });

// leave and come back: same browser context, so the same visitor cookie
const counts = async () => Promise.all(["P22", "B24", "S22", "D46", "B12"].map((c) => count(page, c)));
const beforeReload = await counts();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
const afterReload = await counts();
log.push(`status after reload: ${await page.locator(".status").innerText()}`);
log.push(`stock before reload ${beforeReload.join(" ")} / after ${afterReload.join(" ")}`);
await page.screenshot({ path: `${out}/experiment-reloaded.png` });
console.log(log.join("\n"));
console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
await browser.close();
