import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { LineQueue, type LineStream } from "../../src/server/log.ts";

// The bounded output queue in front of stdout (ADR 0013, corrected 20 Oct
// 2026), against a fake stream whose backpressure the test controls. This
// checks the queue's own rules: order, bounds, overflow reporting, recovery,
// failure handling, bounded flushing. It does not stand in for a real pipe;
// spec/server/log-backpressure.test.ts does that with a real child process.

class FakeStream extends EventEmitter implements LineStream {
  written: string[] = [];
  full = false; // while true, write() accepts the chunk but reports the stream full
  failNext: Error | null = null;
  throwOnWrite = false;
  write(chunk: string, cb?: (err?: Error | null) => void): boolean {
    if (this.throwOnWrite) throw new Error("write after end");
    const err = this.failNext;
    this.failNext = null;
    if (!err) this.written.push(chunk);
    queueMicrotask(() => cb?.(err));
    return !this.full;
  }
  release(): void {
    this.full = false;
    this.emit("drain");
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const lines = (s: FakeStream) => s.written.map((w) => w.replace(/\n$/, ""));

describe("LineQueue", () => {
  it("writes every line, in order, one per write", async () => {
    const s = new FakeStream();
    const q = new LineQueue(s);
    for (let i = 0; i < 50; i++) q.push(`{"n":${i}}`);
    await q.flush(1000);
    expect(lines(s)).toEqual(Array.from({ length: 50 }, (_, i) => `{"n":${i}}`));
    expect(s.written.every((w) => w.endsWith("\n"))).toBe(true);
  });

  it("waits for 'drain' when the stream is full, without dropping or reordering", async () => {
    const s = new FakeStream();
    s.full = true;
    const q = new LineQueue(s, { lines: 100, bytes: 1e6 });
    for (let i = 0; i < 10; i++) q.push(`l${i}`);
    await tick();
    expect(s.written).toHaveLength(1); // one in flight, the rest held
    expect(q.stats().queued).toBe(9);
    s.release();
    await q.flush(1000);
    expect(lines(s)).toEqual(Array.from({ length: 10 }, (_, i) => `l${i}`));
  });

  it("is bounded by line count: a full queue drops new lines and counts them", async () => {
    const s = new FakeStream();
    s.full = true;
    const q = new LineQueue(s, { lines: 5, bytes: 1e6 });
    for (let i = 0; i < 20; i++) q.push(`l${i}`);
    await tick();
    const st = q.stats();
    expect(st.queued).toBeLessThanOrEqual(5);
    expect(st.dropped).toBeGreaterThan(0);
    expect(st.queued + st.dropped + s.written.length).toBe(20);
  });

  it("is bounded by bytes as well as lines", async () => {
    const s = new FakeStream();
    s.full = true;
    const q = new LineQueue(s, { lines: 1000, bytes: 100 });
    for (let i = 0; i < 20; i++) q.push("x".repeat(30));
    await tick();
    expect(q.stats().bytes).toBeLessThanOrEqual(100);
    expect(q.stats().dropped).toBeGreaterThan(0);
  });

  it("after recovering, reports the loss once, in order, and keeps retained lines contiguous", async () => {
    const s = new FakeStream();
    s.full = true;
    const q = new LineQueue(s, { lines: 3, bytes: 1e6 });
    for (let i = 0; i < 10; i++) q.push(`l${i}`);
    s.release();
    await q.flush(1000);
    q.push("after");
    await q.flush(1000);
    const out = lines(s);
    // l0 went straight to the stream, l1..l3 were queued, l4..l9 dropped
    expect(out.slice(0, 4)).toEqual(["l0", "l1", "l2", "l3"]);
    const report = out.find((l) => l.includes('"log.dropped"'));
    expect(report).toBeDefined();
    expect(JSON.parse(report!)).toMatchObject({ event: "log.dropped", outcome: "error", reason: "output_backpressure", lost: 6 });
    expect(out.filter((l) => l.includes('"log.dropped"'))).toHaveLength(1);
    expect(out.indexOf(report!)).toBeLessThan(out.indexOf("after"));
    // exactly where the gap was: after every kept line from before it, before anything later
    expect(out.map((l) => (l.includes('"log.dropped"') ? "GAP" : l))).toEqual(["l0", "l1", "l2", "l3", "GAP", "after"]);
    expect(q.stats().dropped).toBe(0);
  });

  it("two separate episodes of loss are reported separately, each in its own place", async () => {
    const s = new FakeStream();
    const q = new LineQueue(s, { lines: 2, bytes: 1e6 });
    s.full = true;
    for (const l of ["a1", "a2", "a3", "a4", "a5"]) q.push(l); // a1 in flight, a2 a3 kept, a4 a5 lost
    s.release();
    await q.flush(1000);
    s.full = true;
    for (const l of ["b1", "b2", "b3", "b4"]) q.push(l); // b1 in flight, b2 b3 kept, b4 lost
    s.release();
    await q.flush(1000);
    const out = lines(s).map((l) => (l.includes('"log.dropped"') ? `GAP${JSON.parse(l).lost}` : l));
    expect(out).toEqual(["a1", "a2", "a3", "GAP2", "b1", "b2", "b3", "GAP1"]);
  });

  it("a stream error stops output for good: later lines are counted, never retried, nothing throws", async () => {
    const s = new FakeStream();
    const q = new LineQueue(s);
    s.failNext = new Error("EPIPE");
    q.push("first");
    await tick();
    expect(q.stats().dead).toBe(true);
    const before = s.written.length;
    expect(() => q.push("second")).not.toThrow();
    await tick();
    expect(s.written.length).toBe(before);
    expect(q.stats().dropped).toBeGreaterThanOrEqual(1);
    await expect(q.flush(50)).resolves.toBe(true); // a dead stream has nothing left to wait for
  });

  it("an 'error' event, a 'close' event, or a throwing write() all stop output without propagating", async () => {
    for (const kill of ["error", "close", "throw"] as const) {
      const s = new FakeStream();
      const q = new LineQueue(s);
      if (kill === "throw") s.throwOnWrite = true;
      else s.emit(kill, new Error("gone"));
      expect(() => q.push("x")).not.toThrow();
      await tick();
      expect(q.stats().dead).toBe(true);
    }
  });

  it("flush is bounded: it resolves false after the timeout if the stream never drains", async () => {
    const s = new FakeStream();
    s.full = true;
    const q = new LineQueue(s);
    q.push("a");
    q.push("b");
    const t0 = Date.now();
    await expect(q.flush(100)).resolves.toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
