import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// ADR 0009: plans cost no stock and never block real construction; realizing
// one is atomic (consumes stock exactly once, resolves the plan, keeps both
// proposer and realizer); attribution never overwrites the original builder;
// a contributor record outlives the contributor's own parts.

const baseUrl = inject("baseUrl");

interface Snapshot {
  roomId: string;
  revision: number;
  parts: { id: string; partId: string; placedBy?: string; editedBy?: string; proposedBy?: string; rev?: number }[];
  inventory: Record<string, number>;
  plans: { id: string; partId: string; proposedBy: string; status: string }[];
  contributors: { visitorId: string; hasBuilt: boolean }[];
}

async function freshVisitor(): Promise<{ cookie: string }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  return { cookie: cookie! };
}

async function createRoom(cookie: string): Promise<Snapshot> {
  const res = await fetch(new URL("/api/rooms", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ visibility: "public", allowPublish: true }),
  });
  return (await res.json()) as Snapshot;
}

async function command(cookie: string, roomId: string, cmd: Record<string, unknown>, expectedRevision = 0): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(`/api/rooms/${roomId}/command`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ commandId: randomUUID(), expectedRevision, command: cmd }),
  });
  return { status: res.status, json: await res.json() };
}

async function getRoom(cookie: string, roomId: string): Promise<Snapshot> {
  const res = await fetch(new URL(`/api/rooms/${roomId}`, baseUrl), { headers: { cookie } });
  return (await res.json()) as Snapshot;
}

describe("plans", () => {
  it("cost no stock to propose, and don't block a real placement in the same spot", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const before = room.inventory["brick-2x4"];

    const proposed = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 2, y: 0, z: 2, rot: 0, colour: "sky" } });
    expect(proposed.json.ok).toBe(true);
    expect(proposed.json.snapshot.inventory["brick-2x4"]).toBe(before);
    expect(proposed.json.snapshot.plans).toHaveLength(1);

    // a real placement in the same spot is unaffected by the plan sitting there
    const real = await command(a.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 2, y: 0, z: 2, rot: 0, colour: "navy" } });
    expect(real.json.ok, JSON.stringify(real.json)).toBe(true);
  });

  it("realizing consumes stock exactly once and keeps both proposer and realizer", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });

    const before = room.inventory["brick-2x4"];
    const proposed = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 4, y: 0, z: 4, rot: 0, colour: "sky" } });
    const planId = proposed.json.snapshot.plans[0].id;

    // b (not the proposer) realizes it — the brief: any member may realize a plan
    const realized = await command(b.cookie, room.roomId, { type: "realize-plan", planId }, proposed.json.snapshot.revision);
    expect(realized.json.ok, JSON.stringify(realized.json)).toBe(true);
    expect(realized.json.snapshot.inventory["brick-2x4"]).toBe(before - 1);
    expect(realized.json.snapshot.plans.find((p: any) => p.id === planId)).toBeUndefined(); // no longer open

    const part = realized.json.snapshot.parts.find((p: any) => p.x === 4 && p.z === 4);
    expect(part.placedBy).toBeDefined();
    expect(part.proposedBy).toBeDefined();
    expect(part.proposedBy).not.toBe(part.placedBy); // a proposed by a, realized by b

    // realizing again (stale plan, already resolved) is refused, not double-charged
    const again = await command(b.cookie, room.roomId, { type: "realize-plan", planId }, realized.json.snapshot.revision);
    expect(again.json.ok).toBe(false);
  });

  it("rejects realizing a plan that no longer fits, without silently dropping it", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const proposed = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 8, y: 0, z: 2, rot: 0, colour: "sky" } });
    const planId = proposed.json.snapshot.plans[0].id;

    // build over the same spot for real, so the plan can no longer be realized
    const real = await command(a.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 8, y: 0, z: 2, rot: 0, colour: "navy" } }, proposed.json.snapshot.revision);
    expect(real.json.ok).toBe(true);

    const realize = await command(a.cookie, room.roomId, { type: "realize-plan", planId }, real.json.snapshot.revision);
    expect(realize.json.ok).toBe(false);
    expect(realize.json.code).toBe("collision");
    // the plan itself is still there, open, not silently removed
    expect(realize.json.snapshot.plans.some((p: any) => p.id === planId)).toBe(true);
  });
});

describe("attribution and contributors", () => {
  it("keeps the original builder on recolour and rotate; records who edited separately", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const placed = await command(a.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" } });
    const part = placed.json.snapshot.parts[0];
    const originalBuilder = part.placedBy;

    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    const recoloured = await command(b.cookie, room.roomId, { type: "recolour", placedId: part.id, colour: "sky", expectedRev: part.rev }, placed.json.snapshot.revision);
    expect(recoloured.json.ok).toBe(true);
    const after = recoloured.json.snapshot.parts.find((p: any) => p.id === part.id);
    expect(after.placedBy).toBe(originalBuilder); // never overwritten
    expect(after.editedBy).toBeDefined();
    expect(after.editedBy).not.toBe(originalBuilder);
  });

  it("records a contributor on first real placement, and keeps them after their parts are removed or they leave", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });

    const placed = await command(b.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" } });
    expect(placed.json.ok).toBe(true);
    let snap = await getRoom(a.cookie, room.roomId);
    expect(snap.contributors.some((c) => c.hasBuilt)).toBe(true);

    await fetch(new URL(`/api/rooms/${room.roomId}/leave`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    const removed = await command(a.cookie, room.roomId, { type: "remove", placedId: placed.json.snapshot.parts[0].id }, placed.json.snapshot.revision);
    expect(removed.json.ok).toBe(true);
    snap = await getRoom(a.cookie, room.roomId);
    // the contributor record survives: still a contributor, even with no parts left and not present
    expect(snap.contributors.length).toBeGreaterThanOrEqual(1);
  });

  it("never records a plan-only participant as having built anything", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });

    await command(b.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    const snap = await getRoom(a.cookie, room.roomId);
    // b proposed a plan but placed nothing real: not a contributor
    expect(snap.contributors.length).toBe(0);
  });
});
