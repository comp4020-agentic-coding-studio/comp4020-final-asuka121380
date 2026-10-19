import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// ADR 0008's testable half: two distinct people, in two independent
// browsers (two fresh cookies, never sharing one), act on one shared room.
// A change one makes must reach the other's open SSE stream in well under
// the crit's "about a second" bar, with no reload, and two independent
// placements must both succeed rather than one rejecting the other.

const baseUrl = inject("baseUrl");

interface Snapshot {
  roomId: string;
  revision: number;
  maxPlayers: number;
  parts: { id: string; partId: string; x: number; y: number; z: number; rev?: number }[];
  inventory: Record<string, number>;
}

async function freshVisitor(): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  return { cookie: cookie! };
}

async function createPublicRoom(cookie: string): Promise<Snapshot> {
  const res = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ visibility: "public", allowPublish: true }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Snapshot;
}

async function joinRoom(cookie: string, roomId: string): Promise<Snapshot> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/join`, baseUrl), { method: "POST", headers: { cookie } });
  const body = (await res.json()) as Snapshot;
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}

async function place(cookie: string, roomId: string, placement: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/command`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      commandId: randomUUID(),
      expectedRevision: 0,
      command: { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy", ...placement } },
    }),
  });
  return { status: res.status, json: await res.json() };
}

/** Reads one SSE `data:` event from the stream, or times out. */
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

describe("realtime: two people in one room", () => {
  it("delivers a placement to the other open session well under a second, with no reload", async () => {
    const a = await freshVisitor();
    const room = await createPublicRoom(a.cookie);
    const b = await freshVisitor();
    await joinRoom(b.cookie, room.roomId);

    const res = await fetch(new URL(`/api/rooms/${room.roomId}/events`, baseUrl), { headers: { cookie: b.cookie } });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await nextEvent(reader, 2000); // the catch-up snapshot on connect

    const start = Date.now();
    const placed = await place(a.cookie, room.roomId, { x: 2, z: 2 });
    expect(placed.json.ok).toBe(true);

    const event = await nextEvent<{ type: string; snapshot: Snapshot }>(reader, 2000);
    const elapsed = Date.now() - start;
    expect(event.type).toBe("snapshot");
    expect(event.snapshot.parts).toHaveLength(1);
    expect(elapsed, `took ${elapsed}ms, wanted well under 1000ms`).toBeLessThan(1000);
    reader.cancel();
  });

  // ADR 0011: Plan mode's demand count is derived on each client from this
  // same pushed snapshot, so the plan, and the unchanged real stock, must
  // both arrive on the other member's stream.
  it("delivers a proposed plan to the other open session, with real stock unchanged", async () => {
    const a = await freshVisitor();
    const room = await createPublicRoom(a.cookie);
    const b = await freshVisitor();
    await joinRoom(b.cookie, room.roomId);
    const res = await fetch(new URL(`/api/rooms/${room.roomId}/events`, baseUrl), { headers: { cookie: b.cookie } });
    const reader = res.body!.getReader();
    await nextEvent(reader, 2000);

    const start = Date.now();
    const proposed = await fetch(new URL(`/api/rooms/${room.roomId}/command`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ commandId: randomUUID(), expectedRevision: 0, command: { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 6, z: 0, rot: 0, colour: "sky" } } }),
    });
    expect((await proposed.json()).ok).toBe(true);
    const event = await nextEvent<{ type: string; snapshot: Snapshot & { plans: { partId: string }[] } }>(reader, 2000);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(event.snapshot.plans).toHaveLength(1);
    expect(event.snapshot.inventory["brick-2x4"]).toBe(room.inventory["brick-2x4"]);
    reader.cancel();
  });

  it("lets two members place in different spots at once; neither rejects the other", async () => {
    const a = await freshVisitor();
    const room = await createPublicRoom(a.cookie);
    const b = await freshVisitor();
    await joinRoom(b.cookie, room.roomId);

    const [ra, rb] = await Promise.all([place(a.cookie, room.roomId, { x: 0, z: 0 }), place(b.cookie, room.roomId, { x: 6, z: 4 })]);
    expect(ra.json.ok, JSON.stringify(ra.json)).toBe(true);
    expect(rb.json.ok, JSON.stringify(rb.json)).toBe(true);

    const res = await fetch(new URL(`/api/rooms/${room.roomId}`, baseUrl), { headers: { cookie: a.cookie } });
    const snap = (await res.json()) as Snapshot;
    expect(snap.parts).toHaveLength(2);
  });

  it("enforces the scene's maxPlayers on join, and lets a rejoin from the same visitor through without using another slot", async () => {
    const a = await freshVisitor();
    const room = await createPublicRoom(a.cookie);
    expect(room.maxPlayers).toBe(2);
    const b = await freshVisitor();
    await joinRoom(b.cookie, room.roomId);

    const c = await freshVisitor();
    const res = await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: c.cookie } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("room_full");

    // b rejoining (e.g. a second tab, or a reload) must not be refused as full
    const again = await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    expect(again.status).toBe(200);
  });

  it("refuses a non-member from reading or subscribing to an invite-only room", async () => {
    const a = await freshVisitor();
    const createRes = await fetch(new URL("/api/rooms", baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ visibility: "invite_only", allowPublish: false }),
    });
    const room = (await createRes.json()) as Snapshot;

    const stranger = await freshVisitor();
    const read = await fetch(new URL(`/api/rooms/${room.roomId}`, baseUrl), { headers: { cookie: stranger.cookie } });
    expect(read.status).toBe(404);

    const events = await fetch(new URL(`/api/rooms/${room.roomId}/events`, baseUrl), { headers: { cookie: stranger.cookie } });
    expect(events.status).toBe(404);

    const join = await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: stranger.cookie } });
    expect(join.status).toBe(403);
  });
});
