import { useSyncExternalStore } from "react";
import { CATALOG, partDef } from "../../domain/catalog.ts";
import type { Command, CommandEnvelope, Snapshot } from "../../domain/commands.ts";
import type { Cell, Rotation } from "../../domain/grid.ts";
import {
  fitHeights,
  footprint,
  nextRotation,
  plannedRemaining,
  plannedStructure,
  planFits as planFitsOf,
  validateCommand,
  validatePlacement,
  validatePlan,
  type Placement,
  type PlanFit,
  type Rejection,
} from "../../domain/rules.ts";
import { STREET_SCENE } from "../../domain/scene.ts";
import { onIdentityChangedElsewhere } from "./session-events.ts";
import { AccessError, NetworkError, RoomFullError, type Transport } from "./transport.ts";
import { screenToGrid } from "./view.ts";

// Client state. The snapshot is the server's, replaced wholesale on every
// answer. Everything else is local and never saved: which part is held, the
// preview, the selection, the delete tool and the construction mode. What a
// click means follows from those (ADR 0003, ADR 0011):
//   holding a part, Build mode → the click places it for real
//   holding a part, Plan mode  → the click proposes it as a transparent plan
//   delete tool on             → the click removes the real part or withdraws the plan under it
//   otherwise                  → the click selects a part or plan, or clears selection
// The mode is this browser's alone: another member's mode never changes it.

/** What committing a held part does (ADR 0011). */
export type Mode = "build" | "plan";

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
export type CameraRequest = { kind: "top" | "reset" | "focus"; n: number };
/** A left-drag navigation tool (ADR 0012), for anyone without a convenient right or middle button. */
export type NavTool = "orbit" | "pan" | null;
/**
 * The realtime stream's own state (ADR 0008), separate from `save`: a
 * command can still be sent and answered over plain HTTP while the live
 * push channel is reconnecting, so the two are never conflated into one
 * status.
 */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface AppState {
  snapshot: Snapshot | null;
  durable: boolean;
  held: Held | null;
  /** Build places real parts; Plan proposes transparent plans. Local, and stable until switched explicitly. */
  mode: Mode;
  /** The colour the next part is placed in; kept across part choices. */
  colour: string;
  selectedId: string | null;
  /** A selected open plan (ADR 0009), mutually exclusive with `selectedId`. */
  selectedPlanId: string | null;
  deleting: boolean;
  /** The real part or plan under the pointer (or keyboard cursor) while the delete tool is on. */
  targetId: string | null;
  save: { status: SaveStatus; message?: string; code?: "access_denied" | "room_full" };
  /** The realtime stream's own state; independent of whether a command can still be sent (ADR 0008). */
  connection: ConnectionStatus;
  /** The last thing worth saying out loud, mirrored to an aria-live region. */
  notice: { text: string; kind: "info" | "error"; at: number } | null;
  camera: CameraRequest;
  /** While set, a left drag moves the camera and a left click edits nothing. */
  navTool: NavTool;
  /**
   * Parts committed while this page watched, by id → performance.now() at
   * arrival, so the scene can play a short drop into place once (ADR 0012).
   * Never filled from an initial load or a reconnect's catch-up snapshot.
   */
  drops: Record<string, number>;
  /**
   * Live "look here" marks pushed over SSE, by plan id (ADR 0009). A mark is
   * never forced on anyone's camera; the UI reads this to draw a restrained,
   * fading outline and lets stale entries age out locally.
   */
  marks: Record<string, { markedBy: string; at: number }>;
  /** This browser's own visitor id, so "you" can be marked in a member list; resolved once from the server. */
  selfId: string | null;
}

export const scene = STREET_SCENE;

/**
 * The room this editor opened (from the URL, ADR 0007), or null for the
 * back-compat default-room path. Set once at startup by main.tsx, before
 * `start()` runs; never changes within one page load — switching rooms
 * means navigating to a different /build/room/:id, not an in-place swap.
 */
let roomId: string | null = null;
export const setRoomId = (id: string | null): void => {
  roomId = id;
};
export const getRoomId = (): string | null => roomId;

let state: AppState = {
  snapshot: null,
  durable: true,
  held: null,
  mode: "build",
  colour: "pale-mint",
  selectedId: null,
  selectedPlanId: null,
  deleting: false,
  targetId: null,
  save: { status: "loading" },
  connection: "connecting",
  notice: null,
  camera: { kind: "reset", n: 0 },
  navTool: null,
  drops: {},
  marks: {},
  selfId: null,
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

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Adopt a newer authoritative snapshot that arrived live (a command's own
 * answer, or a pushed change after the stream's catch-up). Real parts whose
 * ids this page hasn't seen yet just arrived, so they get one drop; a part
 * already known — a repeated snapshot, a duplicate answer, the same change
 * seen over both HTTP and SSE — never replays it.
 */
function adoptLive(next: Snapshot): void {
  const prev = state.snapshot;
  if (prev && prev.roomId === next.roomId && next.revision < prev.revision) return; // a stale answer overtaken by a push
  if (!prev || prev.roomId !== next.roomId || reducedMotion()) {
    set({ snapshot: next });
    return;
  }
  const known = new Set(prev.parts.map((p) => p.id));
  const now = performance.now();
  const drops: Record<string, number> = {};
  for (const [id, at] of Object.entries(state.drops)) if (now - at < 1000) drops[id] = at;
  let added = false;
  for (const p of next.parts) {
    if (!known.has(p.id) && !(p.id in state.drops)) {
      drops[p.id] = now;
      added = true;
    }
  }
  set(added || Object.keys(drops).length !== Object.keys(state.drops).length ? { snapshot: next, drops } : { snapshot: next });
}

let transport: Transport;
let pending: CommandEnvelope | null = null;
let stopIdentityWatch: (() => void) | null = null;

export async function start(t: Transport): Promise<void> {
  transport = t;
  eventSource?.close();
  eventSource = null;
  set({ durable: t.durable, save: { status: "loading" }, connection: "connecting" });
  if (t.durable) {
    fetch("/api/me")
      .then((r) => r.json())
      .then((r: { visitorId: string }) => set({ selfId: r.visitorId }))
      .catch(() => {});
  }
  try {
    const snapshot = await t.load();
    set({ snapshot, save: { status: "saved" } });
    if (t.durable) connectRealtime(snapshot.roomId);
  } catch (e) {
    const code = e instanceof AccessError ? "access_denied" : e instanceof RoomFullError ? "room_full" : undefined;
    set({
      save: { status: "load-failed", message: e instanceof Error ? e.message : String(e), code },
      connection: "offline",
    });
  }
  // Regression (independent review): a tab left open through a sign-out or
  // account switch that happened in ANOTHER tab must stop stale editing and
  // refresh its own authentication state, not keep acting as the identity
  // it no longer has a session for. `broadcastIdentityChange` (another
  // tab's Account.tsx) notifies this one; the server would refuse any
  // further mutation anyway (every command re-checks current admission),
  // but waiting for a refused command to find out is a worse experience
  // than reloading this room's access/state proactively the moment the
  // identity underneath it might have changed.
  stopIdentityWatch?.();
  if (t.durable) {
    stopIdentityWatch = onIdentityChangedElsewhere(() => {
      putDown();
      select(null);
      selectPlan(null);
      toggleDelete(false);
      void start(t); // reload: re-resolves selfId, re-joins (re-checking admission), reconnects SSE
    });
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
  const es = new EventSource(`/api/rooms/${roomId}/events`);
  eventSource = es;
  // every (re)connection's first snapshot is a catch-up (realtime.ts): it is
  // adopted as-is, without animating whatever was built while away
  let caughtUp = false;
  es.onopen = () => {
    caughtUp = false;
    set({ connection: "connected" });
  };
  es.onmessage = (ev) => {
    set({ connection: "connected" }); // any event proves the stream is live, open or not
    const event = JSON.parse(ev.data) as { type: "snapshot"; snapshot: Snapshot } | { type: "plan-marked"; planId: string; markedBy: string };
    if (event.type === "snapshot") {
      if (caughtUp) adoptLive(event.snapshot);
      else set({ snapshot: event.snapshot });
      caughtUp = true;
    } else {
      set({ marks: { ...state.marks, [event.planId]: { markedBy: event.markedBy, at: Date.now() } } });
    }
  };
  // the browser retries a dropped connection on its own (readyState goes
  // CONNECTING, then either open again or closed if the room is gone); a
  // reconnect's first event is always a full snapshot (realtime.ts), so no
  // separate recovery fetch is needed, only the status shown while it's down
  es.onerror = () => {
    if (eventSource !== es) return; // a newer connection superseded this one
    set({ connection: es.readyState === EventSource.CONNECTING ? "reconnecting" : "offline" });
  };
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
    navTool: null,
  });
  // a plan may describe pieces the room doesn't have yet (ADR 0011)
  if (state.mode === "build" && (state.snapshot?.inventory[partId] ?? 0) === 0) say(`No ${def.name} left in your kit.`, "error");
}

/**
 * Switch between Build and Plan (ADR 0011). The preview on screen stays
 * exactly where it is — position, height, rotation, part and colour — and
 * only what a commit does changes (ADR 0012). The shown height is pinned as
 * an exact level first, so the other mode's height list can never move it;
 * if it isn't valid in the new mode, the preview says so and commits are
 * refused there. Entering Plan leaves the delete tool, as choosing a part does.
 */
export function setMode(mode: Mode): void {
  if (state.mode === mode) return;
  const shown = preview();
  const held = state.held && shown ? { ...state.held, level: shown.placement.y, snap: false } : state.held;
  set({ mode, held, ...(mode === "plan" && state.deleting ? { deleting: false, targetId: null } : {}) });
  if (mode === "plan") {
    say(coarsePointer() ? "Plan mode: plans cost no stock." : "Plan mode: a click proposes a transparent plan. It costs no stock. Press P or Build to go back.");
  } else {
    const held = state.held && partDef(state.held.partId);
    const none = held && (state.snapshot?.inventory[held.id] ?? 0) === 0;
    say(none ? `Build mode: a click places real parts. No ${held.name} left in the kit.` : "Build mode: a click places real parts.", none ? "error" : "info");
  }
}

export function toggleMode(): void {
  setMode(state.mode === "plan" ? "build" : "plan");
}

const coarsePointer = (): boolean => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** Real stock minus the room's open plans, by part type: planning demand, never stock (ADR 0011). */
export function plannedCounts(s: AppState = state): Record<string, number> {
  return s.snapshot ? plannedRemaining(s.snapshot) : {};
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

/** Put the preview back where it was (Workbench: the pointer passed over the scene on its way to a control). Same part only. */
export function restoreHeld(prev: Held): void {
  if (state.held && state.held.partId === prev.partId) setHeld({ anchor: prev.anchor, level: prev.level, snap: prev.snap, rot: state.held.rot });
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

/**
 * Higher (+1) or Lower (−1): the next height above or below that fits here
 * for the current mode (ADR 0005, 0012): clear and supported by real parts
 * in Build mode, by real parts and standing plans in Plan mode. Occupied
 * heights are skipped and every lower spot that fits stays reachable.
 */
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

/** The preview, whether each kind of commit would be accepted there, and the heights that fit for the current mode. */
export interface Preview {
  placement: Placement;
  /** Whether a REAL placement would be accepted here: real stock, real collision, real support. */
  rejection: Rejection | null;
  /** Whether a PLAN would be accepted here: bounds, collision and support against real parts plus standing plans (ADR 0012). */
  planRejection: Rejection | null;
  /** The current mode's rejection: what a commit right now would meet. */
  modeRejection: Rejection | null;
  /** Heights that fit here for the current mode, lowest first: what Higher/Lower step through. */
  fits: number[];
}

/** The previewed placement, and whether a real placement or a plan would be accepted there. */
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
  // the same structure the server checks against (rules.ts), so heights, verdict and command agree
  const structure = s.mode === "plan" ? plannedStructure(snapshot) : snapshot.parts;
  const fits = fitHeights(scene, def, { x, z, rot: held.rot }, structure);
  const y = chooseLevel(held, fits);
  const placement: Placement = { partId: def.id, x, y, z, rot: held.rot, colour: s.colour };
  const rejection = validatePlacement(scene, snapshot, placement);
  const planRejection = validatePlan(scene, snapshot, placement);
  return { placement, rejection, planRejection, modeRejection: s.mode === "plan" ? planRejection : rejection, fits };
}

function chooseLevel(held: Held, fits: number[]): number {
  if (held.level === null) return fits[0] ?? 0;
  if (!held.snap || fits.includes(held.level)) return held.level;
  // an approximate level from a side face: the nearest that fits at or below it
  return [...fits].reverse().find((f) => f <= held.level!) ?? held.level;
}

/** Each open plan's fit against the current construction (ADR 0012), for drawing and the selected-plan panel. */
export function planFitsNow(s: AppState = state): Map<string, PlanFit> {
  return s.snapshot ? planFitsOf(s.snapshot) : new Map();
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
  set({ deleting: on, held: on ? null : state.held, selectedId: null, selectedPlanId: null, targetId: null, ...(on ? { navTool: null } : {}) });
  say(on ? "Delete tool on: choose a real part or plan to remove it." : "Delete tool off.");
}

export function setTarget(id: string | null): void {
  if (state.targetId !== id) set({ targetId: id });
}

/** Step through placed parts: the selection, or the delete tool's target. */
export function cycle(step: 1 | -1): void {
  const parts = [...(state.snapshot?.parts ?? []), ...(state.deleting ? state.snapshot?.plans ?? [] : [])];
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

/** Escape: leave the delete tool, else the navigation tool, else put the held part down, else clear the selection. Never changes Build/Plan. */
export function escape(): void {
  if (state.deleting) toggleDelete(false);
  else if (state.navTool) setNavTool(null);
  else if (state.held) putDown();
  else if (state.selectedId) select(null);
  else if (state.selectedPlanId) selectPlan(null);
}

export function requestCamera(kind: CameraRequest["kind"]): void {
  set({ camera: { kind, n: state.camera.n + 1 } });
}

/** What F frames: the selected real part or plan, or null when nothing is selected. */
export function focusTarget(s: AppState = state): Placement | null {
  return s.snapshot?.parts.find((p) => p.id === s.selectedId) ?? s.snapshot?.plans.find((p) => p.id === s.selectedPlanId) ?? null;
}

export function focusSelected(): void {
  if (!focusTarget()) {
    say("Select a part or a plan first, then focus on it.", "error");
    return;
  }
  requestCamera("focus");
}

/** Orbit or Pan with a left drag, or back to building (null). Moving the camera never touches the room. */
export function setNavTool(tool: NavTool): void {
  if (state.navTool === tool) tool = null;
  set({ navTool: tool, ...(tool ? { deleting: false, targetId: null } : {}) });
  say(tool === "orbit" ? "Orbit tool: drag to turn the view. Esc or the tool again to build." : tool === "pan" ? "Pan tool: drag to slide the view. Esc or the tool again to build." : "Back to building.");
}

// ---- commands ------------------------------------------------------------

async function send(envelope: CommandEnvelope, describe: string): Promise<boolean> {
  pending = envelope;
  set({ save: { status: "saving" } });
  try {
    const result = await transport.send(envelope);
    pending = null;
    if (result.ok) {
      adoptLive(result.snapshot);
      set({ save: { status: "saved" } });
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

/** Delete tool: use the existing authoritative command for the target's kind. */
export async function deleteObject(id: string | null): Promise<void> {
  if (!id) return;
  if (state.snapshot?.plans.some((p) => p.id === id)) await withdrawPlan(id);
  else await remove(id);
}

export async function recolourSelected(colour: string): Promise<void> {
  const part = partOf(state.selectedId);
  if (!part) return;
  await submit({ type: "recolour", placedId: part.id, colour, expectedRev: part.rev }, `Recoloured ${nameOf(part.id)}.`);
}

/**
 * Commit exactly the preview on screen, as the current mode says: a real
 * part in Build mode, a plan in Plan mode (ADR 0011). The one entry point
 * for a click on the scene, Enter, and the dock's commit button, so none of
 * them can commit the other kind of object.
 */
export function commitHeld(): Promise<void> {
  return state.mode === "plan" ? proposeHeld() : placeHeld();
}

/** Enter: commit the held part, remove the delete tool's target, or build a selected plan. */
export function confirm(): void {
  if (state.held) void commitHeld();
  else if (state.deleting && state.targetId) void deleteObject(state.targetId);
  else if (state.selectedPlanId) void realizePlan(state.selectedPlanId);
}

// ---- plans (ADR 0009) -------------------------------------------------------
//
// A plan costs no stock and never blocks real construction: proposing one
// goes through the same command path as a placement, so it is validated and
// pushed to every member the same way, but `validatePlan` (not
// `validatePlacement`) is what the server and this preview check it against.

/** Propose the previewed part as a transparent plan; it stays held for the next one. */
async function proposeHeld(): Promise<void> {
  const p = preview();
  if (!p || !state.snapshot) {
    say("Point at the plot first, or move the preview with the arrow keys.", "error");
    return;
  }
  if (p.planRejection) {
    say(`Can't plan there: ${p.planRejection.message}`, "error");
    return;
  }
  const def = partDef(p.placement.partId)!;
  const ok = await submit({ type: "propose-plan", plan: p.placement }, `Proposed a ${def.name} as a plan.`);
  // as with a real part, the next one previews on top of this one
  if (ok) setHeld({ level: p.placement.y + def.h, snap: false });
}

export async function withdrawPlan(planId: string): Promise<void> {
  const ok = await submit({ type: "withdraw-plan", planId }, "Plan withdrawn.");
  if (ok && state.selectedPlanId === planId) set({ selectedPlanId: null });
  if (ok && state.targetId === planId) set({ targetId: null });
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
