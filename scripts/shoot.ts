#!/usr/bin/env node
// Screenshots a running app in the locally installed Chrome, at both marking
// viewports, for the development evidence. Usage:
//   node scripts/shoot.ts <url> <out-dir> [label]
// Not part of `pnpm check`: it needs a desktop Chrome and writes files.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [url, out = "doc/evidence/shots", label = "shot"] = process.argv.slice(2);
if (!url) {
  console.error("usage: node scripts/shoot.ts <url> <out-dir> [label]");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const viewports = [
  { name: "desktop", width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];
for (const v of viewports) {
  const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.isMobile ? 2 : 1 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const file = `${out}/${label}-${v.name}.png`;
  await page.screenshot({ path: file });
  console.log(file, errors.length ? `errors: ${errors.join(" | ")}` : "no console errors");
  await page.close();
}
await browser.close();
