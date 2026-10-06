import { partDef, type PartDefinition } from "./catalog.ts";
import { isColour } from "./colours.ts";
import { key, rotateCell, rotatedSize, type Cell, type Rotation } from "./grid.ts";
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
}

export interface BuildState {
  parts: readonly PlacedPart[];
  /** Pieces still held, by part type. Colour is not a dimension of it. */
  inventory: Readonly<Record<string, number>>;
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
  | "would_unsupport";

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

  const size = rotatedSize(def, p.rot);
  const b = scene.bounds;
  if (p.x < 0 || p.z < 0 || p.y < 0 || p.x + size.w > b.w || p.z + size.d > b.d || p.y + def.h > b.h) {
    return { code: "out_of_bounds", message: "That would stick out of the build plot." };
  }

  if ((state.inventory[p.partId] ?? 0) <= 0) {
    return { code: "out_of_stock", message: `No ${def.name} (${def.code}) left in your kit.` };
  }

  const occ = occupancy(state.parts);
  for (const c of footprint(def, p)) {
    for (let y = p.y; y < p.y + def.h; y++) {
      const other = occ.get(key(c.x, y, c.z));
      if (other) {
        const od = partDef(other.partId);
        return { code: "collision", message: `That space is taken by a ${od?.name ?? "part"}.` };
      }
    }
  }

  if (p.y > 0 && supporters(def, p, state.parts).length === 0) {
    return { code: "unsupported", message: "Nothing to attach to there: it needs studs directly underneath." };
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

export function applyRecolour(state: BuildState, placedId: string, colour: string): BuildState {
  return { ...state, parts: state.parts.map((p) => (p.id === placedId ? { ...p, colour } : p)) };
}

/**
 * Where a part would come to rest over (x, z): on top of the tallest thing
 * under its footprint. The client snaps previews with this; the server never
 * uses it, because the server only checks the placement it's sent.
 */
export function restingHeight(def: PartDefinition, p: Pick<Placement, "x" | "z" | "rot">, parts: readonly PlacedPart[]): number {
  const cells = new Set(footprint(def, p).map((c) => `${c.x},${c.z}`));
  let top = 0;
  for (const q of parts) {
    const qd = partDef(q.partId);
    if (!qd) continue;
    if (footprint(qd, q).some((c) => cells.has(`${c.x},${c.z}`))) top = Math.max(top, q.y + qd.h);
  }
  return top;
}
