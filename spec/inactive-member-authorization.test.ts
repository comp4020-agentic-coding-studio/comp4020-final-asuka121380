import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// Regression (independent review, 14 Oct 2026): A and B join a 2-player
// room; B leaves; C joins; B is correctly refused a rejoin (409 room_full)
// — but B's historical room_members row was still enough to authorize
// every mutating action on the room: placement, removal, rotation,
// recolouring, plan proposal/withdrawal/realization, and plan marking all
// used a bare "does a room_members row exist" check instead of "is this
// visitor currently admitted". Fixed by routing every mutation through
// `isActiveMember` (active=1, or the solo default room's host), the same
// distinction ADR 0007's capacity fix already drew for admission itself.

const baseUrl = inject("baseUrl");

interface Snapshot {
  roomId: string;
  revision: number;
  maxPlayers: number;
  parts: { id: string; partId: string; x: number; y: number; z: number; rev?: number; colour: string }[];
  inventory: Record<string, number>;
  plans: { id: string; partId: string; status: string }[];
  contributors: { visitorId: string }[];
}

async function freshVisitor(): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  return { cookie: cookie! };
}

async function createPublicRoom(cookie: string): Promise<Snapshot> {
  const res = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ visibility: "public", allowPublish: true }),
  });
  return (await res.json()) as Snapshot;
}

async function joinRoom(cookie: string, roomId: string): Promise<{ status: number; body: any }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/join`, baseUrl), { method: "POST", headers: { cookie } });
  return { status: res.status, body: await res.json() };
}

async function leaveRoom(cookie: string, roomId: string): Promise<void> {
  await fetch(new URL(`/api/rooms/${roomId}/leave`, baseUrl), { method: "POST", headers: { cookie } });
}

async function command(cookie: string, roomId: string, cmd: Record<string, unknown>, expectedRevision = 0): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/command`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ commandId: randomUUID(), expectedRevision, command: cmd }),
  });
  return { status: res.status, json: await res.json() };
}

async function mark(cookie: string, roomId: string, planId: string): Promise<number> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/mark`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  return res.status;
}

async function getRoom(cookie: string, roomId: string): Promise<Snapshot> {
  const res = await fetch(new URL(`/api/rooms/${roomId}`, baseUrl), { headers: { cookie } });
  return (await res.json()) as Snapshot;
}

/** Sets up: A and B active in a 2-player room, B leaves, C joins (fills B's slot), B's rejoin attempt is refused. Returns the room and each cookie. */
async function setUpExactSequence(): Promise<{ a: string; b: string; c: string; room: Snapshot }> {
  const a = await freshVisitor();
  const room = await createPublicRoom(a.cookie);
  const b = await freshVisitor();
  const c = await freshVisitor();
  expect((await joinRoom(b.cookie, room.roomId)).status).toBe(200);
  await leaveRoom(b.cookie, room.roomId);
  expect((await joinRoom(c.cookie, room.roomId)).status).toBe(200);
  const rejoin = await joinRoom(b.cookie, room.roomId);
  expect(rejoin.status).toBe(409);
  expect(rejoin.body.code).toBe("room_full");
  return { a: a.cookie, b: b.cookie, c: c.cookie, room };
}

describe("an inactive (replaced) member cannot mutate the room directly", () => {
  it("reproduces the exact reported sequence: B is refused rejoin but a direct placement must also be refused", async () => {
    const { b, room } = await setUpExactSequence();
    const before = await getRoom(b, room.roomId);

    const attempt = await command(b, room.roomId, {
      type: "place",
      placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" },
    });
    expect(attempt.status, JSON.stringify(attempt.json)).not.toBe(200);
    expect(attempt.json.ok).toBe(false);

    const after = await getRoom(b, room.roomId);
    expect(after.revision).toBe(before.revision);
    expect(after.parts).toEqual(before.parts);
    expect(after.inventory).toEqual(before.inventory);
  });

  it("refuses removal, rotation and recolouring the same way", async () => {
    const { a, b, room } = await setUpExactSequence();
    // a real part exists, placed by A (still active), before b was replaced
    const placed = await command(a, room.roomId, {
      type: "place",
      placement: { partId: "brick-2x4", x: 2, y: 0, z: 2, rot: 0, colour: "navy" },
    });
    expect(placed.json.ok).toBe(true);
    const part = placed.json.snapshot.parts[0];
    const revBefore = placed.json.snapshot.revision;

    const remove = await command(b, room.roomId, { type: "remove", placedId: part.id, expectedRev: part.rev }, revBefore);
    expect(remove.json.ok).toBe(false);

    const rotate = await command(b, room.roomId, { type: "rotate", placedId: part.id, rot: 1, expectedRev: part.rev }, revBefore);
    expect(rotate.json.ok).toBe(false);

    const recolour = await command(b, room.roomId, { type: "recolour", placedId: part.id, colour: "sky", expectedRev: part.rev }, revBefore);
    expect(recolour.json.ok).toBe(false);

    const after = await getRoom(a, room.roomId);
    expect(after.revision).toBe(revBefore);
    expect(after.parts[0]).toMatchObject({ id: part.id, colour: "navy", rot: 0 });
  });

  it("refuses plan proposal, withdrawal and realization the same way", async () => {
    const { a, b, room } = await setUpExactSequence();

    const proposeByB = await command(b, room.roomId, {
      type: "propose-plan",
      plan: { partId: "brick-2x4", x: 4, y: 0, z: 4, rot: 0, colour: "sky" },
    });
    expect(proposeByB.json.ok).toBe(false);

    // A (still active) proposes one for real, so withdraw/realize have a
    // genuine target to be refused against
    const proposed = await command(a, room.roomId, {
      type: "propose-plan",
      plan: { partId: "brick-2x4", x: 4, y: 0, z: 4, rot: 0, colour: "sky" },
    });
    expect(proposed.json.ok).toBe(true);
    const planId = proposed.json.snapshot.plans[0].id;
    const revBefore = proposed.json.snapshot.revision;

    const withdraw = await command(b, room.roomId, { type: "withdraw-plan", planId }, revBefore);
    expect(withdraw.json.ok).toBe(false);

    const realize = await command(b, room.roomId, { type: "realize-plan", planId }, revBefore);
    expect(realize.json.ok).toBe(false);

    const after = await getRoom(a, room.roomId);
    expect(after.revision).toBe(revBefore);
    expect(after.plans.find((p) => p.id === planId)?.status).toBe("open");
  });

  it("refuses marking a plan for everyone", async () => {
    const { a, b, room } = await setUpExactSequence();
    const proposed = await command(a, room.roomId, {
      type: "propose-plan",
      plan: { partId: "brick-2x4", x: 6, y: 0, z: 2, rot: 0, colour: "sky" },
    });
    const planId = proposed.json.snapshot.plans[0].id;

    const markStatus = await mark(b, room.roomId, planId);
    expect(markStatus).not.toBe(200);
  });

  it("does not delete B's permanent contributor record from when they were active", async () => {
    const a = await freshVisitor();
    const room = await createPublicRoom(a.cookie);
    const b = await freshVisitor();
    const c = await freshVisitor();
    await joinRoom(b.cookie, room.roomId);
    const placedByB = await command(b.cookie, room.roomId, {
      type: "place",
      placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" },
    });
    expect(placedByB.json.ok).toBe(true);

    await leaveRoom(b.cookie, room.roomId);
    await joinRoom(c.cookie, room.roomId);
    await joinRoom(b.cookie, room.roomId); // refused, room_full — but contributor status predates this

    const after = await getRoom(a.cookie, room.roomId);
    const bId = placedByB.json.snapshot.parts[0].placedBy;
    expect(after.contributors.some((c) => c.visitorId === bId)).toBe(true);
  });

  it("multiple tabs for the SAME active identity never consume two slots, and both can mutate", async () => {
    const a = await freshVisitor();
    const room = await createPublicRoom(a.cookie);
    const b = await freshVisitor();
    expect((await joinRoom(b.cookie, room.roomId)).status).toBe(200);

    // "a second tab" = the same cookie, joining again
    expect((await joinRoom(a.cookie, room.roomId)).status).toBe(200);
    const snap = await getRoom(a.cookie, room.roomId);
    expect(snap.maxPlayers).toBe(2);
    const activeCount = (snap as any).members?.filter((m: any) => m.active).length;
    if (activeCount !== undefined) expect(activeCount).toBe(2); // a and b, not 3

    const placed = await command(a.cookie, room.roomId, {
      type: "place",
      placement: { partId: "brick-2x4", x: 1, y: 0, z: 1, rot: 0, colour: "navy" },
    });
    expect(placed.json.ok).toBe(true);
  });

  it("read-only access (viewing the room, saving a snapshot) is not revoked by inactivity, only mutation", async () => {
    const { b, room } = await setUpExactSequence();
    const read = await fetch(new URL(`/api/rooms/${room.roomId}`, baseUrl), { headers: { cookie: b } });
    expect(read.status).toBe(200); // b is still a historical member; viewing is unaffected

    const save = await fetch(new URL(`/api/rooms/${room.roomId}/save`, baseUrl), { method: "POST", headers: { cookie: b } });
    expect(save.status).toBe(200); // ADR 0009: any member, including an inactive one, may always save
  });

  it("solo/default-room building is unaffected by the active-membership check", async () => {
    const solo = await freshVisitor();
    const build = await (await fetch(new URL("/api/build", baseUrl), { headers: { cookie: solo.cookie } })).json();
    const placed = await fetch(new URL("/api/command", baseUrl), {
      method: "POST",
      headers: { cookie: solo.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        commandId: randomUUID(),
        expectedRevision: build.revision,
        command: { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" } },
      }),
    });
    const body = await placed.json();
    expect(body.ok, JSON.stringify(body)).toBe(true);
  });
});
