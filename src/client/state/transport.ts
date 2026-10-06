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

export const httpTransport: Transport = {
  durable: true,
  async load() {
    const res = await fetch("/api/build", { credentials: "same-origin" });
    if (!res.ok) throw new NetworkError(`couldn't load the build (HTTP ${res.status})`);
    return (await res.json()) as Snapshot;
  },
  async send(envelope) {
    let res: Response;
    try {
      res = await fetch(`/api/command`, {
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

// In-browser stand-in for the server, for the visual preview (`?local`). It
// runs the same rules but keeps nothing: `durable` is false and the UI says so.
export function localTransport(): Transport {
  const scene = STREET_SCENE;
  let state: BuildState = { parts: [], inventory: { ...scene.kit } };
  let revision = 0;
  let n = 0;
  const snapshot = (): Snapshot => ({
    buildId: "local",
    sceneId: scene.id,
    templateVersion: scene.version,
    revision,
    parts: [...state.parts],
    inventory: { ...state.inventory },
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
