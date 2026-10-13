import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFor, parseEnvelope, roomSnapshot, runCommand, summaryFor } from "./builds.ts";
import { openDatabase } from "./db.ts";
import { createRecoveryCode, createSession, findVisitor, recoveryRateLimited, redeemRecoveryCode, visitorFor } from "./identity.ts";
import { areFriends, createFriendLink, friendsOf, openFriendLink, pendingRequestsFor, requestFriend, respondToRequest } from "./friends.ts";
import { renderReadme } from "./readme.ts";
import { markPlan, subscribe } from "./realtime.ts";
import {
  createRoom,
  defaultRoomFor,
  findRoom,
  inviteToRoom,
  isMember,
  join as joinRoom,
  leave as leaveRoom,
  markActive,
  pendingInvitesFor,
  publicLobby,
  respondToInvite,
  roomsFor,
  snapshotOf,
  sweepPresence,
} from "./rooms.ts";
import { getSnapshot, publishSnapshot, saveSnapshot, showcaseEntry, showcaseList, snapshotsSavedBy } from "./snapshots.ts";

// One same-origin service: the built client (the homepage at / and the
// editor at /build/), the build API, the realtime room stream, and /readme/.
// It listens on 0.0.0.0:$PORT, and its only durable state is the SQLite file
// on the volume mounted at /data (fly.toml).

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ROOT = process.cwd();
const CLIENT = join(ROOT, "dist/client");
const COOKIE = "brick_visitor";
const YEAR = 365 * 24 * 60 * 60;

const db = openDatabase(join(DATA_DIR, "app.db"));
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true); // Fly terminates TLS in front of us

function readCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function setCookie(req: Request, res: Response, token: string): void {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; SameSite=Lax${secure}`);
}

/** Resolves the caller's visitor id from the cookie, creating one if needed, and keeps the response's cookie in sync. */
function identify(req: Request, res: Response): string {
  const visitor = visitorFor(db, readCookie(req));
  if (visitor.newToken) setCookie(req, res, visitor.newToken);
  return visitor.id;
}

// One line per command: who (an opaque prefix), which room, what, and how it
// went. Never the cookie, never a recovery code.
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...fields }));
}

// A small per-visitor brake on command floods; real building is far slower.
const recent = new Map<string, number[]>();
function tooFast(visitorId: string): boolean {
  const t = Date.now();
  const times = (recent.get(visitorId) ?? []).filter((x) => t - x < 10_000);
  times.push(t);
  recent.set(visitorId, times);
  return times.length > 40;
}

app.use("/api", express.json({ limit: "16kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// ---- identity and recovery (ADR 0006) --------------------------------------

app.get("/api/build", (req, res) => {
  const visitorId = identify(req, res);
  res.json(buildFor(db, visitorId));
});

// the homepage's "Continue my build": read-only, and sets no cookie
app.get("/api/summary", (req, res) => {
  res.json(summaryFor(db, () => findVisitor(db, readCookie(req))));
});

// who the server resolves this request's cookie to; the lobby UI uses this
// to mark "you" in a member list without the server trusting a client-sent id
app.get("/api/me", (req, res) => {
  res.json({ visitorId: identify(req, res) });
});

app.post("/api/identity/recovery-code", (req, res) => {
  const visitorId = identify(req, res);
  res.json({ code: createRecoveryCode(db, visitorId) });
});

app.post("/api/identity/recover", (req, res) => {
  if (recoveryRateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ ok: false, message: "Too many attempts; wait a minute and try again." });
    return;
  }
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const visitorId = code && redeemRecoveryCode(db, code);
  if (!visitorId) {
    res.status(400).json({ ok: false, message: "That code is invalid or has already been used." });
    return;
  }
  // a new session for the existing visitor, alongside any others they hold,
  // so redeeming the code never signs another of their devices out
  setCookie(req, res, createSession(db, visitorId));
  res.json({ ok: true, message: "Recovered. This code is now spent — generate a new one if you want to link another device." });
});

// ---- rooms (ADR 0007) -------------------------------------------------------

app.get("/api/rooms", (_req, res) => {
  res.json(publicLobby(db));
});

app.post("/api/rooms", (req, res) => {
  const visitorId = identify(req, res);
  const visibility = req.body?.visibility === "public" ? "public" : "invite_only";
  const allowPublish = typeof req.body?.allowPublish === "boolean" ? req.body.allowPublish : visibility === "public";
  const label = typeof req.body?.label === "string" ? req.body.label.slice(0, 80) : undefined;
  const room = createRoom(db, visitorId, { visibility, allowPublish, label });
  res.json(snapshotOf(db, room));
});

app.post("/api/rooms/:id/join", (req, res) => {
  const visitorId = identify(req, res);
  const outcome = joinRoom(db, req.params.id, visitorId);
  if (!outcome.ok) {
    const status = outcome.code === "not_found" ? 404 : outcome.code === "forbidden" ? 403 : 409;
    res.status(status).json({ ok: false, code: outcome.code });
    return;
  }
  const room = findRoom(db, req.params.id)!;
  res.json(snapshotOf(db, room));
});

app.post("/api/rooms/:id/leave", (req, res) => {
  const visitorId = identify(req, res);
  leaveRoom(db, req.params.id, visitorId);
  res.json({ ok: true });
});

// this visitor's own rooms: the default solo room plus any shared room
// they've joined, so the editor can offer "resume a room" (ADR 0007)
app.get("/api/my/rooms", (req, res) => {
  const visitorId = identify(req, res);
  res.json(roomsFor(db, visitorId));
});

app.get("/api/my/invites", (req, res) => {
  const visitorId = identify(req, res);
  res.json(pendingInvitesFor(db, visitorId));
});

// only the host invites, and only a friend: friendship is required so an
// invite-only room's access still traces back to an accepted relationship,
// even though friendship alone is never sufficient to join (ADR 0007)
app.post("/api/rooms/:id/invite", (req, res) => {
  const visitorId = identify(req, res);
  const to = typeof req.body?.to === "string" ? req.body.to : "";
  if (!to || !areFriends(db, visitorId, to)) {
    res.status(400).json({ ok: false, message: "You can only invite a friend." });
    return;
  }
  const outcome = inviteToRoom(db, req.params.id, visitorId, to);
  if (!outcome.ok) {
    res.status(outcome.code === "not_found" ? 404 : outcome.code === "forbidden" ? 403 : 409).json({ ok: false, code: outcome.code });
    return;
  }
  res.json({ ok: true, inviteId: outcome.id });
});

app.post("/api/invites/:id/respond", (req, res) => {
  const visitorId = identify(req, res);
  const accept = req.body?.accept === true;
  const outcome = respondToInvite(db, req.params.id, visitorId, accept);
  if (!outcome.ok) {
    const status = outcome.code === "not_found" ? 404 : outcome.code === "room_full" ? 409 : 403;
    res.status(status).json({ ok: false, code: outcome.code });
    return;
  }
  res.json(outcome);
});

app.get("/api/rooms/:id", (req, res) => {
  const visitorId = identify(req, res);
  const room = findRoom(db, req.params.id);
  if (!room || (room.visibility === "invite_only" && !isMember(db, room.id, visitorId))) {
    res.status(404).json({ ok: false, message: "No such room." });
    return;
  }
  res.json(snapshotOf(db, room));
});

// Realtime: server-sent events, one connection per open session per room
// (ADR 0008). Writes still only ever happen through POST /api/command.
app.get("/api/rooms/:id/events", (req, res) => {
  const visitorId = identify(req, res);
  const room = findRoom(db, req.params.id);
  if (!room || !isMember(db, room.id, visitorId)) {
    res.status(404).json({ ok: false, message: "No such room." });
    return;
  }
  markActive(db, room.id, visitorId);
  const unsubscribe = subscribe(room.id, res, snapshotOf(db, room));
  const keepAlive = setInterval(() => markActive(db, room.id, visitorId), 10_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.post("/api/rooms/:id/mark", (req, res) => {
  const visitorId = identify(req, res);
  const room = findRoom(db, req.params.id);
  const planId = typeof req.body?.planId === "string" ? req.body.planId : "";
  if (!room || !isMember(db, room.id, visitorId) || !planId) {
    res.status(404).json({ ok: false, message: "No such room or plan." });
    return;
  }
  const sent = markPlan(room.id, planId, visitorId);
  res.json({ ok: true, sent });
});

// ---- commands (unchanged path, now room-scoped: ADR 0007/0008) -----------

function handleCommand(req: Request, res: Response, visitorId: string, roomId: string): void {
  if (!req.is("application/json")) {
    res.status(415).json({ ok: false, code: "bad_request", message: "Commands are JSON." });
    return;
  }
  if (tooFast(visitorId)) {
    res.status(429).json({ ok: false, code: "bad_request", message: "That's a lot of changes at once; wait a moment." });
    return;
  }
  const envelope = parseEnvelope(req.body);
  if (!envelope) {
    res.status(400).json({ ok: false, code: "bad_request", message: "That command isn't one the server understands." });
    return;
  }
  const { result, outcome, roomId: committedRoomId } = runCommand(db, visitorId, roomId, envelope);
  log({
    event: "command",
    visitor: visitorId.slice(0, 8),
    room: committedRoomId?.slice(0, 8),
    type: envelope.command.type,
    outcome,
    code: result.ok ? undefined : result.code,
    revision: result.ok ? result.snapshot.revision : undefined,
  });
  const status = result.ok ? 200 : outcome === "forbidden" ? 403 : outcome === "conflict" ? 409 : 422;
  res.status(status).json(result);
}

// A command never creates a visitor (unlike GET /api/build): no cookie means
// no session to act as, so it's refused outright, exactly as C8 (author's
// "trust the client for... identity" rule in CLAUDE.md applies here too).
app.post("/api/rooms/:id/command", (req, res) => {
  const visitorId = findVisitor(db, readCookie(req));
  if (!visitorId) {
    res.status(401).json({ ok: false, code: "bad_request", message: "No visitor session; reload the page." });
    return;
  }
  handleCommand(req, res, visitorId, req.params.id);
});

// back-compat shape for a visitor with no room in mind yet: their own
// default solo room, same as C8's single build
app.post("/api/command", (req, res) => {
  const visitorId = findVisitor(db, readCookie(req));
  if (!visitorId) {
    res.status(401).json({ ok: false, code: "bad_request", message: "No visitor session; reload the page." });
    return;
  }
  const room = defaultRoomFor(db, visitorId);
  handleCommand(req, res, visitorId, room.id);
});

// ---- friends (ADR 0007) ----------------------------------------------------

app.get("/api/friends", (req, res) => {
  const visitorId = identify(req, res);
  res.json({ friends: friendsOf(db, visitorId), pending: pendingRequestsFor(db, visitorId) });
});

app.post("/api/friends/link", (req, res) => {
  const visitorId = identify(req, res);
  res.json({ token: createFriendLink(db, visitorId) });
});

app.get("/api/friends/link/:token", (req, res) => {
  const visitorId = identify(req, res);
  const outcome = openFriendLink(db, req.params.token, visitorId);
  if (!outcome.ok) {
    res.status(400).json({ ok: false, code: outcome.code });
    return;
  }
  res.json({ ok: true, requestId: outcome.requestId, fromVisitor: outcome.fromVisitor });
});

app.post("/api/friends/requests", (req, res) => {
  const visitorId = identify(req, res);
  const to = typeof req.body?.to === "string" ? req.body.to : "";
  if (!to || areFriends(db, visitorId, to)) {
    res.status(400).json({ ok: false, message: "Can't send that request." });
    return;
  }
  const outcome = requestFriend(db, visitorId, to);
  if (!outcome.ok) {
    res.status(409).json({ ok: false, code: outcome.code });
    return;
  }
  res.json({ ok: true, requestId: outcome.requestId });
});

app.post("/api/friends/requests/:id/respond", (req, res) => {
  const visitorId = identify(req, res);
  const accept = req.body?.accept === true;
  const outcome = respondToRequest(db, req.params.id, visitorId, accept);
  if (!outcome.ok) {
    res.status(outcome.code === "not_found" ? 404 : 403).json({ ok: false, code: outcome.code });
    return;
  }
  res.json({ ok: true, status: outcome.status });
});

// ---- snapshots and the public showcase (ADR 0009) --------------------------

app.post("/api/rooms/:id/save", (req, res) => {
  const visitorId = identify(req, res);
  if (!isMember(db, req.params.id, visitorId)) {
    res.status(403).json({ ok: false, message: "Not a member of this room." });
    return;
  }
  const summary = saveSnapshot(db, req.params.id, visitorId);
  if (!summary) {
    res.status(404).json({ ok: false, message: "No such room." });
    return;
  }
  res.json(summary);
});

app.get("/api/snapshots", (req, res) => {
  const visitorId = identify(req, res);
  res.json(snapshotsSavedBy(db, visitorId));
});

app.get("/api/snapshots/:id", (req, res) => {
  const visitorId = identify(req, res);
  const snapshot = getSnapshot(db, req.params.id);
  if (!snapshot || (snapshot.savedBy !== visitorId && !isMember(db, snapshot.roomId, visitorId))) {
    res.status(404).json({ ok: false, message: "No such snapshot." });
    return;
  }
  // plans are hidden from the default read-only presentation (ADR 0009);
  // only "continue" (below) restores them
  const { plans: _plans, ...withoutPlans } = snapshot;
  void _plans;
  res.json(withoutPlans);
});

app.post("/api/snapshots/:id/publish", (req, res) => {
  const visitorId = identify(req, res);
  const outcome = publishSnapshot(db, req.params.id, visitorId);
  if (!outcome.ok) {
    res.status(outcome.code === "not_found" ? 404 : 403).json({ ok: false, code: outcome.code });
    return;
  }
  res.json({ ok: true, publicationId: outcome.id });
});

app.post("/api/snapshots/:id/continue", (req, res) => {
  const visitorId = identify(req, res);
  const snapshot = getSnapshot(db, req.params.id);
  if (!snapshot) {
    res.status(404).json({ ok: false, message: "No such snapshot." });
    return;
  }
  const visibility = req.body?.visibility === "public" ? "public" : "invite_only";
  const allowPublish = typeof req.body?.allowPublish === "boolean" ? req.body.allowPublish : visibility === "public";
  const room = createRoom(db, visitorId, { visibility, allowPublish, fromSnapshotId: snapshot.id });
  res.json(snapshotOf(db, room));
});

app.get("/api/showcase", (_req, res) => {
  res.json(showcaseList(db));
});

app.get("/api/showcase/:id", (req, res) => {
  const entry = showcaseEntry(db, req.params.id);
  if (!entry) {
    res.status(404).json({ ok: false, message: "Not published." });
    return;
  }
  const snapshot = getSnapshot(db, entry.snapshotId)!;
  const { plans: _plans, ...withoutPlans } = snapshot;
  void _plans;
  res.json({ ...entry, snapshot: withoutPlans });
});

// Express matches /readme and /readme/ alike; only the slash form lets the
// README's relative links resolve, so send the bare one there
app.get("/readme/", (req, res) => {
  if (!req.path.endsWith("/")) {
    res.redirect(301, "/readme/");
    return;
  }
  res.type("html").send(renderReadme(join(ROOT, "README.md")));
});
// images the README links relatively (docs/…) resolve under /readme/
app.use("/readme/docs", express.static(join(ROOT, "docs")));

if (existsSync(CLIENT)) {
  // /build/room/:id is the one editor bundle, client-routed by pathname (no
  // separate server page for each room): a direct link or reload must still
  // serve it. Registered before express.static, which would otherwise match
  // /build/room/:id/ as a request for the build/room/ directory's own index.
  app.get(/^\/build\/room\/[^/]+\/?$/, (_req, res) => {
    res.type("html").send(readFileSync(join(CLIENT, "build/room/index.html"), "utf8"));
  });
  app.use(
    express.static(CLIENT, {
      index: "index.html",
      // Vite's hashed assets can be cached for good; everything else (the
      // pages that name them, and unhashed files such as scene covers) is
      // revalidated, so a replaced file is never stale
      setHeaders: (res, path) =>
        res.setHeader("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache"),
    }),
  );
} else {
  app.get("/", (_req, res) => {
    res.type("text").send("The client hasn't been built: run `pnpm build`.");
  });
}

app.use((_req, res) => {
  res.status(404).type("text").send("Not found");
});

const server = app.listen(PORT, "0.0.0.0", () => {
  log({ event: "listening", port: PORT, data: DATA_DIR });
});

// ADR 0007: presence sweep, so a dropped connection's slot frees after a
// grace period without needing its own cleanup codepath.
const presenceSweep = setInterval(() => sweepPresence(db), 10_000);

// Fly stops idle machines with SIGINT; close cleanly so WAL is checkpointed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(presenceSweep);
    server.close();
    db.close();
    process.exit(0);
  });
}
