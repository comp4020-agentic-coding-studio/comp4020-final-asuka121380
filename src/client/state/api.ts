// Thin fetch wrappers for the lobby (ADR 0007): room creation, joining,
// friends and invitations. Every call is same-origin, cookie-based; nothing
// here decides anything the server doesn't re-check.

import { ensureIdentity } from "./identity.ts";

export interface LobbyRoom {
  id: string;
  sceneId: string;
  label: string | null;
  occupancy: number;
  capacity: number;
  /** Disclosed before joining (the brief: show publication policy before admission, not only after). */
  allowPublish: boolean;
}

export interface MyRoom {
  id: string;
  sceneId: string;
  label: string | null;
  visibility: "public" | "invite_only";
  isHost: boolean;
  isDefault: boolean;
}

export interface RoomInvite {
  id: string;
  roomId: string;
  sceneId: string;
  label: string | null;
  invitedBy: string;
  createdAt: string;
  /** Disclosed before accepting. */
  allowPublish: boolean;
  occupancy: number;
  capacity: number;
}

export interface FriendRequest {
  id: string;
  fromVisitor: string;
  createdAt: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface Account {
  id: string;
  username: string;
  displayName: string;
}
/** Who this browser is now. Goes through `ensureIdentity`, so a first visit's identity is established once, never raced. */
export const whoAmI = (): Promise<{ visitorId: string; account: Account | null }> => ensureIdentity();

// ---- explicit accounts (phase 2 corrective review) -------------------------

export const migrationCheck = (): Promise<{ hasOwnWork: boolean; alreadyLinked: boolean }> =>
  fetch("/api/account/migration-check").then((r) => json(r));

export type RegisterCode = "username_taken" | "invalid_username" | "weak_password" | "already_linked";
export function register(username: string, password: string, displayName: string): Promise<{ ok: boolean; account?: Account; code?: RegisterCode; message?: string }> {
  return fetch("/api/account/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  }).then((r) => r.json());
}

/**
 * Step one: verifies the password and reports whether THIS browser's own
 * anonymous visitor has rooms/friends/snapshots of its own, but sets no
 * cookie and switches nothing yet (the migration-conflict case: never
 * switch a browser away from a worked-in anonymous identity without an
 * explicit decision). If `priorHadOwnWork` is false, the caller can go
 * straight to `confirmSignIn`; if true, show the warning first.
 */
export function signIn(username: string, password: string): Promise<{ ok: boolean; account?: Account; priorHadOwnWork?: boolean; message?: string }> {
  return fetch("/api/account/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json());
}

/** Step two: actually issues the session and switches this browser's cookie. Called immediately (no conflict) or after the conflict warning is confirmed. */
export function confirmSignIn(username: string, password: string): Promise<{ ok: boolean; account?: Account; message?: string }> {
  return fetch("/api/account/sign-in/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => r.json());
}

export const signOut = (): Promise<{ ok: boolean }> => fetch("/api/account/sign-out", { method: "POST" }).then((r) => json(r));

// a small in-memory cache: the same visitor id is looked up repeatedly
// across a member list, a contributor list and credits on one page
const nameCache = new Map<string, string>();
export async function displayNamesFor(ids: readonly string[]): Promise<Record<string, string>> {
  const unknown = ids.filter((id) => !nameCache.has(id));
  if (unknown.length > 0) {
    const fetched = await fetch(`/api/account/names?ids=${unknown.join(",")}`).then((r) => json<Record<string, string>>(r));
    for (const id of unknown) if (fetched[id]) nameCache.set(id, fetched[id]);
  }
  return Object.fromEntries(ids.map((id) => [id, nameCache.get(id)] as const).filter((e): e is [string, string] => !!e[1]));
}

/** The visitor's own default solo room, fetched-or-created, exactly as C8's single build (ADR 0007). */
export const myDefaultRoom = (): Promise<{ roomId: string }> => fetch("/api/build").then((r) => json(r));

export const publicLobby = (): Promise<LobbyRoom[]> => fetch("/api/rooms").then((r) => json(r));

export const myRooms = (): Promise<MyRoom[]> => fetch("/api/my/rooms").then((r) => json(r));

export const myInvites = (): Promise<RoomInvite[]> => fetch("/api/my/invites").then((r) => json(r));

export const myFriends = (): Promise<{ friends: string[]; pending: FriendRequest[] }> => fetch("/api/friends").then((r) => json(r));

export function createRoom(visibility: "public" | "invite_only", allowPublish: boolean, label?: string): Promise<{ roomId: string }> {
  return fetch("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visibility, allowPublish, label }),
  }).then((r) => json(r));
}

export type JoinCode = "room_full" | "forbidden" | "not_found";
export type JoinResult = { ok: true } | { ok: false; code: JoinCode };

export async function joinRoom(roomId: string): Promise<JoinResult> {
  const res = await fetch(`/api/rooms/${roomId}/join`, { method: "POST" });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { code?: JoinCode };
  return { ok: false, code: body.code ?? "not_found" };
}

export interface AdmissionPreview {
  id: string;
  sceneId: string;
  label: string | null;
  visibility: "public" | "invite_only";
  allowPublish: boolean;
  occupancy: number;
  capacity: number;
  canJoin: boolean;
  reason?: "forbidden" | "room_full";
  alreadyMember: boolean;
}

/**
 * Everything a pre-join confirmation screen needs, read-only: it never
 * joins, reserves a slot, or discloses a room's contents (the brief:
 * "a preview must not reserve a slot, join the room, expose private build
 * contents, or bypass invitation checks"). An invite-only room this
 * visitor has no standing in returns null, the same as a 404 would —
 * nothing about it is disclosed to a stranger. The caller still calls the
 * real `joinRoom` to actually admit, which re-checks everything server-side
 * at that moment regardless of what this said a moment earlier.
 */
export async function previewAdmission(roomId: string): Promise<AdmissionPreview | null> {
  const res = await fetch(`/api/rooms/${roomId}/preview`);
  if (!res.ok) return null;
  return (await res.json()) as AdmissionPreview;
}

export const leaveRoom = (roomId: string): Promise<void> => fetch(`/api/rooms/${roomId}/leave`, { method: "POST" }).then(() => undefined);

export function sendFriendRequest(to: string): Promise<{ ok: boolean; requestId?: string; code?: string }> {
  return fetch("/api/friends/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to }),
  }).then((r) => r.json());
}

export function respondToFriendRequest(id: string, accept: boolean): Promise<{ ok: boolean }> {
  return fetch(`/api/friends/requests/${id}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accept }),
  }).then((r) => r.json());
}

export const createFriendLink = (): Promise<{ token: string }> => fetch("/api/friends/link", { method: "POST" }).then((r) => json(r));

export function openFriendLink(token: string): Promise<{ ok: boolean; requestId?: string; fromVisitor?: string; code?: string }> {
  return fetch(`/api/friends/link/${token}`).then((r) => r.json());
}

export function inviteToRoom(roomId: string, to: string): Promise<{ ok: boolean; inviteId?: string; message?: string; code?: string }> {
  return fetch(`/api/rooms/${roomId}/invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to }),
  }).then((r) => r.json());
}

export function respondToInvite(id: string, accept: boolean): Promise<{ ok: boolean; roomId?: string; status?: string; code?: string }> {
  return fetch(`/api/invites/${id}/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accept }),
  }).then((r) => r.json());
}

/** Any member may save a room at any time, without pausing or changing it (ADR 0009). */
export interface SnapshotSummary {
  id: string;
  roomId: string;
  sceneId: string;
  revision: number;
  savedBy: string;
  savedAt: string;
  allowPublish: boolean;
  /** The snapshot the room this was saved from was itself continued from, if any. */
  sourceSnapshotId: string | null;
}
export const saveRoom = (roomId: string): Promise<SnapshotSummary> => fetch(`/api/rooms/${roomId}/save`, { method: "POST" }).then((r) => json(r));

export const mySnapshots = (): Promise<SnapshotSummary[]> => fetch("/api/snapshots").then((r) => json(r));

export interface SnapshotDetail extends SnapshotSummary {
  parts: { id: string; partId: string; x: number; y: number; z: number; rot: number; colour: string; placedBy: string; proposedBy?: string; editedBy?: string }[];
  inventory: Record<string, number>;
  /** Who actually built in the room this snapshot captures. */
  contributors: { visitorId: string; firstContributionAt: string }[];
  /** Credited from an earlier snapshot in the chain; never conflated with `contributors`. */
  inheritedCredits: { visitorId: string; firstContributionAt: string }[];
}
export const getSnapshot = (id: string): Promise<SnapshotDetail> => fetch(`/api/snapshots/${id}`).then((r) => json(r));

export function publishSnapshot(id: string): Promise<{ ok: boolean; publicationId?: string; code?: string }> {
  return fetch(`/api/snapshots/${id}/publish`, { method: "POST" }).then((r) => r.json());
}

/**
 * The server may clamp the requested visibility/publish settings if the
 * source snapshot is restricted (never more permissive than its lineage),
 * so the response's own `visibility`/`allowPublish` are what actually
 * applied, which may differ from what was requested.
 */
export function continueSnapshot(
  id: string,
  visibility: "public" | "invite_only",
  allowPublish: boolean,
): Promise<{ roomId: string; visibility: "public" | "invite_only"; allowPublish: boolean }> {
  return fetch(`/api/snapshots/${id}/continue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visibility, allowPublish }),
  }).then((r) => json(r));
}

/** Copies a saved or published version directly into this visitor's own collection; creates or joins no room. */
export const collectSnapshot = (id: string): Promise<SnapshotSummary> => fetch(`/api/snapshots/${id}/collect`, { method: "POST" }).then((r) => json(r));

export interface ShowcaseEntry {
  publicationId: string;
  snapshotId: string;
  sceneId: string;
  publishedBy: string;
  publishedAt: string;
}
export const showcaseList = (): Promise<ShowcaseEntry[]> => fetch("/api/showcase").then((r) => json(r));

export const showcaseEntry = (id: string): Promise<ShowcaseEntry & { snapshot: SnapshotDetail }> =>
  fetch(`/api/showcase/${id}`).then((r) => json(r));

/** An identity panel's recovery actions (ADR 0006). */
export const createRecoveryCode = (): Promise<{ code: string }> => fetch("/api/identity/recovery-code", { method: "POST" }).then((r) => json(r));

export function redeemRecoveryCode(code: string): Promise<{ ok: boolean; message?: string }> {
  return fetch("/api/identity/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }).then((r) => r.json());
}
