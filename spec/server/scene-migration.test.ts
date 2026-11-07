import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/server/db.ts";
import { visitorFor } from "../../src/server/identity.ts";
import { createRoom, defaultRoomFor, findRoom, join as joinRoom, snapshotOf } from "../../src/server/rooms.ts";
import { STREET_SCENE } from "../../src/domain/scene.ts";

// ADR 0015's one schema change: the "one default solo room per visitor"
// index becomes "one per visitor and scene". A database written before it
// (user_version 4) must open with every room, part and quantity unchanged,
// keep its visitors' existing solo rooms as their Beach Houses rooms, and
// then allow a second, castle, solo room beside each.

describe("migration 5: one default room per visitor and scene", () => {
  it("leaves an existing database's rooms untouched and lets each visitor add a castle plot", () => {
    const dir = mkdtempSync(join(tmpdir(), "scene-migration-"));
    try {
      const file = join(dir, "app.db");
      // a database as the previous release left it
      const db = openDatabase(file);
      const visitor = visitorFor(db, undefined).id;
      const beach = defaultRoomFor(db, visitor);
      const partId = randomUUID();
      const t = new Date().toISOString();
      db.prepare("INSERT INTO parts (id, build_id, part_id, x, y, z, rot, colour, placed_by, created_at) VALUES (?, ?, 'brick-2x4', 2, 0, 2, 0, 'navy', ?, ?)").run(partId, beach.id, visitor, t);
      db.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE build_id = ? AND part_id = 'brick-2x4'").run(beach.id);
      db.close();
      // put it back to the pre-ADR-0015 schema: the old index, user_version 4
      const raw = new DatabaseSync(file);
      raw.exec("DROP INDEX rooms_one_default_per_host_scene; CREATE UNIQUE INDEX rooms_one_default_per_host ON rooms(host_id) WHERE is_default = 1; PRAGMA user_version = 4;");
      const stockBefore = raw.prepare("SELECT part_id, quantity FROM inventory WHERE build_id = ? ORDER BY part_id").all(beach.id);
      raw.close();

      // the new release opens it
      const db2 = openDatabase(file);
      expect((db2.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(5);
      const indexes = (db2.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rooms'").all() as { name: string }[]).map((r) => r.name);
      expect(indexes).toContain("rooms_one_default_per_host_scene");
      expect(indexes).not.toContain("rooms_one_default_per_host");

      const kept = findRoom(db2, beach.id)!;
      expect(kept.scene_id).toBe(STREET_SCENE.id);
      expect(kept.template_version).toBe(STREET_SCENE.version);
      expect(snapshotOf(db2, kept).parts.map((p) => p.id)).toEqual([partId]);
      expect(db2.prepare("SELECT part_id, quantity FROM inventory WHERE build_id = ? ORDER BY part_id").all(beach.id)).toEqual(stockBefore);

      // the same Beach Houses solo room is still theirs, and a castle one is added beside it
      expect(defaultRoomFor(db2, visitor).id).toBe(beach.id);
      const castle = defaultRoomFor(db2, visitor, "castle-01");
      expect(castle.id).not.toBe(beach.id);
      expect(castle.scene_id).toBe("castle-01");
      expect(defaultRoomFor(db2, visitor, "castle-01").id).toBe(castle.id);
      // still at most one default per visitor and scene
      expect(() =>
        db2.prepare("INSERT INTO rooms (id, host_id, scene_id, visibility, allow_publish, is_default, created_at) VALUES (?, ?, 'castle-01', 'invite_only', 0, 1, ?)").run(randomUUID(), visitor, t),
      ).toThrow();
      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enforces each room's own capacity: 4 for the castle, 2 for Beach Houses", () => {
    const db = openDatabase(":memory:");
    const people = Array.from({ length: 5 }, () => visitorFor(db, undefined).id);
    const castle = createRoom(db, people[0], { visibility: "public", allowPublish: true, sceneId: "castle-01" });
    const beach = createRoom(db, people[0], { visibility: "public", allowPublish: true });
    for (const v of people.slice(1, 4)) expect(joinRoom(db, castle.id, v).ok).toBe(true);
    expect(joinRoom(db, castle.id, people[4])).toEqual({ ok: false, code: "room_full" });
    expect(joinRoom(db, beach.id, people[1]).ok).toBe(true);
    expect(joinRoom(db, beach.id, people[2])).toEqual({ ok: false, code: "room_full" });
    expect(snapshotOf(db, findRoom(db, castle.id)!).maxPlayers).toBe(4);
    expect(snapshotOf(db, findRoom(db, beach.id)!).maxPlayers).toBe(2);
  });

  // ADR 0016: a third scene needs no schema change; its rooms and solo plots
  // sit beside the others under the same index, with six places.
  it("adds a Woodland Commons solo plot and six-place rooms beside the others", () => {
    const db = openDatabase(":memory:");
    const people = Array.from({ length: 7 }, () => visitorFor(db, undefined).id);
    const beach = defaultRoomFor(db, people[0]);
    const castle = defaultRoomFor(db, people[0], "castle-01");
    const tree = defaultRoomFor(db, people[0], "treehouse-01");
    expect(new Set([beach.id, castle.id, tree.id]).size).toBe(3);
    expect(defaultRoomFor(db, people[0], "treehouse-01").id).toBe(tree.id);
    const room = createRoom(db, people[0], { visibility: "public", allowPublish: true, sceneId: "treehouse-01" });
    for (const v of people.slice(1, 6)) expect(joinRoom(db, room.id, v).ok).toBe(true);
    expect(joinRoom(db, room.id, people[6])).toEqual({ ok: false, code: "room_full" });
    expect(snapshotOf(db, findRoom(db, room.id)!).maxPlayers).toBe(6);
  });
});
