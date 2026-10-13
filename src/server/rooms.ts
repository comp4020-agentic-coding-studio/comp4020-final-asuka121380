import { randomUUID } from "node:crypto";
import type { Contributor, Member, Snapshot } from "../domain/commands.ts";
import type { Plan, PlacedPart } from "../domain/rules.ts";
import { STREET_SCENE } from "../domain/scene.ts";
import { transaction, type Db } from "./db.ts";

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
}

function roomRow(db: Db, roomId: string): RoomRow | undefined {
  return db
    .prepare(
      `SELECT r.id, r.host_id, r.scene_id, b.template_version, b.revision, r.visibility, r.allow_publish, r.is_default, r.label
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

/** A brand-new, player-created room (not the migrated solo default). */
export function createRoom(db: Db, hostId: string, opts: CreateRoomOptions): RoomRow {
  return transaction(db, () => {
    const id = randomUUID();
    const t = now();
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
    ).run(id, hostId, scene.id, opts.visibility, opts.allowPublish ? 1 : 0, opts.label ?? null, opts.fromSnapshotId ?? null, t);
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

  // ADR 0009: a continued room inherits prior contributors on its credits
  // list (seeded here into room_contributors) but they are never members of
  // the new room unless they also join it — that's `room_members`, untouched.
  const contributors = db.prepare("SELECT visitor_id, first_contribution_at FROM snapshot_contributors WHERE snapshot_id = ?").all(snapshotId) as {
    visitor_id: string;
    first_contribution_at: string;
  }[];
  const insertContributor = db.prepare("INSERT OR IGNORE INTO room_contributors (room_id, visitor_id, first_contribution_at) VALUES (?, ?, ?)");
  for (const c of contributors) insertContributor.run(roomId, c.visitor_id, c.first_contribution_at);

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
export function join(db: Db, roomId: string, visitorId: string): JoinOutcome {
  return transaction(db, (): JoinOutcome => {
    const room = findRoom(db, roomId);
    if (!room) return { ok: false, code: "not_found" };
    if (room.visibility === "invite_only" && room.host_id !== visitorId) {
      const invite = db
        .prepare("SELECT 1 FROM room_invites WHERE room_id = ? AND invited_visitor_id = ? AND status = 'accepted'")
        .get(roomId, visitorId);
      if (!invite) return { ok: false, code: "forbidden" };
    }
    const already = isMember(db, roomId, visitorId);
    const t = now();
    if (already) {
      db.prepare("UPDATE room_members SET active = 1, last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(t, roomId, visitorId);
      return { ok: true };
    }
    const { n } = db.prepare("SELECT count(*) AS n FROM room_members WHERE room_id = ? AND active = 1").get(roomId) as { n: number };
    if (n >= scene.maxPlayers) return { ok: false, code: "room_full" };
    db.prepare("INSERT INTO room_members (room_id, visitor_id, joined_at, last_seen_at, active) VALUES (?, ?, ?, ?, 1)").run(roomId, visitorId, t, t);
    return { ok: true };
  });
}

export function markActive(db: Db, roomId: string, visitorId: string): void {
  db.prepare("UPDATE room_members SET active = 1, last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(now(), roomId, visitorId);
}

/** 30s grace (ADR 0007) so a reload or brief drop doesn't flip presence off; called by a periodic sweep. */
export function sweepPresence(db: Db, graceMs = 30_000): void {
  const cutoff = new Date(Date.now() - graceMs).toISOString();
  db.prepare("UPDATE room_members SET active = 0 WHERE active = 1 AND last_seen_at < ?").run(cutoff);
}

export function leave(db: Db, roomId: string, visitorId: string): void {
  db.prepare("UPDATE room_members SET active = 0 WHERE room_id = ? AND visitor_id = ?").run(roomId, visitorId);
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
    members: members.map((m): Member => ({ visitorId: m.visitor_id, active: !!m.active, isHost: m.visitor_id === room.host_id })),
  };
}
