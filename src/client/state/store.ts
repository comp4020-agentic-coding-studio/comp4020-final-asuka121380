import { useSyncExternalStore } from "react";
import { CATALOG, partDef } from "../../domain/catalog.ts";
import type { Command, CommandEnvelope, Snapshot } from "../../domain/commands.ts";
import type { Cell, Rotation } from "../../domain/grid.ts";
import {
  restingHeight,
  validatePlacement,
  validateRecolour,
  validateRemoval,
  type Placement,
  type Rejection,
} from "../../domain/rules.ts";
import { STREET_SCENE } from "../../domain/scene.ts";
import { NetworkError, type Transport } from "./transport.ts";

// Client state. The snapshot is the server's, replaced wholesale on every
// answer; everything else (tool, preview, selection) is local and never saved.

export type Mode = "build" | "select";

export interface Tool {
  mode: Mode;
  partId: string;
  colour: string;
  rot: Rotation;
  /** The footprint cell the preview is centred on, or null for no preview. */
  anchor: Cell | null;
  /** Manual height aid, in plates above where the part would rest. */
  lift: number;
}

export type SaveStatus = "loading" | "load-failed" | "saved" | "saving" | "failed";

export interface AppState {
  snapshot: Snapshot | null;
  durable: boolean;
  tool: Tool;
  selectedId: string | null;
  save: { status: SaveStatus; message?: string };
  /** The last thing worth saying out loud, mirrored to an aria-live region. */
  notice: { text: string; kind: "info" | "error"; at: number } | null;
}

export const scene = STREET_SCENE;

let state: AppState = {
  snapshot: null,
  durable: true,
  tool: { mode: "build", partId: "brick-2x4", colour: partDef("brick-2x4")!.defaultColour, rot: 0, anchor: null, lift: 0 },
  selectedId: null,
  save: { status: "loading" },
  notice: null,
};

const listeners = new Set<() => void>();
const set = (patch: Partial<AppState>): void => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getState = (): AppState => state;

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

const say = (text: string, kind: "info" | "error" = "info"): void => set({ notice: { text, kind, at: Date.now() } });

let transport: Transport;
let pending: CommandEnvelope | null = null;

export async function start(t: Transport): Promise<void> {
  transport = t;
  set({ durable: t.durable, save: { status: "loading" } });
  try {
    const snapshot = await t.load();
    set({ snapshot, save: { status: "saved" } });
  } catch (e) {
    set({ save: { status: "load-failed", message: e instanceof Error ? e.message : String(e) } });
  }
}

// ---- tool ----------------------------------------------------------------

export function setTool(patch: Partial<Tool>): void {
  set({ tool: { ...state.tool, ...patch } });
}

export function choosePart(partId: string): void {
  const def = partDef(partId);
  if (!def) return;
  const rot = def.rotations.includes(state.tool.rot) ? state.tool.rot : def.rotations[0];
  setTool({ partId, rot, mode: "build", lift: 0 });
  set({ selectedId: null });
}

export function rotate(): void {
  const def = partDef(state.tool.partId)!;
  const i = def.rotations.indexOf(state.tool.rot);
  setTool({ rot: def.rotations[(i + 1) % def.rotations.length] });
}

export function moveAnchor(dx: number, dz: number): void {
  const a = state.tool.anchor ?? { x: Math.floor(scene.bounds.w / 2), z: Math.floor(scene.bounds.d / 2) };
  const x = Math.min(scene.bounds.w - 1, Math.max(0, a.x + dx));
  const z = Math.min(scene.bounds.d - 1, Math.max(0, a.z + dz));
  setTool({ anchor: { x, z }, lift: 0 });
}

export function cancel(): void {
  if (state.selectedId) set({ selectedId: null });
  else setTool({ anchor: null, lift: 0 });
}

/** The previewed placement and whether the rules would accept it. */
export function preview(s: AppState = state): { placement: Placement; rejection: Rejection | null } | null {
  const { tool, snapshot } = s;
  if (tool.mode !== "build" || !tool.anchor || !snapshot) return null;
  const def = partDef(tool.partId);
  if (!def) return null;
  const w = tool.rot % 2 === 0 ? def.w : def.d;
  const d = tool.rot % 2 === 0 ? def.d : def.w;
  // centre the footprint on the anchor, then keep it inside the plot
  const x = Math.min(scene.bounds.w - w, Math.max(0, tool.anchor.x - Math.floor((w - 1) / 2)));
  const z = Math.min(scene.bounds.d - d, Math.max(0, tool.anchor.z - Math.floor((d - 1) / 2)));
  const rest = restingHeight(def, { x, z, rot: tool.rot }, snapshot.parts);
  const y = Math.max(0, rest + tool.lift);
  const placement: Placement = { partId: def.id, x, y, z, rot: tool.rot, colour: tool.colour };
  return { placement, rejection: validatePlacement(scene, snapshot, placement) };
}

// ---- commands ------------------------------------------------------------

function newId(): string {
  return crypto.randomUUID();
}

async function send(envelope: CommandEnvelope, describe: string): Promise<boolean> {
  pending = envelope;
  set({ save: { status: "saving" } });
  try {
    const result = await transport.send(envelope);
    pending = null;
    if (result.ok) {
      set({ snapshot: result.snapshot, save: { status: "saved" } });
      say(state.durable ? `${describe} Saved.` : `${describe} (Preview: not saved.)`);
      return true;
    }
    set({ snapshot: result.snapshot ?? state.snapshot, save: { status: "saved" } });
    say(
      result.code === "revision_conflict"
        ? "Your build changed somewhere else, so it has been reloaded. Nothing was lost; try again."
        : `Not placed: ${result.message}`,
      "error",
    );
    return false;
  } catch (e) {
    // keep the same envelope: retrying it can never apply twice
    const message = e instanceof NetworkError ? e.message : "something went wrong";
    set({ save: { status: "failed", message } });
    say(`Not saved: ${message}. Your last change is waiting to be retried.`, "error");
    return false;
  }
}

function submit(command: Command, describe: string): Promise<boolean> {
  if (!state.snapshot || pending || state.save.status === "saving") return Promise.resolve(false);
  return send({ commandId: newId(), expectedRevision: state.snapshot.revision, command }, describe);
}

export function retry(): void {
  if (pending) void send(pending, "Retried.");
}

export async function placePreview(): Promise<void> {
  const p = preview();
  if (!p) {
    say("Choose a spot on the plot first.", "error");
    return;
  }
  if (p.rejection) {
    say(`Can't place there: ${p.rejection.message}`, "error");
    return;
  }
  const def = partDef(p.placement.partId)!;
  const ok = await submit({ type: "place", placement: p.placement }, `Placed ${def.name}.`);
  if (ok) setTool({ lift: 0 });
}

export function select(id: string | null): void {
  set({ selectedId: id });
  if (id) {
    const part = state.snapshot?.parts.find((p) => p.id === id);
    const def = part && partDef(part.partId);
    if (def) say(`Selected ${def.name} (${def.code}).`);
  }
}

export function cycleSelection(step: 1 | -1): void {
  const parts = state.snapshot?.parts ?? [];
  if (parts.length === 0) return;
  const i = parts.findIndex((p) => p.id === state.selectedId);
  const next = i === -1 ? (step === 1 ? parts.length - 1 : 0) : (i + step + parts.length) % parts.length;
  setTool({ mode: "select" });
  select(parts[next].id);
}

export async function removeSelected(): Promise<void> {
  const id = state.selectedId;
  if (!id || !state.snapshot) return;
  const rejection = validateRemoval(state.snapshot, id);
  if (rejection) {
    say(rejection.message, "error");
    return;
  }
  const part = state.snapshot.parts.find((p) => p.id === id)!;
  const ok = await submit({ type: "remove", placedId: id }, `Removed ${partDef(part.partId)!.name}; it's back in your kit.`);
  if (ok) set({ selectedId: null });
}

export async function recolourSelected(colour: string): Promise<void> {
  const id = state.selectedId;
  if (!id || !state.snapshot) return;
  const rejection = validateRecolour(state.snapshot, id, colour);
  if (rejection) {
    say(rejection.message, "error");
    return;
  }
  await submit({ type: "recolour", placedId: id, colour }, "Recoloured.");
}

export const catalog = CATALOG.filter((d) => d.id in scene.kit);
