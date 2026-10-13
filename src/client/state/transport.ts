import type { CommandEnvelope, CommandResult, Snapshot } from "../../domain/commands.ts";
import { applyCommand, applyPlacement, validateCommand, type BuildState } from "../../domain/rules.ts";
import { STREET_SCENE } from "../../domain/scene.ts";

export interface Transport {
  /** Resume this visitor's build, or start one. */
  load(): Promise<Snapshot>;
  send(envelope: CommandEnvelope): Promise<CommandResult>;
  readonly durable: boolean;
}

export class NetworkError extends Error {}
/** The room doesn't exist, or isn't one this visitor may read (invite-only, not a member). */
export class AccessError extends Error {}
/** The room exists and this visitor could join it, but it's already at its scene's maxPlayers. */
export class RoomFullError extends Error {}

/**
 * A specific room (ADR 0007). `roomId` undefined means "my own default solo
 * room", the back-compat path the server still serves at `/api/build` and
 * `/api/command` for a visitor with no room chosen yet.
 */
export function roomTransport(roomId: string | undefined): Transport {
  const buildUrl = roomId ? `/api/rooms/${roomId}` : "/api/build";
  const commandUrl = roomId ? `/api/rooms/${roomId}/command` : "/api/command";
  return {
    durable: true,
    async load() {
      // A direct link, a reload, or a reconnect is the same request as a
      // join: it restores this visitor's membership (a no-op if they're
      // already in) before reading state, so "restores the correct room and
      // authoritative state" holds whether this is the first visit or the
      // hundredth. For an invite-only room with no accepted invitation, this
      // is refused exactly as a join would be.
      if (roomId) {
        const joined = await fetch(`/api/rooms/${roomId}/join`, { method: "POST", credentials: "same-origin" });
        if (joined.status === 403 || joined.status === 404) throw new AccessError("this room isn't open to you");
        if (joined.status === 409) throw new RoomFullError("this room is full");
      }
      const res = await fetch(buildUrl, { credentials: "same-origin" });
      if (res.status === 404) throw new AccessError("this room isn't open to you");
      if (!res.ok) throw new NetworkError(`couldn't load the build (HTTP ${res.status})`);
      return (await res.json()) as Snapshot;
    },
    async send(envelope) {
      let res: Response;
      try {
        res = await fetch(commandUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope),
        });
      } catch {
        throw new NetworkError("no connection to the server");
      }
      if (res.status >= 500) throw new NetworkError(`the server failed (HTTP ${res.status})`);
      return (await res.json()) as CommandResult;
    },
  };
}

/** Back-compat alias: the visitor's own default room. */
export const httpTransport: Transport = roomTransport(undefined);

// In-browser stand-in for the server, for the visual preview (`?local`). It
// runs the same rules but keeps nothing: `durable` is false and the UI says so.
export function localTransport(): Transport {
  const scene = STREET_SCENE;
  let state: BuildState = { parts: [], inventory: { ...scene.kit }, plans: [] };
  let revision = 0;
  let n = 0;
  const snapshot = (): Snapshot => ({
    buildId: "local",
    roomId: "local",
    sceneId: scene.id,
    templateVersion: scene.version,
    revision,
    parts: [...state.parts],
    inventory: { ...state.inventory },
    plans: [...(state.plans ?? [])],
    contributors: [],
    members: [{ visitorId: "local", active: true, isHost: true }],
    maxPlayers: scene.maxPlayers,
    visibility: "invite_only",
    allowPublish: false,
    hostId: "local",
  });
  if (new URLSearchParams(location.search).has("reference")) {
    for (const p of scene.reference) state = applyPlacement(state, p, `ref${n++}`);
  }
  return {
    durable: false,
    async load() {
      return snapshot();
    },
    async send({ command }) {
      const rejection = validateCommand(scene, state, command);
      if (rejection) return { ok: false, ...rejection, snapshot: snapshot() };
      state = applyCommand(state, command, `local${n++}`);
      revision++;
      return { ok: true, snapshot: snapshot() };
    },
  };
}
