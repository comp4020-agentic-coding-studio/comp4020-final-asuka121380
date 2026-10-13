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
