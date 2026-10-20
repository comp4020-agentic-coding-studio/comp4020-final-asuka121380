import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MAX_LINES } from "../../src/server/log.ts";
import { browser, startServer } from "./helpers/server-process.ts";

// The real server in its own process, with its real stdout pipe left unread
// (as a stalled log shipper would), closed, or congested at shutdown. These
// show what a fake stream can't: that a full kernel pipe no longer stalls the
// server, and how exit behaves with output stuck. External test timeouts
// catch hangs; they are not proof against every possible blocked event loop.

const SENTINEL = "SENTINEL-backpressure-0c4e";
const dir = mkdtempSync(join(tmpdir(), "brick-backpressure-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** One fresh visitor per request: each writes one `visitor.new` line (~200 bytes). */
async function burst(base: string, n: number): Promise<{ ok: number; maxMs: number }> {
  let ok = 0;
  let maxMs = 0;
  for (let i = 0; i < n; i += 20) {
    const t = Date.now();
    const rs = await Promise.all(Array.from({ length: Math.min(20, n - i) }, () => fetch(`${base}/api/me`, { signal: AbortSignal.timeout(5000) })));
    maxMs = Math.max(maxMs, Date.now() - t);
    for (const r of rs) if (r.ok && typeof ((await r.json()) as { visitorId?: string }).visitorId === "string") ok++;
  }
  return { ok, maxMs };
}

describe("stdout backpressure never stalls the server", () => {
  it("with stdout unread, requests keep being answered; when reading resumes, kept lines arrive in order and the loss is reported once in place", async () => {
    const server = await startServer();
    try {
      server.pauseStdout();
      // well past the pipe, our side's stream buffer, and the queue's MAX_LINES
      const n = MAX_LINES * 3;
      const { ok, maxMs } = await burst(server.base, n);
      expect(ok).toBe(n); // every request answered, correctly
      expect(maxMs).toBeLessThan(2000); // a batch of 20 never waited on the log pipe
      // a request that returns real data still works while output is stuck
      // (its own line is dropped too: the queue is full, which is the policy)
      const a = browser(server.base);
      const stuck = await a.req("POST", "/api/rooms", { visibility: "public", label: SENTINEL });
      expect(stuck.status).toBe(200);
      expect(stuck.body.roomId).toMatch(/^[0-9a-f-]{36}$/);

      server.resumeStdout();
      await server.waitFor((e) => e.event === "log.dropped", 10_000);
      await new Promise((r) => setTimeout(r, 300)); // the queue drains
      // once output flows again, new lines are written normally
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      await server.waitFor((e) => e.event === "room.create" && e.room === room.body.roomId, 5000);
      const events = server.events();
      const dropped = events.filter((e) => e.event === "log.dropped");
      const visitors = events.filter((e) => e.event === "visitor.new");
      expect(dropped.length).toBeGreaterThanOrEqual(1);
      const lost = dropped.reduce((sum, e) => sum + (e.lost as number), 0);
      // every visitor line is either delivered or counted as lost, none duplicated
      expect(new Set(visitors.map((e) => e.actor)).size).toBe(visitors.length);
      // each burst line is either delivered or counted, and so is the stuck room's line
      expect(visitors.length + lost).toBeGreaterThanOrEqual(n + 1);
      expect(events.some((e) => e.event === "room.create" && e.room === stuck.body.roomId)).toBe(false);
      // retained lines arrive in the order they were logged (each line's own `t` never goes backwards;
      // a log.dropped line is stamped when written, so it's left out of this comparison)
      const kept = events.filter((e) => e.event !== "log.dropped").map((e) => e.t as string);
      expect(kept).toEqual([...kept].sort());
      // the room created after output recovered comes after the report of loss, not before it
      const firstGap = events.findIndex((e) => e.event === "log.dropped");
      expect(events.findIndex((e) => e.event === "room.create" && e.room === room.body.roomId)).toBeGreaterThan(firstGap);
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
      expect(server.stderr()).toBe("");
    } finally {
      await server.stop();
    }
  }, 60_000);

  it("with stdout closed (EPIPE), requests still return correct results and nothing recurses or reaches stderr", async () => {
    const server = await startServer();
    try {
      server.closeStdout();
      const { ok } = await burst(server.base, 200);
      expect(ok).toBe(200);
      const a = browser(server.base);
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      const placed = await a.req("POST", `/api/rooms/${room.body.roomId}/command`, {
        commandId: crypto.randomUUID(),
        expectedRevision: 0,
        command: { type: "place", placement: { partId: "brick-2x2", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } },
      });
      expect(placed.status).toBe(200);
      expect(placed.body.snapshot.parts).toHaveLength(1);
      // still alive and serving afterwards
      expect((await fetch(`${server.base}/api/rooms`)).status).toBe(200);
      expect(server.stderr()).toBe("");
      server.kill("SIGTERM");
      expect((await server.exited).code).toBe(0);
    } finally {
      await server.stop();
    }
  }, 60_000);
});

describe("shutdown with output congested", () => {
  it("SIGTERM with stdout unread, lines pending and SSE streams open: exits 0 within the deadline", async () => {
    const server = await startServer();
    try {
      const a = browser(server.base);
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      const ctrl = new AbortController();
      const sse = await fetch(`${server.base}/api/rooms/${room.body.roomId}/events`, { headers: { cookie: a.cookie }, signal: ctrl.signal });
      expect(sse.status).toBe(200);
      server.pauseStdout();
      await burst(server.base, MAX_LINES * 2);
      const t0 = Date.now();
      server.kill("SIGTERM");
      const { code } = await server.exited;
      expect(code).toBe(0);
      expect(Date.now() - t0).toBeLessThan(4500); // the 3 s deadline, plus process teardown
      ctrl.abort();
    } finally {
      await server.stop();
    }
  }, 60_000);

  it("a fatal error during a graceful shutdown makes the exit status non-zero", async () => {
    // registered before the server's own handler: on SIGTERM, throw once the shutdown is under way
    const preload = join(dir, "fatal-during-shutdown.mjs");
    writeFileSync(preload, `process.once("SIGTERM", () => setImmediate(() => { throw new TypeError("${SENTINEL} during shutdown"); }));`);
    const server = await startServer({ nodeArgs: ["--import", preload] });
    try {
      // an open stream keeps server.close() waiting, so cleanup takes longer than one tick
      const a = browser(server.base);
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      const ctrl = new AbortController();
      await fetch(`${server.base}/api/rooms/${room.body.roomId}/events`, { headers: { cookie: a.cookie }, signal: ctrl.signal });
      server.kill("SIGTERM");
      const { code } = await server.exited;
      expect(code).toBe(1);
      const stops = server.events().filter((e) => e.event === "server.stop");
      expect(stops[0]).toMatchObject({ outcome: "ok", reason: "sigterm" });
      expect(stops.find((e) => e.reason === "escalated_uncaught_exception")).toMatchObject({ outcome: "error" });
      expect(server.events().some((e) => e.event === "process.crash")).toBe(true);
      // one shutdown, escalated, not two
      expect(stops).toHaveLength(2);
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
      expect(server.stderr()).toBe("");
      ctrl.abort();
    } finally {
      await server.stop();
    }
  }, 30_000);

  it("…also when the fatal error comes in the same tick as the signal (a microtask)", async () => {
    const preload = join(dir, "fatal-during-shutdown-microtask.mjs");
    writeFileSync(preload, `process.once("SIGTERM", () => queueMicrotask(() => { throw new TypeError("${SENTINEL}"); }));`);
    const server = await startServer({ nodeArgs: ["--import", preload] });
    try {
      server.kill("SIGTERM");
      const { code } = await server.exited;
      expect(code).toBe(1);
      expect(server.events().some((e) => e.event === "server.stop" && e.reason === "escalated_uncaught_exception")).toBe(true);
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
    } finally {
      await server.stop();
    }
  }, 30_000);

  it("a later signal never lowers a fatal exit status", async () => {
    const preload = join(dir, "fatal-then-signal.mjs");
    // throw, then immediately send ourselves SIGTERM while the fatal shutdown is running
    writeFileSync(preload, `setTimeout(() => { setImmediate(() => process.kill(process.pid, "SIGTERM")); throw new Error("${SENTINEL}"); }, 1200);`);
    const server = await startServer({ nodeArgs: ["--import", preload] });
    try {
      const { code } = await server.exited;
      expect(code).toBe(1);
      const stops = server.events().filter((e) => e.event === "server.stop");
      expect(stops).toHaveLength(1); // the SIGTERM changed nothing and logged nothing
      expect(stops[0]).toMatchObject({ outcome: "error", reason: "uncaught_exception" });
    } finally {
      await server.stop();
    }
  }, 30_000);

  it("repeated signals: one cleanup, no hang, exit 0", async () => {
    const server = await startServer();
    try {
      for (let i = 0; i < 5; i++) server.kill(i % 2 ? "SIGINT" : "SIGTERM");
      const { code } = await server.exited;
      expect(code).toBe(0);
      expect(server.events().filter((e) => e.event === "server.stop")).toHaveLength(1);
    } finally {
      await server.stop();
    }
  }, 30_000);
});
