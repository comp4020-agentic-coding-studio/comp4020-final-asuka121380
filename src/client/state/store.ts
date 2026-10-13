import { useSyncExternalStore } from "react";
import { CATALOG, partDef } from "../../domain/catalog.ts";
import type { Command, CommandEnvelope, Snapshot } from "../../domain/commands.ts";
import type { Cell, Rotation } from "../../domain/grid.ts";
import {
  fitHeights,
  footprint,
  nextRotation,
  validateCommand,
  validatePlacement,
  type Placement,
  type Rejection,
} from "../../domain/rules.ts";
import { STREET_SCENE } from "../../domain/scene.ts";
import { NetworkError, type Transport } from "./transport.ts";
import { screenToGrid } from "./view.ts";

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
  /**
   * The preview's height in plates, as the player chose it: by pointing at a
   * surface, or with Higher/Lower (ADR 0005). Null until something chooses
   * it, which means the lowest height that fits.
   */
  level: number | null;
  /**
   * True when the level came from pointing at the side of something, where
   * the hit height is only approximate: a level that doesn't fit then drops
   * to the nearest one below that does. A level from a top surface, or set
   * with the keys or buttons, is kept exactly, and the preview says why the
   * part can't go there.
   */
  snap: boolean;
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
  /** A selected open plan (ADR 0009), mutually exclusive with `selectedId`. */
  selectedPlanId: string | null;
  deleting: boolean;
  /** The placed part under the pointer (or keyboard cursor) while the delete tool is on. */
  targetId: string | null;
  save: { status: SaveStatus; message?: string };
  /** The last thing worth saying out loud, mirrored to an aria-live region. */
  notice: { text: string; kind: "info" | "error"; at: number } | null;
  camera: CameraRequest;
  /**
   * Live "look here" marks pushed over SSE, by plan id (ADR 0009). A mark is
   * never forced on anyone's camera; the UI reads this to draw a restrained,
   * fading outline and lets stale entries age out locally.
   */
  marks: Record<string, { markedBy: string; at: number }>;
}

export const scene = STREET_SCENE;

let state: AppState = {
  snapshot: null,
  durable: true,
  held: null,
  colour: "pale-mint",
  selectedId: null,
  selectedPlanId: null,
  deleting: false,
  targetId: null,
  save: { status: "loading" },
  notice: null,
  camera: { kind: "reset", n: 0 },
  marks: {},
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
    if (t.durable) connectRealtime(snapshot.roomId);
  } catch (e) {
    set({ save: { status: "load-failed", message: e instanceof Error ? e.message : String(e) } });
  }
}

// ---- realtime (ADR 0008) ---------------------------------------------------
//
// A committed change anywhere in the room — including by this browser's own
// other tabs, or by another member — is pushed here and merged straight into
// the live snapshot. A command's own POST response is already authoritative
// for the actor that sent it; applying the matching pushed snapshot again is
// harmless, since both describe the same committed state.

let eventSource: EventSource | null = null;

function connectRealtime(roomId: string): void {
  eventSource?.close();
  eventSource = new EventSource(`/api/rooms/${roomId}/events`);
  eventSource.onmessage = (ev) => {
    const event = JSON.parse(ev.data) as { type: "snapshot"; snapshot: Snapshot } | { type: "plan-marked"; planId: string; markedBy: string };
    if (event.type === "snapshot") {
      set({ snapshot: event.snapshot });
    } else {
      set({ marks: { ...state.marks, [event.planId]: { markedBy: event.markedBy, at: Date.now() } } });
    }
  };
  // the browser retries a dropped connection on its own; a reconnect's first
  // event is always a full snapshot (realtime.ts), so no separate recovery
  // path is needed here
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
    held: { partId, rot, anchor: state.held?.anchor ?? null, level: state.held?.level ?? null, snap: state.held?.snap ?? false },
    selectedId: null,
    selectedPlanId: null,
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

/** Aim the preview where the pointer is: a cell, the level of the surface it hit, and whether that level is approximate. */
export function aimAt(anchor: Cell, level: number, snap = false): void {
  setHeld({ anchor, level, snap });
}

const centreCell = (): Cell => ({ x: Math.floor(scene.bounds.w / 2), z: Math.floor(scene.bounds.d / 2) });

/** Show a preview if there isn't one: the middle of the plot, at the lowest height that fits. */
export function ensureAnchor(): void {
  if (state.held && !state.held.anchor) setHeld({ anchor: centreCell(), level: null, snap: false });
}

/** Move the preview one stud in world terms; its height stays as chosen. */
export function moveAnchor(dx: number, dz: number): void {
  if (!state.held) return;
  const a = state.held.anchor ?? centreCell();
  const x = Math.min(scene.bounds.w - 1, Math.max(0, a.x + dx));
  const z = Math.min(scene.bounds.d - 1, Math.max(0, a.z + dz));
  // whatever height is showing becomes the chosen one, and stays put
  const shown = preview()?.placement.y ?? state.held.level;
  setHeld({ anchor: { x, z }, level: state.held.anchor ? shown : state.held.level, snap: false });
}

/** Move the preview one stud as seen on screen (ADR 0005): right is +1 screen-right, up is +1 away. */
export function moveOnScreen(right: number, up: number): void {
  const { dx, dz } = screenToGrid(right, up);
  moveAnchor(dx, dz);
}

/** Higher (+1) or Lower (−1): the next height above or below that fits here. */
export function stepLevel(dir: 1 | -1): void {
  const p = preview();
  if (!state.held || !p) {
    ensureAnchor();
    return;
  }
  const y = p.placement.y;
  const next = dir === 1 ? p.fits.find((f) => f > y) : [...p.fits].reverse().find((f) => f < y);
  if (next === undefined) {
    say(dir === 1 ? "Nothing fits any higher here." : "Nothing fits any lower here.", "error");
    return;
  }
  setHeld({ level: next, snap: false });
}

/** The heights that fit, and where the preview sits among them. */
export interface Preview {
  placement: Placement;
  rejection: Rejection | null;
  /** Every height that fits at this footprint, lowest first. */
  fits: number[];
}

/** The previewed placement and whether the rules would accept it. */
export function preview(s: AppState = state): Preview | null {
  const { held, snapshot } = s;
  if (!held?.anchor || !snapshot) return null;
  const def = partDef(held.partId);
  if (!def) return null;
  const w = held.rot % 2 === 0 ? def.w : def.d;
  const d = held.rot % 2 === 0 ? def.d : def.w;
  // centre the footprint on the anchor, then keep it inside the plot
  const x = Math.min(scene.bounds.w - w, Math.max(0, held.anchor.x - Math.floor((w - 1) / 2)));
  const z = Math.min(scene.bounds.d - d, Math.max(0, held.anchor.z - Math.floor((d - 1) / 2)));
  const fits = fitHeights(scene, def, { x, z, rot: held.rot }, snapshot.parts);
  const y = chooseLevel(held, fits);
  const placement: Placement = { partId: def.id, x, y, z, rot: held.rot, colour: s.colour };
  return { placement, rejection: validatePlacement(scene, snapshot, placement), fits };
}

function chooseLevel(held: Held, fits: number[]): number {
  if (held.level === null) return fits[0] ?? 0;
  if (!held.snap || fits.includes(held.level)) return held.level;
  // an approximate level from a side face: the nearest that fits at or below it
  return [...fits].reverse().find((f) => f <= held.level!) ?? held.level;
}

/** Where a placement's footprint is, for "is this tap on the preview?". */
export function onFootprint(p: Placement, cell: Cell): boolean {
  const def = partDef(p.partId);
  return !!def && footprint(def, p).some((c) => c.x === cell.x && c.z === cell.z);
}

// ---- selection and the delete tool -----------------------------------------

export function select(id: string | null): void {
  set({ selectedId: id, selectedPlanId: null });
  if (id) {
    const part = partOf(id);
    const def = part && partDef(part.partId);
    if (def) say(`Selected ${def.name} (${def.code}).`);
  }
}

/** A plan is a proposal, not a placed part: a different, smaller set of actions applies (ADR 0009). */
export function selectPlan(id: string | null): void {
  set({ selectedPlanId: id, selectedId: null });
  if (id) {
    const plan = (state.snapshot?.plans ?? []).find((p) => p.id === id);
    const def = plan && partDef(plan.partId);
    if (def) say(`Selected a proposed ${def.name} (${def.code}).`);
  }
}

export function toggleDelete(on = !state.deleting): void {
  set({ deleting: on, held: on ? null : state.held, selectedId: null, selectedPlanId: null, targetId: null });
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
  else if (state.selectedPlanId) selectPlan(null);
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
        : result.code === "part_conflict"
          ? "Someone else just changed that part; it's been refreshed. Nothing was lost; try again."
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
  // the next one goes on top of this one, as if pointing at its top face
  if (ok) setHeld({ level: p.placement.y + def.h, snap: false });
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
  // ADR 0008: carrying the part's own revision means a conflict is only
  // ever reported for *this* part, never for an unrelated change elsewhere.
  await submit({ type: "rotate", placedId: part.id, rot: nextRotation(part.partId, part.rot), expectedRev: part.rev }, `Turned ${def.name}.`);
}

export async function remove(id: string | null): Promise<void> {
  const part = partOf(id);
  if (!part) return;
  const name = nameOf(part.id);
  const ok = await submit({ type: "remove", placedId: part.id, expectedRev: part.rev }, `Removed ${name}; it's back in your kit.`);
  if (ok && state.selectedId === part.id) set({ selectedId: null });
  if (ok && state.targetId === part.id) set({ targetId: null });
}

export async function recolourSelected(colour: string): Promise<void> {
  const part = partOf(state.selectedId);
  if (!part) return;
  await submit({ type: "recolour", placedId: part.id, colour, expectedRev: part.rev }, `Recoloured ${nameOf(part.id)}.`);
}

/** Enter: place the held part, remove the delete tool's target, or build a selected plan. */
export function confirm(): void {
  if (state.held) void placeHeld();
  else if (state.deleting && state.targetId) void remove(state.targetId);
  else if (state.selectedPlanId) void realizePlan(state.selectedPlanId);
}

// ---- plans (ADR 0009) -------------------------------------------------------
//
// A plan costs no stock and never blocks real construction: proposing one
// goes through the same command path as a placement, so it is validated and
// pushed to every member the same way, but `validatePlan` (not
// `validatePlacement`) is what the server and this preview check it against.

/** Propose the currently previewed part as a transparent plan, instead of placing it for real. */
export async function proposeHeld(): Promise<void> {
  const p = preview();
  if (!p || !state.snapshot) {
    say("Point at the plot first, or move the preview with the arrow keys.", "error");
    return;
  }
  const def = partDef(p.placement.partId)!;
  await submit({ type: "propose-plan", plan: p.placement }, `Proposed a ${def.name}.`);
}

export async function withdrawPlan(planId: string): Promise<void> {
  const ok = await submit({ type: "withdraw-plan", planId }, "Plan withdrawn.");
  if (ok && state.selectedPlanId === planId) set({ selectedPlanId: null });
}

/** Any member may realize any open plan (author's brief: not restricted to its proposer). */
export async function realizePlan(planId: string): Promise<void> {
  const ok = await submit({ type: "realize-plan", planId }, "Built from the plan.");
  if (ok && state.selectedPlanId === planId) set({ selectedPlanId: null });
}

/**
 * "Mark for everyone": a transient, restrained ping, not a command — it
 * never touches the build, so it bypasses the validated command path
 * entirely and posts straight to the room's mark endpoint (ADR 0009).
 */
export async function markPlanForEveryone(planId: string): Promise<void> {
  if (!state.snapshot) return;
  try {
    await fetch(`/api/rooms/${state.snapshot.roomId}/mark`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
  } catch {
    // a missed mark is only ever a missed "look here"; nothing to retry or recover
  }
}

export const catalog = CATALOG.filter((d) => d.id in scene.kit);
