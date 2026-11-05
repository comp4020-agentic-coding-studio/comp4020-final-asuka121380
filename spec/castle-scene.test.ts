import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// ADR 0015, against the running app: a second playable scene. The scene a
// room builds is chosen when it is created, stored on the room, and read
// back from there by every path (reload, join, snapshot, continue); the
// castle admits four distinct visitors and refuses a fifth; its stock is
// one shared kit; and Beach Houses keeps its own kit and two places.

const baseUrl = inject("baseUrl");

interface Snapshot {
  roomId: string;
  sceneId: string;
  templateVersion: number;
  maxPlayers: number;
  revision: number;
  parts: { id: string; partId: string }[];
  inventory: Record<string, number>;
}

async function freshVisitor(): Promise<string> {
  const res = await fetch(new URL("/api/me", baseUrl));
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}

async function post(cookie: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: baseUrl },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function get(cookie: string, path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(path, baseUrl), { headers: { cookie } });
  return { status: res.status, json: await res.json() };
}

const createRoom = (cookie: string, body: Record<string, unknown>) => post(cookie, "/api/rooms", { visibility: "public", allowPublish: true, ...body });

const place = (cookie: string, roomId: string, placement: Record<string, unknown>) =>
  post(cookie, `/api/rooms/${roomId}/command`, {
    commandId: randomUUID(),
    expectedRevision: 0,
    command: { type: "place", placement: { rot: 0, colour: "stone", ...placement } },
  });

describe("choosing the castle scene", () => {
  it("a new room builds the scene asked for, with that scene's kit and capacity", async () => {
    const a = await freshVisitor();
    const { status, json } = await createRoom(a, { sceneId: "castle-01" });
    expect(status).toBe(200);
    const room = json as Snapshot;
    expect(room.sceneId).toBe("castle-01");
    expect(room.maxPlayers).toBe(4);
    expect(room.inventory["brick-1x1"]).toBe(229);
    expect(room.inventory["arch-1x8x2"]).toBe(4);
    expect(room.inventory["planter-1x2"]).toBeUndefined(); // a Beach Houses part
    expect(room.parts).toHaveLength(0); // new rooms start empty, never with a finished castle
  });

  it("a room created with no scene is still Beach Houses, with two places", async () => {
    const a = await freshVisitor();
    const room = (await createRoom(a, {})).json as Snapshot;
    expect(room.sceneId).toBe("street-01");
    expect(room.maxPlayers).toBe(2);
    expect(room.inventory["brick-1x1"]).toBeUndefined();
  });

  it("an unknown scene is refused, and nothing is created", async () => {
    const a = await freshVisitor();
    const before = (await get(a, "/api/my/rooms")).json as unknown[];
    const { status } = await createRoom(a, { sceneId: "moon-base" });
    expect(status).toBe(400);
    const after = (await get(a, "/api/my/rooms")).json as unknown[];
    expect(after.length).toBe(before.length);
  });

  it("keeps one solo plot per scene for a visitor, each with its own scene", async () => {
    const a = await freshVisitor();
    const castle = (await get(a, "/api/build?scene=castle-01")).json as Snapshot;
    const beach = (await get(a, "/api/build")).json as Snapshot;
    expect(castle.sceneId).toBe("castle-01");
    expect(beach.sceneId).toBe("street-01");
    expect(castle.roomId).not.toBe(beach.roomId);
    // asking again returns the same plots, never a new one
    expect(((await get(a, "/api/build?scene=castle-01")).json as Snapshot).roomId).toBe(castle.roomId);
    expect(((await get(a, "/api/build?scene=street-01")).json as Snapshot).roomId).toBe(beach.roomId);
  });

  it("a castle part is refused in a Beach Houses room, and accepted in a castle room", async () => {
    const a = await freshVisitor();
    const beach = (await createRoom(a, {})).json as Snapshot;
    const castle = (await createRoom(a, { sceneId: "castle-01" })).json as Snapshot;
    const there = await place(a, beach.roomId, { partId: "arch-1x4", x: 0, y: 0, z: 0 });
    expect(there.json.ok).toBe(false);
    expect(there.json.code).toBe("unknown_part");
    const here = await place(a, castle.roomId, { partId: "arch-1x4", x: 0, y: 0, z: 0 });
    expect(here.json.ok, JSON.stringify(here.json)).toBe(true);
  });
});

describe("the castle's scene survives every path", () => {
  it("reload, snapshot and continue all keep the castle", async () => {
    const a = await freshVisitor();
    const room = (await createRoom(a, { sceneId: "castle-01" })).json as Snapshot;
    expect((await place(a, room.roomId, { partId: "plate-6x6", x: 4, y: 0, z: 4 })).json.ok).toBe(true);
    expect((await place(a, room.roomId, { partId: "round-brick-1x1", x: 4, y: 1, z: 4 })).json.ok).toBe(true);

    const reloaded = (await get(a, `/api/rooms/${room.roomId}`)).json as Snapshot;
    expect(reloaded.sceneId).toBe("castle-01");
    expect(reloaded.parts).toHaveLength(2);

    const saved = (await post(a, `/api/rooms/${room.roomId}/save`)).json;
    expect(saved.sceneId).toBe("castle-01");
    const read = (await get(a, `/api/snapshots/${saved.id}`)).json;
    expect(read.sceneId).toBe("castle-01");
    expect(read.parts).toHaveLength(2);

    const continued = (await post(a, `/api/snapshots/${saved.id}/continue`, { visibility: "invite_only" })).json as Snapshot;
    expect(continued.sceneId).toBe("castle-01");
    expect(continued.maxPlayers).toBe(4);
    expect(continued.parts.map((p) => p.partId).sort()).toEqual(["plate-6x6", "round-brick-1x1"]);
    // the continued room's own kit is the castle's: held + placed = kit
    expect(continued.inventory["plate-6x6"] + 1).toBe(15);

    const mine = (await get(a, "/api/my/rooms")).json as { id: string; sceneId: string }[];
    expect(mine.find((r) => r.id === room.roomId)?.sceneId).toBe("castle-01");
    expect(mine.find((r) => r.id === continued.roomId)?.sceneId).toBe("castle-01");
  });

  it("the lobby and the pre-join preview show the castle's real capacity", async () => {
    const a = await freshVisitor();
    const b = await freshVisitor();
    const room = (await createRoom(a, { sceneId: "castle-01", label: "Castle lobby check" })).json as Snapshot;
    const lobby = (await get(b, "/api/rooms")).json as { id: string; sceneId: string; capacity: number }[];
    const listed = lobby.find((r) => r.id === room.roomId);
    expect(listed?.sceneId).toBe("castle-01");
    expect(listed?.capacity).toBe(4);
    const preview = (await get(b, `/api/rooms/${room.roomId}/preview`)).json;
    expect(preview.sceneId).toBe("castle-01");
    expect(preview.capacity).toBe(4);
  });
});

describe("four builders share one castle", () => {
  it("admits four distinct visitors, refuses a fifth, and all four share and conserve one kit", async () => {
    const host = await freshVisitor();
    const room = (await createRoom(host, { sceneId: "castle-01" })).json as Snapshot;
    const others = [await freshVisitor(), await freshVisitor(), await freshVisitor()];
    for (const c of others) {
      const joined = await post(c, `/api/rooms/${room.roomId}/join`);
      expect(joined.status, JSON.stringify(joined.json)).toBe(200);
      expect(joined.json.maxPlayers).toBe(4);
    }
    const fifth = await freshVisitor();
    const refused = await post(fifth, `/api/rooms/${room.roomId}/join`);
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe("room_full");

    // each of the four places one 1×1 brick in a different corner of the courtyard
    const builders = [host, ...others];
    const spots = [
      [0, 0],
      [31, 0],
      [0, 25],
      [31, 25],
    ];
    for (const [i, c] of builders.entries()) {
      const r = await place(c, room.roomId, { partId: "brick-1x1", x: spots[i][0], y: 0, z: spots[i][1] });
      expect(r.json.ok, JSON.stringify(r.json)).toBe(true);
    }
    const after = (await get(fifth, `/api/rooms/${room.roomId}`)).json as Snapshot;
    expect(after.parts.filter((p) => p.partId === "brick-1x1")).toHaveLength(4);
    expect(after.inventory["brick-1x1"]).toBe(229 - 4);
    // the refused fifth visitor can read the public room but not build in it
    const denied = await place(fifth, room.roomId, { partId: "brick-1x1", x: 10, y: 0, z: 10 });
    expect(denied.json.ok).toBe(false);
  });

  it("Beach Houses still refuses its third visitor", async () => {
    const host = await freshVisitor();
    const room = (await createRoom(host, {})).json as Snapshot;
    expect((await post(await freshVisitor(), `/api/rooms/${room.roomId}/join`)).status).toBe(200);
    const third = await post(await freshVisitor(), `/api/rooms/${room.roomId}/join`);
    expect(third.status).toBe(409);
    expect(third.json.code).toBe("room_full");
  });
});
