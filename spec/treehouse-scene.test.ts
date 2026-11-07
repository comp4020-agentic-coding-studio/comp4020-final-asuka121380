import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// ADR 0016, against the running app: Woodland Commons, the third playable
// scene. A room created with it stores it; reload, snapshot and continue all
// keep it; it admits six distinct visitors and refuses a seventh; all six
// share and conserve one kit, and see each other's parts live; and the
// server decides with the tree's fixed structure: a part rests on a
// platform, and nothing is placed inside the trunk.

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
  return res.headers.get("set-cookie")!.split(";")[0];
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

const SCENE = "treehouse-01";
const createRoom = (cookie: string, body: Record<string, unknown> = {}) => post(cookie, "/api/rooms", { visibility: "public", allowPublish: true, sceneId: SCENE, ...body });

async function command(cookie: string, roomId: string, cmd: Record<string, unknown>) {
  const now = (await get(cookie, `/api/rooms/${roomId}`)).json as Snapshot;
  return post(cookie, `/api/rooms/${roomId}/command`, { commandId: randomUUID(), expectedRevision: now.revision, command: cmd });
}

const place = (cookie: string, roomId: string, placement: Record<string, unknown>) =>
  command(cookie, roomId, { type: "place", placement: { rot: 0, colour: "nougat", ...placement } });

async function nextEvent<T>(stream: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number): Promise<T> {
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([
      stream.read(),
      new Promise<{ value: undefined; done: false }>((resolve) => setTimeout(() => resolve({ value: undefined, done: false }), 50)),
    ]);
    if (done) throw new Error("stream closed");
    if (value) buf += decoder.decode(value, { stream: true });
    const m = buf.match(/data: (.*)\n\n/);
    if (m) return JSON.parse(m[1]) as T;
  }
  throw new Error(`no event within ${timeoutMs}ms`);
}

describe("choosing Woodland Commons", () => {
  it("a new room is an empty tree-house room with its own kit and six places", async () => {
    const a = await freshVisitor();
    const { status, json } = await createRoom(a);
    expect(status).toBe(200);
    const room = json as Snapshot;
    expect(room.sceneId).toBe(SCENE);
    expect(room.maxPlayers).toBe(6);
    expect(room.parts).toHaveLength(0);
    expect(room.inventory["stairs-2x4"]).toBe(6);
    expect(room.inventory["plate-1x2"]).toBe(345);
    expect(room.inventory["arch-1x8x2"]).toBeUndefined(); // a castle part
    expect(room.inventory["planter-1x2"]).toBeUndefined(); // a Beach Houses part
  });

  it("keeps one solo plot per scene, beside the Beach Houses and castle plots", async () => {
    const a = await freshVisitor();
    const tree = (await get(a, `/api/build?scene=${SCENE}`)).json as Snapshot;
    const castle = (await get(a, "/api/build?scene=castle-01")).json as Snapshot;
    const beach = (await get(a, "/api/build")).json as Snapshot;
    expect(tree.sceneId).toBe(SCENE);
    expect(new Set([tree.roomId, castle.roomId, beach.roomId]).size).toBe(3);
    expect(((await get(a, `/api/build?scene=${SCENE}`)).json as Snapshot).roomId).toBe(tree.roomId);
    expect(tree.maxPlayers).toBe(6);
  });
});

describe("the server decides with the tree", () => {
  it("accepts a part on the left platform, refuses one inside the trunk and one floating beside a platform", async () => {
    const a = await freshVisitor();
    const room = (await createRoom(a)).json as Snapshot;
    const onDeck = await place(a, room.roomId, { partId: "brick-1x2", x: 2, y: 12, z: 5 });
    expect(onDeck.json.ok, JSON.stringify(onDeck.json)).toBe(true);
    const inTrunk = await place(a, room.roomId, { partId: "brick-1x1", x: 15, y: 0, z: 4 });
    expect(inTrunk.json.ok).toBe(false);
    expect(inTrunk.json.code).toBe("collision");
    expect(inTrunk.json.message).toMatch(/trunk/);
    const floating = await place(a, room.roomId, { partId: "brick-1x1", x: 9, y: 12, z: 5 });
    expect(floating.json.code).toBe("unsupported");
    // a plan obeys the same tree
    const plan = await command(a, room.roomId, { type: "propose-plan", plan: { partId: "brick-1x1", x: 15, y: 20, z: 4, rot: 0, colour: "nougat" } });
    expect(plan.json.code).toBe("collision");
    // the part on the platform can be removed; stock comes back
    const after = (await get(a, `/api/rooms/${room.roomId}`)).json as Snapshot;
    const removed = await command(a, room.roomId, { type: "remove", placedId: after.parts[0].id });
    expect(removed.json.ok, JSON.stringify(removed.json)).toBe(true);
    expect(((await get(a, `/api/rooms/${room.roomId}`)).json as Snapshot).inventory["brick-1x2"]).toBe(43);
  });

  it("no command can name a part of the tree", async () => {
    const a = await freshVisitor();
    const room = (await createRoom(a)).json as Snapshot;
    for (const id of ["trunk-lower", "deck-left", "branch-right"]) {
      const r = await command(a, room.roomId, { type: "remove", placedId: id });
      expect(r.json.code, id).toBe("not_found");
    }
  });
});

describe("Woodland Commons survives every path", () => {
  it("reload, snapshot and continue all keep the scene and its parts", async () => {
    const a = await freshVisitor();
    const room = (await createRoom(a)).json as Snapshot;
    expect((await place(a, room.roomId, { partId: "plate-2x2", x: 24, y: 24, z: 6 })).json.ok).toBe(true);
    expect((await place(a, room.roomId, { partId: "stairs-2x4", x: 3, y: 0, z: 13 })).json.ok).toBe(true);

    const reloaded = (await get(a, `/api/rooms/${room.roomId}`)).json as Snapshot;
    expect(reloaded.sceneId).toBe(SCENE);
    expect(reloaded.parts).toHaveLength(2);

    const saved = (await post(a, `/api/rooms/${room.roomId}/save`)).json;
    expect(saved.sceneId).toBe(SCENE);
    const read = (await get(a, `/api/snapshots/${saved.id}`)).json;
    expect(read.sceneId).toBe(SCENE);
    expect(read.parts).toHaveLength(2);

    const continued = (await post(a, `/api/snapshots/${saved.id}/continue`, { visibility: "invite_only" })).json as Snapshot;
    expect(continued.sceneId).toBe(SCENE);
    expect(continued.maxPlayers).toBe(6);
    expect(continued.parts.map((p) => p.partId).sort()).toEqual(["plate-2x2", "stairs-2x4"]);
    expect(continued.inventory["stairs-2x4"] + 1).toBe(6);
  });

  it("the lobby and the pre-join preview show six places", async () => {
    const a = await freshVisitor();
    const b = await freshVisitor();
    const room = (await createRoom(a, { label: "Woodland lobby check" })).json as Snapshot;
    const lobby = (await get(b, "/api/rooms")).json as { id: string; sceneId: string; capacity: number }[];
    const listed = lobby.find((r) => r.id === room.roomId);
    expect(listed?.sceneId).toBe(SCENE);
    expect(listed?.capacity).toBe(6);
    const preview = (await get(b, `/api/rooms/${room.roomId}/preview`)).json;
    expect(preview.sceneId).toBe(SCENE);
    expect(preview.capacity).toBe(6);
  });
});

describe("six builders share one tree", () => {
  it("admits six distinct visitors, refuses a seventh, and all six share one kit live", async () => {
    const host = await freshVisitor();
    const room = (await createRoom(host)).json as Snapshot;
    const others = await Promise.all(Array.from({ length: 5 }, () => freshVisitor()));
    for (const c of others) {
      const joined = await post(c, `/api/rooms/${room.roomId}/join`);
      expect(joined.status, JSON.stringify(joined.json)).toBe(200);
      expect(joined.json.maxPlayers).toBe(6);
    }
    const seventh = await freshVisitor();
    const refused = await post(seventh, `/api/rooms/${room.roomId}/join`);
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe("room_full");

    // the sixth member watches the room's stream while the others build
    const watcher = others[4];
    const res = await fetch(new URL(`/api/rooms/${room.roomId}/events`, baseUrl), { headers: { cookie: watcher } });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await nextEvent(reader, 2000);

    // each of the six places a 1×2 plate: on the ground, on each platform, and on the plot's corners
    const builders = [host, ...others];
    const spots = [
      [0, 0, 26],
      [2, 12, 4],
      [24, 24, 5],
      [12, 36, 8],
      [30, 0, 26],
      [0, 0, 20],
    ];
    const start = Date.now();
    const r0 = await place(builders[0], room.roomId, { partId: "plate-1x2", x: spots[0][0], y: spots[0][1], z: spots[0][2] });
    expect(r0.json.ok, JSON.stringify(r0.json)).toBe(true);
    const event = await nextEvent<{ type: string; snapshot: Snapshot }>(reader, 2000);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(event.snapshot.parts).toHaveLength(1);
    reader.cancel();
    for (let i = 1; i < 6; i++) {
      const r = await place(builders[i], room.roomId, { partId: "plate-1x2", x: spots[i][0], y: spots[i][1], z: spots[i][2] });
      expect(r.json.ok, `${i}: ${JSON.stringify(r.json)}`).toBe(true);
    }
    const after = (await get(seventh, `/api/rooms/${room.roomId}`)).json as Snapshot;
    expect(after.parts.filter((p) => p.partId === "plate-1x2")).toHaveLength(6);
    expect(after.inventory["plate-1x2"]).toBe(345 - 6);
    const denied = await place(seventh, room.roomId, { partId: "plate-1x2", x: 4, y: 0, z: 24 });
    expect(denied.json.ok).toBe(false);
  });
});
