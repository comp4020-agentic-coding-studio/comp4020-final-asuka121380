import { randomUUID } from "node:crypto";
import type { Command, CommandEnvelope, CommandResult, Snapshot } from "../domain/commands.ts";
import { rotatedPlacement, validateCommand, type BuildState, type PlacedPart } from "../domain/rules.ts";
import { STREET_SCENE } from "../domain/scene.ts";
import { transaction, type Db } from "./db.ts";
import { emitRoomEvent } from "./realtime.ts";
import { defaultRoomFor, findRoom, isActiveMember, snapshotOf, type RoomRow } from "./rooms.ts";

// The authoritative command path. Every durable change is: find the room's
// build, check the command against the shared rules, then write the part,
// stock, revision and (new, ADR 0008) per-part version in one transaction.
// The client's view of stock, validity or identity is never trusted.
//
// ADR 0007: a build now belongs to a room with possibly several members, not
// one visitor. ADR 0008: `place` is checked against live state only, never
// gated on the room's whole revision; `remove`/`recolour`/`rotate` are gated
// on the targeted part's own revision when the client supplies one.

const scene = STREET_SCENE;
const now = (): string => new Date().toISOString();

/**
 * For the homepage: does this browser already have a build, and how big is
 * it? Read-only. Unlike `buildFor` it never creates a visitor or a room, so
 * looking at the homepage writes nothing (ADR 0004).
 */
export function summaryFor(db: Db, findVisitorId: () => string | null): { hasBuild: boolean; parts: number } {
  const visitorId = findVisitorId();
  if (!visitorId) return { hasBuild: false, parts: 0 };
  const row = db.prepare("SELECT id FROM rooms WHERE host_id = ? AND is_default = 1").get(visitorId) as { id: string } | undefined;
  if (!row) return { hasBuild: false, parts: 0 };
  const { n } = db.prepare("SELECT count(*) AS n FROM parts WHERE build_id = ?").get(row.id) as { n: number };
  return { hasBuild: true, parts: n };
}

/** The visitor's default solo room, started with the whole kit on first visit. Never replaces an existing one. */
export function buildFor(db: Db, visitorId: string): Snapshot {
  return snapshotOf(db, defaultRoomFor(db, visitorId));
}

export function roomSnapshot(db: Db, roomId: string): Snapshot | undefined {
  const room = findRoom(db, roomId);
  return room && snapshotOf(db, room);
}

// ---- input checking --------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 100): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePlacement(p: Record<string, unknown>): { partId: string; colour: string; x: number; y: number; z: number; rot: 0 } | null {
  if (!isStr(p.partId) || !isStr(p.colour) || ![p.x, p.y, p.z, p.rot].every(isNum)) return null;
  return { partId: p.partId, colour: p.colour, x: p.x as number, y: p.y as number, z: p.z as number, rot: p.rot as 0 };
}

/** The envelope's shape only; the rules decide whether it's allowed. */
export function parseEnvelope(body: unknown): CommandEnvelope | null {
  if (!isObj(body) || !isStr(body.commandId, 64) || !Number.isInteger(body.expectedRevision) || !isObj(body.command)) return null;
  const c = body.command;
  const rev = isNum(c.expectedRev) ? (c.expectedRev as number) : undefined;
  let command: Command;
  if (c.type === "place" && isObj(c.placement)) {
    const p = parsePlacement(c.placement);
    if (!p) return null;
    command = { type: "place", placement: p };
  } else if (c.type === "remove" && isStr(c.placedId)) {
    command = { type: "remove", placedId: c.placedId, expectedRev: rev };
  } else if (c.type === "recolour" && isStr(c.placedId) && isStr(c.colour)) {
    command = { type: "recolour", placedId: c.placedId, colour: c.colour, expectedRev: rev };
  } else if (c.type === "rotate" && isStr(c.placedId) && typeof c.rot === "number") {
    command = { type: "rotate", placedId: c.placedId, rot: c.rot as 0, expectedRev: rev };
  } else if (c.type === "propose-plan" && isObj(c.plan)) {
    const p = parsePlacement(c.plan);
    if (!p) return null;
    command = { type: "propose-plan", plan: p };
  } else if (c.type === "withdraw-plan" && isStr(c.planId)) {
    command = { type: "withdraw-plan", planId: c.planId };
  } else if (c.type === "realize-plan" && isStr(c.planId)) {
    command = { type: "realize-plan", planId: c.planId };
  } else {
    return null;
  }
  return { commandId: body.commandId, expectedRevision: body.expectedRevision as number, command };
}

// ---- the command path ------------------------------------------------------

export interface Outcome {
  result: CommandResult;
  roomId?: string;
  /** For the action log: what happened, without anything private. */
  outcome: "applied" | "duplicate" | "rejected" | "conflict" | "no-build" | "forbidden";
}

/** True once this visitor has ever placed a real part in this room (ADR 0009: distinct from mere membership). */
function recordContributor(db: Db, roomId: string, visitorId: string): void {
  db.prepare("INSERT OR IGNORE INTO room_contributors (room_id, visitor_id, first_contribution_at) VALUES (?, ?, ?)").run(roomId, visitorId, now());
}

function logActivity(db: Db, roomId: string, actorId: string, action: string, objectId: string | null, revision: number): void {
  db.prepare("INSERT INTO room_activity (room_id, actor_id, action, object_id, revision, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    roomId,
    actorId,
    action,
    objectId,
    revision,
    now(),
  );
}

export function runCommand(db: Db, visitorId: string, roomId: string, envelope: CommandEnvelope): Outcome {
  return transaction(db, (): Outcome => {
    const room = findRoom(db, roomId);
    if (!room) {
      return { outcome: "no-build", result: { ok: false, code: "not_found", message: "There's no room to change; reload the page." } };
    }
    // `isActiveMember`, not a bare room_members row check: a visitor who
    // left, disconnected past the grace period, or was capacity-refused a
    // rejoin after being replaced, has historical membership but no longer
    // holds a live slot — and must not be able to mutate the room by
    // sending a command directly, even though the UI itself would never
    // offer them the controls (found by an independent review: B correctly
    // got 409 room_full rejoining, but could still place a part by posting
    // the command straight to the API).
    if (!isActiveMember(db, roomId, visitorId)) {
      return { outcome: "forbidden", roomId, result: { ok: false, code: "bad_request", message: "You're not currently admitted to this room; rejoin to continue." } };
    }

    // a retry of a command that already committed: report the current state, change nothing
    const seen = db.prepare("SELECT 1 FROM commands WHERE build_id = ? AND command_id = ?").get(room.id, envelope.commandId);
    if (seen) return { outcome: "duplicate", roomId, result: { ok: true, snapshot: snapshotOf(db, room) } };

    const snapshot = snapshotOf(db, room);
    const state: BuildState = snapshot;
    const { command } = envelope;
    const rejection = validateCommand(scene, state, command);
    if (rejection) {
      const conflict = rejection.code === "part_conflict";
      return {
        outcome: conflict ? "conflict" : "rejected",
        roomId,
        result: { ok: false, code: rejection.code, message: rejection.message, snapshot },
      };
    }

    const t = now();
    let objectId: string | null = null;
    let action = command.type;
    if (command.type === "place") {
      const p = command.placement;
      const id = randomUUID();
      objectId = id;
      db.prepare(
        "INSERT INTO parts (id, build_id, part_id, x, y, z, rot, colour, placed_by, rev, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
      ).run(id, room.id, p.partId, p.x, p.y, p.z, p.rot, p.colour, visitorId, t);
      db.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE build_id = ? AND part_id = ?").run(room.id, p.partId);
      recordContributor(db, room.id, visitorId);
    } else if (command.type === "remove") {
      const part = state.parts.find((p) => p.id === command.placedId)!;
      objectId = part.id;
      db.prepare("DELETE FROM parts WHERE id = ? AND build_id = ?").run(part.id, room.id);
      db.prepare("UPDATE inventory SET quantity = quantity + 1 WHERE build_id = ? AND part_id = ?").run(room.id, part.partId);
    } else if (command.type === "recolour") {
      objectId = command.placedId;
      db.prepare("UPDATE parts SET colour = ?, edited_by = ?, edited_at = ?, rev = rev + 1 WHERE id = ? AND build_id = ?").run(
        command.colour,
        visitorId,
        t,
        command.placedId,
        room.id,
      );
    } else if (command.type === "rotate") {
      objectId = command.placedId;
      const turned = rotatedPlacement(state.parts.find((p) => p.id === command.placedId)!, command.rot);
      db.prepare("UPDATE parts SET x = ?, z = ?, rot = ?, edited_by = ?, edited_at = ?, rev = rev + 1 WHERE id = ? AND build_id = ?").run(
        turned.x,
        turned.z,
        turned.rot,
        visitorId,
        t,
        turned.id,
        room.id,
      );
    } else if (command.type === "propose-plan") {
      const p = command.plan;
      const id = randomUUID();
      objectId = id;
      db.prepare(
        "INSERT INTO plans (id, room_id, part_id, x, y, z, rot, colour, proposed_by, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
      ).run(id, room.id, p.partId, p.x, p.y, p.z, p.rot, p.colour, visitorId, t);
    } else if (command.type === "withdraw-plan") {
      objectId = command.planId;
      db.prepare("UPDATE plans SET status = 'withdrawn' WHERE id = ? AND room_id = ?").run(command.planId, room.id);
    } else {
      // realize-plan
      const plan = state.plans!.find((p) => p.id === command.planId)!;
      const id = randomUUID();
      objectId = id;
      action = "realize-plan";
      db.prepare(
        "INSERT INTO parts (id, build_id, part_id, x, y, z, rot, colour, placed_by, proposed_by, rev, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
      ).run(id, room.id, plan.partId, plan.x, plan.y, plan.z, plan.rot, plan.colour, visitorId, plan.proposedBy, t);
      db.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE build_id = ? AND part_id = ?").run(room.id, plan.partId);
      db.prepare("UPDATE plans SET status = 'realized', realized_part_id = ? WHERE id = ? AND room_id = ?").run(id, plan.id, room.id);
      recordContributor(db, room.id, visitorId);
    }

    const revision = room.revision + 1;
    db.prepare("UPDATE builds SET revision = ?, updated_at = ? WHERE id = ?").run(revision, t, room.id);
    db.prepare("INSERT INTO commands (build_id, command_id, type, revision, created_at) VALUES (?, ?, ?, ?, ?)").run(
      room.id,
      envelope.commandId,
      command.type,
      revision,
      t,
    );
    logActivity(db, room.id, visitorId, action, objectId, revision);

    const after = snapshotOf(db, { ...room, revision });
    emitRoomEvent(room.id, { type: "snapshot", snapshot: after });
    return { outcome: "applied", roomId: room.id, result: { ok: true, snapshot: after } };
  });
}

export { findRoom, type RoomRow };
