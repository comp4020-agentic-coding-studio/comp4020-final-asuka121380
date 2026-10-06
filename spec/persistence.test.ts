import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

// The promise behind "find their trace still there when they come back":
// a committed part survives a fresh request with the same visitor cookie, and
// the server, not the client, decides what's allowed and what stock is left.
//
// These run against whatever APP_URL points at, the live app included, so
// each test is a brand-new anonymous visitor with its own build: they never
// touch anyone else's. They do leave those small test builds behind.

const baseUrl = inject("baseUrl");

interface Snapshot {
  buildId: string;
  revision: number;
  parts: { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string }[];
  inventory: Record<string, number>;
}

async function newVisitor(): Promise<{ cookie: string; build: Snapshot }> {
  const res = await fetch(new URL("/api/build", baseUrl));
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  expect(cookie, "the first visit sets a visitor cookie").toBeTruthy();
  return { cookie: cookie!, build: (await res.json()) as Snapshot };
}

async function load(cookie: string): Promise<Snapshot> {
  const res = await fetch(new URL("/api/build", baseUrl), { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as Snapshot;
}

async function send(cookie: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL("/api/command", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const place = (revision: number, placement: Record<string, unknown>, commandId = randomUUID()) => ({
  commandId,
  expectedRevision: revision,
  command: { type: "place", placement: { partId: "brick-2x4", x: 0, y: 0, z: 0, rot: 0, colour: "navy", ...placement } },
});

describe("a visitor's build", () => {
  it("keeps a committed part across a fresh request", async () => {
    const { cookie, build } = await newVisitor();
    expect(build.parts).toEqual([]);
    const before = build.inventory["brick-2x4"];

    const r = await send(cookie, place(build.revision, { x: 2, z: 3, colour: "rose" }));
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);

    const again = await load(cookie);
    expect(again.buildId).toBe(build.buildId);
    expect(again.revision).toBe(build.revision + 1);
    expect(again.parts).toHaveLength(1);
    expect(again.parts[0]).toMatchObject({ partId: "brick-2x4", x: 2, y: 0, z: 3, rot: 0, colour: "rose" });
    expect(again.inventory["brick-2x4"]).toBe(before - 1);
  });

  it("is separate for a different visitor", async () => {
    const a = await newVisitor();
    await send(a.cookie, place(a.build.revision, {}));
    const b = await newVisitor();
    expect(b.build.buildId).not.toBe(a.build.buildId);
    expect(b.build.parts).toEqual([]);
  });

  it("runs a retried command only once", async () => {
    const { cookie, build } = await newVisitor();
    const command = place(build.revision, {});
    const first = await send(cookie, command);
    const retry = await send(cookie, command);
    expect(first.json.ok).toBe(true);
    expect(retry.json.ok).toBe(true);
    const after = await load(cookie);
    expect(after.parts).toHaveLength(1);
    expect(after.inventory["brick-2x4"]).toBe(build.inventory["brick-2x4"] - 1);
  });

  it("refuses an invalid placement and charges nothing", async () => {
    const { cookie, build } = await newVisitor();
    const floating = await send(cookie, place(build.revision, { y: 3 }));
    expect(floating.status).toBe(422);
    expect(floating.json).toMatchObject({ ok: false, code: "unsupported" });
    const outside = await send(cookie, place(build.revision, { x: 99 }));
    expect(outside.json).toMatchObject({ ok: false, code: "out_of_bounds" });
    const after = await load(cookie);
    expect(after.parts).toEqual([]);
    expect(after.revision).toBe(build.revision);
    expect(after.inventory).toEqual(build.inventory);
  });

  it("refuses a command made against a stale revision", async () => {
    const { cookie, build } = await newVisitor();
    await send(cookie, place(build.revision, {}));
    const stale = await send(cookie, place(build.revision, { x: 4 }));
    expect(stale.status).toBe(409);
    expect(stale.json.code).toBe("revision_conflict");
    expect((await load(cookie)).parts).toHaveLength(1);
  });

  it("won't remove a part that is something's only support, and returns removed parts to the kit", async () => {
    const { cookie, build } = await newVisitor();
    await send(cookie, place(0, {}));
    let s = await load(cookie);
    await send(cookie, place(s.revision, { y: 3 }));
    s = await load(cookie);
    const [bottom, top] = s.parts;

    const blocked = await send(cookie, { commandId: randomUUID(), expectedRevision: s.revision, command: { type: "remove", placedId: bottom.id } });
    expect(blocked.json).toMatchObject({ ok: false, code: "would_unsupport" });

    const removed = await send(cookie, { commandId: randomUUID(), expectedRevision: s.revision, command: { type: "remove", placedId: top.id } });
    expect(removed.json.ok).toBe(true);
    const after = await load(cookie);
    expect(after.parts.map((p) => p.id)).toEqual([bottom.id]);
    expect(after.inventory["brick-2x4"]).toBe(build.inventory["brick-2x4"] - 1);
  });

  it("turns a placed part through the command path, keeping its id and stock", async () => {
    const { cookie, build } = await newVisitor();
    await send(cookie, place(0, { x: 4, z: 2 }));
    let s = await load(cookie);
    const id = s.parts[0].id;
    const turned = await send(cookie, { commandId: randomUUID(), expectedRevision: s.revision, command: { type: "rotate", placedId: id, rot: 1 } });
    expect(turned.json.ok).toBe(true);
    s = await load(cookie);
    expect(s.parts).toEqual([expect.objectContaining({ id, x: 5, z: 1, rot: 1 })]);
    expect(s.inventory["brick-2x4"]).toBe(build.inventory["brick-2x4"] - 1);

    // turning back out of the plot's edge is refused and changes nothing
    await send(cookie, place(s.revision, { x: 12, z: 0, rot: 0 }));
    s = await load(cookie);
    const edge = s.parts[1];
    const refused = await send(cookie, { commandId: randomUUID(), expectedRevision: s.revision, command: { type: "rotate", placedId: edge.id, rot: 1 } });
    expect(refused.json).toMatchObject({ ok: false, code: "out_of_bounds" });
    expect((await load(cookie)).parts[1]).toEqual(edge);
  });

  it("keeps decorative parts like any other", async () => {
    const { cookie, build } = await newVisitor();
    for (const [i, partId] of ["window-1x2x2", "fence-1x4x1", "planter-1x2"].entries()) {
      const s = await load(cookie);
      const r = await send(cookie, place(s.revision, { partId, x: i * 5, z: 6, colour: "white" }));
      expect(r.json.ok, partId).toBe(true);
    }
    const after = await load(cookie);
    expect(after.parts.map((p) => p.partId)).toEqual(["window-1x2x2", "fence-1x4x1", "planter-1x2"]);
    for (const p of after.parts) expect(after.inventory[p.partId]).toBe(build.inventory[p.partId] - 1);
  });

  it("refuses commands without a visitor", async () => {
    const res = await fetch(new URL("/api/command", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(place(0, {})),
    });
    expect(res.status).toBe(401);
  });
});

describe("the homepage's summary", () => {
  it("says there's no build, and creates no visitor, for a browser without a cookie", async () => {
    const res = await fetch(new URL("/api/summary", baseUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({ hasBuild: false, parts: 0 });
  });

  it("counts the parts in this visitor's build, and is the same build the editor loads", async () => {
    const { cookie, build } = await newVisitor();
    await send(cookie, place(build.revision, { x: 4, z: 2 }));
    const res = await fetch(new URL("/api/summary", baseUrl), { headers: { cookie } });
    expect(await res.json()).toEqual({ hasBuild: true, parts: 1 });
    expect((await load(cookie)).parts).toHaveLength(1);
  });
});

describe("the two pages", () => {
  it("serves the homepage at / and the editor at /build/, with /build redirecting", async () => {
    const home = await fetch(new URL("/", baseUrl));
    expect(home.status).toBe(200);
    const editor = await fetch(new URL("/build/", baseUrl));
    expect(editor.status).toBe(200);
    expect(await editor.text()).toContain('id="root"');
    const bare = await fetch(new URL("/build", baseUrl), { redirect: "manual" });
    expect([301, 302, 308]).toContain(bare.status);
    expect(bare.headers.get("location")).toMatch(/\/build\/$/);
  });
});
