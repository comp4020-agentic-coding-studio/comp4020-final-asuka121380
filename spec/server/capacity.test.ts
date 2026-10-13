import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/server/db.ts";
import { visitorFor } from "../../src/server/identity.ts";
import { createRoom, join, leave, markActive, respondToInvite, inviteToRoom, sweepPresence, isMember } from "../../src/server/rooms.ts";

// Regression (independent review): a returning member rejoining after
// leaving, after a presence sweep, after being replaced by a third person,
// or via an accepted invitation or an SSE reconnect, must still be
// capacity-checked exactly like a brand-new join — historical membership
// (a room_members row existing at all) is not the same thing as holding one
// of the room's currently-active slots. Each test below sets up a 2-player
// room already at capacity with two ACTIVE members, then exercises one
// specific re-admission path and asserts it is refused, never silently
// let through because the visitor already has a row.

function fresh(db: ReturnType<typeof openDatabase>): string {
  return visitorFor(db, undefined).id;
}

function activeCount(db: ReturnType<typeof openDatabase>, roomId: string): number {
  const { n } = db.prepare("SELECT count(*) AS n FROM room_members WHERE room_id = ? AND active = 1").get(roomId) as { n: number };
  return n;
}

describe("room capacity: returning members never bypass it", () => {
  it("B leaving then C joining then B rejoining: B's return is refused once C holds the second slot", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const c = fresh(db);
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    expect(join(db, room.id, b).ok).toBe(true);
    expect(activeCount(db, room.id)).toBe(2);

    leave(db, room.id, b);
    expect(activeCount(db, room.id)).toBe(1);

    expect(join(db, room.id, c).ok).toBe(true); // c takes the freed slot
    expect(activeCount(db, room.id)).toBe(2);

    const rejoin = join(db, room.id, b); // b already has a room_members row (historical)
    expect(rejoin).toEqual({ ok: false, code: "room_full" });
    expect(activeCount(db, room.id)).toBe(2);
    expect(isMember(db, room.id, b)).toBe(true); // historical membership is untouched either way
  });

  it("a presence sweep (disconnect/grace expiry) frees the slot, and whoever returns first through join gets it, not both", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const c = fresh(db);
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    join(db, room.id, b);

    // simulate b going stale: back-date its last_seen_at past the grace window
    db.prepare("UPDATE room_members SET last_seen_at = ? WHERE room_id = ? AND visitor_id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      room.id,
      b,
    );
    sweepPresence(db, 30_000);
    expect(activeCount(db, room.id)).toBe(1); // only a is active now

    expect(join(db, room.id, c).ok).toBe(true);
    expect(activeCount(db, room.id)).toBe(2);

    const bReturns = join(db, room.id, b);
    expect(bReturns).toEqual({ ok: false, code: "room_full" });
  });

  it("the returning host is capacity-checked too — host status grants no exemption", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const c = fresh(db);
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    join(db, room.id, b);
    leave(db, room.id, a); // the HOST leaves this time
    expect(join(db, room.id, c).ok).toBe(true); // c fills the host's freed slot

    const hostReturns = join(db, room.id, a);
    expect(hostReturns).toEqual({ ok: false, code: "room_full" });
  });

  it("multiple tabs for the SAME active visitor never count as a second occupant, and never get refused", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    join(db, room.id, b);
    expect(activeCount(db, room.id)).toBe(2);

    // a opens a second tab: still just `join` with the same visitor id
    const secondTab = join(db, room.id, a);
    expect(secondTab.ok).toBe(true);
    expect(activeCount(db, room.id)).toBe(2); // unchanged — no new slot consumed
  });

  it("an accepted room invitation is capacity-checked the same way a direct join is, for a returning invitee", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const c = fresh(db);
    const inviteOnly = createRoom(db, a, { visibility: "invite_only", allowPublish: false });

    const invite = inviteToRoom(db, inviteOnly.id, a, b);
    expect(invite.ok).toBe(true);
    const accepted = respondToInvite(db, (invite as { ok: true; id: string }).id, b, true);
    expect(accepted).toMatchObject({ ok: true, status: "accepted" });
    expect(activeCount(db, inviteOnly.id)).toBe(2);

    leave(db, inviteOnly.id, b);
    const invite2 = inviteToRoom(db, inviteOnly.id, a, c);
    const accepted2 = respondToInvite(db, (invite2 as { ok: true; id: string }).id, c, true);
    expect(accepted2.ok).toBe(true); // c fills the freed slot
    expect(activeCount(db, inviteOnly.id)).toBe(2);

    // b's own invitation is still (and remains) "accepted" from the first
    // round — nothing revokes it when b leaves. Responding to that SAME,
    // already-resolved invite id again must not let b back in past capacity
    // just because its status column already reads 'accepted': admission is
    // re-checked every time, never cached from the first acceptance.
    const bAcceptsAgain = respondToInvite(db, (invite as { ok: true; id: string }).id, b, true);
    expect(bAcceptsAgain).toEqual({ ok: false, code: "room_full" });
  });

  it("an SSE (re)connect's markActive is capacity-checked for a currently-inactive returning member", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const c = fresh(db);
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    join(db, room.id, b);
    leave(db, room.id, b);
    join(db, room.id, c);

    const reconnect = markActive(db, room.id, b); // b's SSE connection comes back after c took the slot
    expect(reconnect).toEqual({ ok: false, code: "room_full" });
    expect(activeCount(db, room.id)).toBe(2);

    // an already-active member's own heartbeat is always a harmless no-op
    const heartbeat = markActive(db, room.id, c);
    expect(heartbeat).toEqual({ ok: true, changed: false });
  });

  it("two simultaneous attempts for the last slot: exactly one succeeds (the transaction, not a race, decides)", () => {
    const db = openDatabase(":memory:");
    const a = fresh(db);
    const b = fresh(db);
    const c = fresh(db);
    const d = fresh(db);
    const room = createRoom(db, a, { visibility: "public", allowPublish: true });
    join(db, room.id, b);
    leave(db, room.id, a);
    leave(db, room.id, b); // both slots free now; a and b are historical members only

    // node:sqlite is synchronous, so "simultaneous" here means "run back to
    // back with no slot freed in between" — the invariant under test is that
    // the room never ends up with more than maxPlayers active, not the
    // scheduling itself (the transactional BEGIN IMMEDIATE is what a real
    // concurrent request serializes against; ADR 0007/0008)
    const r1 = join(db, room.id, a);
    const r2 = join(db, room.id, b);
    const r3 = join(db, room.id, c);
    const r4 = join(db, room.id, d);
    const results = [r1, r2, r3, r4];
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.code === "room_full")).toHaveLength(2);
    expect(activeCount(db, room.id)).toBe(2);
  });
});
