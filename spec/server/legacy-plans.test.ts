import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planFits } from "../../src/domain/rules.ts";
import { runCommand } from "../../src/server/builds.ts";
import { openDatabase } from "../../src/server/db.ts";
import { visitorFor } from "../../src/server/identity.ts";
import { createRoom, snapshotOf, findRoom } from "../../src/server/rooms.ts";

// ADR 0012 compatibility policy: plans written under ADR 0009's looser rules
// may float or overlap. They are never deleted or moved by the upgrade;
// they're reported as `conflict`/`unsupported`, can always be withdrawn, and
// never block unrelated work in the room. Written straight into the table,
// exactly as an older server would have left them.

function legacyRoom() {
  const db = openDatabase(":memory:");
  const a = visitorFor(db, undefined).id;
  const room = createRoom(db, a, { visibility: "public", allowPublish: true });
  const insert = db.prepare(
    "INSERT INTO plans (id, room_id, part_id, x, y, z, rot, colour, proposed_by, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
  );
  const ids = { floating: randomUUID(), base: randomUUID(), duplicate: randomUUID(), onFloating: randomUUID() };
  insert.run(ids.floating, room.id, "brick-2x4", 0, 6, 0, 0, "sky", a, "2026-10-13T01:00:00.000Z");
  insert.run(ids.base, room.id, "brick-2x4", 8, 0, 2, 0, "sky", a, "2026-10-13T01:00:01.000Z");
  insert.run(ids.duplicate, room.id, "brick-2x4", 8, 0, 2, 0, "rose", a, "2026-10-13T01:00:02.000Z");
  insert.run(ids.onFloating, room.id, "brick-2x4", 0, 9, 0, 0, "sky", a, "2026-10-13T01:00:03.000Z");
  return { db, a, roomId: room.id, ids };
}

const cmd = (command: Record<string, unknown>) => ({ commandId: randomUUID(), expectedRevision: 0, command }) as never;

describe("legacy plans after the ADR 0012 upgrade", () => {
  it("are all still served, unchanged, and reported by fit", () => {
    const { db, roomId, ids } = legacyRoom();
    const snap = snapshotOf(db, findRoom(db, roomId)!);
    expect(snap.plans).toHaveLength(4);
    expect(snap.plans.find((p) => p.id === ids.floating)).toMatchObject({ x: 0, y: 6, z: 0 });
    const fits = planFits(snap);
    expect(fits.get(ids.floating)).toBe("unsupported");
    expect(fits.get(ids.base)).toBe("standing");
    expect(fits.get(ids.duplicate)).toBe("conflict");
    expect(fits.get(ids.onFloating)).toBe("unsupported");
  });

  it("don't block unrelated placements, plans, removals or withdrawals elsewhere", () => {
    const { db, a, roomId } = legacyRoom();
    const placed = runCommand(db, a, roomId, cmd({ type: "place", placement: { partId: "brick-2x2", x: 12, y: 0, z: 5, rot: 0, colour: "navy" } }));
    expect(placed.result.ok).toBe(true);
    const planned = runCommand(db, a, roomId, cmd({ type: "propose-plan", plan: { partId: "brick-2x2", x: 12, y: 3, z: 5, rot: 0, colour: "sky" } }));
    expect(planned.result.ok).toBe(true);
    // the floating legacy plan is no support: a plan on top of it is refused
    const onFloating = runCommand(db, a, roomId, cmd({ type: "propose-plan", plan: { partId: "brick-2x4", x: 4, y: 9, z: 0, rot: 0, colour: "sky" } }));
    expect(onFloating.result.ok).toBe(false);
  });

  it("can each be withdrawn, recovering a valid design, and a duplicate never counts as support to protect", () => {
    const { db, a, roomId, ids } = legacyRoom();
    for (const id of [ids.floating, ids.onFloating, ids.duplicate]) {
      const r = runCommand(db, a, roomId, cmd({ type: "withdraw-plan", planId: id }));
      expect(r.result.ok, JSON.stringify(r.result)).toBe(true);
    }
    const snap = snapshotOf(db, findRoom(db, roomId)!);
    expect(snap.plans.map((p) => p.id)).toEqual([ids.base]);
    expect([...planFits(snap).values()]).toEqual(["standing"]);
  });

  it("decides standing in commit order even when two plans share a timestamp", () => {
    const db = openDatabase(":memory:");
    const a = visitorFor(db, undefined).id;
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    const insert = db.prepare(
      "INSERT INTO plans (id, room_id, part_id, x, y, z, rot, colour, proposed_by, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
    );
    // ids chosen so that sorting by id would put the upper plan first
    insert.run("zzz-base", room.id, "brick-2x4", 0, 0, 0, 0, "sky", a, "2026-10-19T00:00:00.000Z");
    insert.run("aaa-upper", room.id, "brick-2x4", 0, 3, 0, 0, "sky", a, "2026-10-19T00:00:00.000Z");
    const snap = snapshotOf(db, findRoom(db, room.id)!);
    expect(planFits(snap).get("aaa-upper")).toBe("standing");
    const withdraw = runCommand(db, a, room.id, cmd({ type: "withdraw-plan", planId: "zzz-base" }));
    expect(withdraw.result.ok).toBe(false);
  });

  it("a real part built into a standing plan keeps the plan, now conflicting, with stock and credits untouched", () => {
    const { db, a, roomId, ids } = legacyRoom();
    const before = snapshotOf(db, findRoom(db, roomId)!);
    const r = runCommand(db, a, roomId, cmd({ type: "place", placement: { partId: "brick-2x4", x: 10, y: 0, z: 3, rot: 0, colour: "navy" } }));
    expect(r.result.ok).toBe(true);
    const snap = snapshotOf(db, findRoom(db, roomId)!);
    const plan = snap.plans.find((p) => p.id === ids.base)!;
    expect(plan).toMatchObject({ x: 8, y: 0, z: 2, proposedBy: a });
    expect(planFits(snap).get(ids.base)).toBe("conflict");
    expect(snap.inventory["brick-2x4"]).toBe(before.inventory["brick-2x4"] - 1);
  });
});
