import { useSyncExternalStore } from "react";
import { CATALOG, partDef } from "../../domain/catalog.ts";
import type { Command, CommandEnvelope, Snapshot } from "../../domain/commands.ts";
import type { Cell, Rotation } from "../../domain/grid.ts";
import {
  nextRotation,
  restingHeight,
  validateCommand,
  validatePlacement,
  type Placement,
  type Rejection,
} from "../../domain/rules.ts";
import { STREET_SCENE } from "../../domain/scene.ts";
import { NetworkError, type Transport } from "./transport.ts";

// Client state. The snapshot is the server's, replaced wholesale on every
// answer. Everything else is local and never saved: which part is held, the
// preview, the selection and the delete tool. There are no modes. What a
// click means follows from those (ADR 0003):
//   holding a part  → the click places it
//   delete tool on  → the click removes the part under it
//   otherwise       → the click selects a placed part, or clears selection

export interface Held {
  partId: string;
  rot: Rotation;
  /** The footprint cell the preview is centred on, or null for no preview yet. */
  anchor: Cell | null;
  /** Manual height aid, in plates above where the part would rest. */
  lift: number;
}

export type SaveStatus = "loading" | "load-failed" | "saved" | "saving" | "failed";
export type CameraRequest = { kind: "top" | "reset"; n: number };

export interface AppState {
  snapshot: Snapshot | null;
  durable: boolean;
  held: Held | null;
  /** The colour the next part is placed in; kept across part choices. */
  colour: string;
  selectedId: string | null;
  deleting: boolean;
  /** The placed part under the pointer (or keyboard cursor) while the delete tool is on. */
  targetId: string | null;
  save: { status: SaveStatus; message?: string };
  /** The last thing worth saying out loud, mirrored to an aria-live region. */
  notice: { text: string; kind: "info" | "error"; at: number } | null;
  camera: CameraRequest;
}

export const scene = STREET_SCENE;

let state: AppState = {
  snapshot: null,
  durable: true,
  held: null,
  colour: "pale-mint",
  selectedId: null,
  deleting: false,
  targetId: null,
  save: { status: "loading" },
  notice: null,
  camera: { kind: "reset", n: 0 },
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

const partOf = (id: string | null) => (id ? state.snapshot?.parts.find((p) => p.id === id) : undefined);
const nameOf = (id: string | null): string => {
  const p = partOf(id);
  return (p && partDef(p.partId)?.name) ?? "part";
};

// ---- holding a part --------------------------------------------------------

/** Pick up a tray part; choosing the part already held puts it down. */
export function choosePart(partId: string): void {
  const def = partDef(partId);
  if (!def) return;
  if (state.held?.partId === partId) {
    putDown();
    return;
  }
  const rot = state.held && def.rotations.includes(state.held.rot) ? state.held.rot : def.rotations[0];
  set({
    held: { partId, rot, anchor: state.held?.anchor ?? null, lift: 0 },
    selectedId: null,
    deleting: false,
    targetId: null,
  });
  if ((state.snapshot?.inventory[partId] ?? 0) === 0) say(`No ${def.name} left in your kit.`, "error");
}

export function putDown(): void {
  set({ held: null });
}

export function setColour(colour: string): void {
  set({ colour });
}

function setHeld(patch: Partial<Held>): void {
  if (state.held) set({ held: { ...state.held, ...patch } });
}

export function aimAt(anchor: Cell): void {
  setHeld({ anchor, lift: 0 });
}

export function moveAnchor(dx: number, dz: number): void {
  if (!state.held) return;
  const a = state.held.anchor ?? { x: Math.floor(scene.bounds.w / 2), z: Math.floor(scene.bounds.d / 2) };
  const x = Math.min(scene.bounds.w - 1, Math.max(0, a.x + dx));
  const z = Math.min(scene.bounds.d - 1, Math.max(0, a.z + dz));
  setHeld({ anchor: { x, z }, lift: 0 });
}

export function lift(by: number): void {
  if (state.held?.anchor) setHeld({ lift: state.held.lift + by });
}

/** The previewed placement and whether the rules would accept it. */
export function preview(s: AppState = state): { placement: Placement; rejection: Rejection | null } | null {
  const { held, snapshot } = s;
  if (!held?.anchor || !snapshot) return null;
  const def = partDef(held.partId);
  if (!def) return null;
  const w = held.rot % 2 === 0 ? def.w : def.d;
  const d = held.rot % 2 === 0 ? def.d : def.w;
  // centre the footprint on the anchor, then keep it inside the plot
  const x = Math.min(scene.bounds.w - w, Math.max(0, held.anchor.x - Math.floor((w - 1) / 2)));
  const z = Math.min(scene.bounds.d - d, Math.max(0, held.anchor.z - Math.floor((d - 1) / 2)));
  const rest = restingHeight(def, { x, z, rot: held.rot }, snapshot.parts);
  const y = Math.max(0, rest + held.lift);
  const placement: Placement = { partId: def.id, x, y, z, rot: held.rot, colour: s.colour };
  return { placement, rejection: validatePlacement(scene, snapshot, placement) };
}

// ---- selection and the delete tool -----------------------------------------

export function select(id: string | null): void {
  set({ selectedId: id });
  if (id) {
    const part = partOf(id);
    const def = part && partDef(part.partId);
    if (def) say(`Selected ${def.name} (${def.code}).`);
  }
}

export function toggleDelete(on = !state.deleting): void {
  set({ deleting: on, held: on ? null : state.held, selectedId: null, targetId: null });
  say(on ? "Delete tool on: choose a part to remove it." : "Delete tool off.");
}

export function setTarget(id: string | null): void {
  if (state.targetId !== id) set({ targetId: id });
}

/** Step through placed parts: the selection, or the delete tool's target. */
export function cycle(step: 1 | -1): void {
  const parts = state.snapshot?.parts ?? [];
  if (parts.length === 0 || state.held) return;
  const current = state.deleting ? state.targetId : state.selectedId;
  const i = parts.findIndex((p) => p.id === current);
  const next = parts[i === -1 ? (step === 1 ? parts.length - 1 : 0) : (i + step + parts.length) % parts.length];
  if (state.deleting) {
    set({ targetId: next.id });
    say(`Delete target: ${partDef(next.partId)?.name}. Enter removes it.`);
  } else {
    select(next.id);
  }
}

/** Escape: leave the delete tool, else put the held part down, else clear the selection. */
export function escape(): void {
  if (state.deleting) toggleDelete(false);
  else if (state.held) putDown();
  else if (state.selectedId) select(null);
}

export function requestCamera(kind: CameraRequest["kind"]): void {
  set({ camera: { kind, n: state.camera.n + 1 } });
}

// ---- commands ------------------------------------------------------------

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
        : result.message,
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

/** Checks locally first, so an obviously refused command never costs a round trip. */
function submit(command: Command, describe: string): Promise<boolean> {
  if (!state.snapshot || pending || state.save.status === "saving") return Promise.resolve(false);
  const rejection = validateCommand(scene, state.snapshot, command);
  if (rejection) {
    say(rejection.message, "error");
    return Promise.resolve(false);
  }
  return send({ commandId: crypto.randomUUID(), expectedRevision: state.snapshot.revision, command }, describe);
}

export function retry(): void {
  if (pending) void send(pending, "Retried.");
}

/** Place the previewed part; it stays held for the next one. */
export async function placeHeld(): Promise<void> {
  const p = preview();
  if (!p) {
    say("Point at the plot first, or move the preview with the arrow keys.", "error");
    return;
  }
  if (p.rejection) {
    say(`Can't place there: ${p.rejection.message}`, "error");
    return;
  }
  const def = partDef(p.placement.partId)!;
  const ok = await submit({ type: "place", placement: p.placement }, `Placed ${def.name}.`);
  if (ok) setHeld({ lift: 0 });
}

/** R: turn the held preview, or turn the selected part through the server. */
export async function rotate(): Promise<void> {
  if (state.held) {
    setHeld({ rot: nextRotation(state.held.partId, state.held.rot) });
    return;
  }
  const part = partOf(state.selectedId);
  if (!part) return;
  const def = partDef(part.partId)!;
  if (def.rotations.length < 2) {
    say(`A ${def.name} looks the same every way round.`, "error");
    return;
  }
  await submit({ type: "rotate", placedId: part.id, rot: nextRotation(part.partId, part.rot) }, `Turned ${def.name}.`);
}

export async function remove(id: string | null): Promise<void> {
  const part = partOf(id);
  if (!part) return;
  const name = nameOf(part.id);
  const ok = await submit({ type: "remove", placedId: part.id }, `Removed ${name}; it's back in your kit.`);
  if (ok && state.selectedId === part.id) set({ selectedId: null });
  if (ok && state.targetId === part.id) set({ targetId: null });
}

export async function recolourSelected(colour: string): Promise<void> {
  const part = partOf(state.selectedId);
  if (!part) return;
  await submit({ type: "recolour", placedId: part.id, colour }, `Recoloured ${nameOf(part.id)}.`);
}

/** Enter: place the held part, or remove the delete tool's target. */
export function confirm(): void {
  if (state.held) void placeHeld();
  else if (state.deleting && state.targetId) void remove(state.targetId);
}

export const catalog = CATALOG.filter((d) => d.id in scene.kit);
