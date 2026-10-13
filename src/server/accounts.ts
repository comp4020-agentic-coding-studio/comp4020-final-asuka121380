import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createSession, deleteSession, type Visitor } from "./identity.ts";
import { transaction, type Db } from "./db.ts";

// Explicit accounts (phase 2 corrective review, author-approved scope
// change), layered OVER the existing cookie/visitor model rather than
// replacing it: an account is a durable username + display name + password,
// pointing at exactly one "primary" visitor row (accounts.ts never creates a
// second identity for the same account — see the unique index in db.ts's
// migration 4). Every room, friendship, contributor record and snapshot
// keeps using visitor_id exactly as before; accounts only add a way to
// reliably get back to the same visitor_id from a different browser.
//
// Password hashing: Node's own `scrypt`, not a hand-rolled algorithm. A
// fresh random salt per account; the stored hash is never comparable by
// plain `===` (timing-safe compare only). No plaintext password, hash or
// recovery code is ever logged, returned in a response body beyond the
// immediate action's own result, or put in a URL.

const SCRYPT_KEYLEN = 64;
const now = (): string => new Date().toISOString();

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN);
}

export interface Account {
  id: string;
  username: string;
  displayName: string;
}

function accountRow(db: Db, id: string): { id: string; username: string; display_name: string } | undefined {
  return db.prepare("SELECT id, username, display_name FROM accounts WHERE id = ?").get(id) as
    | { id: string; username: string; display_name: string }
    | undefined;
}

export function accountOf(db: Db, id: string): Account | undefined {
  const row = accountRow(db, id);
  return row && { id: row.id, username: row.username, displayName: row.display_name };
}

/** The account a visitor is linked to, if any — never created implicitly; only `register`/`signIn` set `visitors.account_id`. */
export function accountForVisitor(db: Db, visitorId: string): Account | undefined {
  const row = db.prepare("SELECT account_id FROM visitors WHERE id = ?").get(visitorId) as { account_id: string | null } | undefined;
  return row?.account_id ? accountOf(db, row.account_id) : undefined;
}

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,23}$/i;

export type RegisterOutcome =
  | { ok: true; account: Account }
  | { ok: false; code: "username_taken" | "invalid_username" | "weak_password" | "already_linked" };

/**
 * Registers a brand-new account, linking it to `visitorId` as that
 * account's one and only primary visitor (migration case 1, the brief's
 * "registering a new account while using an existing anonymous identity"):
 * nothing about that visitor's existing rooms, friendships or snapshots is
 * touched — they simply become reachable by signing in from now on, in
 * addition to this browser's existing cookie.
 *
 * Refuses outright if `visitorId` is already linked to a DIFFERENT account
 * (never silently re-links or creates a second account for the same
 * browser); the caller is expected to have already handled the "this
 * browser already has an account" case before calling this.
 */
export function register(db: Db, visitorId: string, username: string, password: string, displayName: string): RegisterOutcome {
  const name = username.trim();
  if (!USERNAME_RE.test(name)) return { ok: false, code: "invalid_username" };
  if (password.length < 8) return { ok: false, code: "weak_password" };
  return transaction(db, (): RegisterOutcome => {
    const existingLink = db.prepare("SELECT account_id FROM visitors WHERE id = ?").get(visitorId) as { account_id: string | null } | undefined;
    if (existingLink?.account_id) return { ok: false, code: "already_linked" };
    const taken = db.prepare("SELECT 1 FROM accounts WHERE username = ? COLLATE NOCASE").get(name);
    if (taken) return { ok: false, code: "username_taken" };
    const id = randomUUID();
    const salt = randomBytes(16);
    const hash = hashPassword(password, salt);
    const t = now();
    const trimmedDisplay = displayName.trim().slice(0, 40) || name;
    db.prepare("INSERT INTO accounts (id, username, display_name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      name,
      trimmedDisplay,
      hash.toString("hex"),
      salt.toString("hex"),
      t,
    );
    db.prepare("UPDATE visitors SET account_id = ? WHERE id = ?").run(id, visitorId);
    return { ok: true, account: { id, username: name, displayName: trimmedDisplay } };
  });
}

export type VerifyOutcome = { ok: true; account: Account; visitorId: string } | { ok: false; code: "invalid_credentials" };

/**
 * Checks a username/password and, if correct, names the account's one
 * primary visitor — but creates NO session and sets NO cookie. Signing in
 * is a two-step action precisely because of the migration-conflict case
 * (brief: "obtain a decision where necessary" before switching a browser
 * away from an anonymous identity with its own work): the caller checks
 * this result, and separately whether the CURRENT browser's own anonymous
 * visitor has work of its own, before ever calling `confirmSignIn` to
 * actually issue the new session. Errors are deliberately non-enumerating:
 * a wrong username and a right username with a wrong password return the
 * identical outcome, so a caller can't learn which usernames exist by
 * probing.
 */
export function verifyCredentials(db: Db, username: string, password: string): VerifyOutcome {
  const row = db
    .prepare("SELECT id, username, display_name, password_hash, password_salt FROM accounts WHERE username = ? COLLATE NOCASE")
    .get(username.trim()) as { id: string; username: string; display_name: string; password_hash: string; password_salt: string } | undefined;
  if (!row) return { ok: false, code: "invalid_credentials" };
  const salt = Buffer.from(row.password_salt, "hex");
  const expected = Buffer.from(row.password_hash, "hex");
  const actual = hashPassword(password, salt);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, code: "invalid_credentials" };
  const primary = db.prepare("SELECT id FROM visitors WHERE account_id = ?").get(row.id) as { id: string } | undefined;
  if (!primary) return { ok: false, code: "invalid_credentials" }; // defensive: an account always has exactly one primary visitor once registered
  return { ok: true, account: { id: row.id, username: row.username, displayName: row.display_name }, visitorId: primary.id };
}

/** Actually issues a fresh session for `visitorId` — called only once the caller has decided to proceed (immediately, or after the conflict screen is confirmed). */
export function confirmSignIn(db: Db, visitorId: string): string {
  return createSession(db, visitorId);
}

/** Deletes one session row outright: a stolen or old cookie stops working server-side, not only client-side. */
export function signOut(db: Db, token: string): void {
  deleteSession(db, token);
}

// ---- rate limiting (same in-process, per-source-IP style as the existing
// recovery-code limiter in identity.ts — one shared-cpu-1x machine, no
// separate store) --------------------------------------------------------

const attempts = new Map<string, number[]>();
export function authRateLimited(sourceIp: string): boolean {
  const t = Date.now();
  const times = (attempts.get(sourceIp) ?? []).filter((x) => t - x < 60_000);
  times.push(t);
  attempts.set(sourceIp, times);
  return times.length > 10;
}

/**
 * Whether a different, already-signed-in-elsewhere visitor's rooms exist on
 * THIS browser's current anonymous visitor — the migration-conflict case
 * (brief: "signing into an existing account while the browser contains
 * another anonymous identity's work"). Checked before sign-in is allowed to
 * actually switch this browser's cookie, so the caller can warn first.
 */
export function visitorHasOwnWork(db: Db, visitorId: string): boolean {
  const rooms = db.prepare("SELECT 1 FROM room_members WHERE visitor_id = ? LIMIT 1").get(visitorId);
  const snaps = db.prepare("SELECT 1 FROM snapshots WHERE saved_by = ? LIMIT 1").get(visitorId);
  const friends = db.prepare("SELECT 1 FROM friendships WHERE visitor_a = ? OR visitor_b = ? LIMIT 1").get(visitorId, visitorId);
  return !!(rooms || snaps || friends);
}

/**
 * Display names for a batch of visitor ids, for every place the UI shows
 * "who": friends, invitations, room members, contributors, attribution and
 * work credits (brief: "use display names... instead of raw UUIDs"). A
 * visitor with no linked account has no name to show — the caller falls
 * back to its own short, anonymous label, never a raw UUID.
 */
export function displayNamesFor(db: Db, visitorIds: readonly string[]): Record<string, string> {
  if (visitorIds.length === 0) return {};
  const placeholders = visitorIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT v.id AS visitor_id, a.display_name FROM visitors v JOIN accounts a ON a.id = v.account_id WHERE v.id IN (${placeholders})`)
    .all(...visitorIds) as { visitor_id: string; display_name: string }[];
  return Object.fromEntries(rows.map((r) => [r.visitor_id, r.display_name]));
}

export type { Visitor };
