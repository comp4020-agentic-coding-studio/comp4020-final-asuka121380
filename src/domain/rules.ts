import { partDef, type PartDefinition } from "./catalog.ts";
import { isColour } from "./colours.ts";
import { key, rotateCell, rotatedSize, type Cell, type Rotation } from "./grid.ts";
import type { Command } from "./commands.ts";
import type { FixedPiece, SceneTemplate } from "./scene.ts";

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

/**
 * Whether an open plan currently fits the combined structure (ADR 0012).
 * Derived on every read, never stored: `standing` plans are part of the
 * planned structure; `conflict` (a real part, or an earlier standing plan,
 * now occupies its space) and `unsupported` (nothing standing holds it up)
 * plans are kept and shown, but neither block nor support anything.
 */
export type PlanFit = "standing" | "conflict" | "unsupported";

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
  | "plan_depends"
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

/** The footprint cells with an anti-stud underneath: what can rest on studs below. */
export function socketCells(def: PartDefinition, p: Pick<Placement, "x" | "z" | "rot">): Cell[] {
  if (!def.sockets) return footprint(def, p);
  return def.sockets.map((c) => {
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

// ---- a scene's fixed structure (ADR 0016) -------------------------------------
//
// Some scenes have solid boxes that are already built: a tree's trunk,
// roots and branches, and the platforms on its branches. Every box blocks
// parts exactly as a placed part would; only a box with studs (a platform)
// carries a part resting on its top face. They are never in the build, the
// kit or the stock, so no command can select, recolour, turn or remove them.

interface Solid {
  /** Which fixed box fills each grid cell, keyed by `x,y,z`. */
  occ: Map<string, FixedPiece>;
  /** Stud cells by the height of the top face they are on, keyed by `x,z`. */
  studs: Map<number, Set<string>>;
}

const solids = new WeakMap<SceneTemplate, Solid>();

function solidOf(scene: SceneTemplate | undefined): Solid | null {
  if (!scene?.fixed) return null;
  let s = solids.get(scene);
  if (!s) {
    s = { occ: new Map(), studs: new Map() };
    for (const f of scene.fixed.pieces) {
      for (let x = f.x; x < f.x + f.w; x++) {
        for (let z = f.z; z < f.z + f.d; z++) {
          for (let y = f.y; y < f.y + f.h; y++) s.occ.set(key(x, y, z), f);
          if (f.studs) {
            const top = f.y + f.h;
            if (!s.studs.has(top)) s.studs.set(top, new Set());
            s.studs.get(top)!.add(`${x},${z}`);
          }
        }
      }
    }
    solids.set(scene, s);
  }
  return s;
}

const FIXED_NAMES: Record<FixedPiece["kind"], string> = { trunk: "the tree's trunk", root: "a root of the tree", branch: "a branch of the tree", deck: "a fixed platform" };

/** The fixed box in the way of a part at `p`, if any. */
function fixedCollision(scene: SceneTemplate | undefined, def: PartDefinition, p: Placement): FixedPiece | null {
  const solid = solidOf(scene);
  if (!solid) return null;
  for (const c of footprint(def, p)) {
    for (let y = p.y; y < p.y + def.h; y++) {
      const f = solid.occ.get(key(c.x, y, c.z));
      if (f) return f;
    }
  }
  return null;
}

/** Whether a part at `p` rests on the studs of a fixed platform. */
function onFixed(scene: SceneTemplate | undefined, def: PartDefinition, p: Placement): boolean {
  const studs = solidOf(scene)?.studs.get(p.y);
  return !!studs && socketCells(def, p).some((c) => studs.has(`${c.x},${c.z}`));
}

/** Held up at `p`: on the plot, on a fixed platform, or on the studs of one of `parts`. */
function isHeld(scene: SceneTemplate | undefined, def: PartDefinition, p: Placement, parts: readonly PlacedPart[]): boolean {
  return p.y === 0 || onFixed(scene, def, p) || supporters(def, p, parts).length > 0;
}

/** The parts whose studs carry a part sitting at `p`. Empty means unsupported, unless on the plot. */
function supporters(def: PartDefinition, p: Placement, parts: readonly PlacedPart[]): PlacedPart[] {
  const below = new Set(socketCells(def, p).map((c) => `${c.x},${c.z}`));
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

/** Bounds and collision for a part among `parts`; support is checked separately by `checkFit`. */
function checkBoundsAndCollision(scene: SceneTemplate, parts: readonly PlacedPart[], p: Placement, def: PartDefinition): Rejection | null {
  const size = rotatedSize(def, p.rot);
  const b = scene.bounds;
  if (p.x < 0 || p.z < 0 || p.y < 0 || p.x + size.w > b.w || p.z + size.d > b.d || p.y + def.h > b.h) {
    return { code: "out_of_bounds", message: "That would stick out of the build plot." };
  }

  const fixed = fixedCollision(scene, def, p);
  if (fixed) return { code: "collision", message: `That space is taken by ${FIXED_NAMES[fixed.kind]}.` };
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
  return null;
}

/** Bounds, collision and support for a part among `parts`; stock is the caller's business. */
function checkFit(scene: SceneTemplate, parts: readonly PlacedPart[], p: Placement, def: PartDefinition): Rejection | null {
  const base = checkBoundsAndCollision(scene, parts, p, def);
  if (base) return base;
  if (!isHeld(scene, def, p, parts)) {
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
/** Also refuses a turn that would leave a standing plan with no support (ADR 0012). */
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
  const stranded = resting.filter((p) => !isHeld(scene, partDef(p.partId)!, p, after));
  if (stranded.length > 0) {
    return { code: "would_unsupport", message: "Can't turn it: a part resting on it would lose its support." };
  }
  const planAfter = strandedPlans(state, target, after, null, scene);
  if (planAfter) return { code: "plan_depends", message: `Can't turn it: ${planAfter} rests on it. Move or withdraw that plan first.` };
  return null;
}

/**
 * C8 rule (author's decision): a part can't be removed if any part resting on
 * it would be left without support. Nothing is removed in a cascade.
 * `scene` brings in its fixed structure (ADR 0016): a part also resting on a
 * fixed platform keeps that support. Omitted, there is none.
 */
export function validateRemoval(state: BuildState, placedId: string, scene?: SceneTemplate): Rejection | null {
  const target = state.parts.find((p) => p.id === placedId);
  if (!target) return { code: "not_found", message: "That part is no longer in the build." };
  const def = partDef(target.partId);
  if (!def) return { code: "not_found", message: "That part is no longer in the build." };

  const rest = state.parts.filter((p) => p.id !== placedId);
  const resting = state.parts.filter((p) => supporters(partDef(p.partId)!, p, [target]).length > 0);
  const stranded = resting.filter((p) => !isHeld(scene, partDef(p.partId)!, p, rest));
  if (stranded.length > 0) {
    const names = [...new Set(stranded.map((p) => partDef(p.partId)?.name ?? "part"))].join(", ");
    return {
      code: "would_unsupport",
      message: `Can't remove this yet: it's the only support for ${stranded.length === 1 ? "a" : stranded.length} ${names} above it. Remove ${stranded.length === 1 ? "that" : "those"} first.`,
    };
  }
  const plan = strandedPlans(state, target, rest, null, scene);
  if (plan) return { code: "plan_depends", message: `Can't remove this yet: ${plan} rests on it. Withdraw that plan first, or give it other support.` };
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

// ---- plans (ADR 0009, geometry from ADR 0012) --------------------------------
//
// A plan is a transparent proposal: it costs no stock and never reserves
// space against REAL construction. Since ADR 0012 (author, 19 Oct 2026,
// superseding ADR 0009's "a plan never needs support and may overlap
// anything") a new plan must also be geometrically coherent with the
// combined structure — real parts plus the room's standing open plans —
// using exactly the rules real parts obey: bounds, the footprint collision
// box, and support from at least one stud directly beneath (or the plot).
// Only stock is exempt: planning demand may exceed the real kit.
//
// Real parts still only ever rest on REAL support. Plans existing before
// ADR 0012, or overtaken later by real construction, are never deleted or
// moved: `planFits` reports them as `conflict` or `unsupported`, and such
// plans neither block nor support anything until withdrawn.

/**
 * Open plans in commit order, the order in which standing is decided. The
 * server lists them in insertion order (rooms.ts, `ORDER BY rowid`) and every
 * transition appends, so array order is commit order everywhere. A timestamp
 * can't be used: two commits may share one millisecond.
 */
function openPlans(state: BuildState): Plan[] {
  return (state.plans ?? []).filter((p) => p.status === "open");
}

/**
 * Each open plan's fit against `parts` plus earlier standing plans, in
 * commit order. Deterministic, so the server, every client and a reload
 * agree. A plan that conflicts or floats is skipped as an obstacle and as a
 * support for the plans after it. `scene` brings in its fixed structure
 * (ADR 0016), which blocks and supports plans as it does parts.
 */
export function planFits(state: BuildState, parts: readonly PlacedPart[] = state.parts, scene?: SceneTemplate): Map<string, PlanFit> {
  const out = new Map<string, PlanFit>();
  const structure: PlacedPart[] = [...parts];
  for (const plan of openPlans(state)) {
    const def = partDef(plan.partId);
    if (!def) {
      out.set(plan.id, "conflict");
      continue;
    }
    const fit = fitAmong(plan, def, structure, scene);
    out.set(plan.id, fit);
    if (fit === "standing") structure.push(planAsPart(plan));
  }
  return out;
}

const planAsPart = (p: Plan): PlacedPart => ({ partId: p.partId, x: p.x, y: p.y, z: p.z, rot: p.rot, colour: p.colour, id: `plan:${p.id}` });

function fitAmong(p: Placement, def: PartDefinition, structure: readonly PlacedPart[], scene: SceneTemplate | undefined): PlanFit {
  if (fixedCollision(scene, def, p)) return "conflict";
  const occ = occupancy(structure);
  for (const c of footprint(def, p)) {
    for (let y = p.y; y < p.y + def.h; y++) if (occ.has(key(c.x, y, c.z))) return "conflict";
  }
  if (!isHeld(scene, def, p, structure)) return "unsupported";
  return "standing";
}

function collidesWithPlan(structure: readonly PlacedPart[], p: Placement, def: PartDefinition): boolean {
  const occ = occupancy(structure);
  for (const c of footprint(def, p)) {
    for (let y = p.y; y < p.y + def.h; y++) if (occ.get(key(c.x, y, c.z))?.id.startsWith("plan:")) return true;
  }
  return false;
}

/** Real parts plus every standing plan, as placed parts: what a new plan is checked against. */
export function plannedStructure(state: BuildState, scene?: SceneTemplate): PlacedPart[] {
  const fits = planFits(state, state.parts, scene);
  return [...state.parts, ...openPlans(state).filter((p) => fits.get(p.id) === "standing").map(planAsPart)];
}

export function validatePlan(scene: SceneTemplate, state: BuildState, p: Placement): Rejection | null {
  const def = partDef(p.partId);
  if (!def || !(p.partId in scene.kit)) return { code: "unknown_part", message: "That part isn't in this scene's kit." };
  if (!def.rotations.includes(p.rot)) return { code: "bad_rotation", message: "That rotation isn't allowed for this part." };
  if (!isColour(p.colour)) return { code: "bad_colour", message: "That colour isn't in the palette." };
  if (![p.x, p.y, p.z].every(isInt)) return { code: "bad_position", message: "Positions are whole studs and plates." };
  const structure = plannedStructure(state, scene);
  const base = checkBoundsAndCollision(scene, structure, p, def);
  if (base) {
    if (base.code !== "collision") return base;
    return { code: "collision", message: collidesWithPlan(structure, p, def) ? "Another plan already takes that space." : base.message };
  }
  if (!isHeld(scene, def, p, structure)) {
    return { code: "unsupported", message: "Nothing to attach to there: a plan needs studs underneath too, from real parts or other plans." };
  }
  return null;
}

/**
 * A standing plan resting directly on `target` (a real part being removed or
 * turned, or a plan being withdrawn) that would be left with no support once
 * `parts` replaces the real parts and `withoutPlan` is gone — named for a
 * message, or null. Alternative support keeps it standing, so nothing is
 * refused then. Plans that already conflict or float are never dependants,
 * and a plan merely overlapped by a turned part is not "resting on" it.
 */
function strandedPlans(state: BuildState, target: Placement, parts: readonly PlacedPart[], withoutPlan: string | null, scene: SceneTemplate | undefined): string | null {
  const targetDef = partDef(target.partId);
  if (!targetDef) return null;
  const before = planFits(state, state.parts, scene);
  const afterState: BuildState = { ...state, plans: (state.plans ?? []).filter((p) => p.id !== withoutPlan) };
  const after = planFits(afterState, parts, scene);
  const asPart: PlacedPart = { ...target, id: "target" };
  for (const plan of openPlans(afterState)) {
    const def = partDef(plan.partId);
    if (!def || before.get(plan.id) !== "standing" || after.get(plan.id) !== "unsupported") continue;
    if (supporters(def, plan, [asPart]).length > 0) return `a planned ${def.name}`;
  }
  return null;
}

/**
 * Planning demand (ADR 0011): real stock left minus the room's open plans of
 * each part type. Derived, never stored, and never consulted by any
 * validation — it may go negative, and a real placement or realization is
 * still decided by `inventory` alone.
 */
export function plannedRemaining(state: BuildState): Record<string, number> {
  const out: Record<string, number> = { ...state.inventory };
  for (const p of state.plans ?? []) {
    if (p.status === "open") out[p.partId] = (out[p.partId] ?? 0) - 1;
  }
  return out;
}

/** Refused while a standing plan rests on this one alone (ADR 0012); never cascades. */
export function validateWithdrawPlan(state: BuildState, planId: string, scene?: SceneTemplate): Rejection | null {
  const plan = (state.plans ?? []).find((p) => p.id === planId);
  if (!plan) return { code: "not_found", message: "That plan is no longer there." };
  if (plan.status !== "open") return { code: "plan_not_open", message: "That plan has already been realized or withdrawn." };
  const dependant = strandedPlans(state, plan, state.parts, planId, scene);
  if (dependant) return { code: "plan_depends", message: `Can't withdraw this plan yet: ${dependant} rests on it. Withdraw that one first, or give it other support.` };
  return null;
}

/**
 * Realizing is placing for real: real stock, real collision and REAL support
 * only (a planned wall never holds up a real roof). The plan itself is not
 * a real part, so it can't collide with itself. Plans resting on it keep
 * their support, since the real part has the same geometry.
 */
export function validateRealizePlan(scene: SceneTemplate, state: BuildState, planId: string): { rejection: Rejection | null; plan?: Plan } {
  const plan = (state.plans ?? []).find((p) => p.id === planId);
  if (!plan) return { rejection: { code: "not_found", message: "That plan is no longer there." } };
  if (plan.status !== "open") return { rejection: { code: "plan_not_open", message: "That plan has already been realized or withdrawn." }, plan };
  const rejection = validatePlacement(scene, state, plan);
  if (rejection?.code === "unsupported") {
    return { rejection: { code: "unsupported", message: "Can't build this plan yet: nothing real is under it. Build what it rests on first." }, plan };
  }
  return { rejection, plan };
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
 * clear of `parts`, and on the plot or on studs (ADR 0005). Stock is left
 * out because it is the same at every height. Pass real parts for Build mode
 * and `plannedStructure(state)` for Plan mode (ADR 0012), so the preview's
 * heights are exactly what the server's check accepts.
 */
export function fitHeights(scene: SceneTemplate, def: PartDefinition, p: Pick<Placement, "x" | "z" | "rot">, parts: readonly PlacedPart[]): number[] {
  // fixed platforms count as supports and the tree's boxes as obstacles, via checkFit
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
      return validateRemoval(state, command.placedId, scene) ?? checkPartRevision(state, command.placedId, command.expectedRev);
    case "recolour":
      return validateRecolour(state, command.placedId, command.colour) ?? checkPartRevision(state, command.placedId, command.expectedRev);
    case "rotate":
      return validateRotation(scene, state, command.placedId, command.rot) ?? checkPartRevision(state, command.placedId, command.expectedRev);
    case "propose-plan":
      return validatePlan(scene, state, command.plan);
    case "withdraw-plan":
      return validateWithdrawPlan(state, command.planId, scene);
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
