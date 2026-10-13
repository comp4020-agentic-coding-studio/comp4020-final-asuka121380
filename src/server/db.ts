import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Everything that touches SQLite goes through this module, so swapping
// node:sqlite for another driver changes one file. The database lives on the
// Fly volume (/data); nothing durable is kept anywhere else.

export type Db = DatabaseSync;

const MIGRATIONS: string[] = [
  // 1: visitors, their builds, the parts and stock in each, and the commands
  // already applied (so a retried command never runs twice)
  `
  CREATE TABLE visitors (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE builds (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    scene_id TEXT NOT NULL,
    template_version INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX builds_by_visitor ON builds(visitor_id, created_at);
  CREATE TABLE inventory (
    build_id TEXT NOT NULL REFERENCES builds(id),
    part_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (build_id, part_id)
  );
  CREATE TABLE parts (
    id TEXT PRIMARY KEY,
    build_id TEXT NOT NULL REFERENCES builds(id),
    part_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    rot INTEGER NOT NULL,
    colour TEXT NOT NULL,
    placed_by TEXT NOT NULL REFERENCES visitors(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX parts_by_build ON parts(build_id);
  CREATE TABLE commands (
    build_id TEXT NOT NULL REFERENCES builds(id),
    command_id TEXT NOT NULL,
    type TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (build_id, command_id)
  );
  `,
  // 2 (ADRs 0006-0009): a build becomes a room's construction, shared by
  // its members. `rooms` is 1:1 with `builds`, same id, so parts and
  // inventory (already keyed by build_id) need no migration at all. Every
  // existing build gets a room row and its original visitor as sole member,
  // in the migration block below, not in this SQL (it needs to read the
  // visitor id per build).
  `
  ALTER TABLE parts ADD COLUMN edited_by TEXT REFERENCES visitors(id);
  ALTER TABLE parts ADD COLUMN edited_at TEXT;
  ALTER TABLE parts ADD COLUMN proposed_by TEXT REFERENCES visitors(id);
  ALTER TABLE parts ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;

  -- One visitor, several valid cookies (ADR 0006): visitors.token_hash only
  -- ever matched one browser, which would make redeeming a recovery code on
  -- a second device silently sign the first one out. A session is its own
  -- row, so both keep working after a code links a second device. The
  -- original token_hash row's value is copied below into this visitor's
  -- first session; visitors.token_hash itself is left in place, unused, and
  -- identity.ts never reads it again.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX sessions_by_visitor ON sessions(visitor_id);
  INSERT INTO sessions (token_hash, visitor_id, created_at) SELECT token_hash, id, created_at FROM visitors;

  CREATE TABLE rooms (
    id TEXT PRIMARY KEY REFERENCES builds(id),
    host_id TEXT NOT NULL REFERENCES visitors(id),
    scene_id TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'invite_only')),
    allow_publish INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    label TEXT,
    -- set only when this room was created by continuing a snapshot (ADR
    -- 0009); walked by snapshots.ts to keep publication restriction from
    -- loosening through a chain of continue -> save -> continue -> save
    source_snapshot_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX rooms_by_visibility ON rooms(visibility);
  -- one default (solo, C8-style) room per visitor
  CREATE UNIQUE INDEX rooms_one_default_per_host ON rooms(host_id) WHERE is_default = 1;

  CREATE TABLE room_members (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    joined_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, visitor_id)
  );
  CREATE INDEX room_members_by_visitor ON room_members(visitor_id);

  CREATE TABLE room_invites (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    invited_visitor_id TEXT NOT NULL REFERENCES visitors(id),
    invited_by TEXT NOT NULL REFERENCES visitors(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
    created_at TEXT NOT NULL,
    UNIQUE (room_id, invited_visitor_id)
  );

  CREATE TABLE room_contributors (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    first_contribution_at TEXT NOT NULL,
    PRIMARY KEY (room_id, visitor_id)
  );

  CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    part_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    rot INTEGER NOT NULL,
    colour TEXT NOT NULL,
    proposed_by TEXT NOT NULL REFERENCES visitors(id),
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'realized', 'withdrawn')) DEFAULT 'open',
    realized_part_id TEXT
  );
  CREATE INDEX plans_by_room ON plans(room_id, status);

  CREATE TABLE recovery_codes (
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    code_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
  CREATE INDEX recovery_codes_by_visitor ON recovery_codes(visitor_id);

  CREATE TABLE friendships (
    visitor_a TEXT NOT NULL REFERENCES visitors(id),
    visitor_b TEXT NOT NULL REFERENCES visitors(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (visitor_a, visitor_b),
    CHECK (visitor_a < visitor_b)
  );

  CREATE TABLE friend_requests (
    id TEXT PRIMARY KEY,
    from_visitor TEXT NOT NULL REFERENCES visitors(id),
    to_visitor TEXT REFERENCES visitors(id),
    token TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
  CREATE INDEX friend_requests_by_to ON friend_requests(to_visitor, status);

  CREATE TABLE snapshots (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    scene_id TEXT NOT NULL,
    template_version INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    saved_by TEXT NOT NULL REFERENCES visitors(id),
    saved_at TEXT NOT NULL,
    allow_publish INTEGER NOT NULL DEFAULT 0,
    source_snapshot_id TEXT REFERENCES snapshots(id)
  );
  CREATE INDEX snapshots_by_room ON snapshots(room_id);

  CREATE TABLE snapshot_parts (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    part_id TEXT NOT NULL,
    type_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    rot INTEGER NOT NULL,
    colour TEXT NOT NULL,
    placed_by TEXT NOT NULL REFERENCES visitors(id),
    proposed_by TEXT REFERENCES visitors(id),
    edited_by TEXT REFERENCES visitors(id),
    PRIMARY KEY (snapshot_id, part_id)
  );

  CREATE TABLE snapshot_inventory (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    part_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    PRIMARY KEY (snapshot_id, part_id)
  );

  CREATE TABLE snapshot_contributors (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    first_contribution_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, visitor_id)
  );

  CREATE TABLE snapshot_plans (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    plan_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    z INTEGER NOT NULL,
    rot INTEGER NOT NULL,
    colour TEXT NOT NULL,
    proposed_by TEXT NOT NULL REFERENCES visitors(id),
    PRIMARY KEY (snapshot_id, plan_id)
  );

  CREATE TABLE publications (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL UNIQUE REFERENCES snapshots(id),
    published_by TEXT NOT NULL REFERENCES visitors(id),
    published_at TEXT NOT NULL
  );

  -- Factual record of meaningful room changes (phase 2 brief, section 12):
  -- actor, action, affected object, time, authoritative revision. Not an
  -- event-sourcing log to replay from; a readable history for provenance and
  -- future memory-oriented presentation.
  CREATE TABLE room_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    actor_id TEXT NOT NULL REFERENCES visitors(id),
    action TEXT NOT NULL,
    object_id TEXT,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX room_activity_by_room ON room_activity(room_id, id);
  `,
  // 3: a continued room's inherited credits are their own table, separate
  // from room_contributors (who has actually built in *this* room). The
  // first cut merged them into room_contributors directly, which made an
  // inherited creator indistinguishable from someone who joined and built
  // here — the brief is explicit that these must stay distinct.
  `
  CREATE TABLE room_inherited_credits (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    first_contribution_at TEXT NOT NULL,
    PRIMARY KEY (room_id, visitor_id)
  );
  CREATE TABLE snapshot_inherited_credits (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    first_contribution_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, visitor_id)
  );
  `,
];

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");
  migrate(db);
  backfillRooms(db);
  return db;
}

// Idempotent: each migration runs once, recorded in user_version.
function migrate(db: Db): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/**
 * ADR 0007: every pre-existing build (one per C8 visitor) becomes a room
 * with that visitor as host and sole member, invite-only and not
 * publishable. Idempotent (only builds with no `rooms` row yet are
 * touched), runs on every startup so it also covers a build created by code
 * that predates this migration but whose row only appears after a restart
 * mid-upgrade; nothing about parts, inventory or revision changes. Exported
 * so a test that seeds a raw pre-room `builds` row (modelling an old
 * database file) can re-run it after seeding, the way a real restart would.
 */
export function backfillRooms(db: Db): void {
  const rows = db
    .prepare(
      `SELECT b.id, b.visitor_id, b.scene_id, b.created_at
       FROM builds b LEFT JOIN rooms r ON r.id = b.id
       WHERE r.id IS NULL`,
    )
    .all() as { id: string; visitor_id: string; scene_id: string; created_at: string }[];
  if (rows.length === 0) return;
  transaction(db, () => {
    const insertRoom = db.prepare(
      `INSERT INTO rooms (id, host_id, scene_id, visibility, allow_publish, is_default, created_at)
       VALUES (?, ?, ?, 'invite_only', 0, 1, ?)`,
    );
    const insertMember = db.prepare(
      `INSERT INTO room_members (room_id, visitor_id, joined_at, last_seen_at, active) VALUES (?, ?, ?, ?, 0)`,
    );
    for (const row of rows) {
      insertRoom.run(row.id, row.visitor_id, row.scene_id, row.created_at);
      insertMember.run(row.id, row.visitor_id, row.created_at, row.created_at);
    }
  });
}

/** Runs `fn` inside one write transaction: all of it commits, or none of it. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
