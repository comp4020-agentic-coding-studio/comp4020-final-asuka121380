#!/usr/bin/env node
// First-visit identity ordering (state/identity.ts; ADR 0013's 20 Oct
// correction), in real Chrome, against a LOCAL server whose stdout is
// captured to a file. The script puts its own small proxy in front of the
// server, so it can hold one response back or fail the identity request,
// the way a slow cold start or a dropped connection would.
//
//   DATA_DIR=/tmp/idrace PORT=8399 node src/server/index.ts > /tmp/idrace/server.log
//   node scripts/identity-race.ts http://localhost:8399 /tmp/idrace/server.log <out-dir>
//
// What it checks: one visitor per first visit, however many requests and
// tabs; a slow first response never switches who the page is; a direct room
// link, a refresh, sign-out and sign-in keep the page, its commands and its
// realtime stream on one identity; two separate profiles stay two people;
// a failed first request shows a retry that works. Automated browser
// contexts on one machine, not people.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const upstream = process.argv[2] ?? "http://localhost:8399";
const logPath = process.argv[3];
const out = process.argv[4] ?? "/tmp/brick-identity-race";
if (!logPath) throw new Error("usage: node scripts/identity-race.ts <base-url> <server-stdout-file> [out-dir]");
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(upstream)) throw new Error("local servers only");
mkdirSync(out, { recursive: true });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function check(name: string, ok: boolean, detail: unknown = ""): void {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ name, ok, detail: d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${d ? `  — ${d}` : ""}`);
}

// ---- a proxy that can delay a path's response, or fail /api/me --------------

const rules = { slowPath: "", slowMs: 0, failMe: 0 };
const up = new URL(upstream);
const proxy = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/api/me" && rules.failMe > 0) {
    rules.failMe--;
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("unavailable");
    req.resume();
    return;
  }
  const fwd = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
    const send = () => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    };
    if (path === rules.slowPath) setTimeout(send, rules.slowMs);
    else send();
  });
  fwd.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(fwd);
});
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;

// ---- helpers ---------------------------------------------------------------

const logLines = (): Record<string, unknown>[] =>
  readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
const mark = (): number => logLines().length;
const since = (n: number) => logLines().slice(n);
const newVisitors = (n: number) => since(n).filter((e) => e.event === "visitor.new");

const serverSaysMe = (page: Page): Promise<string> => page.evaluate(async () => (await (await fetch("/api/me")).json()).visitorId as string);
const lobbyReady = (page: Page) => page.waitForSelector(".lobby-header, .lobby-grid", { timeout: 20000 });

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const contexts: BrowserContext[] = [];
const fresh = async (): Promise<BrowserContext> => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  contexts.push(c);
  return c;
};

try {
  // 1. a first visit to the lobby: one visitor, and every request after it carries that cookie
  {
    const n = mark();
    const ctx = await fresh();
    const page = await ctx.newPage();
    const sent: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/")) void r.allHeaders().then((h) => sent.push(`${new URL(r.url()).pathname}:${h.cookie ? "cookie" : "none"}`));
    });
    await page.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
    await lobbyReady(page);
    await page.waitForTimeout(600);
    const v = newVisitors(n);
    check("first visit: exactly one visitor, created by /api/me", v.length === 1 && v[0].route === "/api/me", v.map((e) => e.route));
    const before = sent.filter((s) => s.endsWith(":none"));
    check("only the identity request goes out without a cookie", before.length === 1 && before[0].startsWith("/api/me"), before);
  }

  // 2. a slow first response (a cold start) never switches who the page is
  {
    rules.slowPath = "/api/friends";
    rules.slowMs = 2500;
    const n = mark();
    const ctx = await fresh();
    const page = await ctx.newPage();
    await page.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
    await lobbyReady(page);
    const shown = await serverSaysMe(page);
    await page.getByText("Get a friend-request link").click();
    await page.locator('input[aria-label="Your friend-request link"]').waitFor();
    await page.waitForTimeout(3000); // the held-back response arrives
    const after = await serverSaysMe(page);
    const link = since(n).find((e) => e.event === "friend.link");
    check("with a response held back 2.5 s, the page stays one identity", shown === after, { shown: shown.slice(0, 8), after: after.slice(0, 8) });
    check("the friend link belongs to the identity the browser still holds", link?.actor === after.slice(0, 8), link?.actor);
    check("still exactly one visitor", newVisitors(n).length === 1, newVisitors(n).length);
    rules.slowPath = "";
  }

  // 3. same browser profile, three tabs opened at once on a first visit
  {
    const n = mark();
    const ctx = await fresh();
    const pages = await Promise.all([ctx.newPage(), ctx.newPage(), ctx.newPage()]);
    await Promise.all(pages.map((p) => p.goto(`${base}/build/`, { waitUntil: "domcontentloaded" })));
    await Promise.all(pages.map(lobbyReady));
    const ids = await Promise.all(pages.map(serverSaysMe));
    const locks = await pages[0].evaluate(() => !!navigator.locks);
    check("same profile, three tabs at once: one shared identity", new Set(ids).size === 1, ids.map((i) => i.slice(0, 8)));
    check("…and only one visitor created (Web Locks available here)", locks && newVisitors(n).length === 1, { locks, visitors: newVisitors(n).length });
  }

  // 4. two separate profiles stay two people
  const ctxA = await fresh();
  const ctxB = await fresh();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await Promise.all([pageA.goto(`${base}/build/`, { waitUntil: "domcontentloaded" }), pageB.goto(`${base}/build/`, { waitUntil: "domcontentloaded" })]);
  await Promise.all([lobbyReady(pageA), lobbyReady(pageB)]);
  const idA = await serverSaysMe(pageA);
  const idB = await serverSaysMe(pageB);
  check("two separate profiles at once: two distinct identities", idA !== idB, `${idA.slice(0, 8)} / ${idB.slice(0, 8)}`);

  // 5. a direct room link on a first visit: preview, join, commands and the stream all as one identity
  {
    await pageA.getByRole("button", { name: "Create and open" }).click();
    await pageA.waitForURL(/\/build\/room\//);
    const roomId = pageA.url().match(/\/build\/room\/([^/?]+)/)![1];
    const n = mark();
    const ctxC = await fresh();
    const pageC = await ctxC.newPage();
    await pageC.goto(`${base}/build/room/${roomId}/?debug`, { waitUntil: "domcontentloaded" });
    await pageC.getByRole("button", { name: /^Join this room/ }).click();
    await pageC.waitForFunction(() => (window as any).__state?.().snapshot && (window as any).__state().connection === "connected", null, { timeout: 15000 });
    const selfShown = await pageC.evaluate(() => (window as any).__state().selfId as string);
    const c = await serverSaysMe(pageC);
    const res = await pageC.evaluate(async (id) => {
      const r = await fetch(`/api/rooms/${id}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedRevision: 0, command: { type: "place", placement: { partId: "brick-2x2", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } } }),
      });
      return r.status;
    }, roomId);
    await pageC.waitForTimeout(300);
    // A is in the room too, so leave A's own lines out
    const lines = since(n);
    const cLabel = c.slice(0, 8);
    const aLabel = idA.slice(0, 8);
    const actors = new Set(lines.filter((e) => e.actor !== aLabel && (e.room === roomId || e.event === "visitor.new")).map((e) => e.actor));
    check("direct room link: one visitor, created before the preview", newVisitors(n).length === 1 && newVisitors(n)[0].route === "/api/me", newVisitors(n).map((e) => e.route));
    check("the editor's 'you', its join, stream and command are all the same identity", selfShown === c && res === 200 && actors.size === 1 && actors.has(cLabel), {
      selfShown: selfShown.slice(0, 8),
      server: c.slice(0, 8),
      actors: [...actors],
      res,
    });
    const sse = lines.find((e) => e.event === "sse.open" && e.room === roomId && e.actor !== aLabel);
    check("the realtime stream opened as that identity", sse?.actor === c.slice(0, 8), sse?.actor);

    // 6. a refresh keeps the identity, creates nothing new
    const r0 = mark();
    await pageC.reload({ waitUntil: "domcontentloaded" });
    await pageC.waitForFunction(() => (window as any).__state?.().snapshot, null, { timeout: 15000 });
    check("refresh with an existing identity: same visitor, no new one", (await serverSaysMe(pageC)) === c && newVisitors(r0).length === 0, newVisitors(r0).length);
  }

  // 7. a failed identity request shows a retry; retrying works and nothing half-starts
  {
    rules.failMe = 1;
    const n = mark();
    const ctx = await fresh();
    const page = await ctx.newPage();
    await page.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Try again" }).waitFor({ timeout: 15000 });
    const lobbyShown = await page.locator(".lobby-grid").count();
    check("a failed first request shows 'Couldn't start your session' with a retry, not the lobby", lobbyShown === 0 && (await page.getByRole("heading", { name: "Couldn't start your session" }).count()) === 1);
    check("…and nothing identity-dependent was sent meanwhile", newVisitors(n).length === 0, newVisitors(n).length);
    await page.getByRole("button", { name: "Try again" }).click();
    await lobbyReady(page);
    check("retrying establishes one identity and opens the lobby", newVisitors(n).length === 1, newVisitors(n).length);
  }

  // 8. sign-in and sign-out: the page's "you" follows the server's answer
  {
    const ctx = await fresh();
    const page = await ctx.newPage();
    await page.goto(`${base}/build/?view=account`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Create an account" }).click();
    const user = `idrace${Date.now() % 1e8}`;
    await page.getByLabel("Username", { exact: true }).fill(user);
    await page.getByLabel("Password (at least", { exact: false }).fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 10000 });
    const signedIn = await serverSaysMe(page);
    const n = mark();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Create an account" }).waitFor({ timeout: 10000 });
    const anon = await serverSaysMe(page);
    const v = newVisitors(n);
    check("sign-out: one fresh anonymous identity, issued by the sign-out itself", anon !== signedIn && v.length === 1 && v[0].route === "/api/account/sign-out", v.map((e) => e.route));
    // signing back in switches to the account's identity, and the lobby reflects it
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Username", { exact: true }).fill(user);
    await page.getByLabel("Password", { exact: true }).fill("correct horse battery");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 10000 });
    check("sign-in again: back to the account's identity", (await serverSaysMe(page)) === signedIn);
    await page.goto(`${base}/build/`, { waitUntil: "domcontentloaded" });
    await lobbyReady(page);
    check("the lobby then shows the signed-in name", (await page.getByRole("link", { name: /^Signed in as/ }).count()) === 1);
  }
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  proxy.close();
}

writeFileSync(`${out}/results.json`, `${JSON.stringify({ base: upstream, at: new Date().toISOString(), results }, null, 2)}\n`);
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} passed; results in ${out}/results.json`);
process.exit(pass === results.length ? 0 : 1);
