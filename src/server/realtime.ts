import { EventEmitter } from "node:events";
import type { Response } from "express";
import type { Snapshot } from "../domain/commands.ts";

// ADR 0008: server-sent events. One in-process emitter per room id; every
// write already goes through the one validated, transactional command path
// (builds.ts), so this module only ever pushes — it never accepts a write.
// Because the whole app is one process on one machine (ADR 0001), no
// cross-instance fan-out is needed; this is revisited if that changes.

export type RoomEvent =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "plan-marked"; planId: string; markedBy: string };

const bus = new EventEmitter();
bus.setMaxListeners(0); // many small rooms, each with up to maxPlayers listeners

export function emitRoomEvent(roomId: string, event: RoomEvent): void {
  bus.emit(roomId, event);
}

/** Subscribes `res` (an open SSE response) to a room's events until the client disconnects. */
export function subscribe(roomId: string, res: Response, initial: Snapshot): () => void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable any intermediary buffering; Fly's proxy forwards each flush
  });
  const send = (event: RoomEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  send({ type: "snapshot", snapshot: initial }); // catch-up: a reconnecting client needs no separate fetch
  const onEvent = (event: RoomEvent): void => send(event);
  bus.on(roomId, onEvent);

  // keep intermediaries (and idle-connection timeouts) from closing a quiet stream
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  return () => {
    clearInterval(heartbeat);
    bus.off(roomId, onEvent);
  };
}

// ---- session-keyed connection registry -------------------------------------
//
// Regression (independent review, 14 Oct 2026): `subscribe()` above checks
// membership once, at connect time, and then relays every event for a room
// to this response until the underlying socket physically closes. Signing
// out (or switching accounts) deletes the SESSION row, but nothing ever
// told an already-open SSE connection that its authorizing session was
// gone — so it kept streaming a private room's updates indefinitely after
// the identity that opened it had logged out elsewhere (or even in the
// very same browser, if a tab's React state didn't reload). A connection
// is keyed here by the SESSION TOKEN that opened it (never the visitor id
// alone), so revoking one session's streams never touches a different,
// still-valid session for the same visitor (ADR 0006: one visitor may hold
// several sessions) — "another valid session remains connected" must keep
// working exactly as before.

export interface LiveConnection {
  /** The hash of the session token that authorized this connection (identity.ts's `hashToken`), never the raw token itself. */
  tokenHash: string;
  roomId: string;
  visitorId: string;
  /** Tears this one connection down: clears its keep-alive, unsubscribes it from the room's events, and ends the HTTP response. */
  kill: () => void;
}

const connections = new Set<LiveConnection>();

/** Called once per opened SSE connection. The returned function deregisters it (also safe to call after `revokeSession` already did). */
export function registerConnection(conn: LiveConnection): () => void {
  connections.add(conn);
  return () => connections.delete(conn);
}

/**
 * Closes every live SSE connection that was opened under this exact session
 * token — called when that session ends (sign-out) or is superseded (an
 * account switch on the same browser) — and reports each (roomId,
 * visitorId) pair whose LAST live connection was just closed, so the
 * caller can clear that visitor's presence in that room immediately
 * (ADR 0007's 30s grace sweep would eventually do it anyway, but a stale
 * stream must not keep *renewing* active presence via its own keep-alive
 * in the meantime — killing it stops that renewal outright). A pair is
 * only reported if no OTHER connection — a different tab's session, or a
 * second device's — is still keeping that same visitor present in that
 * same room (ADR 0006: a visitor may hold several sessions at once).
 */
export function revokeSession(tokenHash: string): { roomId: string; visitorId: string }[] {
  const mine = [...connections].filter((c) => c.tokenHash === tokenHash);
  for (const c of mine) connections.delete(c);
  for (const c of mine) c.kill();
  const seen = new Set<string>();
  const cleared: { roomId: string; visitorId: string }[] = [];
  for (const c of mine) {
    const key = `${c.roomId}:${c.visitorId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stillLive = [...connections].some((o) => o.roomId === c.roomId && o.visitorId === c.visitorId);
    if (!stillLive) cleared.push({ roomId: c.roomId, visitorId: c.visitorId });
  }
  return cleared;
}

// ADR 0009: marks are transient — coalesced per plan, never persisted. A
// short per-plan cooldown is the "modest anti-spam limit" the brief asks for.
const lastMark = new Map<string, number>();
const MARK_COOLDOWN_MS = 3_000;

export function markPlan(roomId: string, planId: string, markedBy: string): boolean {
  const t = Date.now();
  const last = lastMark.get(planId) ?? 0;
  if (t - last < MARK_COOLDOWN_MS) return false;
  lastMark.set(planId, t);
  emitRoomEvent(roomId, { type: "plan-marked", planId, markedBy });
  return true;
}
