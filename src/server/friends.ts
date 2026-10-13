import { randomBytes, randomUUID } from "node:crypto";
import { transaction, type Db } from "./db.ts";

// ADR 0007 (friendship) supports two paths: a personal link, and a request
// from another player's entry in a shared room. A request always requires
// acceptance; opening a link never silently establishes friendship.

const now = (): string => new Date().toISOString();
const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export function areFriends(db: Db, a: string, b: string): boolean {
  const [x, y] = pairKey(a, b);
  return !!db.prepare("SELECT 1 FROM friendships WHERE visitor_a = ? AND visitor_b = ?").get(x, y);
}

export type RequestOutcome =
  | { ok: true; requestId: string }
  | { ok: false; code: "already_friends" | "pending" | "self" };

/** A request sent directly to a known visitor (from a room's member list). */
export function requestFriend(db: Db, from: string, to: string): RequestOutcome {
  if (from === to) return { ok: false, code: "self" };
  if (areFriends(db, from, to)) return { ok: false, code: "already_friends" };
  return transaction(db, (): RequestOutcome => {
    const existing = db
      .prepare("SELECT id FROM friend_requests WHERE status = 'pending' AND ((from_visitor = ? AND to_visitor = ?) OR (from_visitor = ? AND to_visitor = ?))")
      .get(from, to, to, from) as { id: string } | undefined;
    if (existing) return { ok: false, code: "pending" };
    const id = randomUUID();
    db.prepare("INSERT INTO friend_requests (id, from_visitor, to_visitor, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(id, from, to, now());
    return { ok: true, requestId: id };
  });
}

/** A personal, shareable link. Opening it never grants friendship by itself (author). */
export function createFriendLink(db: Db, from: string): string {
  const token = randomBytes(16).toString("base64url");
  const id = randomUUID();
  db.prepare("INSERT INTO friend_requests (id, from_visitor, to_visitor, token, status, created_at) VALUES (?, ?, NULL, ?, 'pending', ?)").run(
    id,
    from,
    token,
    now(),
  );
  return token;
}

export type OpenLinkOutcome =
  | { ok: true; requestId: string; fromVisitor: string }
  | { ok: false; code: "invalid" | "self" | "already_friends" };

/** Viewing a link's request (not yet acceptance): who it's from, so the UI can ask before accepting. */
export function openFriendLink(db: Db, token: string, viewer: string): OpenLinkOutcome {
  const row = db.prepare("SELECT id, from_visitor FROM friend_requests WHERE token = ? AND status = 'pending'").get(token) as
    | { id: string; from_visitor: string }
    | undefined;
  if (!row) return { ok: false, code: "invalid" };
  if (row.from_visitor === viewer) return { ok: false, code: "self" };
  if (areFriends(db, row.from_visitor, viewer)) return { ok: false, code: "already_friends" };
  // a link may be opened by several distinct people; each gets their own
  // pending request once they ask to accept, so reuse this row's id loosely
  // as "the request to act on" for this (from, viewer) pair
  return { ok: true, requestId: row.id, fromVisitor: row.from_visitor };
}

export type RespondOutcome = { ok: true; status: "accepted" | "declined" } | { ok: false; code: "not_found" | "forbidden" | "already_resolved" };

export function respondToRequest(db: Db, requestId: string, respondent: string, accept: boolean): RespondOutcome {
  return transaction(db, (): RespondOutcome => {
    const row = db.prepare("SELECT from_visitor, to_visitor, token, status FROM friend_requests WHERE id = ?").get(requestId) as
      | { from_visitor: string; to_visitor: string | null; token: string | null; status: string }
      | undefined;
    if (!row) return { ok: false, code: "not_found" };
    // a direct request names its recipient; a link request is open to whoever opens it and chooses to accept
    if (row.to_visitor && row.to_visitor !== respondent) return { ok: false, code: "forbidden" };
    if (row.status !== "pending") return { ok: false, code: "already_resolved" };
    if (!accept) {
      // a link stays open for someone else to use; a direct request is resolved
      if (row.token) return { ok: true, status: "declined" };
      db.prepare("UPDATE friend_requests SET status = 'declined' WHERE id = ?").run(requestId);
      return { ok: true, status: "declined" };
    }
    const [a, b] = pairKey(row.from_visitor, respondent);
    db.prepare("INSERT OR IGNORE INTO friendships (visitor_a, visitor_b, created_at) VALUES (?, ?, ?)").run(a, b, now());
    // a direct request is consumed; a link stays usable for other people
    if (!row.token) db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(requestId);
    return { ok: true, status: "accepted" };
  });
}

export function pendingRequestsFor(db: Db, visitorId: string): { id: string; fromVisitor: string; createdAt: string }[] {
  const rows = db
    .prepare("SELECT id, from_visitor, created_at FROM friend_requests WHERE to_visitor = ? AND status = 'pending' ORDER BY created_at")
    .all(visitorId) as { id: string; from_visitor: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, fromVisitor: r.from_visitor, createdAt: r.created_at }));
}

export function friendsOf(db: Db, visitorId: string): string[] {
  const rows = db.prepare("SELECT visitor_a, visitor_b FROM friendships WHERE visitor_a = ? OR visitor_b = ?").all(visitorId, visitorId) as {
    visitor_a: string;
    visitor_b: string;
  }[];
  return rows.map((r) => (r.visitor_a === visitorId ? r.visitor_b : r.visitor_a));
}
