import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { accountForVisitor, authRateLimited, confirmSignIn, displayNamesFor, register, signOut, verifyCredentials, visitorHasOwnWork } from "./accounts.ts";
import { buildFor, parseEnvelope, roomSnapshot, runCommand, summaryFor } from "./builds.ts";
import { openDatabase } from "./db.ts";
import { createRecoveryCode, createSession, deleteSession, findVisitor, hashToken, recoveryRateLimited, redeemRecoveryCode, visitorFor } from "./identity.ts";
import { areFriends, createFriendLink, friendsOf, openFriendLink, pendingRequestsFor, requestFriend, respondToRequest } from "./friends.ts";
import { renderReadme } from "./readme.ts";
import { markPlan, registerConnection, revokeSession, subscribe } from "./realtime.ts";
import {
  admissionPreview,
  createRoom,
  defaultRoomFor,
  findRoom,
  inviteToRoom,
  isActiveMember,
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
import { canAccessSnapshot, collectSnapshot, getSnapshot, publishSnapshot, saveSnapshot, showcaseEntry, showcaseList, snapshotsSavedBy } from "./snapshots.ts";

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

/** Reads back the raw token from a Set-Cookie header `setCookie` just wrote on this same response (used only when a request arrived with no cookie of its own, so there is nothing else to key a new SSE connection's session on). */
function newCookieToken(res: Response): string {
  const header = res.getHeader("Set-Cookie");
  const value = Array.isArray(header) ? header[0] : (header as string | undefined);
  return value?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1] ?? "";
}

/** Resolves the caller's visitor id from the cookie, creating one if needed, and keeps the response's cookie in sync. */
function identify(req: Request, res: Response): string {
  const visitor = visitorFor(db, readCookie(req));
  if (visitor.newToken) setCookie(req, res, visitor.newToken);
  return visitor.id;
}

/** After revoking a session's SSE connections, flips presence off for any (room, visitor) pair whose last live connection was just closed — reusing `leave`'s own active=0 + SSE-push logic, so other members see the departure immediately rather than waiting out the 30s presence sweep. */
function clearPresence(cleared: { roomId: string; visitorId: string }[]): void {
  for (const { roomId, visitorId } of cleared) leaveRoom(db, roomId, visitorId);
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

// CSRF: the session cookie is already SameSite=Lax, which blocks a
// cross-site HTML form's simple cross-site POST from carrying it at all.
// The residual gap this closes is a cross-site browser request that Lax
// still allows in some cases (e.g. a top-level navigation), so every
// state-changing request additionally requires its Origin (or, lacking
// that, Referer) header to match this server's own origin. A browser sets
// Origin on every POST itself and a script cannot override or omit it
// cross-origin, so this can't be bypassed from another site; a same-origin
// request (the only kind this single-page app itself ever makes) always
// satisfies it without any client-side change.
function sameOrigin(req: Request): boolean {
  const host = req.header("host");
  const origin = req.header("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const referer = req.header("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  // Neither header present: a real cross-origin browser POST always sends
  // Origin, so this case is either same-origin tooling that doesn't bother
  // setting either header (this project's own spec/API test scripts,
  // curl, server-to-server calls) or a same-site navigation that dropped
  // Referer for privacy reasons — not a forgeable cross-site browser
  // request, which is what SameSite=Lax plus this check together defend
  // against. Accepted, since every write still requires the session
  // cookie, which a genuinely cross-site browser request cannot attach.
  return true;
}
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" || sameOrigin(req)) {
    next();
    return;
  }
  res.status(403).json({ ok: false, code: "bad_request", message: "Cross-site request refused." });
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
  const visitorId = identify(req, res);
  const account = accountForVisitor(db, visitorId);
  res.json({ visitorId, account: account ?? null });
});

// Regression (independent review, 14 Oct 2026): a recovery code is meant
// to re-link a BROWSER to an anonymous GUEST identity that was never
// password-protected — ADR 0006 explicitly frames it as "no password, no
// email, nothing the project depends on besides its own database." But
// `createRecoveryCode` took only a visitor id, with no check on whether
// that visitor had since been linked to an account (ADR 0010): a visitor
// signed in to a password-protected account could still generate a
// recovery code for THEMSELVES, and redeeming it from any other browser
// granted full account access with no password at all — a strictly
// weaker path into the exact account the password exists to protect.
// Refused outright here, in both directions: generating one for an
// account-linked visitor, and redeeming one that (even if generated
// before the account existed) now resolves to an account-linked visitor.
app.post("/api/identity/recovery-code", (req, res) => {
  const visitorId = identify(req, res);
  if (accountForVisitor(db, visitorId)) {
    res.status(400).json({
      ok: false,
      message: "This identity is signed in to an account; use the account's own username and password to reach it from another device.",
    });
    return;
  }
  res.json({ code: createRecoveryCode(db, visitorId) });
});

app.post("/api/identity/recover", (req, res) => {
  if (recoveryRateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ ok: false, message: "Too many attempts; wait a minute and try again." });
    return;
  }
  // If THIS browser is currently signed in to an account, redeeming a
  // guest code here would silently switch the browser's cookie away from
  // that account — the exact "silent switch away from an identity" the
  // account system otherwise always gates behind an explicit, re-verified
  // confirmation (ADR 0010's two-step sign-in). Recovery was never meant
  // to be a second, unconfirmed way to do that; refused before even
  // checking the code, so this never consumes a still-valid one by mistake.
  const priorVisitorId = findVisitor(db, readCookie(req));
  if (priorVisitorId && accountForVisitor(db, priorVisitorId)) {
    res.status(400).json({
      ok: false,
      message: "This browser is signed in to an account; sign out first if you want to switch to a guest identity.",
    });
    return;
  }
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const visitorId = code && redeemRecoveryCode(db, code);
  if (!visitorId) {
    res.status(400).json({ ok: false, message: "That code is invalid or has already been used." });
    return;
  }
  if (accountForVisitor(db, visitorId)) {
    // the code is already consumed (redeemRecoveryCode deletes it on read)
    // and deliberately not reinstated: a code reaching this point is either
    // a bug elsewhere or an attempt to replay one generated before the
    // account existed, and letting it be tried again changes nothing about
    // the risk, only the convenience of trying again
    res.status(400).json({
      ok: false,
      message: "This identity is signed in to an account; recovery codes can't be used to reach a password-protected account.",
    });
    return;
  }
  // a new session for the existing visitor, alongside any others they hold,
  // so redeeming the code never signs another of their devices out
  setCookie(req, res, createSession(db, visitorId));
  res.json({ ok: true, message: "Recovered. This code is now spent — generate a new one if you want to link another device." });
});

// ---- explicit accounts (phase 2 corrective review) -------------------------

// Whether THIS browser's current anonymous visitor already has rooms,
// snapshots or friendships of its own — the client checks this before
// registering or signing in, to decide whether to warn about a migration
// conflict (brief: never silently merge or reassign another identity's
// work). Read-only; never links or creates anything.
app.get("/api/account/migration-check", (req, res) => {
  const visitorId = identify(req, res);
  const alreadyLinked = !!accountForVisitor(db, visitorId);
  res.json({ hasOwnWork: visitorHasOwnWork(db, visitorId), alreadyLinked });
});

app.post("/api/account/register", (req, res) => {
  if (authRateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ ok: false, message: "Too many attempts; wait a minute and try again." });
    return;
  }
  const visitorId = identify(req, res);
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName : username;
  const outcome = register(db, visitorId, username, password, displayName);
  if (!outcome.ok) {
    const message =
      outcome.code === "username_taken"
        ? "That username is already taken."
        : outcome.code === "invalid_username"
          ? "Usernames are 3-24 letters, numbers, underscores or hyphens, starting with a letter or number."
          : outcome.code === "weak_password"
            ? "Use a password of at least 8 characters."
            : "This browser is already signed in to an account.";
    res.status(400).json({ ok: false, code: outcome.code, message });
    return;
  }
  res.json({ ok: true, account: outcome.account });
});

// Two-step sign-in, specifically because of the migration-conflict case
// (brief: never silently switch a browser away from an anonymous identity
// that already has its own work; "obtain a decision where necessary"). This
// first step only verifies the password and reports whether the CURRENT
// browser's own anonymous visitor has rooms/friends/snapshots of its own —
// it sets no cookie and creates no session, so merely checking credentials
// (or a page reload, or a retry) can never itself complete the switch.
app.post("/api/account/sign-in", (req, res) => {
  if (authRateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ ok: false, message: "Too many attempts; wait a minute and try again." });
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const outcome = verifyCredentials(db, username, password);
  if (!outcome.ok) {
    // non-enumerating: identical response whether the username doesn't
    // exist or the password is simply wrong
    res.status(401).json({ ok: false, message: "Incorrect username or password." });
    return;
  }
  const priorVisitorId = findVisitor(db, readCookie(req));
  const priorHadOwnWork = !!priorVisitorId && priorVisitorId !== outcome.visitorId && visitorHasOwnWork(db, priorVisitorId);
  res.json({ ok: true, account: outcome.account, priorHadOwnWork });
});

// The second step: only ever called either immediately (no conflict), or
// after the UI showed the conflict warning and the player explicitly chose
// to continue. Re-verifies the password itself — this endpoint is not
// trusted to "just switch" on the strength of the first call's response
// alone, since that response already left the browser unauthenticated.
app.post("/api/account/sign-in/confirm", (req, res) => {
  if (authRateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ ok: false, message: "Too many attempts; wait a minute and try again." });
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const outcome = verifyCredentials(db, username, password);
  if (!outcome.ok) {
    res.status(401).json({ ok: false, message: "Incorrect username or password." });
    return;
  }
  // This browser's PRIOR session, if any, is about to stop being the one
  // this cookie resolves to — so any room stream it opened must stop
  // receiving that room's private updates under the old identity right
  // now, not whenever its socket happens to close on its own (the
  // account-switch half of the review's regression: "account switching
  // must not leave the previous identity's stream or room state
  // attached"). Revoking it also clears that visitor's presence in any
  // room whose last live connection this was, rather than letting a
  // now-dead stream's own keep-alive keep renewing it.
  const priorToken = readCookie(req);
  if (priorToken) clearPresence(revokeSession(hashToken(priorToken)));
  const session = confirmSignIn(db, outcome.visitorId);
  setCookie(req, res, session);
  res.json({ ok: true, account: outcome.account });
});

app.post("/api/account/sign-out", (req, res) => {
  const token = readCookie(req);
  if (token) {
    signOut(db, token);
    // Close every SSE stream this specific session opened: logging out in
    // one tab must stop that tab's room stream immediately, not merely
    // once its socket eventually drops — "a stale stream must not keep
    // renewing the old identity's active presence" in the meantime.
    clearPresence(revokeSession(hashToken(token)));
  }
  // a signed-out visit still needs an identity to act as (an anonymous one,
  // exactly like a brand-new visit); identify() issues a fresh cookie here
  identify(req, res);
  res.json({ ok: true });
});

// Batch display-name lookup: every list that shows "who" (friends,
// invitations, members, contributors, attribution, credits) resolves
// through this instead of a raw visitor id. A visitor with no account has
// no entry in the response; the client falls back to its own short,
// anonymous label.
app.get("/api/account/names", (req, res) => {
  const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean).slice(0, 100) : [];
  res.json(displayNamesFor(db, ids));
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

// Pre-join admission preview (the brief: "a first-time join through a
// direct URL must show a pre-join screen before joining... show room name,
// scene, capacity, visibility, and whether members may publish"). Never
// joins, never reserves a slot — `join` re-checks everything itself,
// atomically, at the moment admission actually happens, so a preview that
// went stale (someone else took the last slot a moment later) is refused
// there regardless of what this said a moment earlier.
app.get("/api/rooms/:id/preview", (req, res) => {
  const visitorId = identify(req, res);
  const preview = admissionPreview(db, req.params.id, visitorId);
  if (!preview) {
    res.status(404).json({ ok: false, message: "No such room." });
    return;
  }
  res.json(preview);
});

// Realtime: server-sent events, one connection per open session per room
// (ADR 0008). Writes still only ever happen through POST /api/command.
//
// `isMember` only proves *historical* membership (a room_members row exists
// at all, active or not) — it is not itself proof this visitor currently
// holds one of the room's live slots. A returning member whose presence had
// lapsed (left, disconnected past the grace period, or simply never active
// again after someone else took the freed slot) must go through the same
// capacity check a fresh join does before being marked active; connecting
// the stream and only afterward discovering the room is already full at
// capacity would both reject the viewer's own events and still have opened
// a never-torn-down SSE handle, so the check happens first.
//
// Registered by the SESSION TOKEN that opened it (`registerConnection`,
// realtime.ts), so that signing that specific session out (or an account
// switch that supersedes it) can revoke exactly this stream without
// touching a different, still-valid session the same visitor might hold
// elsewhere (ADR 0006/0010) — see `revokeSession`'s callers below.
app.get("/api/rooms/:id/events", (req, res) => {
  const incomingToken = readCookie(req);
  const visitorId = identify(req, res); // may issue a fresh cookie if `incomingToken` was absent/invalid
  const room = findRoom(db, req.params.id);
  if (!room || !isMember(db, room.id, visitorId)) {
    res.status(404).json({ ok: false, message: "No such room." });
    return;
  }
  const admitted = markActive(db, room.id, visitorId);
  if (!admitted.ok) {
    res.status(409).json({ ok: false, code: admitted.code, message: "This room is already at capacity." });
    return;
  }
  // The session token this connection is authorized under: the one that
  // was already in the cookie, or (a brand-new visitor's very first
  // request) the fresh one `identify` just issued. Either way this
  // connection is now tied to one real, revocable session row.
  const sessionToken = incomingToken ?? newCookieToken(res);
  const tokenHash = hashToken(sessionToken);
  const unsubscribe = subscribe(room.id, res, snapshotOf(db, room));
  const keepAlive = setInterval(() => markActive(db, room.id, visitorId), 10_000);
  const deregister = registerConnection({
    tokenHash,
    roomId: room.id,
    visitorId,
    kill: () => {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    },
  });
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    deregister();
  });
});

app.post("/api/rooms/:id/mark", (req, res) => {
  const visitorId = identify(req, res);
  const room = findRoom(db, req.params.id);
  const planId = typeof req.body?.planId === "string" ? req.body.planId : "";
  // A mark is a live, room-visible action, not a read: an inactive former
  // member (left, replaced, or refused a rejoin) must not be able to push a
  // "look here" to people currently in the room — the same
  // currently-admitted check every other mutation now uses.
  if (!room || !isActiveMember(db, room.id, visitorId) || !planId) {
    res.status(404).json({ ok: false, message: "No such room or plan." });
    return;
  }
  // The target must actually be a current, open plan IN THIS ROOM: an
  // isolated check found that any string was accepted and broadcast as
  // `sent: true`, including a plan from a different room or one that was
  // never a real plan id at all. `snapshotOf`'s `plans` are already
  // filtered to `status = 'open'` for this room.id, so this is the same
  // authoritative list a member's own client reads.
  const isOpenPlanHere = snapshotOf(db, room).plans.some((p) => p.id === planId);
  if (!isOpenPlanHere) {
    res.status(404).json({ ok: false, message: "That plan isn't open in this room." });
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
  if (!snapshot || !canAccessSnapshot(db, req.params.id, visitorId)) {
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

// A direct "save to my collection" from a viewed (saved-or-published)
// version: a distinct, immutable copy this visitor now owns, with no room
// created or joined as a side effect (the brief, section 10 — "creating a
// room and saving from that room is not equivalent to collecting a work").
// Authorized by the same rule viewing it already required.
app.post("/api/snapshots/:id/collect", (req, res) => {
  const visitorId = identify(req, res);
  if (!canAccessSnapshot(db, req.params.id, visitorId)) {
    res.status(404).json({ ok: false, message: "No such snapshot." });
    return;
  }
  const summary = collectSnapshot(db, req.params.id, visitorId);
  if (!summary) {
    res.status(404).json({ ok: false, message: "No such snapshot." });
    return;
  }
  res.json(summary);
});

// Access to the SOURCE must be authorized before anything is copied:
// possession of a snapshot id is not authorization (a link can be shared
// freely, and a UUID is not a secret). Continuing is refused, with nothing
// created, unless the requester saved it themselves, is a current member of
// the room it came from, or it has actually been published — the same
// three cases GET /api/snapshots/:id itself allows, checked here with the
// identical function, not a looser or different rule (the brief's
// "apply the same policy consistently to viewing, copying... and
// continuing" — this was the bug: continue skipped the check GET already
// had, so a 404 on GET gave no protection at all against continue).
app.post("/api/snapshots/:id/continue", (req, res) => {
  const visitorId = identify(req, res);
  const snapshot = getSnapshot(db, req.params.id);
  if (!snapshot || !canAccessSnapshot(db, req.params.id, visitorId)) {
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
