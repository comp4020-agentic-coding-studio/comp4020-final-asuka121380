import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildFor, runCommand, visitorFor } from "../../src/server/builds.ts";
import { openDatabase } from "../../src/server/db.ts";
import { STREET_SCENE as scene } from "../../src/domain/scene.ts";

// A build saved under scene version 1 must still load, keep every saved part
// and quantity, and gain the version 2 parts (ADR 0003). This test writes a
// version 1 build into a throwaway in-memory database exactly as the v1
// server did, then reads it through today's code.

const v1Kit = Object.fromEntries(Object.entries(scene.kit).filter(([id]) => !(id in scene.additions[2])));

function seedV1(): { db: ReturnType<typeof openDatabase>; visitorId: string; buildId: string; partId: string } {
  const db = openDatabase(":memory:");
  const visitorId = visitorFor(db, undefined).id;
  const buildId = randomUUID();
  const partId = randomUUID();
  const t = new Date().toISOString();
  db.prepare("INSERT INTO builds (id, visitor_id, scene_id, template_version, revision, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)").run(
    buildId,
    visitorId,
    scene.id,
    t,
    t,
  );
  for (const [p, q] of Object.entries(v1Kit)) {
    db.prepare("INSERT INTO inventory (build_id, part_id, quantity) VALUES (?, ?, ?)").run(buildId, p, p === "brick-2x4" ? q - 1 : q);
  }
  db.prepare("INSERT INTO parts (id, build_id, part_id, x, y, z, rot, colour, placed_by, created_at) VALUES (?, ?, 'brick-2x4', 6, 0, 2, 0, 'brick-red', ?, ?)").run(
    partId,
    buildId,
    visitorId,
    t,
  );
  return { db, visitorId, buildId, partId };
}

describe("a build saved under scene version 1", () => {
  it("loads with its parts and stock intact, plus the new parts at full quantity", () => {
    const { db, visitorId, buildId, partId } = seedV1();
    const snap = buildFor(db, visitorId);
    expect(snap.buildId).toBe(buildId);
    expect(snap.templateVersion).toBe(scene.version);
    expect(snap.revision).toBe(1);
    expect(snap.parts).toEqual([{ id: partId, partId: "brick-2x4", x: 6, y: 0, z: 2, rot: 0, colour: "brick-red" }]);
    for (const [p, q] of Object.entries(v1Kit)) expect(snap.inventory[p], p).toBe(p === "brick-2x4" ? q - 1 : q);
    for (const [p, q] of Object.entries(scene.additions[2])) expect(snap.inventory[p], p).toBe(q);
    // K = held + placed for every type
    for (const [p, k] of Object.entries(scene.kit)) {
      expect(snap.inventory[p] + snap.parts.filter((x) => x.partId === p).length, p).toBe(k);
    }
  });

  it("upgrades once: loading again changes nothing", () => {
    const { db, visitorId } = seedV1();
    const first = buildFor(db, visitorId);
    const second = buildFor(db, visitorId);
    expect(second).toEqual(first);
  });

  it("accepts a new decorative part after the upgrade, through the command path", () => {
    const { db, visitorId } = seedV1();
    const snap = buildFor(db, visitorId);
    const { result } = runCommand(db, visitorId, {
      commandId: randomUUID(),
      expectedRevision: snap.revision,
      command: { type: "place", placement: { partId: "planter-1x2", x: 2, y: 0, z: 6, rot: 0, colour: "bark" } },
    });
    expect(result.ok).toBe(true);
  });
});
