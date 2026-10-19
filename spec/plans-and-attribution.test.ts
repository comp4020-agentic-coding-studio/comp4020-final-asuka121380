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

  // Author-directed rule change, 19 Oct 2026 (ADR 0012), superseding ADR
  // 0009's 13 Oct correction and the two tests that asserted it here ("a
  // plan with no support at all is accepted" and "a plan may collide with
  // real construction"). Plans now describe a geometrically coherent
  // structure: real parts plus standing open plans, under the same bounds,
  // collision and stud rules as real parts. Only stock stays exempt.
  it("refuses a floating plan, but accepts a wall on the plot and a roof on that planned wall; the roof can't be realized until the wall is real", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);

    const floating = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 3, z: 0, rot: 0, colour: "sky" } });
    expect(floating.json.ok).toBe(false);
    expect(floating.json.code).toBe("unsupported");

    const wall = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    expect(wall.json.ok, JSON.stringify(wall.json)).toBe(true);
    const roof = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "slope-2x2", x: 0, y: 3, z: 0, rot: 0, colour: "navy" } });
    expect(roof.json.ok, JSON.stringify(roof.json)).toBe(true);
    const wallId = wall.json.snapshot.plans[0].id;
    const roofId = roof.json.snapshot.plans.find((p: any) => p.id !== wallId).id;

    // a planned wall never holds up a real roof
    const tooSoon = await command(a.cookie, room.roomId, { type: "realize-plan", planId: roofId });
    expect(tooSoon.json.ok).toBe(false);
    expect(tooSoon.json.code).toBe("unsupported");
    expect(tooSoon.json.snapshot.plans.some((p: any) => p.id === roofId)).toBe(true);

    // realizing the wall keeps the roof plan (now resting on the real wall), and then the roof can be realized
    const builtWall = await command(a.cookie, room.roomId, { type: "realize-plan", planId: wallId });
    expect(builtWall.json.ok, JSON.stringify(builtWall.json)).toBe(true);
    expect(builtWall.json.snapshot.plans.map((p: any) => p.id)).toEqual([roofId]);
    const builtRoof = await command(a.cookie, room.roomId, { type: "realize-plan", planId: roofId });
    expect(builtRoof.json.ok, JSON.stringify(builtRoof.json)).toBe(true);
    expect(builtRoof.json.snapshot.parts.find((p: any) => p.partId === "slope-2x2").proposedBy).toBeDefined();
  });

  it("refuses a plan inside a real part, and a duplicate or partial overlap of another plan, horizontal or vertical", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const real = await command(a.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy" } });
    expect(real.json.ok).toBe(true);
    const inside = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 1, y: 0, z: 0, rot: 0, colour: "sky" } });
    expect(inside.json.code).toBe("collision");

    const p1 = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 8, y: 0, z: 2, rot: 0, colour: "sky" } });
    expect(p1.json.ok).toBe(true);
    for (const plan of [
      { partId: "brick-2x4", x: 8, y: 0, z: 2, rot: 0, colour: "sky" }, // exact duplicate
      { partId: "brick-2x4", x: 10, y: 0, z: 3, rot: 0, colour: "sky" }, // partial, sideways
      { partId: "plate-2x2", x: 9, y: 2, z: 2, rot: 0, colour: "sky" }, // partial, vertical
    ]) {
      const r = await command(a.cookie, room.roomId, { type: "propose-plan", plan });
      expect(r.json.ok, JSON.stringify(plan)).toBe(false);
      expect(r.json.code).toBe("collision");
    }
    // adjacency and stacking are fine
    const beside = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 12, y: 0, z: 2, rot: 0, colour: "sky" } });
    expect(beside.json.ok).toBe(true);
    const onTop = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 10, y: 3, z: 2, rot: 0, colour: "sky" } });
    expect(onTop.json.ok, JSON.stringify(onTop.json)).toBe(true);
    // and the real brick still can't be stacked on a plan
    const realOnPlan = await command(a.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 8, y: 3, z: 2, rot: 0, colour: "navy" } });
    expect(realOnPlan.json.code).toBe("unsupported");
  });

  it("refuses withdrawing, removing or turning the only support under a standing plan, without cascading", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const base = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 3, z: 0, rot: 0, colour: "sky" } });
    const withdraw = await command(a.cookie, room.roomId, { type: "withdraw-plan", planId: base.json.snapshot.plans[0].id });
    expect(withdraw.json.ok).toBe(false);
    expect(withdraw.json.code).toBe("plan_depends");
    expect(withdraw.json.message).toMatch(/rests on it/);
    expect(withdraw.json.snapshot.plans).toHaveLength(2);

    const real = await command(a.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x4", x: 8, y: 0, z: 2, rot: 0, colour: "navy" } });
    const part = real.json.snapshot.parts[0];
    await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-1x2", x: 11, y: 3, z: 2, rot: 1, colour: "sky" } });
    const remove = await command(a.cookie, room.roomId, { type: "remove", placedId: part.id, expectedRev: part.rev });
    expect(remove.json.code).toBe("plan_depends");
    const rotate = await command(a.cookie, room.roomId, { type: "rotate", placedId: part.id, rot: 1, expectedRev: part.rev });
    expect(rotate.json.code).toBe("plan_depends");
    const after = await getRoom(a.cookie, room.roomId);
    expect(after.parts).toHaveLength(1);
    expect(after.plans).toHaveLength(3);
  });

  it("lets only one of two concurrent overlapping proposals from different members succeed", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    const [ra, rb] = await Promise.all([
      command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 4, y: 0, z: 4, rot: 0, colour: "sky" } }),
      command(b.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 6, y: 0, z: 5, rot: 0, colour: "rose" } }),
    ]);
    expect([ra.json.ok, rb.json.ok].filter(Boolean)).toHaveLength(1);
    const loser = ra.json.ok ? rb : ra;
    expect(loser.json.code).toBe("collision");
    expect((await getRoom(a.cookie, room.roomId)).plans).toHaveLength(1);
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

// ADR 0011: Plan mode's displayed demand is derived from the snapshot every
// member receives — real stock minus open plans. The server keeps no second
// stock table; these assert it never subtracts plans from real inventory and
// that real stock alone decides placement and realization.
describe("planning demand", () => {
  const demand = (s: Snapshot, partId: string): number => s.inventory[partId] - s.plans.filter((p) => p.partId === partId).length;

  it("accepts more plans than real stock; derived demand goes negative while real stock is unchanged", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const real = room.inventory["brick-1x2"];
    let snap = room;
    for (let i = 0; i < real + 2; i++) {
      const r = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-1x2", x: i % 8 * 2, y: 0, z: Math.floor(i / 8), rot: 0, colour: "sky" } });
      expect(r.json.ok, JSON.stringify(r.json)).toBe(true);
      snap = r.json.snapshot;
    }
    expect(snap.inventory["brick-1x2"]).toBe(real);
    expect(demand(snap, "brick-1x2")).toBe(-2);
  });

  it("proposing a plan with zero real stock left is accepted", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    let snap = room;
    for (let i = 0; i < room.inventory["planter-1x2"]; i++) {
      snap = (await command(a.cookie, room.roomId, { type: "place", placement: { partId: "planter-1x2", x: i * 2, y: 0, z: 0, rot: 0, colour: "brick-red" } })).json.snapshot;
    }
    expect(snap.inventory["planter-1x2"]).toBe(0);
    const r = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "planter-1x2", x: 8, y: 0, z: 0, rot: 0, colour: "brick-red" } });
    expect(r.json.ok, JSON.stringify(r.json)).toBe(true);
    expect(demand(r.json.snapshot, "planter-1x2")).toBe(-1);
  });

  it("negative demand never stops another member placing a real part while real stock remains", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const b = await freshVisitor();
    await fetch(new URL(`/api/rooms/${room.roomId}/join`, baseUrl), { method: "POST", headers: { cookie: b.cookie } });
    const real = room.inventory["brick-2x2"];
    for (let i = 0; i < real + 1; i++) {
      await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x2", x: (i % 8) * 2, y: 0, z: 2 * Math.floor(i / 8), rot: 0, colour: "sky" } });
    }
    const placed = await command(b.cookie, room.roomId, { type: "place", placement: { partId: "brick-2x2", x: 0, y: 0, z: 6, rot: 0, colour: "navy" } });
    expect(placed.json.ok, JSON.stringify(placed.json)).toBe(true);
    expect(placed.json.snapshot.inventory["brick-2x2"]).toBe(real - 1);
    expect(demand(placed.json.snapshot, "brick-2x2")).toBe(-2);
  });

  it("withdrawing restores demand by one; realizing removes the plan's demand and spends real stock once", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const real = room.inventory["brick-2x4"];
    const p1 = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    const p2 = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 4, y: 0, z: 0, rot: 0, colour: "sky" } });
    expect(demand(p2.json.snapshot, "brick-2x4")).toBe(real - 2);

    const withdrawn = await command(a.cookie, room.roomId, { type: "withdraw-plan", planId: p1.json.snapshot.plans[0].id });
    expect(demand(withdrawn.json.snapshot, "brick-2x4")).toBe(real - 1);
    expect(withdrawn.json.snapshot.inventory["brick-2x4"]).toBe(real);

    const planId = p2.json.snapshot.plans.find((p: any) => p.id !== p1.json.snapshot.plans[0].id).id;
    const realized = await command(a.cookie, room.roomId, { type: "realize-plan", planId });
    expect(realized.json.ok, JSON.stringify(realized.json)).toBe(true);
    expect(realized.json.snapshot.inventory["brick-2x4"]).toBe(real - 1);
    expect(realized.json.snapshot.plans).toHaveLength(0);
    expect(demand(realized.json.snapshot, "brick-2x4")).toBe(real - 1);
  });

  it("realizing with no real stock left fails out_of_stock and leaves the plan open", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const proposed = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "planter-1x2", x: 10, y: 0, z: 4, rot: 0, colour: "brick-red" } });
    const planId = proposed.json.snapshot.plans[0].id;
    let snap = proposed.json.snapshot;
    for (let i = 0; i < room.inventory["planter-1x2"]; i++) {
      snap = (await command(a.cookie, room.roomId, { type: "place", placement: { partId: "planter-1x2", x: i * 2, y: 0, z: 0, rot: 0, colour: "brick-red" } })).json.snapshot;
    }
    const r = await command(a.cookie, room.roomId, { type: "realize-plan", planId });
    expect(r.json.ok).toBe(false);
    expect(r.json.code).toBe("out_of_stock");
    expect(r.json.snapshot.plans.some((p: any) => p.id === planId)).toBe(true);
    expect(r.json.snapshot.inventory["planter-1x2"]).toBe(0);
    void snap;
  });
});

describe("marking a plan", () => {
  // Regression: an isolated test found POST /api/rooms/:id/mark returned 200
  // with { sent: true } for a nonexistent plan id — the endpoint checked room
  // membership but never that the id named a real, currently-open plan in
  // THAT room, so any string was accepted and broadcast over SSE.
  it("refuses a nonexistent plan id, without broadcasting anything", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const res = await fetch(new URL(`/api/rooms/${room.roomId}/mark`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ planId: "not-a-real-plan-id" }),
    });
    expect(res.status).toBe(404);
  });

  it("refuses a plan that belongs to a different room, even one this visitor is a member of", async () => {
    const a = await freshVisitor();
    const roomA = await createRoom(a.cookie);
    const roomB = await createRoom(a.cookie);
    const proposed = await command(a.cookie, roomA.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    const planId = proposed.json.snapshot.plans[0].id;

    const crossRoom = await fetch(new URL(`/api/rooms/${roomB.roomId}/mark`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    expect(crossRoom.status).toBe(404);
  });

  it("refuses a plan that has already been realized (no longer open)", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const proposed = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    const planId = proposed.json.snapshot.plans[0].id;
    const realized = await command(a.cookie, room.roomId, { type: "realize-plan", planId }, proposed.json.snapshot.revision);
    expect(realized.json.ok).toBe(true);

    const mark = await fetch(new URL(`/api/rooms/${room.roomId}/mark`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    expect(mark.status).toBe(404);
  });

  it("accepts a real, currently-open plan in this room", async () => {
    const a = await freshVisitor();
    const room = await createRoom(a.cookie);
    const proposed = await command(a.cookie, room.roomId, { type: "propose-plan", plan: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "sky" } });
    const planId = proposed.json.snapshot.plans[0].id;
    const mark = await fetch(new URL(`/api/rooms/${room.roomId}/mark`, baseUrl), {
      method: "POST",
      headers: { cookie: a.cookie, "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    expect(mark.status).toBe(200);
    expect((await mark.json()).sent).toBe(true);
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
