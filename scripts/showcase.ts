#!/usr/bin/env node
// Two independent identities, driven entirely through visible controls,
// proving the collection/snapshot/showcase flow end to end (ADR 0009):
// save, view read-only, continue into an independent new room, publish,
// a second player saving the published version and continuing it, and the
// negative case — a restricted snapshot stays unreachable through
// publication, a public derived room, or a public preview. Then the same
// for a Woodland Commons room (ADR 0016): a part on the tree's left
// platform, saved, viewed read-only with the scene named, published and
// continued by B into a Woodland room with the part still on the platform.
//   node scripts/showcase.ts [base-url] [out-dir]
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8080";
const out = process.argv[3] ?? "/tmp/showcase";
mkdirSync(out, { recursive: true });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

const selfId = (page: Page) => page.evaluate(async () => (await (await fetch("/api/me")).json()).visitorId);

/** The lobby's room form unfolds from the "Start a shared room" tile (731c920). */
async function createRoom(page: Page, label: string, scene: string | null = null, inviteOnly = false): Promise<void> {
  await page.goto(`${base}/build/?debug`, { waitUntil: "domcontentloaded" });
  if (scene) await page.getByRole("radio", { name: new RegExp(scene) }).check();
  await page.locator(".start-plot-shared").click();
  await page.waitForSelector("text=Create and open");
  await page.fill('input[placeholder="e.g. Saturday build"]', label);
  if (inviteOnly) await page.locator('input[name="start-visibility"]').nth(1).check();
  await page.getByRole("button", { name: "Create and open" }).click();
  await page.waitForURL(/\/build\/room\/.*debug/);
  await page.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
}

async function placeOne(page: Page, at: [number, number, number] = [2.5, 0, 2.5]): Promise<void> {
  await page.locator('.tray button[aria-label^="Brick 2×4,"]').click();
  const p = await page.evaluate(([x, y, z]) => (window as any).__project(x, y, z), at);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
}

const browser = await chromium.launch({ channel: "chrome" });
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

// ---- A creates a public, publishable room and builds something -----------
const label = `Showcase check ${Date.now()}`;
await createRoom(pageA, label);
await placeOne(pageA);
const idA = await selfId(pageA);

// ---- 1. Save the room's current version to A's collection -----------------
await pageA.getByRole("button", { name: /^Room/ }).click();
await pageA.getByRole("button", { name: "Save a copy" }).click();
await pageA.waitForSelector("text=Saved to your collection.");
const viewLink = pageA.locator('a:has-text("View it")');
await viewLink.waitFor();
const snapshotHref = await viewLink.getAttribute("href");
check("1. a room member saves the current version to their collection", !!snapshotHref, snapshotHref);

// ---- 2. Browse the collection and open it read-only ------------------------
await pageA.goto(`${base}${snapshotHref}`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Saved version");
const noEditorControls = !(await pageA.locator(".tray").count());
check("2. opening a saved version shows a read-only page with no building controls", noEditorControls);
const snapshotId = new URL(pageA.url()).searchParams.get("snapshot")!;

// the list renders once the page's identity is established (state/identity.ts), so wait for it before counting
const collectionRow = await pageA
  .goto(`${base}/build/?view=collection`, { waitUntil: "domcontentloaded" })
  .then(() => pageA.locator(".room-row").first().or(pageA.getByText("Nothing saved yet")).waitFor({ timeout: 10000 }))
  .then(() => pageA.locator(".room-row").count());
check("the saved version also appears by browsing the collection page", collectionRow >= 1, collectionRow);

// ---- 3. Continue it in a new, independent room -----------------------------
await pageA.goto(`${base}/build/?snapshot=${snapshotId}`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Continue this version");
await pageA.getByRole("button", { name: "Continue in a new room" }).click();
await pageA.waitForURL(/\/build\/room\//, { timeout: 5000 });
const continuedRoomUrl = pageA.url();
await pageA.goto(`${continuedRoomUrl}?debug`, { waitUntil: "domcontentloaded" });
await pageA.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const continuedParts = await pageA.evaluate(() => (window as any).__state().snapshot.parts.length);
check("3. continuing creates an independent room with the saved construction intact", continuedParts === 1, continuedParts);

// confirm the ORIGINAL room and snapshot are untouched by the continue
const originalStillThere = await (await fetch(`${base}/api/snapshots/${snapshotId}`, { headers: { cookie: await ctxA.cookies().then((c) => c.map((x) => `${x.name}=${x.value}`).join("; ")) } })).json();
check("saving/continuing never modified the source snapshot", originalStillThere.parts.length === 1, originalStillThere.parts.length);

// ---- 4. Publish an eligible saved version -----------------------------------
await pageA.goto(`${base}/build/?view=collection`, { waitUntil: "domcontentloaded" });
await pageA.locator(".room-row", { hasText: "revision" }).first().getByRole("button", { name: "Publish" }).click();
await pageA.waitForSelector("text=Published to the public showcase.");
await pageA.goto(`${base}/build/?view=showcase`, { waitUntil: "domcontentloaded" });
const showcaseRow = pageA.locator(".room-row").first();
await showcaseRow.waitFor({ timeout: 5000 });
check("4. a published version appears in the public showcase", await showcaseRow.isVisible());
const showcaseHref = await showcaseRow.getByRole("link", { name: "View" }).getAttribute("href");

// ---- 5. B (independent identity) saves the published version and continues it
await pageB.goto(`${base}${showcaseHref}`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector("text=Saved version, published");
const idB = await selfId(pageB);
check("B and A are distinct identities", idA && idB && idA !== idB, `${idA} / ${idB}`);

await pageB.getByRole("button", { name: "Continue in a new room" }).click();
await pageB.waitForURL(/\/build\/room\//, { timeout: 5000 });
const bRoomUrl = pageB.url();
await pageB.goto(`${bRoomUrl}?debug`, { waitUntil: "domcontentloaded" });
await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const bPartsAfterContinue = await pageB.evaluate(() => (window as any).__state().snapshot.parts.length);
check("5. B (a stranger to A) can continue the published version into their own room", bPartsAfterContinue === 1, bPartsAfterContinue);

// B's new room is independent: A's original room and the published snapshot are untouched
const stillPublished = await fetch(`${base}${showcaseHref}`).then((r) => r.status);
check("publishing/continuing never removed or altered the published entry", stillPublished === 200, stillPublished);

// ---- 6. publisher, contributors, source credits and current-room contributors, distinctly shown
await pageB.goto(`${base}${showcaseHref}`, { waitUntil: "domcontentloaded" });
const creditsText = await pageB.locator(".credits").textContent();
check("6. the page distinguishes publisher, contributors to this version, and (if any) inherited credits", !!creditsText?.includes("Published by") && !!creditsText?.includes("Contributors to this version"), creditsText?.slice(0, 200));
const friendButtons = await pageB.locator(".credits button:has-text(\"+ friend\")").count();
check("friend-request actions are offered from the credits", friendButtons >= 1, friendButtons);

// ---- negative test: a restricted snapshot stays unreachable ---------------
await createRoom(pageA, `Private ${Date.now()}`, null, true); // invite-only
await placeOne(pageA);
await pageA.getByRole("button", { name: /^Room/ }).click();
await pageA.getByRole("button", { name: "Save a copy" }).click();
await pageA.waitForSelector("text=Saved to your collection.");
const privateLink = await pageA.locator('a:has-text("View it")').getAttribute("href");
const privateSnapshotId = new URL(privateLink!, base).searchParams.get("snapshot")!;

const publishAttempt = await pageA.evaluate(async (id: string) => {
  const res = await fetch(`/api/snapshots/${id}/publish`, { method: "POST" });
  return res.status;
}, privateSnapshotId);
check("a restricted snapshot cannot be published", publishAttempt === 403, publishAttempt);

// try to launder it through a public derived room
const launderedRoom: { roomId: string; visibility: string; allowPublish: boolean } = await pageA.evaluate(async (id: string) => {
  const res = await fetch(`/api/snapshots/${id}/continue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visibility: "public", allowPublish: true }),
  });
  return res.json();
}, privateSnapshotId);
check("the server refuses to make a derived room public when its source is restricted", launderedRoom.visibility === "invite_only" && !launderedRoom.allowPublish, launderedRoom);

const strangerSeesLobby = await pageB.evaluate(async (roomId: string) => {
  const list = await (await fetch("/api/rooms")).json();
  return list.some((r: any) => r.id === roomId);
}, launderedRoom.roomId);
check("the derived room never appears in the public lobby", !strangerSeesLobby);

const strangerJoin = await pageB.evaluate(async (roomId: string) => (await fetch(`/api/rooms/${roomId}/join`, { method: "POST" })).status, launderedRoom.roomId);
check("a stranger cannot join the derived room", strangerJoin === 403, strangerJoin);

const bogusPreview = await pageB.evaluate(async (id: string) => (await fetch(`/api/showcase/${id}`)).status, privateSnapshotId);
check("there is no public preview endpoint that exposes the restricted snapshot by its own id", bogusPreview === 404, bogusPreview);

// ---- Woodland Commons (ADR 0016): save, view, publish and continue a tree-house build
await createRoom(pageA, `Woodland showcase ${Date.now()}`, "Woodland Commons");
const woodScene = await pageA.evaluate(() => (window as any).__state().snapshot.sceneId);
// a brick 2×4 on the tree's left platform (x 1–8, z 4–11, top at plate 12)
await placeOne(pageA, [4, 12 * 0.4, 7.5]);
const woodPart = await pageA.evaluate(() => (window as any).__state().snapshot.parts[0]);
check("W1. a Woodland room is created from the lobby and a part is placed on the tree's left platform", woodScene === "treehouse-01" && woodPart?.y === 12, { woodScene, woodPart });
await pageA.getByRole("button", { name: /^Room/ }).click();
await pageA.getByRole("button", { name: "Save a copy" }).click();
await pageA.waitForSelector("text=Saved to your collection.");
const woodHref = await pageA.locator('a:has-text("View it")').getAttribute("href");
await pageA.goto(`${base}${woodHref}`, { waitUntil: "domcontentloaded" });
await pageA.waitForSelector("text=Saved version");
const woodHint = await pageA.locator(".snapshot-info .lobby-hint").first().textContent();
await pageA.waitForTimeout(2500);
await pageA.screenshot({ path: `${out}/woodland-snapshot-desktop.png` });
check("W2. the saved Woodland version opens read-only and names its scene", /Woodland Commons/.test(woodHint ?? "") && !(await pageA.locator(".tray").count()), woodHint);
const woodSnapshotId = new URL(pageA.url()).searchParams.get("snapshot")!;
const woodPublish = await pageA.evaluate(async (id: string) => (await fetch(`/api/snapshots/${id}/publish`, { method: "POST" })).status, woodSnapshotId);
check("W3. the public Woodland room's saved version can be published", woodPublish === 200 || woodPublish === 201, woodPublish);
await pageB.goto(`${base}/build/?view=showcase`, { waitUntil: "domcontentloaded" });
const woodRow = pageB.locator(".room-row", { hasText: "Woodland Commons" }).first();
await woodRow.waitFor({ timeout: 8000 });
const woodShowHref = await woodRow.getByRole("link", { name: /View/ }).getAttribute("href");
await pageB.goto(`${base}${woodShowHref}`, { waitUntil: "domcontentloaded" });
await pageB.waitForSelector("text=Saved version, published");
await pageB.getByRole("button", { name: "Continue in a new room" }).click();
await pageB.waitForURL(/\/build\/room\//, { timeout: 5000 });
await pageB.goto(`${pageB.url()}?debug`, { waitUntil: "domcontentloaded" });
await pageB.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__project);
const woodB = await pageB.evaluate(() => {
  const s = (window as any).__state().snapshot;
  return { sceneId: s.sceneId, maxPlayers: s.maxPlayers, parts: s.parts.map((p: any) => `${p.partId}@${p.x},${p.y},${p.z}`) };
});
check("W4. B continues the published Woodland version into a Woodland room of six places, the part still on the platform", woodB.sceneId === "treehouse-01" && woodB.maxPlayers === 6 && woodB.parts.length === 1 && woodB.parts[0] === `${woodPart.partId}@${woodPart.x},${woodPart.y},${woodPart.z}`, woodB);
await pageB.waitForTimeout(2000);
await pageB.screenshot({ path: `${out}/woodland-continued-desktop.png` });

await browser.close();

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
