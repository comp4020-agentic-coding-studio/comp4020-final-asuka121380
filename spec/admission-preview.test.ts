import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// A direct-link join previously admitted a visitor BEFORE showing the
// room's publication terms (the terms were shown, if at all, only after
// the join already happened). This covers the pre-join admission preview
// (GET /api/rooms/:id/preview): it must never join, reserve a slot, or
// expose anything an invite-only room's non-member shouldn't see, and the
// actual join must still be independently re-checked — a preview going
// stale between being read and acted on is refused at the real join, not
// trusted from what the preview said.

const baseUrl = inject("baseUrl");

async function freshVisitor(): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  return { cookie: cookie! };
}

async function createRoom(cookie: string, visibility: "public" | "invite_only", allowPublish: boolean, label?: string): Promise<any> {
  const res = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ visibility, allowPublish, label }),
  });
  return res.json();
}

async function preview(cookie: string, roomId: string): Promise<{ status: number; body: any }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/preview`, baseUrl), { headers: { cookie } });
  return { status: res.status, body: await res.json() };
}

async function join(cookie: string, roomId: string): Promise<{ status: number; body: any }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/join`, baseUrl), { method: "POST", headers: { cookie } });
  return { status: res.status, body: await res.json() };
}

async function place(cookie: string, roomId: string): Promise<{ status: number }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/command`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      commandId: randomUUID(),
      expectedRevision: 0,
      command: { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" } },
    }),
  });
  return { status: res.status };
}

describe("pre-join admission preview", () => {
  it("shows name, scene, capacity, visibility and publication terms, for a public room, to a non-member", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true, "Preview test");
    const stranger = await freshVisitor();

    const p = await preview(stranger.cookie, room.roomId);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({
      id: room.roomId,
      label: "Preview test",
      visibility: "public",
      allowPublish: true,
      capacity: 2,
      canJoin: true,
      alreadyMember: false,
    });
    expect(typeof p.body.occupancy).toBe("number");
    expect(typeof p.body.sceneId).toBe("string");
  });

  it("never joins, reserves a slot, or exposes build contents — it's read-only", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    await place(a.cookie, room.roomId); // real content exists in the room

    const stranger = await freshVisitor();
    const p = await preview(stranger.cookie, room.roomId);
    expect(p.status).toBe(200);
    expect(p.body.parts).toBeUndefined(); // no build contents in the preview shape at all
    expect(p.body.inventory).toBeUndefined();

    // the preview alone must not have admitted or reserved anything: the
    // stranger is still absent from the member list after only previewing
    const direct = await fetch(new URL(`/api/rooms/${room.roomId}`, baseUrl), { headers: { cookie: stranger.cookie } });
    expect(direct.status).toBe(200); // public room: readable
    const directBody = await direct.json();
    expect(directBody.members).toHaveLength(1); // only the host — previewing added no member row
  });

  it("discloses nothing about an invite-only room to a visitor with no standing (same as a 404 from GET)", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "invite_only", false, "Secret room");
    const stranger = await freshVisitor();

    const p = await preview(stranger.cookie, room.roomId);
    expect(p.status).toBe(404);
    expect(p.body.label).toBeUndefined();
    expect(p.body.sceneId).toBeUndefined();
  });

  it("does not bypass the invitation check: an uninvited friend still gets nothing from the preview", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "invite_only", false);
    const friend = await freshVisitor();
    // make them friends (not invited to THIS room though)
    const link = await (await fetch(new URL("/api/friends/link", baseUrl), { method: "POST", headers: { cookie: a.cookie } })).json();
    const opened = await (await fetch(new URL(`/api/friends/link/${link.token}`, baseUrl), { headers: { cookie: friend.cookie } })).json();
    await fetch(new URL(`/api/friends/requests/${opened.requestId}/respond`, baseUrl), {
      method: "POST",
      headers: { cookie: friend.cookie, "content-type": "application/json" },
      body: JSON.stringify({ accept: true }),
    });

    const p = await preview(friend.cookie, room.roomId);
    expect(p.status).toBe(404); // friendship alone is still never standing (ADR 0007)
  });

  it("shows the room as full when it is, but a stale preview is re-checked at the real join (room_full there too)", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    const b = await freshVisitor();
    await join(b.cookie, room.roomId); // fills the 2-player room

    const stranger = await freshVisitor();
    const p = await preview(stranger.cookie, room.roomId);
    expect(p.status).toBe(200);
    expect(p.body.canJoin).toBe(false);
    expect(p.body.reason).toBe("room_full");

    // acting on a preview that said "full" is still refused at the real join
    const attempt = await join(stranger.cookie, room.roomId);
    expect(attempt.status).toBe(409);
    expect(attempt.body.code).toBe("room_full");
  });

  it("reports alreadyMember for a returning/admitted player, distinct from a first-time visitor", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "public", true);
    const b = await freshVisitor();
    await join(b.cookie, room.roomId);

    const pA = await preview(a.cookie, room.roomId);
    expect(pA.body.alreadyMember).toBe(true);
    const pB = await preview(b.cookie, room.roomId);
    expect(pB.body.alreadyMember).toBe(true);

    const stranger = await freshVisitor();
    const pStranger = await preview(stranger.cookie, room.roomId);
    expect(pStranger.body.alreadyMember).toBe(false);
  });

  it("the invitation list itself discloses occupancy and capacity, not only the publication flag", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie, "invite_only", false, "Invited room");
    const b = await freshVisitor();
    const link = await (await fetch(new URL("/api/friends/link", baseUrl), { method: "POST", headers: { cookie: a.cookie } })).json();
    const opened = await (await fetch(new URL(`/api/friends/link/${link.token}`, baseUrl), { headers: { cookie: b.cookie } })).json();
    await fetch(new URL(`/api/friends/requests/${opened.requestId}/respond`, baseUrl), {
      method: "POST",
      headers: { cookie: b.cookie, "content-type": "application/json" },
      body: JSON.stringify({ accept: true }),
    });
    const bId = (await (await fetch(new URL("/api/friends", baseUrl), { headers: { cookie: a.cookie } })).json()).friends[0];
    await fetch(new URL(`/api/rooms/${room.roomId}/invite`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ to: bId }),
    });

    const invites = await (await fetch(new URL("/api/my/invites", baseUrl), { headers: { cookie: b.cookie } })).json();
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ label: "Invited room", allowPublish: false, capacity: 2 });
    expect(typeof invites[0].occupancy).toBe("number");
  });
});
