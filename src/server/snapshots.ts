import { randomUUID } from "node:crypto";
import { transaction, type Db } from "./db.ts";
import { findRoom, isMember } from "./rooms.ts";

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
  /** The snapshot the room this was saved from was itself continued from, if any — the chain's previous link. */
  sourceSnapshotId: string | null;
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
      "INSERT INTO snapshots (id, room_id, scene_id, template_version, revision, saved_by, saved_at, allow_publish, source_snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, room.id, room.scene_id, room.template_version, room.revision, savedBy, t, allowPublish ? 1 : 0, room.source_snapshot_id);

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

    // Kept as two distinct lists, mirroring rooms' own split (ADR 0007/0009,
    // and the brief's "distinguish contributors to the saved version [...]
    // from creators of source versions"): who actually built in the room
    // this snapshot captures, and who was already credited into that room
    // from an earlier snapshot further back in the chain.
    const builders = db.prepare("SELECT visitor_id, first_contribution_at FROM room_contributors WHERE room_id = ?").all(room.id) as {
      visitor_id: string;
      first_contribution_at: string;
    }[];
    const insertContributor = db.prepare("INSERT INTO snapshot_contributors (snapshot_id, visitor_id, first_contribution_at) VALUES (?, ?, ?)");
    for (const c of builders) insertContributor.run(id, c.visitor_id, c.first_contribution_at);

    const inherited = db.prepare("SELECT visitor_id, first_contribution_at FROM room_inherited_credits WHERE room_id = ?").all(room.id) as {
      visitor_id: string;
      first_contribution_at: string;
    }[];
    const insertInherited = db.prepare("INSERT INTO snapshot_inherited_credits (snapshot_id, visitor_id, first_contribution_at) VALUES (?, ?, ?)");
    for (const c of inherited) insertInherited.run(id, c.visitor_id, c.first_contribution_at);

    // plans: captured, but excluded from the default read-only view and
    // restored only when continued (author's explicit decision, ADR 0009)
    const plans = db.prepare("SELECT * FROM plans WHERE room_id = ? AND status = 'open' ORDER BY rowid").all(room.id) as {
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

    return { id, roomId: room.id, sceneId: room.scene_id, revision: room.revision, savedBy, savedAt: t, allowPublish, sourceSnapshotId: room.source_snapshot_id };
  });
}

/**
 * Copies an existing, already-authorized snapshot directly into
 * `collectedBy`'s own collection — a distinct, immutable row they now also
 * own as `saved_by` — without creating or joining any room (the brief:
 * "do not create or join a room as a side effect"). Every child table is
 * copied from the SOURCE SNAPSHOT's own rows, never from any live room, so
 * the exact construction, remaining stock, unfinished plans and existing
 * credits are preserved unchanged; the source snapshot itself is never
 * written to. `allow_publish` and `source_snapshot_id` are inherited
 * directly from the source (which already reflects its own full lineage
 * check), so a collected copy is never more publishable than what it was
 * collected from. The caller must have already authorized access to
 * `sourceSnapshotId` (the same `canAccessSnapshot` check viewing or
 * continuing it uses) before calling this.
 */
export function collectSnapshot(db: Db, sourceSnapshotId: string, collectedBy: string): SnapshotSummary | undefined {
  return transaction(db, (): SnapshotSummary | undefined => {
    const src = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(sourceSnapshotId) as
      | { id: string; room_id: string; scene_id: string; template_version: number; revision: number; allow_publish: number }
      | undefined;
    if (!src) return undefined;
    const id = randomUUID();
    const t = now();
    db.prepare(
      "INSERT INTO snapshots (id, room_id, scene_id, template_version, revision, saved_by, saved_at, allow_publish, source_snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, src.room_id, src.scene_id, src.template_version, src.revision, collectedBy, t, src.allow_publish, src.id);

    db.prepare(
      "INSERT INTO snapshot_parts (snapshot_id, part_id, type_id, x, y, z, rot, colour, placed_by, proposed_by, edited_by) SELECT ?, part_id, type_id, x, y, z, rot, colour, placed_by, proposed_by, edited_by FROM snapshot_parts WHERE snapshot_id = ?",
    ).run(id, sourceSnapshotId);
    db.prepare("INSERT INTO snapshot_inventory (snapshot_id, part_id, quantity) SELECT ?, part_id, quantity FROM snapshot_inventory WHERE snapshot_id = ?").run(
      id,
      sourceSnapshotId,
    );
    db.prepare(
      "INSERT INTO snapshot_contributors (snapshot_id, visitor_id, first_contribution_at) SELECT ?, visitor_id, first_contribution_at FROM snapshot_contributors WHERE snapshot_id = ?",
    ).run(id, sourceSnapshotId);
    db.prepare(
      "INSERT INTO snapshot_inherited_credits (snapshot_id, visitor_id, first_contribution_at) SELECT ?, visitor_id, first_contribution_at FROM snapshot_inherited_credits WHERE snapshot_id = ?",
    ).run(id, sourceSnapshotId);
    db.prepare(
      "INSERT INTO snapshot_plans (snapshot_id, plan_id, part_id, x, y, z, rot, colour, proposed_by) SELECT ?, plan_id, part_id, x, y, z, rot, colour, proposed_by FROM snapshot_plans WHERE snapshot_id = ? ORDER BY rowid",
    ).run(id, sourceSnapshotId);

    return {
      id,
      roomId: src.room_id,
      sceneId: src.scene_id,
      revision: src.revision,
      savedBy: collectedBy,
      savedAt: t,
      allowPublish: !!src.allow_publish,
      sourceSnapshotId: src.id,
    };
  });
}

export interface SnapshotDetail extends SnapshotSummary {
  parts: { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string; placedBy: string; proposedBy?: string; editedBy?: string }[];
  inventory: Record<string, number>;
  /** Who actually built in the room this snapshot captures. */
  contributors: { visitorId: string; firstContributionAt: string }[];
  /** Credited from an earlier snapshot in the chain, never conflated with the room's own builders. */
  inheritedCredits: { visitorId: string; firstContributionAt: string }[];
  /** Omitted from the default read-only presentation by the caller; included only when explicitly asked (author: hidden by default). */
  plans: { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string; proposedBy: string }[];
}

export function getSnapshot(db: Db, id: string): SnapshotDetail | undefined {
  const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as
    | {
        id: string;
        room_id: string;
        scene_id: string;
        revision: number;
        saved_by: string;
        saved_at: string;
        allow_publish: number;
        source_snapshot_id: string | null;
      }
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
  const inheritedCredits = db.prepare("SELECT visitor_id, first_contribution_at FROM snapshot_inherited_credits WHERE snapshot_id = ?").all(id) as {
    visitor_id: string;
    first_contribution_at: string;
  }[];
  const plans = db.prepare("SELECT * FROM snapshot_plans WHERE snapshot_id = ? ORDER BY rowid").all(id) as {
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
    sourceSnapshotId: row.source_snapshot_id,
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
    inheritedCredits: inheritedCredits.map((c) => ({ visitorId: c.visitor_id, firstContributionAt: c.first_contribution_at })),
    plans: plans.map((p) => ({ id: p.plan_id, partId: p.part_id, x: p.x, y: p.y, z: p.z, rot: p.rot, colour: p.colour, proposedBy: p.proposed_by })),
  };
}

export function snapshotsSavedBy(db: Db, visitorId: string): SnapshotSummary[] {
  const rows = db
    .prepare(
      "SELECT id, room_id, scene_id, revision, saved_by, saved_at, allow_publish, source_snapshot_id FROM snapshots WHERE saved_by = ? ORDER BY saved_at DESC",
    )
    .all(visitorId) as {
    id: string;
    room_id: string;
    scene_id: string;
    revision: number;
    saved_by: string;
    saved_at: string;
    allow_publish: number;
    source_snapshot_id: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    sceneId: r.scene_id,
    revision: r.revision,
    savedBy: r.saved_by,
    savedAt: r.saved_at,
    allowPublish: !!r.allow_publish,
    sourceSnapshotId: r.source_snapshot_id,
  }));
}

/**
 * Whether `visitorId` is authorized to read, copy or continue this snapshot
 * at all — distinct from whether it is *eligible for public publication*
 * (that's `allow_publish`/the lineage check above). Possession of a
 * snapshot id is never itself authorization (a UUID is guessable-adjacent
 * over enough requests, and more importantly, a link can simply be shared):
 * access requires one of (a) having saved it yourself, (b) being a current
 * member of the room it was saved from (so a roommate can revisit a
 * teammate's save), or (c) the snapshot having actually been published —
 * the one case where "anyone" is correct, and the only one that doesn't
 * route through the snapshot id at all in the UI (the showcase links by
 * publication id, not snapshot id, but the publish state itself must still
 * make a direct `/api/snapshots/:id` request to the same snapshot
 * permissible, since publishing *is* the act of making it public).
 */
/** Whether a snapshot id exists at all; lets the log tell "no access" from "no such snapshot" (ADR 0013). Never changes a response. */
export function snapshotExists(db: Db, snapshotId: string): boolean {
  return !!db.prepare("SELECT 1 FROM snapshots WHERE id = ?").get(snapshotId);
}

export function canAccessSnapshot(db: Db, snapshotId: string, visitorId: string): boolean {
  const row = db.prepare("SELECT saved_by, room_id FROM snapshots WHERE id = ?").get(snapshotId) as
    | { saved_by: string; room_id: string }
    | undefined;
  if (!row) return false;
  if (row.saved_by === visitorId) return true;
  if (isMember(db, row.room_id, visitorId)) return true;
  const published = db.prepare("SELECT 1 FROM publications WHERE snapshot_id = ?").get(snapshotId);
  return !!published;
}

// ---- publication (author's policy, ADR 0009) -------------------------------

/** `reason` refines `not_allowed` for the log only (ADR 0013); the route returns just `code`. */
export type PublishOutcome =
  | { ok: true; id: string }
  | { ok: false; code: "not_found" | "already_published" }
  | { ok: false; code: "not_allowed"; reason: "not_saver" | "publish_disallowed" };

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
    if (row.saved_by !== publishedBy) return { ok: false, code: "not_allowed", reason: "not_saver" };
    if (!row.allow_publish) return { ok: false, code: "not_allowed", reason: "publish_disallowed" };
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
