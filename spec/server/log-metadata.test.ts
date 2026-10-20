import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../src/server/builds.ts";
import { openDatabase } from "../../src/server/db.ts";
import { visitorFor } from "../../src/server/identity.ts";
import { createRoom, join, leave, sweepPresence } from "../../src/server/rooms.ts";

// ADR 0013: the facts the log reports come from the server's own state, not
// the client. These check them at the source, against an in-memory database.

const env = (command: Record<string, unknown>, commandId: string = randomUUID()) => ({ commandId, expectedRevision: 0, command }) as never;
const b24 = (x: number, y: number) => ({ partId: "brick-2x4", x, y, z: 0, rot: 0, colour: "sky" });

function room() {
  const db = openDatabase(":memory:");
  const a = visitorFor(db, undefined).id;
  const b = visitorFor(db, undefined).id;
  const r = createRoom(db, a, { visibility: "public", allowPublish: true });
  join(db, r.id, b);
  return { db, a, b, roomId: r.id };
}

describe("command metadata comes from authoritative state", () => {
  it("the original builder is read from the part, whoever sends the command", () => {
    const { db, a, b, roomId } = room();
    const placed = runCommand(db, a, roomId, env({ type: "place", placement: b24(0, 0) }));
    const partId = placed.meta!.target!;
    expect(placed.meta).toMatchObject({ part: "brick-2x4", at: "0,0,0,0" });
    expect(placed.meta!.author).toBeUndefined();
    const recolour = runCommand(db, b, roomId, env({ type: "recolour", placedId: partId, colour: "leaf" }));
    expect(recolour.meta).toMatchObject({ target: partId, author: a, colour: "leaf" });
    const removed = runCommand(db, b, roomId, env({ type: "remove", placedId: partId }));
    expect(removed.outcome).toBe("applied");
    // captured before the removal deleted the row
    expect(removed.meta).toMatchObject({ target: partId, author: a, part: "brick-2x4", at: "0,0,0,0" });
  });

  it("a realized plan names its proposer, captured before the plan is closed", () => {
    const { db, a, b, roomId } = room();
    const proposed = runCommand(db, b, roomId, env({ type: "propose-plan", plan: b24(4, 0) }));
    const planId = proposed.meta!.target!;
    const realized = runCommand(db, a, roomId, env({ type: "realize-plan", planId }));
    expect(realized.outcome).toBe("applied");
    expect(realized.meta).toMatchObject({ target: planId, author: b, at: "4,0,0,0" });
  });

  it("an unknown target is reported as sent, with no invented author", () => {
    const { db, a, roomId } = room();
    const r = runCommand(db, a, roomId, env({ type: "withdraw-plan", planId: "nope" }));
    expect(r.outcome).toBe("rejected");
    expect(r.meta).toEqual({ target: "nope" });
  });

  it("a duplicate reports the revision its first delivery committed, not the room's current one", () => {
    const { db, a, roomId } = room();
    const id = randomUUID();
    runCommand(db, a, roomId, env({ type: "place", placement: b24(0, 0) }, id));
    runCommand(db, a, roomId, env({ type: "place", placement: b24(8, 0) }));
    const again = runCommand(db, a, roomId, env({ type: "place", placement: b24(0, 0) }, id));
    expect(again.outcome).toBe("duplicate");
    expect(again.meta).toEqual({ firstRevision: 1 });
    expect(again.result.ok && again.result.snapshot.revision).toBe(2);
  });
});

describe("presence changes report what actually changed", () => {
  it("leave says whether the visitor was active; a second leave changes nothing", () => {
    const { db, b, roomId } = room();
    expect(leave(db, roomId, b)).toBe(true);
    expect(leave(db, roomId, b)).toBe(false);
  });

  it("the sweep returns exactly whose presence expired", () => {
    const { db, a, b, roomId } = room();
    db.prepare("UPDATE room_members SET last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(new Date(Date.now() - 60_000).toISOString(), roomId, b);
    expect(sweepPresence(db, 30_000)).toEqual([{ roomId, visitorId: b }]);
    expect(sweepPresence(db, 30_000)).toEqual([]);
    void a;
  });

  it("joining when already admitted is not a new admission", () => {
    const { db, b, roomId } = room();
    expect(join(db, roomId, b)).toEqual({ ok: true, changed: false });
  });
});
