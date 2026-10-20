import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { browser, startServer, type ServerProcess } from "./helpers/server-process.ts";

// ADR 0013: the server's own log lines are enough to narrate who did what.
// Two cookie-keeping clients stand in for two Chrome profiles; the real
// server runs as its own process with a temporary DATA_DIR, and every
// assertion reads its captured stdout. This is an HTTP test, not a browser
// test, and not evidence of two people using the app.

const SECRET = {
  password: "SENTINEL-pass-31f1-correct",
  wrongPassword: "SENTINEL-pass-31f1-wrong",
  username: "sentinel_user_31f1",
  displayName: "SENTINEL Display 31f1",
  label: "SENTINEL room label 31f1",
  commandId: "SENTINEL-cmd-31f1",
};

let server: ServerProcess;
type Line = Record<string, unknown>;
const lineFor = (reqId: string | null, event?: string): Line => {
  const hit = server.events().find((e) => e.req === reqId && (!event || e.event === event));
  if (!hit) throw new Error(`no ${event ?? "log"} line for request ${reqId}\n${server.stdout()}`);
  return hit;
};
const linesFor = (reqId: string | null): Line[] => server.events().filter((e) => e.req === reqId);

const b24 = (x: number, y: number, z: number, colour = "sky") => ({ partId: "brick-2x4", x, y, z, rot: 0, colour });

beforeAll(async () => {
  server = await startServer();
}, 20_000);
afterAll(async () => {
  await server?.stop();
});

describe("a two-person journey, narrated from the server log alone", () => {
  const A = () => state.a;
  const B = () => state.b;
  const state = {} as {
    a: ReturnType<typeof browser>;
    b: ReturnType<typeof browser>;
    aLabel: string;
    bLabel: string;
    roomId: string;
    wallId: string;
    planId: string;
    snapId: string;
  };

  const cmd = (who: ReturnType<typeof browser>, command: Record<string, unknown>, commandId: string = randomUUID()) =>
    who.req("POST", `/api/rooms/${state.roomId}/command`, { commandId, expectedRevision: 0, command });

  it("two arriving browsers become two distinct, server-resolved actors", async () => {
    state.a = browser(server.base);
    state.b = browser(server.base);
    const meA = await A().req("GET", "/api/me");
    const meB = await B().req("GET", "/api/me");
    state.aLabel = meA.body.visitorId.slice(0, 8);
    state.bLabel = meB.body.visitorId.slice(0, 8);
    expect(state.aLabel).not.toBe(state.bLabel);
    expect(lineFor(meA.reqId, "visitor.new")).toMatchObject({ outcome: "changed", reason: "no_cookie", actor: state.aLabel, route: "/api/me" });
    expect(lineFor(meB.reqId, "visitor.new")).toMatchObject({ outcome: "changed", actor: state.bLabel });
    // a returning browser is not a new visitor
    const again = await A().req("GET", "/api/me");
    expect(linesFor(again.reqId)).toEqual([]);
  });

  it("A creates an invite-only room; B is refused without an invitation", async () => {
    const created = await A().req("POST", "/api/rooms", { visibility: "invite_only", label: SECRET.label });
    state.roomId = created.body.roomId;
    expect(lineFor(created.reqId, "room.create")).toMatchObject({ outcome: "changed", actor: state.aLabel, room: state.roomId, visibility: "invite_only" });
    // the editor's first request for a room link: refused before any join is tried
    const look = await B().req("GET", `/api/rooms/${state.roomId}/preview`);
    expect(look.status).toBe(404);
    expect(lineFor(look.reqId, "room.preview")).toMatchObject({ outcome: "denied", reason: "no_invitation", actor: state.bLabel, room: state.roomId });
    const refused = await B().req("POST", `/api/rooms/${state.roomId}/join`);
    expect(refused.status).toBe(403);
    expect(lineFor(refused.reqId, "room.join")).toMatchObject({ outcome: "denied", reason: "no_invitation", actor: state.bLabel, room: state.roomId });
    // B's direct command is refused as well, with a precise internal reason and the unchanged public code
    const sneak = await cmd(B(), { type: "place", placement: b24(8, 0, 4) });
    expect(sneak.status).toBe(403);
    expect(sneak.body.code).toBe("bad_request");
    expect(lineFor(sneak.reqId, "command")).toMatchObject({ outcome: "denied", reason: "not_admitted", actor: state.bLabel, type: "place" });
  });

  it("they become friends, A invites B, and B accepts and joins", async () => {
    const link = await A().req("POST", "/api/friends/link");
    expect(lineFor(link.reqId, "friend.link")).toMatchObject({ outcome: "changed", actor: state.aLabel });
    const opened = await B().req("GET", `/api/friends/link/${link.body.token}`);
    expect(lineFor(opened.reqId, "friend.link_open")).toMatchObject({ outcome: "ok", actor: state.bLabel, peer: state.aLabel });
    const accepted = await B().req("POST", `/api/friends/requests/${opened.body.requestId}/respond`, { accept: true });
    expect(lineFor(accepted.reqId, "friend.response")).toMatchObject({ outcome: "changed", reason: "accepted", actor: state.bLabel, peer: state.aLabel });

    const bId = (await B().req("GET", "/api/me")).body.visitorId;
    const invite = await A().req("POST", `/api/rooms/${state.roomId}/invite`, { to: bId });
    expect(lineFor(invite.reqId, "room.invite")).toMatchObject({ outcome: "changed", actor: state.aLabel, peer: state.bLabel, room: state.roomId, target: invite.body.inviteId });
    const twice = await A().req("POST", `/api/rooms/${state.roomId}/invite`, { to: bId });
    expect(lineFor(twice.reqId, "room.invite")).toMatchObject({ outcome: "unchanged", reason: "already_invited" });

    const respond = await B().req("POST", `/api/invites/${invite.body.inviteId}/respond`, { accept: true });
    expect(lineFor(respond.reqId, "room.invite_response")).toMatchObject({ outcome: "changed", reason: "accepted", actor: state.bLabel, room: state.roomId });
    // the editor's load re-joins: already admitted, so nobody new was admitted
    const rejoin = await B().req("POST", `/api/rooms/${state.roomId}/join`);
    expect(rejoin.status).toBe(200);
    expect(lineFor(rejoin.reqId, "room.join")).toMatchObject({ outcome: "unchanged", actor: state.bLabel });
  });

  it("building and planning: committed changes, a rule rejection, a retry and a conflict are all distinct", async () => {
    const id = randomUUID();
    const wall = await cmd(A(), { type: "place", placement: b24(0, 0, 0) }, id);
    state.wallId = wall.body.snapshot.parts[0].id;
    const placed = lineFor(wall.reqId, "command");
    expect(placed).toMatchObject({ outcome: "changed", type: "place", actor: state.aLabel, target: state.wallId, part: "brick-2x4", at: "0,0,0,0", colour: "sky", cmd: id, rev: 1 });
    expect(placed.author).toBeUndefined();

    // the same command id again: a duplicate delivery, not a second brick
    const retry = await cmd(A(), { type: "place", placement: b24(0, 0, 0) }, id);
    expect(retry.status).toBe(200);
    expect(lineFor(retry.reqId, "command")).toMatchObject({ outcome: "duplicate", cmd: id, rev: 1 });
    expect(server.events().filter((e) => e.event === "command" && e.outcome === "changed" && e.cmd === id)).toHaveLength(1);

    const clash = await cmd(B(), { type: "place", placement: b24(1, 0, 0, "rose") });
    expect(clash.status).toBe(422);
    expect(lineFor(clash.reqId, "command")).toMatchObject({ outcome: "rejected", reason: "collision", actor: state.bLabel, part: "brick-2x4", at: "1,0,0,0" });

    const plan = await cmd(B(), { type: "propose-plan", plan: b24(0, 3, 0, "rose") });
    state.planId = plan.body.snapshot.plans[0].id;
    expect(lineFor(plan.reqId, "command")).toMatchObject({ outcome: "changed", type: "propose-plan", actor: state.bLabel, target: state.planId, at: "0,3,0,0", rev: 2 });

    // A can't pull the wall out from under B's plan
    const pull = await cmd(A(), { type: "remove", placedId: state.wallId, expectedRev: 0 });
    expect(lineFor(pull.reqId, "command")).toMatchObject({ outcome: "rejected", reason: "plan_depends", actor: state.aLabel, author: state.aLabel, target: state.wallId });

    // B recolours A's brick: the actor is B, the original builder is A
    const recolour = await cmd(B(), { type: "recolour", placedId: state.wallId, colour: "leaf", expectedRev: 0 });
    expect(lineFor(recolour.reqId, "command")).toMatchObject({ outcome: "changed", type: "recolour", actor: state.bLabel, author: state.aLabel, target: state.wallId, colour: "leaf" });
    // A's edit based on the old part revision is a conflict, not a rule rejection
    const stale = await cmd(A(), { type: "recolour", placedId: state.wallId, colour: "navy", expectedRev: 0 });
    expect(stale.status).toBe(409);
    expect(lineFor(stale.reqId, "command")).toMatchObject({ outcome: "conflict", reason: "part_conflict", actor: state.aLabel, author: state.aLabel });

    // A builds B's plan: actor A, proposer B, and it's B's plan id that was acted on
    const realize = await cmd(A(), { type: "realize-plan", planId: state.planId });
    expect(lineFor(realize.reqId, "command")).toMatchObject({ outcome: "changed", type: "realize-plan", actor: state.aLabel, author: state.bLabel, target: state.planId, at: "0,3,0,0" });

    // a plan withdrawn by someone other than its proposer names both
    const plan2 = await cmd(A(), { type: "propose-plan", plan: b24(8, 0, 4) });
    const plan2Id = plan2.body.snapshot.plans.find((p: { x: number }) => p.x === 8).id;
    const withdraw = await cmd(B(), { type: "withdraw-plan", planId: plan2Id });
    expect(lineFor(withdraw.reqId, "command")).toMatchObject({ outcome: "changed", type: "withdraw-plan", actor: state.bLabel, author: state.aLabel, target: plan2Id });
  });

  it("B marks a plan: a transient broadcast, then a cooldown", async () => {
    const plan = await cmd(A(), { type: "propose-plan", plan: b24(12, 0, 4) });
    const pid = plan.body.snapshot.plans.find((p: { x: number }) => p.x === 12).id;
    const mark = await B().req("POST", `/api/rooms/${state.roomId}/mark`, { planId: pid });
    expect(lineFor(mark.reqId, "plan.mark")).toMatchObject({ outcome: "ok", actor: state.bLabel, author: state.aLabel, target: pid });
    const again = await B().req("POST", `/api/rooms/${state.roomId}/mark`, { planId: pid });
    expect(lineFor(again.reqId, "plan.mark")).toMatchObject({ outcome: "limited", reason: "cooldown" });
  });

  it("early command refusals are logged with a safe correlation, never the raw input", async () => {
    // our client always sends a UUID; any other id is accepted as before, and logged only as a hash
    const odd = await cmd(A(), { type: "place", placement: b24(12, 0, 0) }, SECRET.commandId);
    expect(odd.status).toBe(200);
    const oddLine = lineFor(odd.reqId, "command");
    expect(oddLine).toMatchObject({ outcome: "changed" });
    expect(oddLine.cmd).toMatch(/^h-[0-9a-f]{16}$/);
    const oddRetry = await cmd(A(), { type: "place", placement: b24(12, 0, 0) }, SECRET.commandId);
    expect(lineFor(oddRetry.reqId, "command")).toMatchObject({ outcome: "duplicate", cmd: oddLine.cmd });

    const garbled = await A().req("POST", `/api/rooms/${state.roomId}/command`, { commandId: randomUUID(), expectedRevision: 0, command: { type: "teleport" } });
    expect(garbled.status).toBe(400);
    expect(lineFor(garbled.reqId, "command")).toMatchObject({ outcome: "invalid", reason: "bad_envelope", type: "unrecognised", actor: state.aLabel });

    const notJson = await A().req("POST", `/api/rooms/${state.roomId}/command`, undefined, { type: "text/plain", data: SECRET.commandId });
    expect(notJson.status).toBe(415);
    expect(lineFor(notJson.reqId, "command")).toMatchObject({ outcome: "invalid", reason: "not_json" });

    const anon = browser(server.base);
    const noSession = await anon.req("POST", `/api/rooms/${state.roomId}/command`, { commandId: randomUUID(), expectedRevision: 0, command: { type: "place" } });
    expect(noSession.status).toBe(401);
    const noSessionLine = lineFor(noSession.reqId, "command");
    expect(noSessionLine).toMatchObject({ outcome: "denied", reason: "no_session", type: "place" });
    expect(noSessionLine.actor).toBeUndefined();
  });

  it("saving, publishing, copying and continuing, with their refusals", async () => {
    const save = await A().req("POST", `/api/rooms/${state.roomId}/save`);
    state.snapId = save.body.id;
    expect(lineFor(save.reqId, "snapshot.save")).toMatchObject({ outcome: "changed", actor: state.aLabel, room: state.roomId, target: state.snapId });

    // B didn't save it, so B may not publish it; and this room doesn't allow publishing anyway
    const bPublish = await B().req("POST", `/api/snapshots/${state.snapId}/publish`);
    expect(bPublish.status).toBe(403);
    expect(lineFor(bPublish.reqId, "snapshot.publish")).toMatchObject({ outcome: "denied", reason: "not_saver", actor: state.bLabel });
    const aPublish = await A().req("POST", `/api/snapshots/${state.snapId}/publish`);
    expect(lineFor(aPublish.reqId, "snapshot.publish")).toMatchObject({ outcome: "denied", reason: "publish_disallowed", actor: state.aLabel });

    const collect = await B().req("POST", `/api/snapshots/${state.snapId}/collect`);
    expect(lineFor(collect.reqId, "snapshot.collect")).toMatchObject({ outcome: "changed", actor: state.bLabel, source: state.snapId, target: collect.body.id });

    const outsider = browser(server.base);
    const peek = await outsider.req("POST", `/api/snapshots/${state.snapId}/continue`, {});
    expect(peek.status).toBe(404);
    expect(lineFor(peek.reqId, "snapshot.continue")).toMatchObject({ outcome: "denied", reason: "no_access", source: state.snapId });
    const missing = await outsider.req("POST", `/api/snapshots/${randomUUID()}/collect`);
    expect(lineFor(missing.reqId, "snapshot.collect")).toMatchObject({ outcome: "rejected", reason: "not_found" });

    const cont = await A().req("POST", `/api/snapshots/${state.snapId}/continue`, { visibility: "invite_only" });
    expect(lineFor(cont.reqId, "snapshot.continue")).toMatchObject({ outcome: "changed", actor: state.aLabel, source: state.snapId, room: cont.body.roomId });
  });

  it("an SSE connection's open and close are connection events, not presence changes", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${server.base}/api/rooms/${state.roomId}/events`, { headers: { cookie: B().cookie }, signal: ctrl.signal });
    const reqId = res.headers.get("x-request-id");
    expect(res.status).toBe(200);
    const open = lineFor(reqId, "sse.open");
    expect(open).toMatchObject({ actor: state.bLabel, room: state.roomId, open: 1 });
    expect(["ok", "changed"]).toContain(open.outcome);
    ctrl.abort();
    const close = await server.waitFor((e) => e.req === reqId && e.event === "sse.close");
    expect(close).toMatchObject({ outcome: "ok", reason: "client_gone", actor: state.bLabel, open: 0 });
    // a dropped connection is not leaving the room
    expect(server.events().some((e) => e.event === "room.leave" && e.req === reqId)).toBe(false);
  });

  it("an explicit leave is a change once, then a no-op", async () => {
    const leave = await B().req("POST", `/api/rooms/${state.roomId}/leave`);
    expect(lineFor(leave.reqId, "room.leave")).toMatchObject({ outcome: "changed", actor: state.bLabel });
    const again = await B().req("POST", `/api/rooms/${state.roomId}/leave`);
    expect(lineFor(again.reqId, "room.leave")).toMatchObject({ outcome: "unchanged" });
  });

  it("accounts: outcomes are logged, credentials and names never are", async () => {
    const c = browser(server.base);
    await c.req("GET", "/api/me");
    const reg = await c.req("POST", "/api/account/register", { username: SECRET.username, password: SECRET.password, displayName: SECRET.displayName });
    expect(reg.status).toBe(200);
    expect(lineFor(reg.reqId, "account.register")).toMatchObject({ outcome: "changed" });
    const d = browser(server.base);
    const wrong = await d.req("POST", "/api/account/sign-in", { username: SECRET.username, password: SECRET.wrongPassword });
    expect(wrong.status).toBe(401);
    expect(lineFor(wrong.reqId, "account.sign_in")).toMatchObject({ outcome: "denied", reason: "bad_credentials" });
    const right = await d.req("POST", "/api/account/sign-in/confirm", { username: SECRET.username, password: SECRET.password });
    expect(right.status).toBe(200);
    expect(lineFor(right.reqId, "account.sign_in")).toMatchObject({ outcome: "changed", reason: "confirmed" });
    const out = await d.req("POST", "/api/account/sign-out");
    expect(lineFor(out.reqId, "account.sign_out")).toMatchObject({ outcome: "changed" });
    // signing out issues a fresh anonymous identity on the same request
    expect(lineFor(out.reqId, "visitor.new")).toMatchObject({ outcome: "changed" });
  });

  it("no secret, cookie, token or free text appears anywhere in stdout or stderr", async () => {
    const all = server.stdout() + server.stderr();
    for (const s of Object.values(SECRET)) expect(all).not.toContain(s);
    for (const who of [A(), B()]) {
      const token = who.cookie.split("=")[1];
      expect(token.length).toBeGreaterThan(20);
      expect(all).not.toContain(token);
    }
    expect(all).not.toContain("brick_visitor");
    expect(server.stderr()).toBe("");
    // every stdout line is one of ours: JSON with an allowlisted event name
    for (const line of server.stdout().split("\n").filter(Boolean)) expect(JSON.parse(line).event).toMatch(/^[a-z]+(\.[a-z_]+)*$/);
  });
});
