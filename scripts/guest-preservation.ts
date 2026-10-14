#!/usr/bin/env node
// Verifies section 4's guest-work preservation and status-clarity features
// through visible browser behaviour:
//   1. The migration-warning screen offers an inline "generate a recovery
//      code for this guest identity first" action — no need to leave the
//      screen to find the "Identity and another device" panel.
//   2. Using it shows the code on screen, and the button to actually
//      continue signing in is still available either way.
//   3. The code generated there genuinely recovers the guest identity on a
//      fresh browser context afterward.
//   4. Guest mode and signed-in status are shown clearly and distinctly on
//      the account page and in the lobby header.
//   5. After sign-out, the account page explicitly confirms the return to
//      guest mode (not just silence).
//   6. The "Identity and another device" panel visibly changes once
//      signed in: generating a guest code is replaced by an explanation
//      that recovery codes don't apply to a signed-in account.
//   node scripts/guest-preservation.ts [base-url]
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

// build something as a guest, so this identity has "meaningful work"
await page.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await page.fill('input[placeholder="e.g. Saturday build"]', `Preservation check ${Date.now()}`);
await page.getByRole("button", { name: "Create and open" }).click();
await page.waitForURL(/\/build\/room\/.*debug/);
await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const guestRoomId = await page.evaluate(() => (window as any).__state().snapshot.roomId);

// register a DIFFERENT account to sign into (from a separate context, so
// its own cookie doesn't interfere with this guest's)
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
const username = `preserve${Date.now()}`;
const password = "a-preservation-password-1";
await page2.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await page2.waitForSelector("text=Create an account");
await page2.getByRole("button", { name: "Create an account" }).click();
await page2.getByLabel("Username", { exact: true }).fill(username);
await page2.getByLabel("Display name", { exact: false }).fill("Preserve Target");
await page2.getByLabel("Password (at least", { exact: false }).fill(password);
await page2.getByRole("button", { name: "Create account" }).click();
await page2.waitForSelector("text=Signed in as");
await ctx2.close();

// ---- 4: guest mode is shown clearly before signing in
await page.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Guest mode");
check("the account page clearly labels guest mode before any sign-in", true);
const lobbyText = await page.goto(`${base}/build/`, { waitUntil: "domcontentloaded" }).then(() => page.locator(".lobby-header").textContent());
check("the lobby header shows 'Guest' status, not just a bare 'Sign in'", /Guest/.test(lobbyText ?? ""), lobbyText?.slice(0, 200));

// ---- 1, 2, 3: the migration-warning screen's inline preservation path
await page.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.fill('input[autocomplete="username"]', username);
await page.fill('input[autocomplete="current-password"]', password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForSelector("text=This browser has other work");
check("signing into a different account from a guest with real work shows the migration warning", true);

const generateButton = page.getByRole("button", { name: /Generate a recovery code for this guest identity/ });
await generateButton.waitFor();
check("the warning screen offers an inline preservation action, not just a pointer elsewhere", true);
await generateButton.click();
const codeInput = page.locator('input[aria-label="Recovery code for this guest identity"]');
await codeInput.waitFor({ timeout: 5000 });
const code = await codeInput.inputValue();
check("generating shows the actual code on screen", code.length > 0, code);

const confirmButton = page.getByRole("button", { name: /I've saved my code/ });
await confirmButton.waitFor();
check("after generating, the confirm button acknowledges the code was saved", true);
await confirmButton.click();
await page.waitForSelector("text=Signed in as");
check("confirming completes the switch to the other account", true);

// verify the code genuinely recovers the ORIGINAL guest identity, on a fresh browser
const ctx3 = await browser.newContext();
const page3 = await ctx3.newPage();
await page3.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await page3.getByText("Identity and another device").click();
await page3.fill('input[aria-label="Recovery code to redeem"]', code);
await page3.getByRole("button", { name: "Use it here" }).click();
await page3.waitForTimeout(1200); // the panel reloads the page on success
await page3.waitForLoadState("domcontentloaded");
const recoveredRooms = await page3.evaluate(async () => (await (await fetch("/api/my/rooms")).json()).map((r: any) => r.id));
check("the generated code genuinely recovers the original guest identity's room afterward", recoveredRooms.includes(guestRoomId), recoveredRooms);
await ctx3.close();

// ---- 5: sign-out explicitly confirms the return to guest mode
await page.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Signed in as");
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForSelector("text=Guest mode");
const signOutConfirmation = await page.locator(".lobby-card").textContent();
check("after sign-out, the page explicitly confirms the return to guest mode", /Signed out/.test(signOutConfirmation ?? ""), signOutConfirmation?.slice(0, 200));
check("no trace of the just-signed-out account's username/details remains visible", !(signOutConfirmation ?? "").includes(username), signOutConfirmation?.slice(0, 200));

// ---- 6: the Identity panel changes once signed in (no guest-code bypass offered)
await page2.close().catch(() => {});
const ctx4 = await browser.newContext();
const page4 = await ctx4.newPage();
await page4.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await page4.waitForSelector("text=Create an account");
await page4.getByRole("button", { name: "Sign in", exact: true }).click();
await page4.fill('input[autocomplete="username"]', username);
await page4.fill('input[autocomplete="current-password"]', password);
await page4.getByRole("button", { name: "Sign in", exact: true }).click();
await page4.waitForSelector("text=Signed in as");
await page4.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await page4.getByText("Identity and another device").click();
const identityPanelText = await page4.locator(".lobby-card", { hasText: "Identity and another device" }).textContent();
const hasGenerateButton = await page4.getByRole("button", { name: "Generate a recovery code" }).count();
check("signed in, the Identity panel no longer offers to generate a guest bypass code", hasGenerateButton === 0, identityPanelText?.slice(0, 250));
check("...and explains why instead", /password-protected|username and password/i.test(identityPanelText ?? ""), identityPanelText?.slice(0, 250));

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
