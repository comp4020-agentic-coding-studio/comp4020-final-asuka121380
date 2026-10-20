import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { browser, startServer } from "./helpers/server-process.ts";

// ADR 0013 (reviewed 20 Oct 2026): a fatal error is logged safely and the
// process exits non-zero and stops serving; a signal shuts down within a
// bounded time even with realtime streams open. Fatal errors are triggered
// by a test-only `--import` preload written here, so the server itself
// carries no test hook. Each case runs the real server in its own process.

const SENTINEL = "SENTINEL-lifecycle-7d21";
const dir = mkdtempSync(join(tmpdir(), "brick-lifecycle-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function preload(name: string, body: string): string {
  const path = join(dir, `${name}.mjs`);
  writeFileSync(path, body);
  return path;
}

const THROW = preload(
  "throw",
  `setTimeout(() => { const e = new TypeError("${SENTINEL} message"); e.stack += "\\n    at x (/tmp/${SENTINEL}.js:1:1)"; throw e; }, Number(process.env.FATAL_AFTER ?? 1500));`,
);
const REJECT = preload("reject", `setTimeout(() => { Promise.reject(new Error("${SENTINEL} rejected")); }, Number(process.env.FATAL_AFTER ?? 1500));`);

const openStream = async (base: string, cookie: string, roomId: string) => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/rooms/${roomId}/events`, { headers: { cookie }, signal: ctrl.signal });
  return { res, ctrl };
};

describe("fatal errors stop the process, safely", () => {
  it("an uncaught exception logs a sanitized line, exits 1 and stops serving, even with a stream open", async () => {
    const server = await startServer({ nodeArgs: ["--import", THROW], env: { FATAL_AFTER: "1500" } });
    try {
      const a = browser(server.base);
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      const stream = await openStream(server.base, a.cookie, room.body.roomId);
      expect(stream.res.status).toBe(200);
      const t0 = Date.now();
      const { code } = await server.exited;
      expect(code).toBe(1);
      expect(Date.now() - t0).toBeLessThan(5000); // within the shutdown deadline, not hung on the open stream
      const crash = server.events().find((e) => e.event === "process.crash");
      expect(crash).toMatchObject({ outcome: "error", kind: "uncaught_exception", error: "TypeError" });
      expect(server.events().find((e) => e.event === "server.stop")).toMatchObject({ outcome: "error", reason: "uncaught_exception" });
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
      expect(server.stderr()).toBe("");
      // nothing is served afterwards
      await expect(fetch(`${server.base}/api/rooms`)).rejects.toThrow();
      stream.ctrl.abort();
    } finally {
      await server.stop();
    }
  }, 20_000);

  it("an unhandled rejection is fatal too, with the same safe output", async () => {
    const server = await startServer({ nodeArgs: ["--import", REJECT] });
    try {
      const { code } = await server.exited;
      expect(code).toBe(1);
      expect(server.events().find((e) => e.event === "process.crash")).toMatchObject({ kind: "unhandled_rejection", error: "Error" });
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
      expect(server.stderr()).toBe("");
    } finally {
      await server.stop();
    }
  }, 20_000);

  it("with stdout congested by other writes but still being read, the crash line arrives before exit (bounded flush)", async () => {
    // fill the pipe with this preload's own writes, then throw at once; the
    // reader (this test) keeps reading, so the bounded flush can deliver it.
    // With a pipe nobody reads, the line can be lost: see log-backpressure.test.ts
    const FLOOD = preload(
      "flood",
      `setTimeout(() => { const l = JSON.stringify({ event: "filler", pad: "x".repeat(200) }) + "\\n"; for (let i = 0; i < 20000; i++) process.stdout.write(l); throw new TypeError("${SENTINEL}"); }, 1500);`,
    );
    const server = await startServer({ nodeArgs: ["--import", FLOOD] });
    try {
      const { code } = await server.exited;
      expect(code).toBe(1);
      await new Promise((r) => setTimeout(r, 100)); // let the pipe drain into the test
      expect(server.events().some((e) => e.event === "process.crash")).toBe(true);
      expect(server.stdout()).not.toContain(SENTINEL);
    } finally {
      await server.stop();
    }
  }, 20_000);
});

// Make the presence sweep's query fail (it runs every 10 s), optionally with
// the rollback failing too, by patching node:sqlite from a preload.
const sweepFails = (rollbackFails: boolean) =>
  preload(
    rollbackFails ? "sweep-stuck" : "sweep-fails",
    `import { DatabaseSync } from "node:sqlite";
const prepare = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function (sql) {
  if (sql.startsWith("SELECT room_id, visitor_id FROM room_members WHERE active = 1")) throw new Error("${SENTINEL} sweep");
  return prepare.call(this, sql);
};
${rollbackFails ? `const exec = DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec = function (sql) {
  if (sql === "ROLLBACK") throw new Error("${SENTINEL} rollback");
  return exec.call(this, sql);
};` : ""}`,
  );

describe("background errors: recoverable unless the database is left mid-transaction", () => {
  it("a failed presence sweep is logged as recoverable and the server keeps serving", async () => {
    const server = await startServer({ nodeArgs: ["--import", sweepFails(false)] });
    try {
      const line = await server.waitFor((e) => e.event === "background.error", 15_000);
      expect(line).toMatchObject({ outcome: "error", reason: "recoverable", kind: "presence_sweep", error: "Error" });
      const res = await fetch(`${server.base}/api/rooms`);
      expect(res.status).toBe(200);
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
    } finally {
      await server.stop();
    }
  }, 25_000);

  it("if the rollback fails too, leaving a transaction open, it is fatal: logged, exit 1", async () => {
    const server = await startServer({ nodeArgs: ["--import", sweepFails(true)] });
    try {
      const { code } = await server.exited;
      expect(code).toBe(1);
      expect(server.events().find((e) => e.event === "background.error")).toMatchObject({ reason: "fatal_open_transaction", kind: "presence_sweep" });
      expect(server.events().find((e) => e.event === "server.stop")).toMatchObject({ outcome: "error", reason: "open_transaction" });
      expect(server.stdout() + server.stderr()).not.toContain(SENTINEL);
      expect(server.stderr()).toBe("");
    } finally {
      await server.stop();
    }
  }, 25_000);
});

describe("signals shut down within a bounded time", () => {
  it("SIGTERM with realtime streams open: exits 0 promptly, logging the stop", async () => {
    const server = await startServer();
    try {
      const a = browser(server.base);
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      const s1 = await openStream(server.base, a.cookie, room.body.roomId);
      const s2 = await openStream(server.base, a.cookie, room.body.roomId);
      expect([s1.res.status, s2.res.status]).toEqual([200, 200]);
      const t0 = Date.now();
      server.kill("SIGTERM");
      const { code } = await server.exited;
      expect(code).toBe(0);
      expect(Date.now() - t0).toBeLessThan(3500);
      expect(server.events().find((e) => e.event === "server.stop")).toMatchObject({ outcome: "ok", reason: "sigterm" });
      expect(server.stderr()).toBe("");
      s1.ctrl.abort();
      s2.ctrl.abort();
    } finally {
      await server.stop();
    }
  }, 20_000);

  it("a second signal during shutdown doesn't start another one", async () => {
    const server = await startServer();
    try {
      server.kill("SIGTERM");
      server.kill("SIGINT");
      const { code } = await server.exited;
      expect(code).toBe(0);
      expect(server.events().filter((e) => e.event === "server.stop")).toHaveLength(1);
    } finally {
      await server.stop();
    }
  }, 20_000);

  it("a database committed before SIGTERM is intact when the next process opens it", async () => {
    // the same DATA_DIR across two processes: what a restart on Fly does
    const data = mkdtempSync(join(tmpdir(), "brick-lifecycle-data-"));
    try {
      const first = await startServer({ env: { DATA_DIR: data } });
      const a = browser(first.base);
      const room = await a.req("POST", "/api/rooms", { visibility: "public" });
      const placed = await a.req("POST", `/api/rooms/${room.body.roomId}/command`, {
        commandId: crypto.randomUUID(),
        expectedRevision: 0,
        command: { type: "place", placement: { partId: "brick-2x2", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } },
      });
      expect(placed.status).toBe(200);
      first.kill("SIGTERM");
      expect((await first.exited).code).toBe(0);
      const second = await startServer({ env: { DATA_DIR: data } });
      try {
        // same cookie, new process: same visitor, same room, the part still there
        const back = await fetch(`${second.base}/api/rooms/${room.body.roomId}`, { headers: { cookie: a.cookie } });
        expect(back.status).toBe(200);
        expect(((await back.json()) as { parts: unknown[] }).parts).toHaveLength(1);
      } finally {
        await second.stop();
      }
      await first.stop();
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  }, 30_000);
});
