// Thin fetch wrappers for the lobby (ADR 0007): room creation, joining,
// friends and invitations. Every call is same-origin, cookie-based; nothing
// here decides anything the server doesn't re-check.

export interface LobbyRoom {
  id: string;
  sceneId: string;
  label: string | null;
  occupancy: number;
  capacity: number;
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

export const whoAmI = (): Promise<{ visitorId: string }> => fetch("/api/me").then((r) => json(r));

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
