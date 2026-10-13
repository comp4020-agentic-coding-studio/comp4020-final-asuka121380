import { partDef, type PartDefinition } from "./catalog.ts";
import { isColour } from "./colours.ts";
import { key, rotateCell, rotatedSize, type Cell, type Rotation } from "./grid.ts";
import type { Command } from "./commands.ts";
import type { SceneTemplate } from "./scene.ts";

// The construction rules, shared by the server (which decides) and the
// client (which only previews). Plain data in, plain data out: no database,
// React or three.js objects.

export interface Placement {
  partId: string;
  x: number;
  y: number;
  z: number;
  rot: Rotation;
  colour: string;
}

export interface PlacedPart extends Placement {
  id: string;
  /** Who placed it; never overwritten by a later edit (ADR 0009). */
  placedBy?: string;
  /** Who most recently recoloured or rotated it, if anyone (ADR 0009). */
  editedBy?: string;
  /** The plan's original proposer, if this part was realized from one (ADR 0009). */
  proposedBy?: string;
  /** Bumped on every edit to this part; the basis for ADR 0008's per-part conflict check. */
  rev?: number;
}

/** A transparent proposal (ADR 0009): costs no stock, blocks nothing real. */
export interface Plan extends Placement {
  id: string;
  proposedBy: string;
  createdAt: string;
  status: "open" | "realized" | "withdrawn";
}

export interface BuildState {
  parts: readonly PlacedPart[];
  /** Pieces still held, by part type. Colour is not a dimension of it. */
  inventory: Readonly<Record<string, number>>;
  /** Open and resolved plans; most callers only care about `status === "open"`. */
  plans?: readonly Plan[];
}

export type RejectionCode =
  | "unknown_part"
  | "bad_rotation"
  | "bad_colour"
  | "bad_position"
  | "out_of_bounds"
  | "collision"
  | "unsupported"
  | "out_of_stock"
  | "not_found"
  | "would_unsupport"
  | "no_change"
  | "plan_not_open"
  | "room_full"
  | "part_conflict";

export interface Rejection {
  code: RejectionCode;
  message: string;
}

export function footprint(def: PartDefinition, p: Pick<Placement, "x" | "z" | "rot">): Cell[] {
  const cells: Cell[] = [];
  for (let lx = 0; lx < def.w; lx++) {
    for (let lz = 0; lz < def.d; lz++) {
      const c = rotateCell({ x: lx, z: lz }, def, p.rot);
      cells.push({ x: p.x + c.x, z: p.z + c.z });
    }
  }
  return cells;
}

export function studCells(def: PartDefinition, p: Pick<Placement, "x" | "z" | "rot">): Cell[] {
  if (def.studs === "all") return footprint(def, p);
  return def.studs.map((c) => {
    const r = rotateCell(c, def, p.rot);
    return { x: p.x + r.x, z: p.z + r.z };
  });
}

/** Which part fills each grid cell, keyed by `x,y,z`. */
export function occupancy(parts: readonly PlacedPart[]): Map<string, PlacedPart> {
  const occ = new Map<string, PlacedPart>();
  for (const p of parts) {
    const def = partDef(p.partId);
    if (!def) continue;
    for (const c of footprint(def, p)) {
      for (let y = p.y; y < p.y + def.h; y++) occ.set(key(c.x, y, c.z), p);
    }
  }
  return occ;
}

/** The parts whose studs carry a part sitting at `p`. Empty means unsupported, unless on the plot. */
function supporters(def: PartDefinition, p: Placement, parts: readonly PlacedPart[]): PlacedPart[] {
  const below = new Set(footprint(def, p).map((c) => `${c.x},${c.z}`));
  return parts.filter((q) => {
    const qd = partDef(q.partId);
    if (!qd || q.y + qd.h !== p.y) return false;
    return studCells(qd, q).some((c) => below.has(`${c.x},${c.z}`));
  });
}

const isInt = (n: unknown): n is number => Number.isInteger(n);

export function validatePlacement(scene: SceneTemplate, state: BuildState, p: Placement): Rejection | null {
  const def = partDef(p.partId);
  if (!def || !(p.partId in scene.kit)) return { code: "unknown_part", message: "That part isn't in this scene's kit." };
  if (!def.rotations.includes(p.rot)) return { code: "bad_rotation", message: "That rotation isn't allowed for this part." };
  if (!isColour(p.colour)) return { code: "bad_colour", message: "That colour isn't in the palette." };
  if (![p.x, p.y, p.z].every(isInt)) return { code: "bad_position", message: "Positions are whole studs and plates." };
  if ((state.inventory[p.partId] ?? 0) <= 0) {
    return { code: "out_of_stock", message: `No ${def.name} (${def.code}) left in your kit.` };
  }
  return checkFit(scene, state.parts, p, def);
}

/** Bounds, collision and support for a part among `parts`; stock is the caller's business. */
function checkFit(scene: SceneTemplate, parts: readonly PlacedPart[], p: Placement, def: PartDefinition): Rejection | null {
  const size = rotatedSize(def, p.rot);
  const b = scene.bounds;
  if (p.x < 0 || p.z < 0 || p.y < 0 || p.x + size.w > b.w || p.z + size.d > b.d || p.y + def.h > b.h) {
    return { code: "out_of_bounds", message: "That would stick out of the build plot." };
  }

  const occ = occupancy(parts);
  for (const c of footprint(def, p)) {
    for (let y = p.y; y < p.y + def.h; y++) {
      const other = occ.get(key(c.x, y, c.z));
      if (other) {
        const od = partDef(other.partId);
        return { code: "collision", message: `That space is taken by a ${od?.name ?? "part"}.` };
      }
    }
  }

  if (p.y > 0 && supporters(def, p, parts).length === 0) {
    return { code: "unsupported", message: "Nothing to attach to there: it needs studs directly underneath." };
  }
  return null;
}

/**
 * A placed part turned to `rot` about the centre of its footprint (rounding
 * down when the footprint's width and depth differ by an odd number).
 */
export function rotatedPlacement(part: PlacedPart, rot: Rotation): PlacedPart {
  const def = partDef(part.partId)!;
  const from = rotatedSize(def, part.rot);
  const to = rotatedSize(def, rot);
  return {
    ...part,
    rot,
    x: part.x + Math.floor((from.w - to.w) / 2),
    z: part.z + Math.floor((from.d - to.d) / 2),
  };
}

/** The next allowed rotation after the part's current one. */
export function nextRotation(partId: string, rot: Rotation): Rotation {
  const def = partDef(partId)!;
  const i = def.rotations.indexOf(rot);
  return def.rotations[(i + 1) % def.rotations.length];
}

/**
 * Turning a placed part re-checks the whole build: the turned part must fit
 * and be supported, and every part resting on it must still be supported.
 * Identity and stock never change.
 */
export function validateRotation(scene: SceneTemplate, state: BuildState, placedId: string, rot: Rotation): Rejection | null {
  const target = state.parts.find((p) => p.id === placedId);
  if (!target) return { code: "not_found", message: "That part is no longer in the build." };
  const def = partDef(target.partId)!;
  if (!def.rotations.includes(rot)) return { code: "bad_rotation", message: "That rotation isn't allowed for this part." };
  if (rot === target.rot) return { code: "no_change", message: "It's already facing that way." };

  const turned = rotatedPlacement(target, rot);
  const rest = state.parts.filter((p) => p.id !== placedId);
  const fit = checkFit(scene, rest, turned, def);
  if (fit) return { ...fit, message: `Can't turn it there: ${fit.message.charAt(0).toLowerCase()}${fit.message.slice(1)}` };

  const after = [...rest, turned];
  const resting = rest.filter((p) => supporters(partDef(p.partId)!, p, [target]).length > 0);
  const stranded = resting.filter((p) => p.y > 0 && supporters(partDef(p.partId)!, p, after).length === 0);
  if (stranded.length > 0) {
    return { code: "would_unsupport", message: "Can't turn it: a part resting on it would lose its support." };
  }
  return null;
}

/**
 * C8 rule (author's decision): a part can't be removed if any part resting on
 * it would be left without support. Nothing is removed in a cascade.
 */
export function validateRemoval(state: BuildState, placedId: string): Rejection | null {
  const target = state.parts.find((p) => p.id === placedId);
  if (!target) return { code: "not_found", message: "That part is no longer in the build." };
  const def = partDef(target.partId);
  if (!def) return { code: "not_found", message: "That part is no longer in the build." };

  const rest = state.parts.filter((p) => p.id !== placedId);
  const resting = state.parts.filter((p) => supporters(partDef(p.partId)!, p, [target]).length > 0);
  const stranded = resting.filter((p) => p.y > 0 && supporters(partDef(p.partId)!, p, rest).length === 0);
  if (stranded.length > 0) {
    const names = [...new Set(stranded.map((p) => partDef(p.partId)?.name ?? "part"))].join(", ");
    return {
      code: "would_unsupport",
      message: `Can't remove this yet: it's the only support for ${stranded.length === 1 ? "a" : stranded.length} ${names} above it. Remove ${stranded.length === 1 ? "that" : "those"} first.`,
    };
  }
  return null;
}

export function validateRecolour(state: BuildState, placedId: string, colour: string): Rejection | null {
  if (!state.parts.some((p) => p.id === placedId)) return { code: "not_found", message: "That part is no longer in the build." };
  if (!isColour(colour)) return { code: "bad_colour", message: "That colour isn't in the palette." };
  return null;
}

/**
 * ADR 0008: an edit command may carry the part's own revision as the client
 * last saw it. If someone else has since changed that same part, this is a
 * specific, part-level conflict — never the whole room's revision, so an
 * unrelated change elsewhere never trips it. `undefined` skips the check, for
 * callers (older clients, the local single-actor preview) that never
 * encounter another actor.
 */
export function checkPartRevision(state: BuildState, placedId: string, expectedRev: number | undefined): Rejection | null {
  if (expectedRev === undefined) return null;
  const part = state.parts.find((p) => p.id === placedId);
  if (part && (part.rev ?? 0) !== expectedRev) {
    return { code: "part_conflict", message: "Someone already changed that part; its latest version is shown now." };
  }
  return null;
}

// ---- plans (ADR 0009) -------------------------------------------------------
//
// A plan is a transparent proposal: it costs no stock and must never block
// real construction, so it is checked against bounds and a looser "is this
// plausible geometry" support rule, never against real parts' occupancy.

/**
 * Looser than `supporters()`: true if there is *any* footprint cell with
 * something at y-1 immediately below it, real or planned, or if y is 0 (the
 * plot itself always supports). A plan may describe a future state whose own
 * support doesn't exist yet either, so this only rejects plans floating over
 * nothing at all, not plans resting on other plans or on parts not yet built.
 */
function plausibleSupport(def: PartDefinition, p: Pick<Placement, "x" | "y" | "z" | "rot">, parts: readonly PlacedPart[], plans: readonly Plan[]): boolean {
  if (p.y === 0) return true;
  const below = new Set(footprint(def, p).map((c) => `${c.x},${c.z}`));
  const under = (q: Pick<Placement, "x" | "y" | "z" | "rot" | "partId">): boolean => {
    const qd = partDef(q.partId);
    if (!qd || q.y + qd.h !== p.y) return false;
    return studCells(qd, q).some((c) => below.has(`${c.x},${c.z}`));
  };
  return parts.some(under) || plans.some((pl) => pl.status === "open" && under(pl));
}

export function validatePlan(scene: SceneTemplate, state: BuildState, p: Placement): Rejection | null {
  const def = partDef(p.partId);
  if (!def || !(p.partId in scene.kit)) return { code: "unknown_part", message: "That part isn't in this scene's kit." };
  if (!def.rotations.includes(p.rot)) return { code: "bad_rotation", message: "That rotation isn't allowed for this part." };
  if (!isColour(p.colour)) return { code: "bad_colour", message: "That colour isn't in the palette." };
  if (![p.x, p.y, p.z].every(isInt)) return { code: "bad_position", message: "Positions are whole studs and plates." };
  const size = rotatedSize(def, p.rot);
  const b = scene.bounds;
  if (p.x < 0 || p.z < 0 || p.y < 0 || p.x + size.w > b.w || p.z + size.d > b.d || p.y + def.h > b.h) {
    return { code: "out_of_bounds", message: "That would stick out of the build plot." };
  }
  if (!plausibleSupport(def, p, state.parts, state.plans ?? [])) {
    return { code: "unsupported", message: "That has nothing under it, real or planned, to rest on." };
  }
  return null;
}

export function validateWithdrawPlan(state: BuildState, planId: string): Rejection | null {
  const plan = (state.plans ?? []).find((p) => p.id === planId);
  if (!plan) return { code: "not_found", message: "That plan is no longer there." };
  if (plan.status !== "open") return { code: "plan_not_open", message: "That plan has already been realized or withdrawn." };
  return null;
}

/** Realizing is placing for real: the plan's own geometry is re-checked against current live state. */
export function validateRealizePlan(scene: SceneTemplate, state: BuildState, planId: string): { rejection: Rejection | null; plan?: Plan } {
  const plan = (state.plans ?? []).find((p) => p.id === planId);
  if (!plan) return { rejection: { code: "not_found", message: "That plan is no longer there." } };
  if (plan.status !== "open") return { rejection: { code: "plan_not_open", message: "That plan has already been realized or withdrawn." }, plan };
  return { rejection: validatePlacement(scene, state, plan), plan };
}

export function applyProposePlan(state: BuildState, p: Placement, id: string, proposedBy: string, createdAt: string): BuildState {
  const plan: Plan = { ...p, id, proposedBy, createdAt, status: "open" };
  return { ...state, plans: [...(state.plans ?? []), plan] };
}

export function applyWithdrawPlan(state: BuildState, planId: string): BuildState {
  return { ...state, plans: (state.plans ?? []).map((p) => (p.id === planId ? { ...p, status: "withdrawn" } : p)) };
}

/** Consumes stock, creates the real part (carrying both proposer and realizer), resolves the plan. */
export function applyRealizePlan(state: BuildState, planId: string, newId: string, realizedBy: string): BuildState {
  const plan = (state.plans ?? []).find((p) => p.id === planId)!;
  const placed: PlacedPart = { partId: plan.partId, x: plan.x, y: plan.y, z: plan.z, rot: plan.rot, colour: plan.colour, id: newId, placedBy: realizedBy, proposedBy: plan.proposedBy, rev: 0 };
  return {
    parts: [...state.parts, placed],
    inventory: { ...state.inventory, [plan.partId]: (state.inventory[plan.partId] ?? 0) - 1 },
    plans: (state.plans ?? []).map((p) => (p.id === plan.id ? { ...p, status: "realized" } : p)),
  };
}

// Pure transitions. The server applies the same changes inside one database
// transaction; these exist so the rules can be tested end to end without one.

export function applyPlacement(state: BuildState, p: Placement, id: string): BuildState {
  return {
    parts: [...state.parts, { ...p, id }],
    inventory: { ...state.inventory, [p.partId]: (state.inventory[p.partId] ?? 0) - 1 },
  };
}

export function applyRemoval(state: BuildState, placedId: string): BuildState {
  const target = state.parts.find((p) => p.id === placedId)!;
  return {
    parts: state.parts.filter((p) => p.id !== placedId),
    inventory: { ...state.inventory, [target.partId]: (state.inventory[target.partId] ?? 0) + 1 },
  };
}

export function applyRotation(state: BuildState, placedId: string, rot: Rotation): BuildState {
  return { ...state, parts: state.parts.map((p) => (p.id === placedId ? rotatedPlacement(p, rot) : p)) };
}

export function applyRecolour(state: BuildState, placedId: string, colour: string): BuildState {
  return { ...state, parts: state.parts.map((p) => (p.id === placedId ? { ...p, colour } : p)) };
}

/**
 * Every height, lowest first, at which a part fits over (x, z): in bounds,
 * clear of other parts, and on the plot or on studs (ADR 0005). Stock is
 * left out because it is the same at every height. The client offers these
 * as the preview's heights; the server never uses this, because it only
 * checks the placement it's sent.
 */
export function fitHeights(scene: SceneTemplate, def: PartDefinition, p: Pick<Placement, "x" | "z" | "rot">, parts: readonly PlacedPart[]): number[] {
  const out: number[] = [];
  for (let y = 0; y + def.h <= scene.bounds.h; y++) {
    if (!checkFit(scene, parts, { ...p, y, partId: def.id, colour: def.defaultColour }, def)) out.push(y);
  }
  return out;
}

// One dispatcher for every command, so the server and the local preview
// can't disagree about which rule applies.

export function validateCommand(scene: SceneTemplate, state: BuildState, command: Command): Rejection | null {
  switch (command.type) {
    case "place":
      return validatePlacement(scene, state, command.placement);
    case "remove":
      return validateRemoval(state, command.placedId) ?? checkPartRevision(state, command.placedId, command.expectedRev);
    case "recolour":
      return validateRecolour(state, command.placedId, command.colour) ?? checkPartRevision(state, command.placedId, command.expectedRev);
    case "rotate":
      return validateRotation(scene, state, command.placedId, command.rot) ?? checkPartRevision(state, command.placedId, command.expectedRev);
    case "propose-plan":
      return validatePlan(scene, state, command.plan);
    case "withdraw-plan":
      return validateWithdrawPlan(state, command.planId);
    case "realize-plan":
      return validateRealizePlan(scene, state, command.planId).rejection;
  }
}

/**
 * `actorId` attributes a plan proposal or a realized part; it may be omitted
 * for the other command types (and for the local, single-actor preview,
 * where there is never anyone else to attribute to).
 */
export function applyCommand(state: BuildState, command: Command, newId: string, actorId = "local"): BuildState {
  switch (command.type) {
    case "place":
      return applyPlacement(state, command.placement, newId);
    case "remove":
      return applyRemoval(state, command.placedId);
    case "recolour":
      return applyRecolour(state, command.placedId, command.colour);
    case "rotate":
      return applyRotation(state, command.placedId, command.rot);
    case "propose-plan":
      return applyProposePlan(state, command.plan, newId, actorId, new Date().toISOString());
    case "withdraw-plan":
      return applyWithdrawPlan(state, command.planId);
    case "realize-plan":
      return applyRealizePlan(state, command.planId, newId, actorId);
  }
}
