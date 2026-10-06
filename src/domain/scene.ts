import type { Rotation } from "./grid.ts";
import type { Placement } from "./rules.ts";

// A versioned scene: the editable plot, the reference model and the kit.
// Fixed scenery (street, neighbours, hedge) is drawn by the client and is
// never part of the build, the kit or the rules.

export interface SceneTemplate {
  id: string;
  version: number;
  /** Editable plot in studs (w along x, d along z) and plates (h). */
  bounds: { w: number; d: number; h: number };
  /** The complete internal reference model, in the order it's built. */
  reference: readonly Placement[];
  /** K[p]: the whole kit by part type, at this version. Colour is not a dimension of it. */
  kit: Readonly<Record<string, number>>;
  /**
   * What each version added to the one before. Versions only ever add part
   * types: an existing type's quantity never changes, so a saved build is
   * upgraded by adding the new types' stock (ADR 0003).
   */
  additions: Readonly<Record<number, Readonly<Record<string, number>>>>;
}

// Reference: the dark-blue-roofed house and its tree from LEGO Classic 11035,
// instructions pages 100–116 (doc/evidence/0001-reference-model.md). The set's
// 6×8 base plate is the plot itself here, so the house stands directly on it.
// House body x 1–8, z 1–4, front garden z 5–6; the tree stands at x 11–14.

const P = (partId: string, x: number, y: number, z: number, rot: Rotation, colour: string): Placement => ({
  partId,
  x,
  y,
  z,
  rot,
  colour,
});

const RIGHT: Rotation = 1; // slope falls towards +x
const LEFT: Rotation = 3; // slope falls towards −x

const house: Placement[] = [
  // steps 2–8: two wall columns of 2×4 bricks, two navy courses then four mint
  ...[0, 1, 2, 3, 4, 5].flatMap((k) => {
    const colour = k < 2 ? "navy" : "pale-mint";
    return [P("brick-2x4", 1, 3 * k, 1, 1, colour), P("brick-2x4", 7, 3 * k, 1, 1, colour)];
  }),
  // step 3: garden plates in front of the columns
  P("plate-2x2", 1, 0, 5, 0, "leaf"),
  P("plate-2x2", 7, 0, 5, 0, "leaf"),
  // step 9: door in its frame, across the front of the house body
  P("door-1x4x6", 3, 0, 4, 0, "navy"),
  // step 10: two 2×8 plates across the top of the walls
  P("plate-2x8", 1, 18, 1, 0, "white"),
  P("plate-2x8", 1, 18, 3, 0, "white"),
  // step 11: four 2×2 bricks in the middle of the roof
  P("brick-2x2", 3, 19, 1, 0, "navy"),
  P("brick-2x2", 5, 19, 1, 0, "navy"),
  P("brick-2x2", 3, 19, 3, 0, "navy"),
  P("brick-2x2", 5, 19, 3, 0, "navy"),
  // step 12: one 2×4 brick on top of those, front to back
  P("brick-2x4", 4, 22, 1, 1, "navy"),
  // steps 13–15: three courses of slopes, stepping in towards the ridge
  ...[
    { y: 19, left: 1, right: 7 },
    { y: 22, left: 2, right: 6 },
    { y: 25, left: 3, right: 5 },
  ].flatMap(({ y, left, right }) =>
    [1, 3].flatMap((z) => [P("slope-2x2", left, y, z, LEFT, "navy"), P("slope-2x2", right, y, z, RIGHT, "navy")]),
  ),
  // step 16: the ridge
  P("ridge-2x2", 4, 28, 1, 0, "navy"),
  P("ridge-2x2", 4, 28, 3, 0, "navy"),
  // step 17: a flower on each garden plate
  P("flower", 2, 1, 6, 0, "butter"),
  P("flower", 7, 1, 6, 0, "butter"),
];

const tree: Placement[] = [
  // steps 18–19: trunk
  P("brick-2x2", 12, 0, 3, 0, "bark"),
  P("brick-2x2", 12, 3, 3, 0, "bark"),
  P("brick-2x2", 12, 6, 3, 0, "bark"),
  // steps 20–22: canopy
  P("brick-2x4", 11, 9, 3, 0, "forest"),
  P("brick-2x4", 11, 12, 3, 0, "leaf"),
  P("brick-2x4", 11, 15, 3, 0, "forest"),
  // steps 23–24: top and its fruit
  P("brick-2x2", 11, 18, 3, 0, "leaf"),
  P("round-1x1", 12, 21, 4, 0, "brick-red"),
];

const reference = [...house, ...tree];

// Bill of materials of the reference: T[p].
export function billOfMaterials(parts: readonly Placement[]): Record<string, number> {
  const bom: Record<string, number> = {};
  for (const p of parts) bom[p.partId] = (bom[p.partId] ?? 0) + 1;
  return bom;
}

// PROPOSED surplus S[p] and extra types, taken from the set's own "Rebuild"
// extras on page 116 (two mint and one navy 2×4, two 2×2 slopes, four mint
// 1×2 bricks, two 2×1 slopes, three 1×1 rounds). The curved slopes and the
// transparent panel from that page are left out of this catalogue.
const surplus: Record<string, number> = {
  "brick-2x4": 3,
  "brick-2x2": 2,
  "brick-1x2": 4,
  "plate-2x2": 1,
  "slope-2x2": 2,
  "slope-2x1": 2,
  "round-1x1": 3,
};

function kitFrom(bom: Record<string, number>, extra: Record<string, number>): Record<string, number> {
  const kit: Record<string, number> = { ...bom };
  for (const [id, n] of Object.entries(extra)) kit[id] = (kit[id] ?? 0) + n;
  return kit;
}

// Version 2 (6 Oct 2026, ADR 0003): a bounded set of decorative parts.
const v2: Record<string, number> = {
  "window-1x2x2": 4,
  "fence-1x4x1": 4,
  "planter-1x2": 3,
};

export const STREET_SCENE: SceneTemplate = {
  id: "street-01",
  version: 2,
  bounds: { w: 16, d: 8, h: 42 },
  reference,
  kit: kitFrom(kitFrom(billOfMaterials(reference), surplus), v2),
  additions: { 2: v2 },
};

export const SCENES: Readonly<Record<string, SceneTemplate>> = { [STREET_SCENE.id]: STREET_SCENE };
