import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Structured server logs (ADR 0013): one JSON line per event on stdout,
// which Fly collects (`flyctl logs`). This is the diagnostic channel for
// "who did what"; it is not room history (that is `room_activity`) and is
// never shown to players.
//
// Every line goes through `format`, which writes only the allowlisted keys
// of `Fields`, each through a validator for its kind. Nothing here takes a
// request, a body, headers, a cookie, an error object, an error message or
// a stack. Values that come from the client (route params, command ids) are
// logged only if they have the shape of a server-issued UUID; anything else
// becomes the fixed placeholder "unrecognised".

export type Outcome =
  | "changed" // a state change was committed (emitted only after its transaction)
  | "ok" // succeeded without persisting anything (a broadcast, a connection, a credential check)
  | "unchanged" // succeeded as a no-op (already admitted, already gone)
  | "duplicate" // a retried command whose first delivery already committed
  | "rejected" // a construction or domain rule refused it, or its object doesn't exist
  | "conflict" // a stale edit of a part someone else changed first
  | "denied" // authorization or admission refused it
  | "invalid" // the request itself was malformed
  | "limited" // rate limited or cooling down
  | "error"; // unexpected server failure

export interface Fields {
  event: string;
  outcome?: Outcome;
  /** Precise internal reason; may be more specific than the public error code. */
  reason?: string;
  /** Short pseudonymous visitor label (first 8 hex of the server-resolved visitor id); readable, not guaranteed unique. */
  actor?: string;
  /** The original builder of a real part, or the proposer of a plan, read from server state. */
  author?: string;
  /** The other visitor in an invitation, friend request, sign-in or recovery. */
  peer?: string;
  room?: string;
  /** The object acted on: a part, plan, snapshot, invitation, friend request or publication id. */
  target?: string;
  /** The snapshot a copy or a continued room came from. */
  source?: string;
  /** Command type, for `command` events. */
  type?: string;
  part?: string;
  /** "x,y,z,rot" of a construction position. */
  at?: string;
  colour?: string;
  /** Authoritative room revision after a committed command; for a duplicate, the revision its first delivery committed. */
  rev?: number;
  /** Command correlation (`commandRef`): the client's UUID command id, or a hash of any other id. */
  cmd?: string;
  visibility?: "public" | "invite_only";
  /** SSE: live connections this visitor has in this room after the event. */
  open?: number;
  /** HTTP status sent, for `http.*` events. */
  status?: number;
  method?: string;
  /** A known Express route template (or a coarse prefix), never the original URL or query. */
  route?: string;
  /** Safe error classification. */
  kind?: string;
  /** An unexpected error's class name (e.g. TypeError), never its message. */
  error?: string;
  /** An unexpected error's Node/SQLite error code, when it has one. */
  errcode?: string;
  /** Up to three of the app's own stack frames, as "src/…/file.ts:line", never the message line. */
  where?: string;
  ms?: number;
  port?: number;
  /** Server-generated per HTTP request (also sent as X-Request-Id); absent on background events. */
  req?: string;
  /** `log.dropped` only: how many lines were dropped since the last report. */
  lost?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-z0-9_-]{1,40}$/;
const LABEL = /^[0-9a-f]{8}$/;

/** A visitor label: the first 8 hex characters of a server-resolved visitor UUID. */
export const label = (visitorId: string | null | undefined): string | undefined =>
  visitorId && UUID.test(visitorId) ? visitorId.slice(0, 8).toLowerCase() : undefined;

/** A full id if it is UUID-shaped; any other string becomes "unrecognised". */
export const safeId = (id: unknown): string | undefined =>
  typeof id === "string" ? (UUID.test(id) ? id.toLowerCase() : "unrecognised") : undefined;

/**
 * Correlation for a client-supplied command id. Our client sends a UUID,
 * logged as is; any other string is never logged, but its SHA-256 (first 16
 * hex) is, so a retry of the same id can still be matched to its first try.
 */
export const commandRef = (id: unknown): string | undefined => {
  if (typeof id !== "string") return undefined;
  if (UUID.test(id)) return id.toLowerCase();
  return `h-${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
};

/** A value from a known set, else "unrecognised" (for client-chosen names such as a command type). */
export const known = (value: unknown, allowed: ReadonlySet<string>): string | undefined =>
  typeof value === "string" ? (allowed.has(value) ? value : "unrecognised") : undefined;

const token = (v: unknown): string | undefined => (typeof v === "string" && TOKEN.test(v) ? v : undefined);
const visitorLabel = (v: unknown): string | undefined => (typeof v === "string" && LABEL.test(v) ? v : undefined);
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && Math.abs(v) < 1e9 ? v : undefined);
const pattern =
  (re: RegExp) =>
  (v: unknown): string | undefined =>
    typeof v === "string" && re.test(v) ? v : undefined;

// The order of this table is the order of keys in every line.
const VALIDATE: { [K in keyof Fields]-?: (v: unknown) => unknown } = {
  event: (v) => (typeof v === "string" && /^[a-z]+(\.[a-z_]+)*$/.test(v) ? v : "unknown"),
  outcome: token,
  reason: token,
  actor: visitorLabel,
  author: visitorLabel,
  peer: visitorLabel,
  room: safeId,
  target: safeId,
  source: safeId,
  type: token,
  part: token,
  at: pattern(/^-?\d{1,4}(,-?\d{1,4}){3}$/),
  colour: token,
  rev: int,
  cmd: (v) => (typeof v === "string" && (UUID.test(v) || /^h-[0-9a-f]{16}$/.test(v)) ? v.toLowerCase() : undefined),
  visibility: (v) => (v === "public" || v === "invite_only" ? v : undefined),
  open: int,
  status: int,
  method: pattern(/^[A-Z]{3,7}$/),
  route: pattern(/^\/[A-Za-z0-9/:_.*-]{0,80}$/),
  kind: token,
  error: pattern(/^[A-Z][A-Za-z]{0,39}$/),
  errcode: pattern(/^[A-Z][A-Z0-9_]{1,39}$/),
  where: pattern(/^src\/[a-z/]+\.tsx?:\d{1,5}(,src\/[a-z/]+\.tsx?:\d{1,5}){0,2}$/),
  ms: int,
  port: int,
  req: (v) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : undefined),
  lost: int,
};

/** The exact line `emit` writes: allowlisted, validated fields only. Exported for tests. */
export function format(fields: Fields, at: Date = new Date()): string {
  const out: Record<string, unknown> = { t: at.toISOString() };
  for (const key of Object.keys(VALIDATE) as (keyof Fields)[]) {
    if (!(key in fields)) continue;
    const value = VALIDATE[key](fields[key]);
    if (value !== undefined) out[key] = value;
  }
  return JSON.stringify(out);
}

// ---- output: a bounded queue in front of stdout (ADR 0013, corrected 20 Oct 2026) ----
//
// Lines are never written synchronously. An earlier version used
// fs.writeSync so a crash line couldn't be lost on exit, but stdout's pipe
// fd is in blocking mode here, so with the pipe unread (a stalled log
// shipper) writeSync blocked the whole server in the kernel: no requests, no
// timers, and no shutdown, until SIGKILL.
//
// Now each line goes into an in-memory queue, and the queue is written to the
// stream one line at a time, waiting for 'drain' whenever write() says the
// stream is full. The event loop never blocks on logging. Retained lines keep
// their order. The queue is bounded: past MAX_LINES lines or MAX_BYTES bytes,
// a new line is dropped (older queued lines are kept, so what survives is
// contiguous) and counted, and a single `log.dropped` line is written in the
// gap's place, saying how many were lost. If the stream errors or
// closes, writing stops for good and further lines are counted, never
// retried, and never logged about. Under severe output failure, then, some
// diagnostic lines are lost; that is the deliberate trade-off for never
// stalling the server.

/** The part of a Writable the queue uses, so a test can stand in a fake stream. */
export interface LineStream {
  write(chunk: string, cb?: (err?: Error | null) => void): boolean;
  once(event: "drain" | "close", listener: (...args: unknown[]) => void): unknown;
  on(event: "error", listener: (...args: unknown[]) => void): unknown;
}

export const MAX_LINES = 1000;
export const MAX_BYTES = 1024 * 1024;

/** Where lines were dropped: written in their place, as one `log.dropped` line, when the stream gets that far. */
interface Gap {
  lost: number;
}

export class LineQueue {
  private queue: (string | Gap)[] = [];
  private lines = 0;
  private bytes = 0;
  private writing = false;
  private waitingForDrain = false;
  private dead = false;
  private lostWhileDead = 0;
  private flushWaiters: (() => void)[] = [];
  private readonly out: LineStream;
  private readonly limits: { lines: number; bytes: number };

  constructor(out: LineStream, limits = { lines: MAX_LINES, bytes: MAX_BYTES }) {
    this.out = out;
    this.limits = limits;
    // a persistent listener: an unhandled 'error' on stdout (EPIPE) would otherwise be an uncaught exception
    out.on("error", () => this.die());
    out.once("close", () => this.die());
  }

  /** Queues one line. Never throws, never blocks. */
  push(line: string): void {
    if (this.dead) {
      this.lostWhileDead++;
      return;
    }
    const size = Buffer.byteLength(line) + 1;
    if (this.lines >= this.limits.lines || this.bytes + size > this.limits.bytes) {
      // Mark the gap where it happened, so the report lands after every line
      // kept from before it and before every line accepted after it. A gap
      // costs one small object, however many lines it stands for.
      const last = this.queue[this.queue.length - 1];
      if (typeof last === "object") last.lost++;
      else this.queue.push({ lost: 1 });
      return;
    }
    this.queue.push(line);
    this.lines++;
    this.bytes += size;
    this.pump();
  }

  /** Queued lines and bytes, lines dropped and not yet reported, and whether output has failed. */
  stats(): { queued: number; bytes: number; dropped: number; dead: boolean } {
    const pending = this.queue.reduce((n, item) => n + (typeof item === "object" ? item.lost : 0), 0);
    return { queued: this.lines, bytes: this.bytes, dropped: pending + this.lostWhileDead, dead: this.dead };
  }

  /** Resolves when everything queued has been handed to the stream, or after `ms`, whichever is first. Never rejects. */
  flush(ms: number): Promise<boolean> {
    if (this.idle()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      timer.unref?.();
      this.flushWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  private idle(): boolean {
    return this.dead || (this.queue.length === 0 && !this.writing);
  }

  private pump(): void {
    if (this.writing || this.waitingForDrain || this.dead) return;
    const item = this.queue.shift();
    if (item === undefined) {
      this.settle();
      return;
    }
    let line: string;
    if (typeof item === "object") {
      line = format({ event: "log.dropped", outcome: "error", reason: "output_backpressure", lost: item.lost });
    } else {
      line = item;
      this.lines--;
      this.bytes -= Buffer.byteLength(item) + 1;
    }
    this.writing = true;
    let ok: boolean;
    try {
      ok = this.out.write(`${line}\n`, (err) => {
        this.writing = false;
        if (err) this.die();
        else this.pump();
      });
    } catch {
      this.writing = false;
      this.die();
      return;
    }
    if (!ok && !this.dead) {
      this.waitingForDrain = true;
      this.out.once("drain", () => {
        this.waitingForDrain = false;
        this.pump();
      });
    }
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.lostWhileDead += this.queue.reduce((n, item) => n + (typeof item === "object" ? item.lost : 1), 0);
    this.queue = [];
    this.lines = 0;
    this.bytes = 0;
    this.writing = false;
    this.settle();
  }

  private settle(): void {
    if (!this.idle()) return;
    const waiters = this.flushWaiters;
    this.flushWaiters = [];
    for (const w of waiters) w();
  }
}

let output: LineQueue | null = null;
const stdoutQueue = (): LineQueue => (output ??= new LineQueue(process.stdout));

let sink: (line: string) => void = (line) => stdoutQueue().push(line);

/** Queues one event line. Never throws and never blocks, so logging can't fail or stall the request it describes. */
export function emit(fields: Fields): void {
  try {
    sink(format(fields));
  } catch {
    // never let logging turn a committed operation into a failed response
  }
}

/** Best-effort, bounded: resolves once queued lines are handed to stdout, or after `ms`. For use just before exiting. */
export function flushLogs(ms: number): Promise<boolean> {
  return output ? output.flush(ms) : Promise.resolve(true);
}

/** Test seam: capture lines instead of writing them. Returns a restore function. */
export function captureLogs(into: string[]): () => void {
  const prev = sink;
  sink = (line) => into.push(line);
  return () => {
    sink = prev;
  };
}

export const newRequestId = (): string => randomUUID();

/**
 * How an error reaching the error handler is reported: its HTTP status and
 * a fixed kind. Body-parser's own error types are recognised so a malformed
 * body stays a 400 and an oversized one a 413, as before. Never reads the
 * error's message.
 */
export function classifyError(err: unknown): { status: number; kind: string } {
  const e = (typeof err === "object" && err !== null ? err : {}) as { type?: unknown; status?: unknown; statusCode?: unknown };
  const type = typeof e.type === "string" ? e.type : "";
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : 500;
  if (type === "entity.parse.failed") return { status: 400, kind: "malformed_json" };
  if (type === "entity.too.large") return { status: 413, kind: "body_too_large" };
  if (type === "encoding.unsupported" || type === "charset.unsupported") return { status: 415, kind: "unsupported_encoding" };
  if (type === "request.aborted") return { status: 400, kind: "request_aborted" };
  if (type === "request.size.invalid" || type === "stream.encoding.set" || type === "stream.not.readable") return { status: 400, kind: "bad_body" };
  if (status >= 400 && status < 500) return { status, kind: "client_error" };
  return { status: 500, kind: "internal" };
}

const ROOT = process.cwd();

/** A stack frame's location as a repo-relative path, or null if it isn't one of this app's own source files. */
function ownFrame(location: string): string | null {
  let path = location;
  if (path.startsWith("file://")) {
    try {
      path = fileURLToPath(path);
    } catch {
      return null;
    }
  }
  if (!path.startsWith(`${ROOT}/`)) return null;
  const rel = path.slice(ROOT.length + 1);
  return /^src\/[a-z/]+\.tsx?$/.test(rel) ? rel : null;
}

/**
 * For an unexpected error: its class name, its error code, and up to three
 * of the app's own stack frames as file:line. Each stack line is matched
 * against a strict frame pattern pointing into this repo's `src/`, so the
 * message line (which can carry user input) and anything else is dropped.
 */
export function describeError(err: unknown): Pick<Fields, "error" | "errcode" | "where"> {
  if (typeof err !== "object" || err === null) return {};
  const e = err as { name?: unknown; code?: unknown; stack?: unknown; constructor?: { name?: unknown } };
  const name = typeof e.constructor?.name === "string" ? e.constructor.name : undefined;
  const code = typeof e.code === "string" ? e.code : undefined;
  const frames: string[] = [];
  if (typeof e.stack === "string") {
    for (const line of e.stack.split("\n")) {
      const m = /^\s+at (?:.*? \()?(\S+?):(\d+):\d+\)?$/.exec(line);
      if (!m) continue;
      const path = ownFrame(m[1]);
      if (path) frames.push(`${path}:${m[2]}`);
      if (frames.length === 3) break;
    }
  }
  return { error: name, errcode: code, where: frames.length ? frames.join(",") : undefined };
}
