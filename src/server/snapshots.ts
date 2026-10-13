import { randomUUID } from "node:crypto";
import { transaction, type Db } from "./db.ts";
import { findRoom } from "./rooms.ts";

// ADR 0009: a snapshot is an immutable, consistently-captured copy of a
// room — parts, inventory and contributors at one revision, plans kept
// separately. Any member may save, at any time, without changing the room.

const now = (): string => new Date().toISOString();

export interface SnapshotSummary {
  id: string;
  roomId: string;
  sceneId: string;
  revision: number;
  savedBy: string;
  savedAt: string;
  allowPublish: boolean;
}

/**
 * A snapshot's own `allow_publish` can never be more permissive than its
 * room's setting, nor than the snapshot its room was continued from (ADR
 * 0009: "a snapshot can never be more publishable than the room it was saved
 * from, nor than the snapshot that room was continued from"). This is
 * computed once, at save time, and stored — not re-derived from the room
 * later, so a room's setting changing (it can't, in this phase, but
 * defensively) never retroactively changes an already-saved snapshot.
 */
function effectiveAllowPublish(db: Db, roomId: string, roomAllowPublish: boolean): boolean {
  if (!roomAllowPublish) return false;
  // Walk back through whatever snapshot this room was continued from, if
  // any (rooms.source_snapshot_id, set only by `continueFromSnapshot`
  // below). Each hop reads an already-saved, immutable snapshot row, so
  // this is bounded by the lineage's depth, never by live room data.
  const room = db.prepare("SELECT source_snapshot_id FROM rooms WHERE id = ?").get(roomId) as { source_snapshot_id: string | null } | undefined;
  let sourceId = room?.source_snapshot_id ?? null;
  while (sourceId) {
    const src = db.prepare("SELECT allow_publish, source_snapshot_id FROM snapshots WHERE id = ?").get(sourceId) as
      | { allow_publish: number; source_snapshot_id: string | null }
      | undefined;
    if (!src || !src.allow_publish) return false;
    sourceId = src.source_snapshot_id;
  }
  return true;
}

export function saveSnapshot(db: Db, roomId: string, savedBy: string): SnapshotSummary | undefined {
  return transaction(db, (): SnapshotSummary | undefined => {
    const room = findRoom(db, roomId);
    if (!room) return undefined;
    const id = randomUUID();
    const t = now();
    const allowPublish = effectiveAllowPublish(db, roomId, !!room.allow_publish);

    db.prepare(
      "INSERT INTO snapshots (id, room_id, scene_id, template_version, revision, saved_by, saved_at, allow_publish) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, room.id, room.scene_id, room.template_version, room.revision, savedBy, t, allowPublish ? 1 : 0);

    const parts = db.prepare("SELECT * FROM parts WHERE build_id = ?").all(room.id) as {
      id: string;
      part_id: string;
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
      "INSERT INTO snapshot_parts (snapshot_id, part_id, type_id, x, y, z, rot, colour, placed_by, proposed_by, edited_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const p of parts) insertPart.run(id, p.id, p.part_id, p.x, p.y, p.z, p.rot, p.colour, p.placed_by, p.proposed_by, p.edited_by);

    const stock = db.prepare("SELECT part_id, quantity FROM inventory WHERE build_id = ?").all(room.id) as { part_id: string; quantity: number }[];
    const insertStock = db.prepare("INSERT INTO snapshot_inventory (snapshot_id, part_id, quantity) VALUES (?, ?, ?)");
    for (const s of stock) insertStock.run(id, s.part_id, s.quantity);

    const contributors = db.prepare("SELECT visitor_id, first_contribution_at FROM room_contributors WHERE room_id = ?").all(room.id) as {
      visitor_id: string;
      first_contribution_at: string;
    }[];
    const insertContributor = db.prepare("INSERT INTO snapshot_contributors (snapshot_id, visitor_id, first_contribution_at) VALUES (?, ?, ?)");
    for (const c of contributors) insertContributor.run(id, c.visitor_id, c.first_contribution_at);

    // plans: captured, but excluded from the default read-only view and
    // restored only when continued (author's explicit decision, ADR 0009)
    const plans = db.prepare("SELECT * FROM plans WHERE room_id = ? AND status = 'open'").all(room.id) as {
      id: string;
      part_id: string;
      x: number;
      y: number;
      z: number;
      rot: number;
      colour: string;
      proposed_by: string;
    }[];
    const insertPlan = db.prepare(
      "INSERT INTO snapshot_plans (snapshot_id, plan_id, part_id, x, y, z, rot, colour, proposed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const p of plans) insertPlan.run(id, p.id, p.part_id, p.x, p.y, p.z, p.rot, p.colour, p.proposed_by);

    return { id, roomId: room.id, sceneId: room.scene_id, revision: room.revision, savedBy, savedAt: t, allowPublish };
  });
}

export interface SnapshotDetail extends SnapshotSummary {
  parts: { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string; placedBy: string; proposedBy?: string; editedBy?: string }[];
  inventory: Record<string, number>;
  contributors: { visitorId: string; firstContributionAt: string }[];
  /** Omitted from the default read-only presentation by the caller; included only when explicitly asked (author: hidden by default). */
  plans: { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string; proposedBy: string }[];
}

export function getSnapshot(db: Db, id: string): SnapshotDetail | undefined {
  const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as
    | { id: string; room_id: string; scene_id: string; revision: number; saved_by: string; saved_at: string; allow_publish: number }
    | undefined;
  if (!row) return undefined;
  const parts = db.prepare("SELECT * FROM snapshot_parts WHERE snapshot_id = ?").all(id) as {
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
  const stock = db.prepare("SELECT part_id, quantity FROM snapshot_inventory WHERE snapshot_id = ?").all(id) as { part_id: string; quantity: number }[];
  const contributors = db.prepare("SELECT visitor_id, first_contribution_at FROM snapshot_contributors WHERE snapshot_id = ?").all(id) as {
    visitor_id: string;
    first_contribution_at: string;
  }[];
  const plans = db.prepare("SELECT * FROM snapshot_plans WHERE snapshot_id = ?").all(id) as {
    plan_id: string;
    part_id: string;
    x: number;
    y: number;
    z: number;
    rot: number;
    colour: string;
    proposed_by: string;
  }[];
  return {
    id: row.id,
    roomId: row.room_id,
    sceneId: row.scene_id,
    revision: row.revision,
    savedBy: row.saved_by,
    savedAt: row.saved_at,
    allowPublish: !!row.allow_publish,
    parts: parts.map((p) => ({
      id: p.part_id,
      partId: p.type_id,
      x: p.x,
      y: p.y,
      z: p.z,
      rot: p.rot,
      colour: p.colour,
      placedBy: p.placed_by,
      proposedBy: p.proposed_by ?? undefined,
      editedBy: p.edited_by ?? undefined,
    })),
    inventory: Object.fromEntries(stock.map((s) => [s.part_id, s.quantity])),
    contributors: contributors.map((c) => ({ visitorId: c.visitor_id, firstContributionAt: c.first_contribution_at })),
    plans: plans.map((p) => ({ id: p.plan_id, partId: p.part_id, x: p.x, y: p.y, z: p.z, rot: p.rot, colour: p.colour, proposedBy: p.proposed_by })),
  };
}

export function snapshotsSavedBy(db: Db, visitorId: string): SnapshotSummary[] {
  const rows = db
    .prepare("SELECT id, room_id, scene_id, revision, saved_by, saved_at, allow_publish FROM snapshots WHERE saved_by = ? ORDER BY saved_at DESC")
    .all(visitorId) as { id: string; room_id: string; scene_id: string; revision: number; saved_by: string; saved_at: string; allow_publish: number }[];
  return rows.map((r) => ({ id: r.id, roomId: r.room_id, sceneId: r.scene_id, revision: r.revision, savedBy: r.saved_by, savedAt: r.saved_at, allowPublish: !!r.allow_publish }));
}

// ---- publication (author's policy, ADR 0009) -------------------------------

export type PublishOutcome = { ok: true; id: string } | { ok: false; code: "not_found" | "not_allowed" | "already_published" };

/**
 * Any member may publish their own saved snapshot, if its (lineage-checked)
 * allow_publish is true. This is the ONLY write path that creates a
 * publicly-readable row; the showcase never reads `snapshots` directly.
 */
export function publishSnapshot(db: Db, snapshotId: string, publishedBy: string): PublishOutcome {
  return transaction(db, (): PublishOutcome => {
    const row = db.prepare("SELECT allow_publish, saved_by FROM snapshots WHERE id = ?").get(snapshotId) as
      | { allow_publish: number; saved_by: string }
      | undefined;
    if (!row) return { ok: false, code: "not_found" };
    if (row.saved_by !== publishedBy) return { ok: false, code: "not_allowed" };
    if (!row.allow_publish) return { ok: false, code: "not_allowed" };
    const existing = db.prepare("SELECT id FROM publications WHERE snapshot_id = ?").get(snapshotId);
    if (existing) return { ok: false, code: "already_published" };
    const id = randomUUID();
    db.prepare("INSERT INTO publications (id, snapshot_id, published_by, published_at) VALUES (?, ?, ?, ?)").run(id, snapshotId, publishedBy, now());
    return { ok: true, id };
  });
}

export interface ShowcaseEntry {
  publicationId: string;
  snapshotId: string;
  sceneId: string;
  publishedBy: string;
  publishedAt: string;
}

/** The ONLY public read path: joins publications -> snapshots, never rooms directly. */
export function showcaseList(db: Db): ShowcaseEntry[] {
  const rows = db
    .prepare(
      `SELECT p.id AS pub_id, p.snapshot_id, s.scene_id, p.published_by, p.published_at
       FROM publications p JOIN snapshots s ON s.id = p.snapshot_id
       ORDER BY p.published_at DESC`,
    )
    .all() as { pub_id: string; snapshot_id: string; scene_id: string; published_by: string; published_at: string }[];
  return rows.map((r) => ({ publicationId: r.pub_id, snapshotId: r.snapshot_id, sceneId: r.scene_id, publishedBy: r.published_by, publishedAt: r.published_at }));
}

export function showcaseEntry(db: Db, publicationId: string): ShowcaseEntry | undefined {
  const row = db
    .prepare(
      `SELECT p.id AS pub_id, p.snapshot_id, s.scene_id, p.published_by, p.published_at
       FROM publications p JOIN snapshots s ON s.id = p.snapshot_id WHERE p.id = ?`,
    )
    .get(publicationId) as { pub_id: string; snapshot_id: string; scene_id: string; published_by: string; published_at: string } | undefined;
  if (!row) return undefined;
  return { publicationId: row.pub_id, snapshotId: row.snapshot_id, sceneId: row.scene_id, publishedBy: row.published_by, publishedAt: row.published_at };
}
