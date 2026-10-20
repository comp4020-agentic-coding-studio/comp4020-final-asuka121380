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

let sink: (line: string) => void = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Writes one event line. A logging failure never propagates into the request it describes. */
export function emit(fields: Fields): void {
  try {
    sink(format(fields));
  } catch {
    // never let logging turn a committed operation into a failed response
  }
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
