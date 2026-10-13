import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// ADR 0009: a snapshot is an immutable, consistent capture that any member
// may take at any time without altering the room. Publication is a
// room-creation setting, never a role, and never more permissive after
// derivation than its source — checked again at publish and at showcase read.

const baseUrl = inject("baseUrl");

async function freshVisitor(): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  return { cookie: cookie! };
}

async function createRoom(cookie: string, visibility: "public" | "invite_only", allowPublish: boolean): Promise<any> {
  const res = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ visibility, allowPublish }),
  });
  return res.json();
}

async function place(cookie: string, roomId: string, x: number, z: number, expectedRevision = 0): Promise<any> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/command`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      commandId: randomUUID(),
      expectedRevision,
      command: { type: "place", placement: { partId: "brick-2x4", x, y: 0, z, rot: 0, colour: "navy" } },
    }),
  });
  return res.json();
}

async function save(cookie: string, roomId: string): Promise<any> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/save`, baseUrl), { method: "POST", headers: { cookie } });
  return res.json();
}

describe("snapshots", () => {
  it("captures a consistent revision, and a later room edit never changes an already-saved snapshot", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    await place(a.cookie, room.roomId, 0, 0);

    const first = await save(a.cookie, room.roomId);
    expect(first.revision).toBe(1);

    await place(a.cookie, room.roomId, 4, 4, 1);
    const second = await save(a.cookie, room.roomId);
    expect(second.revision).toBe(2);
    expect(second.id).not.toBe(first.id);

    const readFirst = await (await fetch(new URL(`/api/snapshots/${first.id}`, baseUrl), { headers: { cookie: a.cookie } })).json();
    expect(readFirst.parts).toHaveLength(1); // untouched by the later edit
  });

  it("can be saved by a member other than the host", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });

    const snap = await save(b.cookie, room.roomId);
    expect(snap.savedBy).not.toBe(room.hostId);
  });

  it("hides plans from the default read view and restores them only on continue", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "invite_only", false);
    await fetch(new URL(`/api/rooms/${room.roomId}/command`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        commandId: randomUUID(),
        expectedRevision: 0,
        command: { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } },
      }),
    });
    const snap = await save(a.cookie, room.roomId);
    const read = await (await fetch(new URL(`/api/snapshots/${snap.id}`, baseUrl), { headers: { cookie: a.cookie } })).json();
    expect(read.plans).toBeUndefined(); // hidden by default

    const continued = await (
      await fetch(new URL(`/api/snapshots/${snap.id}/continue`, baseUrl), {
        method: "POST",
        headers: { cookie: a.cookie, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
      })
    ).json();
    expect(continued.plans).toHaveLength(1); // restored in the live (continued) room
  });
});

describe("publication policy", () => {
  it("lets any member publish their own snapshot of an allow_publish room, keeping credit", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    await place(b.cookie, room.roomId, 0, 0);

    const snap = await save(b.cookie, room.roomId); // b, not the host, saves
    const pub = await (await fetch(new URL(`/api/snapshots/${snap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: b.cookie } })).json();
    expect(pub.ok).toBe(true);

    const list = await (await fetch(new URL("/api/showcase", baseUrl))).json();
    expect(list.some((e: any) => e.publicationId === pub.publicationId)).toBe(true);
  });

  it("refuses to publish a snapshot from an invite-only room by default, even by its saver", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "invite_only", false);
    await place(a.cookie, room.roomId, 0, 0);
    const snap = await save(a.cookie, room.roomId);
    expect(snap.allowPublish).toBe(false);

    const pub = await fetch(new URL(`/api/snapshots/${snap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: a.cookie } });
    expect(pub.status).toBe(403);
  });

  it("refuses to publish someone else's saved snapshot", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    const snap = await save(a.cookie, room.roomId);
    const stranger = await freshVisitor();
    const pub = await fetch(new URL(`/api/snapshots/${snap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: stranger.cookie } });
    expect(pub.status).toBe(403);
  });

  it("a restricted snapshot stays restricted through continue -> new room -> new snapshot (no laundering)", async () => {
    const a = await freshVisitor();
    const privateRoom = await createRoom(a.cookie, "invite_only", false);
    await place(a.cookie, privateRoom.roomId, 0, 0);
    const privateSnap = await save(a.cookie, privateRoom.roomId);
    expect(privateSnap.allowPublish).toBe(false);

    // continue it into a brand-new room, explicitly trying to turn publishing on
    const derivedRoom = await (
      await fetch(new URL(`/api/snapshots/${privateSnap.id}/continue`, baseUrl), {
        method: "POST",
        headers: { cookie: a.cookie, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public", allowPublish: true }),
      })
    ).json();
    expect(derivedRoom.allowPublish).toBe(true); // the room setting itself can be requested...

    // ...but a snapshot saved from that derived room is still not publishable,
    // because the lineage check walks back to the original restricted snapshot
    const derivedSnap = await save(a.cookie, derivedRoom.roomId);
    expect(derivedSnap.allowPublish).toBe(false);

    const pub = await fetch(new URL(`/api/snapshots/${derivedSnap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: a.cookie } });
    expect(pub.status).toBe(403);
  });

  it("the showcase never exposes a room's or snapshot's contents outside the publications table", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "invite_only", false);
    await place(a.cookie, room.roomId, 0, 0);
    const snap = await save(a.cookie, room.roomId);
    // there's no showcase-preview-by-room-or-snapshot-id endpoint at all; the
    // only read path is /api/showcase and /api/showcase/:publicationId
    const bogus = await fetch(new URL(`/api/showcase/${snap.id}`, baseUrl)); // snapshot id, not a publication id
    expect(bogus.status).toBe(404);
  });
});
