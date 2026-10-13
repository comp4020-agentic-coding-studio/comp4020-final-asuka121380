import { randomUUID } from "node:crypto";
import type { Contributor, Member, Snapshot } from "../domain/commands.ts";
import type { Plan, PlacedPart } from "../domain/rules.ts";
import { STREET_SCENE } from "../domain/scene.ts";
import { transaction, type Db } from "./db.ts";
import { emitRoomEvent } from "./realtime.ts";

// ADR 0007: a build belongs to a room, not a visitor. `rooms.id` is the same
// id as the `builds` row it owns (parts/inventory stay keyed by that id, so
// nothing about them needed to change). This module is the room lifecycle:
// creating, finding, joining, and assembling the snapshot every command path
// and every SSE connection reads.

const scene = STREET_SCENE;
const now = (): string => new Date().toISOString();

export interface RoomRow {
  id: string;
  host_id: string;
  scene_id: string;
  template_version: number;
  revision: number;
  visibility: "public" | "invite_only";
  allow_publish: number;
  is_default: number;
  label: string | null;
  source_snapshot_id: string | null;
}

function roomRow(db: Db, roomId: string): RoomRow | undefined {
  return db
    .prepare(
      `SELECT r.id, r.host_id, r.scene_id, b.template_version, b.revision, r.visibility, r.allow_publish, r.is_default, r.label, r.source_snapshot_id
       FROM rooms r JOIN builds b ON b.id = r.id WHERE r.id = ?`,
    )
    .get(roomId) as RoomRow | undefined;
}

/**
 * Brings a room's build up to the current scene version (ADR 0003's upgrade,
 * unchanged in spirit: versions only add part types, so this only inserts
 * new stock, never touches an existing part, quantity or revision).
 */
function upgrade(db: Db, room: RoomRow): RoomRow {
  if (room.template_version >= scene.version) return room;
  const add = db.prepare("INSERT OR IGNORE INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)");
  for (let v = room.template_version + 1; v <= scene.version; v++) {
    for (const [partId, quantity] of Object.entries(scene.additions[v] ?? {})) add.run(room.id, partId, quantity);
  }
  db.prepare("UPDATE builds SET template_version = ? WHERE id = ?").run(scene.version, room.id);
  return { ...room, template_version: scene.version };
}

export function findRoom(db: Db, roomId: string): RoomRow | undefined {
  const room = roomRow(db, roomId);
  return room && upgrade(db, room);
}

/** This visitor's one default (C8-style, solo, invite-only) room, created on first use. */
export function defaultRoomFor(db: Db, visitorId: string): RoomRow {
  return transaction(db, () => {
    const existing = db.prepare("SELECT id FROM rooms WHERE host_id = ? AND is_default = 1").get(visitorId) as { id: string } | undefined;
    if (existing) return findRoom(db, existing.id)!;
    const id = randomUUID();
    const t = now();
    db.prepare("INSERT INTO builds (id, visitor_id, scene_id, template_version, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)").run(
      id,
      visitorId,
      scene.id,
      scene.version,
      t,
      t,
    );
    const stock = db.prepare("INSERT INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)");
    for (const [partId, quantity] of Object.entries(scene.kit)) stock.run(id, partId, quantity);
    db.prepare(
      "INSERT INTO rooms (id, host_id, scene_id, visibility, allow_publish, is_default, created_at) VALUES (?, ?, ?, 'invite_only', 0, 1, ?)",
    ).run(id, visitorId, scene.id, t);
    db.prepare("INSERT INTO room_members (room_id, visitor_id, joined_at, last_seen_at, active) VALUES (?, ?, ?, ?, 0)").run(id, visitorId, t, t);
    return findRoom(db, id)!;
  });
}

export interface CreateRoomOptions {
  visibility: "public" | "invite_only";
  allowPublish: boolean;
  label?: string;
  /** A room may be created fresh, or seeded from a snapshot (ADR 0009's "continue"). */
  fromSnapshotId?: string;
}

/**
 * A brand-new, player-created room (not the migrated solo default).
 *
 * Continuing a snapshot whose own `allow_publish` is false forces the new
 * room invite-only, regardless of what was requested: a public room is
 * listed in the open lobby and joinable by any visitor while capacity
 * allows (ADR 0007), which is itself a disclosure path independent of the
 * showcase. Letting a restricted snapshot be continued into a public room
 * would hand its construction to any stranger who joins, bypassing the
 * publication policy entirely rather than merely skipping the showcase
 * (ADR 0009: "must not expose the work through a public room or preview").
 */
export function createRoom(db: Db, hostId: string, opts: CreateRoomOptions): RoomRow {
  return transaction(db, () => {
    const id = randomUUID();
    const t = now();
    let visibility = opts.visibility;
    let allowPublish = opts.allowPublish;
    if (opts.fromSnapshotId) {
      const src = db.prepare("SELECT allow_publish FROM snapshots WHERE id = ?").get(opts.fromSnapshotId) as { allow_publish: number } | undefined;
      if (!src?.allow_publish) {
        visibility = "invite_only";
        allowPublish = false;
      }
    }
    db.prepare("INSERT INTO builds (id, visitor_id, scene_id, template_version, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)").run(
      id,
      hostId,
      scene.id,
      scene.version,
      t,
      t,
    );
    db.prepare(
      "INSERT INTO rooms (id, host_id, scene_id, visibility, allow_publish, is_default, label, source_snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
    ).run(id, hostId, scene.id, visibility, allowPublish ? 1 : 0, opts.label ?? null, opts.fromSnapshotId ?? null, t);
    db.prepare("INSERT INTO room_members (room_id, visitor_id, joined_at, last_seen_at, active) VALUES (?, ?, ?, ?, 1)").run(id, hostId, t, t);

    if (opts.fromSnapshotId) {
      seedFromSnapshot(db, id, opts.fromSnapshotId);
    } else {
      const stock = db.prepare("INSERT INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)");
      for (const [partId, quantity] of Object.entries(scene.kit)) stock.run(id, partId, quantity);
    }
    return findRoom(db, id)!;
  });
}

function seedFromSnapshot(db: Db, roomId: string, snapshotId: string): void {
  const t = now();
  const parts = db.prepare("SELECT * FROM snapshot_parts WHERE snapshot_id = ?").all(snapshotId) as {
    part_id: string;
    type_id: string;
    x: number;
    y: number;
    z: number;
    rot: number;
    colour: string;
    placed_by: string;
    proposed_by: string | null;
    edited_by: string | null;
  }[];
  const insertPart = db.prepare(
    "INSERT INTO parts (id, build_id, part_id, x, y, z, rot, colour, placed_by, proposed_by, edited_by, rev, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
  );
  for (const p of parts) insertPart.run(randomUUID(), roomId, p.type_id, p.x, p.y, p.z, p.rot, p.colour, p.placed_by, p.proposed_by, p.edited_by, t);

  const stock = db.prepare("SELECT part_id, quantity FROM snapshot_inventory WHERE snapshot_id = ?").all(snapshotId) as {
    part_id: string;
    quantity: number;
  }[];
  const insertStock = db.prepare("INSERT INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)");
  for (const s of stock) insertStock.run(roomId, s.part_id, s.quantity);

  // ADR 0009: a continued room inherits prior contributors AND whatever was
  // already inherited credit on the snapshot's own room, flattened one level
  // into this room's room_inherited_credits — never merged into
  // room_contributors (who has actually built in *this* room). They are
  // never members of the new room unless they also join it (room_members,
  // untouched), and never described as having built here unless they do.
  const builders = db.prepare("SELECT visitor_id, first_contribution_at FROM snapshot_contributors WHERE snapshot_id = ?").all(snapshotId) as {
    visitor_id: string;
    first_contribution_at: string;
  }[];
  const priorInherited = db.prepare("SELECT visitor_id, first_contribution_at FROM snapshot_inherited_credits WHERE snapshot_id = ?").all(snapshotId) as {
    visitor_id: string;
    first_contribution_at: string;
  }[];
  const insertCredit = db.prepare("INSERT OR IGNORE INTO room_inherited_credits (room_id, visitor_id, first_contribution_at) VALUES (?, ?, ?)");
  for (const c of [...builders, ...priorInherited]) insertCredit.run(roomId, c.visitor_id, c.first_contribution_at);

  // Restore unfinished plans too (author's explicit decision, ADR 0009).
  const plans = db.prepare("SELECT * FROM snapshot_plans WHERE snapshot_id = ?").all(snapshotId) as {
    plan_id: string;
    part_id: string;
    x: number;
    y: number;
    z: number;
    rot: number;
    colour: string;
    proposed_by: string;
  }[];
  const insertPlan = db.prepare(
    "INSERT INTO plans (id, room_id, part_id, x, y, z, rot, colour, proposed_by, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
  );
  for (const p of plans) insertPlan.run(randomUUID(), roomId, p.part_id, p.x, p.y, p.z, p.rot, p.colour, p.proposed_by, t);
}

// ---- membership and capacity ------------------------------------------------

export function isMember(db: Db, roomId: string, visitorId: string): boolean {
  return !!db.prepare("SELECT 1 FROM room_members WHERE room_id = ? AND visitor_id = ?").get(roomId, visitorId);
}

export type JoinOutcome = { ok: true } | { ok: false; code: "room_full" | "not_found" | "forbidden" };

/**
 * Joining is capacity-checked inside the caller's transaction (runCommand's
 * style of BEGIN IMMEDIATE), so two simultaneous joins for the last slot
 * can't both succeed. Rejoining the same visitor never creates a second row
 * or consumes a second slot (room_members is keyed by (room_id, visitor_id)).
 */
/**
 * Membership and presence changes are pushed over SSE too, not only command
 * commits (ADR 0007/0008): a member list that only updates on someone else's
 * next placement would show a joined, left or reconnected person late,
 * incorrectly implying they can't be seen until they build something.
 */
function pushRoomState(db: Db, roomId: string): void {
  const room = findRoom(db, roomId);
  if (room) emitRoomEvent(roomId, { type: "snapshot", snapshot: snapshotOf(db, room) });
}

export function join(db: Db, roomId: string, visitorId: string): JoinOutcome {
  const outcome = transaction(db, (): JoinOutcome & { changed?: boolean } => {
    const room = findRoom(db, roomId);
    if (!room) return { ok: false, code: "not_found" };
    if (room.visibility === "invite_only" && room.host_id !== visitorId) {
      const invite = db
        .prepare("SELECT 1 FROM room_invites WHERE room_id = ? AND invited_visitor_id = ? AND status = 'accepted'")
        .get(roomId, visitorId);
      if (!invite) return { ok: false, code: "forbidden" };
    }
    const existing = db.prepare("SELECT active FROM room_members WHERE room_id = ? AND visitor_id = ?").get(roomId, visitorId) as
      | { active: number }
      | undefined;
    const t = now();
    if (existing) {
      db.prepare("UPDATE room_members SET active = 1, last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(t, roomId, visitorId);
      return { ok: true, changed: !existing.active }; // only a transition from away -> active is news to anyone else
    }
    const { n } = db.prepare("SELECT count(*) AS n FROM room_members WHERE room_id = ? AND active = 1").get(roomId) as { n: number };
    if (n >= scene.maxPlayers) return { ok: false, code: "room_full" };
    db.prepare("INSERT INTO room_members (room_id, visitor_id, joined_at, last_seen_at, active) VALUES (?, ?, ?, ?, 1)").run(roomId, visitorId, t, t);
    return { ok: true, changed: true };
  });
  if (outcome.ok && outcome.changed) pushRoomState(db, roomId);
  return outcome;
}

export function markActive(db: Db, roomId: string, visitorId: string): void {
  // only push when this flips someone from away to active; the periodic SSE
  // keep-alive call (every 10s per open connection) must never itself spam a
  // snapshot to every other member
  const row = db.prepare("SELECT active FROM room_members WHERE room_id = ? AND visitor_id = ?").get(roomId, visitorId) as { active: number } | undefined;
  db.prepare("UPDATE room_members SET active = 1, last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(now(), roomId, visitorId);
  if (row && !row.active) pushRoomState(db, roomId);
}

/** 30s grace (ADR 0007) so a reload or brief drop doesn't flip presence off; called by a periodic sweep. */
export function sweepPresence(db: Db, graceMs = 30_000): void {
  const cutoff = new Date(Date.now() - graceMs).toISOString();
  const affected = db.prepare("SELECT DISTINCT room_id FROM room_members WHERE active = 1 AND last_seen_at < ?").all(cutoff) as { room_id: string }[];
  db.prepare("UPDATE room_members SET active = 0 WHERE active = 1 AND last_seen_at < ?").run(cutoff);
  for (const { room_id } of affected) pushRoomState(db, room_id);
}

export function leave(db: Db, roomId: string, visitorId: string): void {
  const row = db.prepare("SELECT active FROM room_members WHERE room_id = ? AND visitor_id = ?").get(roomId, visitorId) as { active: number } | undefined;
  db.prepare("UPDATE room_members SET active = 0 WHERE room_id = ? AND visitor_id = ?").run(roomId, visitorId);
  if (row?.active) pushRoomState(db, roomId);
}

// ---- room invitations (ADR 0007: a room invitation, not friendship, gates
// an invite-only room) -------------------------------------------------------

export type InviteOutcome = { ok: true; id: string } | { ok: false; code: "not_found" | "forbidden" | "already_invited" };

/** Only the host invites, and only a friend (checked by the caller in index.ts, which owns friends.ts). */
export function inviteToRoom(db: Db, roomId: string, byVisitor: string, toVisitor: string): InviteOutcome {
  return transaction(db, (): InviteOutcome => {
    const room = findRoom(db, roomId);
    if (!room) return { ok: false, code: "not_found" };
    if (room.host_id !== byVisitor) return { ok: false, code: "forbidden" };
    const existing = db
      .prepare("SELECT id, status FROM room_invites WHERE room_id = ? AND invited_visitor_id = ?")
      .get(roomId, toVisitor) as { id: string; status: string } | undefined;
    if (existing?.status === "pending" || existing?.status === "accepted") return { ok: false, code: "already_invited" };
    const id = randomUUID();
    if (existing) {
      db.prepare("UPDATE room_invites SET status = 'pending', invited_by = ?, created_at = ? WHERE id = ?").run(byVisitor, now(), existing.id);
      return { ok: true, id: existing.id };
    }
    db.prepare("INSERT INTO room_invites (id, room_id, invited_visitor_id, invited_by, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(
      id,
      roomId,
      toVisitor,
      byVisitor,
      now(),
    );
    return { ok: true, id };
  });
}

export interface RoomInvite {
  id: string;
  roomId: string;
  sceneId: string;
  label: string | null;
  invitedBy: string;
  createdAt: string;
}

export function pendingInvitesFor(db: Db, visitorId: string): RoomInvite[] {
  const rows = db
    .prepare(
      `SELECT i.id, i.room_id, r.scene_id, r.label, i.invited_by, i.created_at
       FROM room_invites i JOIN rooms r ON r.id = i.room_id
       WHERE i.invited_visitor_id = ? AND i.status = 'pending' ORDER BY i.created_at`,
    )
    .all(visitorId) as { id: string; room_id: string; scene_id: string; label: string | null; invited_by: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, roomId: r.room_id, sceneId: r.scene_id, label: r.label, invitedBy: r.invited_by, createdAt: r.created_at }));
}

export type RespondInviteOutcome =
  | { ok: true; roomId: string; status: "accepted" | "declined" }
  | { ok: false; code: "not_found" | "forbidden" | "room_full" };

/**
 * Accepting marks the invitation accepted AND admits the visitor as a room
 * member in the same step: an invitation the visitor can never act on except
 * by actually reaching the room would be a dead end, not a usable path in
 * (the brief's "then friendship and invitations so invite-only rooms are
 * usable"). Still capacity-checked, inside the same transaction as `join`'s.
 */
export function respondToInvite(db: Db, inviteId: string, visitorId: string, accept: boolean): RespondInviteOutcome {
  const result = transaction(db, (): RespondInviteOutcome & { changed?: boolean } => {
    const row = db.prepare("SELECT room_id, invited_visitor_id FROM room_invites WHERE id = ?").get(inviteId) as
      | { room_id: string; invited_visitor_id: string }
      | undefined;
    if (!row) return { ok: false, code: "not_found" };
    if (row.invited_visitor_id !== visitorId) return { ok: false, code: "forbidden" };
    if (!accept) {
      db.prepare("UPDATE room_invites SET status = 'declined' WHERE id = ?").run(inviteId);
      return { ok: true, roomId: row.room_id, status: "declined" };
    }
    const already = isMember(db, row.room_id, visitorId);
    if (!already) {
      const { n } = db.prepare("SELECT count(*) AS n FROM room_members WHERE room_id = ? AND active = 1").get(row.room_id) as { n: number };
      if (n >= scene.maxPlayers) return { ok: false, code: "room_full" };
    }
    db.prepare("UPDATE room_invites SET status = 'accepted' WHERE id = ?").run(inviteId);
    const t = now();
    if (already) {
      db.prepare("UPDATE room_members SET active = 1, last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(t, row.room_id, visitorId);
    } else {
      db.prepare("INSERT INTO room_members (room_id, visitor_id, joined_at, last_seen_at, active) VALUES (?, ?, ?, ?, 1)").run(row.room_id, visitorId, t, t);
    }
    return { ok: true, roomId: row.room_id, status: "accepted", changed: true };
  });
  if (result.ok && result.changed) pushRoomState(db, result.roomId);
  return result;
}

/** Every room this visitor currently belongs to (member or host), for a "my rooms" list. */
export interface MyRoom {
  id: string;
  sceneId: string;
  label: string | null;
  visibility: "public" | "invite_only";
  isHost: boolean;
  isDefault: boolean;
}

export function roomsFor(db: Db, visitorId: string): MyRoom[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.scene_id, r.label, r.visibility, r.host_id, r.is_default
       FROM room_members m JOIN rooms r ON r.id = m.room_id
       WHERE m.visitor_id = ? ORDER BY r.created_at DESC`,
    )
    .all(visitorId) as { id: string; scene_id: string; label: string | null; visibility: "public" | "invite_only"; host_id: string; is_default: number }[];
  return rows.map((r) => ({ id: r.id, sceneId: r.scene_id, label: r.label, visibility: r.visibility, isHost: r.host_id === visitorId, isDefault: !!r.is_default }));
}

// ---- the public lobby -------------------------------------------------------

export interface LobbyRoom {
  id: string;
  sceneId: string;
  label: string | null;
  occupancy: number;
  capacity: number;
}

/** Only public rooms, with real, server-counted occupancy — never fabricated. */
export function publicLobby(db: Db): LobbyRoom[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.scene_id, r.label, (SELECT count(*) FROM room_members m WHERE m.room_id = r.id AND m.active = 1) AS occupancy
       FROM rooms r WHERE r.visibility = 'public' ORDER BY r.created_at DESC`,
    )
    .all() as { id: string; scene_id: string; label: string | null; occupancy: number }[];
  return rows.map((r) => ({ id: r.id, sceneId: r.scene_id, label: r.label, occupancy: r.occupancy, capacity: scene.maxPlayers }));
}

// ---- snapshot assembly (the live room, for a command result or SSE push) --

export function snapshotOf(db: Db, room: RoomRow): Snapshot {
  const parts = db
    .prepare(
      "SELECT id, part_id, x, y, z, rot, colour, placed_by, edited_by, proposed_by, rev FROM parts WHERE build_id = ? ORDER BY rowid",
    )
    .all(room.id) as {
    id: string;
    part_id: string;
    x: number;
    y: number;
    z: number;
    rot: number;
    colour: string;
    placed_by: string | null;
    edited_by: string | null;
    proposed_by: string | null;
    rev: number;
  }[];
  const stock = db.prepare("SELECT part_id, quantity FROM inventory WHERE build_id = ?").all(room.id) as { part_id: string; quantity: number }[];
  const plans = db.prepare("SELECT * FROM plans WHERE room_id = ? AND status = 'open' ORDER BY created_at").all(room.id) as {
    id: string;
    part_id: string;
    x: number;
    y: number;
    z: number;
    rot: number;
    colour: string;
    proposed_by: string;
    created_at: string;
    status: "open" | "realized" | "withdrawn";
  }[];
  const contributors = db
    .prepare("SELECT visitor_id, first_contribution_at FROM room_contributors WHERE room_id = ?")
    .all(room.id) as { visitor_id: string; first_contribution_at: string }[];
  const inheritedCredits = db
    .prepare("SELECT visitor_id, first_contribution_at FROM room_inherited_credits WHERE room_id = ?")
    .all(room.id) as { visitor_id: string; first_contribution_at: string }[];
  const members = db.prepare("SELECT visitor_id, active FROM room_members WHERE room_id = ?").all(room.id) as {
    visitor_id: string;
    active: number;
  }[];

  return {
    buildId: room.id,
    roomId: room.id,
    sceneId: room.scene_id,
    templateVersion: room.template_version,
    revision: room.revision,
    maxPlayers: scene.maxPlayers,
    visibility: room.visibility,
    allowPublish: !!room.allow_publish,
    hostId: room.host_id,
    parts: parts.map(
      (p): PlacedPart => ({
        id: p.id,
        partId: p.part_id,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot as PlacedPart["rot"],
        colour: p.colour,
        placedBy: p.placed_by ?? undefined,
        editedBy: p.edited_by ?? undefined,
        proposedBy: p.proposed_by ?? undefined,
        rev: p.rev,
      }),
    ),
    inventory: Object.fromEntries(stock.map((s) => [s.part_id, s.quantity])),
    plans: plans.map(
      (p): Plan => ({
        id: p.id,
        partId: p.part_id,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot as Plan["rot"],
        colour: p.colour,
        proposedBy: p.proposed_by,
        createdAt: p.created_at,
        status: p.status,
      }),
    ),
    contributors: contributors.map(
      (c): Contributor => ({
        visitorId: c.visitor_id,
        firstContributionAt: c.first_contribution_at,
        hasBuilt: true, // room_contributors is only ever written on a successful real placement (ADR 0009)
      }),
    ),
    inheritedCredits: inheritedCredits.map(
      (c): Contributor => ({ visitorId: c.visitor_id, firstContributionAt: c.first_contribution_at, hasBuilt: true }),
    ),
    members: members.map((m): Member => ({ visitorId: m.visitor_id, active: !!m.active, isHost: m.visitor_id === room.host_id })),
  };
}
