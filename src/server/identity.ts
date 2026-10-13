import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db } from "./db.ts";

// A visitor is still a browser cookie by default (ADR 0001/0003), but one
// visitor may now hold several valid sessions (one per linked browser), so
// that redeeming a recovery code on a second device never signs the first
// one out. `sessions.token_hash` is the authoritative lookup; `visitors`
// holds no token of its own. ADR 0006 adds the opt-in, single-use recovery
// code itself: generated on request, stored only as a hash, rate-limited,
// and never shown anywhere a friend link or a log would carry it.

const hash = (token: string): string => createHash("sha256").update(token).digest("hex");
const now = (): string => new Date().toISOString();

export interface Visitor {
  id: string;
  /** Set only when a new visitor was created: the cookie value to hand back. */
  newToken?: string;
}

function findBySession(db: Db, token: string): string | null {
  const row = db.prepare("SELECT visitor_id FROM sessions WHERE token_hash = ?").get(hash(token)) as { visitor_id: string } | undefined;
  return row?.visitor_id ?? null;
}

export function visitorFor(db: Db, token: string | undefined): Visitor {
  if (token) {
    const id = findBySession(db, token);
    if (id) return { id };
  }
  const newToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const t = now();
  db.prepare("INSERT INTO visitors (id, token_hash, created_at) VALUES (?, ?, ?)").run(id, hash(newToken), t);
  db.prepare("INSERT INTO sessions (token_hash, visitor_id, created_at) VALUES (?, ?, ?)").run(hash(newToken), id, t);
  return { id, newToken };
}

export function findVisitor(db: Db, token: string | undefined): string | null {
  return token ? findBySession(db, token) : null;
}

/** A fresh session for an *existing* visitor id (ADR 0006 recovery), leaving any of their other sessions intact. */
export function createSession(db: Db, visitorId: string): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, visitor_id, created_at) VALUES (?, ?, ?)").run(hash(token), visitorId, now());
  return token;
}

/** Deletes exactly one session row: clean, server-side invalidation on sign-out, not only clearing the client's cookie. */
export function deleteSession(db: Db, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}

// ---- recovery codes (ADR 0006) ---------------------------------------------

/** Grouped base32 for a person to type back: no 0/1/O/I, 20 bytes of entropy. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomCode(): string {
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i % 4 === 3 && i !== bytes.length - 1) out += "-";
  }
  return out;
}

/** Generates a new single-use code for this visitor. Only its hash is stored. */
export function createRecoveryCode(db: Db, visitorId: string): string {
  const code = randomCode();
  db.prepare("INSERT INTO recovery_codes (visitor_id, code_hash, created_at) VALUES (?, ?, ?)").run(visitorId, hash(code), now());
  return code;
}

// A small per-source-IP brake, in the same style as index.ts's command
// throttle: the course's infrastructure is one machine with no separate
// store, so in-process is the only option, and that's enough for this scale.
const attempts = new Map<string, number[]>();
export function recoveryRateLimited(sourceIp: string): boolean {
  const t = Date.now();
  const times = (attempts.get(sourceIp) ?? []).filter((x) => t - x < 60_000);
  times.push(t);
  attempts.set(sourceIp, times);
  return times.length > 10;
}

/**
 * Redeems a single-use recovery code: deletes it (so it can never be reused)
 * and returns the visitor id it belonged to, or null for a wrong or
 * already-spent code. The caller issues that visitor a fresh cookie, exactly
 * like `visitorFor` would for an existing visitor.
 */
export function redeemRecoveryCode(db: Db, code: string): string | null {
  const h = hash(code.trim().toLowerCase());
  const row = db.prepare("SELECT visitor_id FROM recovery_codes WHERE code_hash = ?").get(h) as { visitor_id: string } | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM recovery_codes WHERE code_hash = ?").run(h);
  return row.visitor_id;
}
