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

    // continue it into a brand-new room, explicitly trying to turn publishing
    // AND public visibility on — a public room is itself a disclosure path
    // (anyone can join it from the open lobby), so both are refused, not
    // only the publish flag
    const derivedRoom = await (
      await fetch(new URL(`/api/snapshots/${privateSnap.id}/continue`, baseUrl), {
        method: "POST",
        headers: { cookie: a.cookie, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public", allowPublish: true }),
      })
    ).json();
    expect(derivedRoom.allowPublish).toBe(false);
    expect(derivedRoom.visibility).toBe("invite_only");

    // a snapshot saved from that derived room is still not publishable,
    // because the lineage check walks back to the original restricted snapshot
    const derivedSnap = await save(a.cookie, derivedRoom.roomId);
    expect(derivedSnap.allowPublish).toBe(false);

    const pub = await fetch(new URL(`/api/snapshots/${derivedSnap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: a.cookie } });
    expect(pub.status).toBe(403);
  });

  it("a restricted snapshot cannot be exposed through a public derived room either (not only the publish flag)", async () => {
    const a = await freshVisitor();
    const privateRoom = await createRoom(a.cookie, "invite_only", false);
    await place(a.cookie, privateRoom.roomId, 0, 0);
    const privateSnap = await save(a.cookie, privateRoom.roomId);

    const derivedRoom = await (
      await fetch(new URL(`/api/snapshots/${privateSnap.id}/continue`, baseUrl), {
        method: "POST",
        headers: { cookie: a.cookie, "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public", allowPublish: true }),
      })
    ).json();

    // a stranger, with no relationship to a at all, must not be able to
    // read or join what is, despite the request above, an invite-only room
    const stranger = await freshVisitor();
    const lobby = await (await fetch(new URL("/api/rooms", baseUrl))).json();
    expect(lobby.some((r: any) => r.id === derivedRoom.roomId)).toBe(false);

    const read = await fetch(new URL(`/api/rooms/${derivedRoom.roomId}`, baseUrl), { headers: { cookie: stranger.cookie } });
    expect(read.status).toBe(404);

    const join = await fetch(new URL(`/api/rooms/${derivedRoom.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: stranger.cookie } });
    expect(join.status).toBe(403);
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

  // Regression: an independent review found that GET correctly refused an
  // unauthorized stranger (404), but POST .../continue skipped that check
  // entirely — accepting any snapshot id and copying its contents, with the
  // requester becoming host of the derived room. Making the derived room
  // itself unreachable (the laundering fix above) didn't close this: the
  // stranger already had the construction and attribution the moment
  // `continue` returned 200, regardless of what the new room's own
  // visibility turned out to be.
  it("unauthorized continuation of a private snapshot is refused before anything is created, even though GET already refused it (regression)", async () => {
    const a = await freshVisitor();
    const privateRoom = await createRoom(a.cookie, "invite_only", false);
    // real construction and attribution, not an empty kit, so a bypass that
    // only worked on an empty snapshot wouldn't quietly pass this test
    await place(a.cookie, privateRoom.roomId, 0, 0);
    await place(a.cookie, privateRoom.roomId, 4, 4, 1);
    const snap = await save(a.cookie, privateRoom.roomId);

    const stranger = await freshVisitor();
    const readAttempt = await fetch(new URL(`/api/snapshots/${snap.id}`, baseUrl), { headers: { cookie: stranger.cookie } });
    expect(readAttempt.status).toBe(404);

    const roomsBefore = await (await fetch(new URL("/api/my/rooms", baseUrl), { headers: { cookie: stranger.cookie } })).json();

    const continueAttempt = await fetch(new URL(`/api/snapshots/${snap.id}/continue`, baseUrl), {
      method: "POST",
      headers: { cookie: stranger.cookie, "content-type": "application/json" },
      body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
    });
    expect(continueAttempt.status).toBe(404);

    // nothing was created: the stranger's own room list is unchanged
    const roomsAfter = await (await fetch(new URL("/api/my/rooms", baseUrl), { headers: { cookie: stranger.cookie } })).json();
    expect(roomsAfter).toEqual(roomsBefore);
  });

  it("a current room member (not just the saver) may still view and continue a snapshot saved from their own room", async () => {
    const a = await freshVisitor();
    // public so b can join directly (invite-only would correctly refuse an
    // uninvited join — tested elsewhere); allowPublish is false regardless,
    // so this also shows access isn't tied to publication eligibility
    const room = await createRoom(a.cookie, "public", false);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    await place(a.cookie, room.roomId, 0, 0);
    const snap = await save(a.cookie, room.roomId); // a saves; b never did

    const read = await fetch(new URL(`/api/snapshots/${snap.id}`, baseUrl), { headers: { cookie: b.cookie } });
    expect(read.status).toBe(200);

    const continued = await fetch(new URL(`/api/snapshots/${snap.id}/continue`, baseUrl), {
      method: "POST",
      headers: { cookie: b.cookie, "content-type": "application/json" },
      body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
    });
    expect(continued.status).toBe(200);
  });

  it("a published snapshot may be continued by anyone, even a stranger with no room membership", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    await place(a.cookie, room.roomId, 0, 0);
    const snap = await save(a.cookie, room.roomId);
    await fetch(new URL(`/api/snapshots/${snap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: a.cookie } });

    const stranger = await freshVisitor();
    const continued = await fetch(new URL(`/api/snapshots/${snap.id}/continue`, baseUrl), {
      method: "POST",
      headers: { cookie: stranger.cookie, "content-type": "application/json" },
      body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
    });
    expect(continued.status).toBe(200);
  });
});

describe("saving a published version directly to another user's collection", () => {
  it("copies it into B's collection with no room created or joined, and never touches the source", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    await place(a.cookie, room.roomId, 0, 0);
    await place(a.cookie, room.roomId, 4, 4, 1);
    const snap = await save(a.cookie, room.roomId);
    const pub = await (await fetch(new URL(`/api/snapshots/${snap.id}/publish`, baseUrl), { method: "POST", headers: { cookie: a.cookie } })).json();
    expect(pub.ok).toBe(true);

    const b = await freshVisitor();
    const roomsBefore = await (await fetch(new URL("/api/my/rooms", baseUrl), { headers: { cookie: b.cookie } })).json();

    const collected = await (
      await fetch(new URL(`/api/snapshots/${snap.id}/collect`, baseUrl), { method: "POST", headers: { cookie: b.cookie } })
    ).json();
    expect(collected.id).toBeTruthy();
    expect(collected.id).not.toBe(snap.id); // a distinct row, not a reference
    expect(collected.savedBy).not.toBe(snap.savedBy); // B now owns this copy; A's original is untouched

    // no room was created or joined as a side effect
    const roomsAfter = await (await fetch(new URL("/api/my/rooms", baseUrl), { headers: { cookie: b.cookie } })).json();
    expect(roomsAfter).toEqual(roomsBefore);

    // B's copy appears in B's own collection, independently viewable
    const bCollection = await (await fetch(new URL("/api/snapshots", baseUrl), { headers: { cookie: b.cookie } })).json();
    expect(bCollection.some((s: any) => s.id === collected.id)).toBe(true);
    const bView = await fetch(new URL(`/api/snapshots/${collected.id}`, baseUrl), { headers: { cookie: b.cookie } });
    expect(bView.status).toBe(200);
    const bDetail = await bView.json();
    expect(bDetail.parts).toHaveLength(2); // the exact construction preserved
    expect(bDetail.sourceSnapshotId).toBe(snap.id);

    // the source snapshot (A's) is unchanged
    const original = await (await fetch(new URL(`/api/snapshots/${snap.id}`, baseUrl), { headers: { cookie: a.cookie } })).json();
    expect(original.parts).toHaveLength(2);
    expect(original.savedBy).toBe(snap.savedBy);
  });

  it("refuses to collect a restricted (unauthorized) snapshot, same as viewing or continuing it would", async () => {
    const a = await freshVisitor();
    const privateRoom = await createRoom(a.cookie, "invite_only", false);
    await place(a.cookie, privateRoom.roomId, 0, 0);
    const snap = await save(a.cookie, privateRoom.roomId);

    const stranger = await freshVisitor();
    const collect = await fetch(new URL(`/api/snapshots/${snap.id}/collect`, baseUrl), { method: "POST", headers: { cookie: stranger.cookie } });
    expect(collect.status).toBe(404);
  });
});
