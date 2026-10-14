#!/usr/bin/env node
// Verifies the session-revocation fix through visible browser behaviour,
// not only server-side HTTP checks (which spec/session-revocation.test.ts
// already covers): two real tabs of the SAME browser (one BrowserContext,
// sharing cookies and localStorage, the way a real person's two tabs do),
// one of them open on a room's editor, the other on the account page.
// Signing out in the account tab must make the editor tab stop acting as
// that identity: the cross-tab `storage` notification (session-events.ts)
// should make it reload and land on the access-denied screen, without the
// editor tab taking any further action of its own.
//   node scripts/session-revocation.ts [base-url]
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext(); // ONE browser, i.e. one shared cookie jar and one shared localStorage origin
const editorTab = await ctx.newPage();
const accountTab = await ctx.newPage();

// register an account and build something, through the real UI, in the editor tab
const username = `crosstab${Date.now()}`;
const password = "a-cross-tab-password-1";

await accountTab.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
await accountTab.waitForSelector("text=Create an account");
await accountTab.getByRole("button", { name: "Create an account" }).click();
await accountTab.getByLabel("Username", { exact: true }).fill(username);
await accountTab.getByLabel("Display name", { exact: false }).fill("Cross Tab");
await accountTab.getByLabel("Password (at least", { exact: false }).fill(password);
await accountTab.getByRole("button", { name: "Create account" }).click();
await accountTab.waitForSelector("text=Signed in as");
check("registered and signed in, in the account tab", true);

// invite-only, so a DIFFERENT identity (the fresh anonymous guest this
// browser becomes immediately after signing out) genuinely cannot reach it
// — a public room would let the new guest identity simply rejoin on its
// own, which would look like the bug persisting when it's really just a
// public room correctly being open to anyone
await editorTab.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await editorTab.fill('input[placeholder="e.g. Saturday build"]', `Cross-tab room ${Date.now()}`);
await editorTab.locator('input[name="visibility"]').nth(1).check();
await editorTab.getByRole("button", { name: "Create and open" }).click();
await editorTab.waitForURL(/\/build\/room\/.*debug/);
await editorTab.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
await editorTab.locator('.tray button[aria-label^="Brick 2×4,"]').click();
const p = await editorTab.evaluate(() => (window as any).__project(2.5, 0, 2.5));
await editorTab.mouse.move(p.x, p.y, { steps: 3 });
await editorTab.waitForTimeout(100);
await editorTab.mouse.click(p.x, p.y);
await editorTab.waitForTimeout(400);
const partsBefore = await editorTab.evaluate(() => (window as any).__state().snapshot.parts.length);
check("the editor tab built something as the signed-in account", partsBefore === 1, partsBefore);

// sign out in the OTHER tab
await accountTab.getByRole("button", { name: "Sign out" }).click();
await accountTab.waitForSelector("text=Create an account");
check("signed out in the account tab", true);

// the editor tab must notice (via the cross-tab storage event) and stop
// acting as the signed-out identity: it reloads the room through the same
// join-on-load path a real reload would use, re-resolving selfId fresh
await editorTab.waitForFunction(
  () => (window as any).__state?.().selfId !== undefined,
  null,
  { timeout: 5000 },
);
// give the reload a moment to actually complete its re-fetch
await editorTab.waitForTimeout(1000);
const stillSameRoomOrAccessDenied = await editorTab.evaluate(() => {
  const s = (window as any).__state?.();
  return { hasSnapshot: !!s?.snapshot, saveStatus: s?.save?.status, bodyText: document.body.innerText.slice(0, 200) };
});
// after sign-out, the editor tab's identity reverted to a fresh anonymous
// guest visitor — since this was a room THAT GUEST never joined under its
// new identity, re-loading it must be refused exactly like any other
// non-member's direct link would be (the access-denied full-page state),
// never silently continuing to show/edit the signed-in account's room
check(
  "after cross-tab sign-out, the editor tab no longer has access to the account's room (refused, not silently continuing)",
  stillSameRoomOrAccessDenied.saveStatus === "load-failed" || /isn.t open to you/i.test(stillSameRoomOrAccessDenied.bodyText),
  stillSameRoomOrAccessDenied,
);

// a held/selected tool must also have been cleared, not left live underneath
const heldAfter = await editorTab.evaluate(() => (window as any).__state?.().held);
check("nothing stayed 'held' across the forced reload", !heldAfter, heldAfter);

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
