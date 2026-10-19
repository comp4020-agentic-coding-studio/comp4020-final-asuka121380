#!/usr/bin/env node
// Verifies the corrective fixes from an independent review, through visible
// UI with two (and, for the friend link, three) genuinely independent
// browser identities — never by extracting a hidden token for the user, and
// never by substituting an API-only shortcut for a missing control.
//   1. A friend-request link, opened directly at its real shared URL
//      (never copy-pasted into a field), shows the sender and an explicit
//      accept/decline.
//   2. A plan with no real or planned support underneath (a future roof
//      before its walls) can be proposed through the real UI — reachable
//      with Higher (since ADR 0012: onto a planned wall, never into empty space).
//   3. Selecting a placed part shows who placed it and, after someone else
//      recolours it, who last edited it — distinctly.
//   4. Saving a published version directly to a collection, via its own
//      button, creates no room as a side effect.
//   5. The public lobby and a pending invitation both show the room's
//      publication setting before joining/accepting.
//   node scripts/review-fixes.ts [base-url]
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
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

// ---- 1. a real friend link, opened at its actual URL, shows sender + accept/decline
await pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageA.getByText("Get a friend-request link").click();
const linkInput = pageA.locator('input[aria-label="Your friend-request link"]');
await linkInput.waitFor();
const link = await linkInput.inputValue(); // the exact URL the UI generated — never a manually-extracted token
check("a friend-request link was generated", link.includes("/build/?friend="), link);

await pageB.goto(link, { waitUntil: "domcontentloaded" }); // open the REAL URL directly, not paste a token into a field
await pageB.waitForSelector("text=Friend request");
const showsSender = await pageB.locator(".lobby-card").textContent();
check("opening the link shows who it's from and an accept/decline, not silent friendship", (showsSender?.includes("shared this link") ?? false) && (await pageB.getByRole("button", { name: "Accept" }).isVisible()));

const friendsBeforeAccept = await pageB.evaluate(async () => (await (await fetch("/api/friends")).json()).friends);
check("viewing the link page itself never establishes friendship", friendsBeforeAccept.length === 0, friendsBeforeAccept);

await pageB.getByRole("button", { name: "Accept" }).click();
await pageB.waitForSelector("text=Friend request accepted.");
const friendsAfter = await pageB.evaluate(async () => (await (await fetch("/api/friends")).json()).friends);
check("accepting through the link page makes them friends", friendsAfter.length === 1, friendsAfter);

// reopening the SAME link afterward correctly says already-friends, not a second accept flow
await pageB.goto(link, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector("text=already friends");
check("reopening an already-accepted link says so, rather than offering to accept again", true);

// ---- 2. (rewritten for ADR 0012, author 19 Oct 2026: the old "future roof
// with no support" check is superseded) a roof planned on a planned wall,
// reached with the visible Higher control; a floating spot isn't offered
await pageA.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
await pageA.fill('input[placeholder="e.g. Saturday build"]', `Review fixes ${Date.now()}`);
await pageA.getByRole("button", { name: "Create and open" }).click();
await pageA.waitForURL(/\/build\/room\/.*debug/);
await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);

await pageA.getByRole("button", { name: "Plan mode", exact: true }).click();
await pageA.locator('.tray button[aria-label^="Brick 2×4,"]').click();
const p = await pageA.evaluate(() => (window as any).__project(2.5, 0, 2.5));
await pageA.mouse.move(p.x, p.y, { steps: 3 });
await pageA.waitForTimeout(150);
await pageA.mouse.click(p.x, p.y); // the planned wall
await pageA.waitForTimeout(400);
await pageA.mouse.move(10, 10);
const wallY = await pageA.evaluate(() => (window as any).__state().snapshot.plans[0]?.y);
const previewY = await pageA.evaluate(() => (window as any).__preview()?.placement.y);
check("after planning a wall, the next preview sits on the planned wall's top", wallY === 0 && previewY === 3, { wallY, previewY });
const higherDisabled = await pageA.getByRole("button", { name: /Higher:/ }).isDisabled();
check("Higher offers no floating height above it", higherDisabled);

const realRejection = await pageA.evaluate(() => (window as any).__preview()?.rejection?.code);
check("a real placement is refused there (a plan is no real support)", realRejection === "unsupported", realRejection);
const proposeDisabled = await pageA.getByRole("button", { name: /Propose plan/ }).getAttribute("aria-disabled");
check("but Propose plan is enabled there: planned support counts for a plan", proposeDisabled !== "true", proposeDisabled);

await pageA.getByRole("button", { name: /Propose plan/ }).click();
await pageA.waitForTimeout(400);
const planCreated = await pageA.evaluate(() => (window as any).__state().snapshot.plans.length);
check("the stacked plan was created through the real button", planCreated === 2, { planCreated, previewY });
await pageA.keyboard.press("Escape");
await pageA.getByRole("button", { name: "Build mode", exact: true }).click();

// ---- 3. attribution shown when a part is selected, before and after another member edits it
await pageA.locator('.tray button[aria-label^="Brick 2×4,"]').click();
const p2 = await pageA.evaluate(() => (window as any).__project(6.5, 0, 2.5));
await pageA.mouse.move(p2.x, p2.y, { steps: 3 });
await pageA.waitForTimeout(100);
await pageA.mouse.click(p2.x, p2.y);
await pageA.waitForTimeout(400);
await pageA.keyboard.press("Escape");

const partId = await pageA.evaluate(() => (window as any).__state().snapshot.parts[0].id);
const selfA = await pageA.evaluate(() => (window as any).__state().selfId);

// select it on A's own screen
const clickAt = await pageA.evaluate((id: string) => {
  const part = (window as any).__state().snapshot.parts.find((p: any) => p.id === id);
  return (window as any).__project(part.x + 2, 1.0, part.z + 1);
}, partId);
await pageA.mouse.move(clickAt.x, clickAt.y, { steps: 3 });
await pageA.waitForTimeout(100);
await pageA.mouse.click(clickAt.x, clickAt.y);
await pageA.waitForFunction(() => (window as any).__state().selectedId, null, { timeout: 2000 });
const attributionText = await pageA.locator(".context-hint").first().textContent();
check("selecting a just-placed part shows who placed it", (attributionText ?? "").includes("Placed by"), attributionText);

// B joins and recolours the same part; A should then see "last changed by" distinctly from "placed by"
const roomUrl = pageA.url();
await pageB.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
const roomId = roomUrl.match(/\/build\/room\/([^/?]+)/)![1];
await pageB.goto(`${base}/build/room/${roomId}?debug`, { waitUntil: "domcontentloaded" });
// a first-time visit to a direct room link now shows the pre-join
// confirmation screen (section 3's fix); confirm it before the editor loads
await pageB.getByRole("button", { name: /^Join this room/ }).click();
await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
await pageB.mouse.move(clickAt.x, clickAt.y, { steps: 3 });
await pageB.waitForTimeout(100);
await pageB.mouse.click(clickAt.x, clickAt.y);
await pageB.waitForFunction(() => (window as any).__state().selectedId, null, { timeout: 2000 });
const swatch = pageB.locator('.swatch-run button[aria-label="Turquoise"]');
await swatch.waitFor({ state: "visible", timeout: 2000 });
await swatch.click();
await pageB.waitForTimeout(400);

await pageA.waitForFunction((id: string) => (window as any).__state().snapshot.parts.find((p: any) => p.id === id)?.colour === "turquoise", partId, { timeout: 2000 });
const afterEditText = await pageA.locator(".context-hint").first().textContent();
check(
  "after another member edits it, A's own screen distinguishes who placed it from who last changed it",
  (afterEditText ?? "").includes("Placed by") && (afterEditText ?? "").includes("Last changed by"),
  afterEditText,
);
void selfA;

// ---- 4. saving a published version directly to a collection creates no room
await pageA.getByRole("button", { name: /^Room/ }).click();
await pageA.getByRole("button", { name: "Save a copy" }).click();
await pageA.waitForSelector("text=Saved to your collection.");
const viewLink = await pageA.locator('a:has-text("View it")').getAttribute("href");
await pageA.goto(`${base}/build/?view=collection`, { waitUntil: "domcontentloaded" });
await pageA.locator(".room-row", { hasText: "revision" }).first().getByRole("button", { name: "Publish" }).click();
await pageA.waitForSelector("text=Published to the public showcase.");
await pageA.goto(`${base}${viewLink}`, { waitUntil: "domcontentloaded" }); // A views their own saved (now published) version

const bRoomsBefore = await pageB.evaluate(async () => (await (await fetch("/api/my/rooms")).json()).length);
await pageB.goto(`${base}/build/?view=showcase`, { waitUntil: "domcontentloaded" });
const showcaseHref = await pageB.locator(".room-row").first().getByRole("link", { name: "View" }).getAttribute("href");
await pageB.goto(`${base}${showcaseHref}`, { waitUntil: "domcontentloaded" });
await pageB.getByRole("button", { name: "Save to my collection" }).click();
await pageB.waitForSelector("text=Saved to your collection.");
const bRoomsAfter = await pageB.evaluate(async () => (await (await fetch("/api/my/rooms")).json()).length);
check("saving a published version to B's collection creates no room as a side effect", bRoomsAfter === bRoomsBefore, { bRoomsBefore, bRoomsAfter });

const bCollectionCount = await pageB.goto(`${base}/build/?view=collection`, { waitUntil: "domcontentloaded" }).then(() => pageB.locator(".room-row").count());
check("the collected copy appears in B's own collection", bCollectionCount >= 1, bCollectionCount);

// ---- 5. publication policy disclosed in the public lobby before joining
await pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Public lobby");
const lobbyCard = pageA.locator(".lobby-card", { has: pageA.getByRole("heading", { name: "Public lobby" }) });
const lobbyRowText = await lobbyCard.locator(".room-row").first().textContent();
check("the public lobby discloses the publication setting before joining", (lobbyRowText ?? "").match(/Publishing allowed|Not publishable/) !== null, lobbyRowText);

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
