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
];

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");
  migrate(db);
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
