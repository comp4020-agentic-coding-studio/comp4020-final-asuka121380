import type { Rotation } from "./grid.ts";
import type { Placement } from "./rules.ts";
import type { FixedPiece, SceneTemplate } from "./scene.ts";

// Woodland Commons, the tree-house scene (ADR 0016). Its kit comes from the
// parts counted in the cabin, roof and stair bags of the official building
// instructions for LEGO Ideas Tree House 21318, mapped to this game's
// catalogue. The counting, the mapping and every substitution are recorded in
// doc/research/0003-tree-house-reference.md. The tree itself (base, trunk,
// branches, foliage) is not in the kit: it is the scene's fixed structure
// below, which the rules treat as already built.

/** Required quantity per game part, from the research record's mapping table. */
export const TREEHOUSE_REQUIRED: Readonly<Record<string, number>> = {
  "plate-1x2": 265,
  "plate-1x4": 160,
  "plate-2x2": 124,
  "brick-1x1": 107,
  "plate-1x1": 105,
  "plate-2x4": 70,
  "round-1x1": 39,
  "slope-2x2": 36,
  "brick-1x4": 34,
  "brick-1x2": 33,
  "round-brick-1x1": 27,
  "window-1x2x2": 20,
  "slope-2x1": 19,
  "plate-6x6": 12,
  "fence-1x4x1": 10,
  "brick-2x4": 9,
  "plate-2x8": 5,
  "arch-1x4": 4,
  "stairs-2x4": 4,
  "door-1x4x6": 3,
  flower: 3,
  "brick-2x2": 1,
};

/** allocated quantity = ceil(required quantity × 1.30), in whole pieces (the castle's rule, ADR 0015). */
const allocate = (required: number): number => Math.ceil(Math.round(required * 130) / 100);

const kit = Object.fromEntries(Object.entries(TREEHOUSE_REQUIRED).map(([id, n]) => [id, allocate(n)]));

// ---- the fixed tree -----------------------------------------------------------
//
// Plot 32 × 28 studs, 72 plates high. The trunk stands behind the working
// area (z 1–10 of 28), so the front of the plot stays open at every height.
// Three branch platforms are the starting supports, one per height zone
// above the ground: left at 12 plates, right at 24, and the crown deck on the
// trunk's top at 36. Only those three decks carry studs. The trunk, roots and
// branches are solid and studless: nothing rests on them and nothing passes
// through them. These coordinates are frozen for `treehouse-01`.

const F = (id: string, kind: FixedPiece["kind"], x: number, y: number, z: number, w: number, d: number, h: number): FixedPiece => ({
  id,
  kind,
  x,
  y,
  z,
  w,
  d,
  h,
  studs: kind === "deck",
});

export const TREE_PIECES: readonly FixedPiece[] = [
  // the trunk: a broad lower trunk up to the crown deck, and the stem that
  // carries on behind the crown cabin into the canopy
  F("trunk-lower", "trunk", 13, 0, 1, 6, 10, 35),
  F("trunk-stem", "trunk", 13, 35, 1, 6, 4, 37),
  // roots spreading on the ground
  F("root-left", "root", 11, 0, 5, 2, 4, 3),
  F("root-right", "root", 19, 0, 4, 2, 4, 3),
  F("root-front", "root", 14, 0, 11, 3, 1, 2),
  // the branches, each running out from the trunk under its platform's width
  F("branch-left", "branch", 2, 8, 7, 11, 2, 3),
  F("branch-right", "branch", 19, 20, 7, 11, 2, 3),
  // the platforms: the only support surfaces
  F("deck-left", "deck", 1, 11, 4, 8, 8, 1),
  F("deck-right", "deck", 23, 23, 5, 8, 8, 1),
  F("deck-crown", "deck", 11, 35, 5, 10, 8, 1),
];

// ---- the reference assembly ---------------------------------------------------
//
// An illustrative settlement built only from the kit, and checked against
// the rules by the tests, in this order (ADR 0016). It is inspiration and a
// test fixture, never pre-placed: new rooms start empty. It uses fewer parts
// than the kit holds; the kit is sized from the official cabins, not from
// this picture (research record, "Reference and kit").
//
// Three buildings with different jobs and shapes, round one shared deck:
// - the Lodge on the low platform (12): wide and low, its long roof facing
//   the front, a door to one side and a deep porch;
// - the Commons (12): a deck on timber stilts in front of the trunk, flush
//   with the lodge's porch, with a long table, railings and a fire ring
//   below; stairs up from the ground and on up to the right platform;
// - the Bunkhouse on the middle platform (24): taller, its gable end to the
//   front, lighter timber, windows round three sides;
// - the Lookout on the crown deck (36): an open pavilion on four posts
//   under a red gable, railed on three sides, reached by a switchback from
//   the bunkhouse porch.

const P = (partId: string, x: number, y: number, z: number, rot: Rotation, colour: string): Placement => ({ partId, x, y, z, rot, colour });

const LOG = "nougat";
const LIGHT = "sand";
const DARK = "bark";
const BAND = "charcoal";
const TRIM = "sand";

type Axis = "x" | "z";

/** One course of bricks along a run: long pieces first, 1×1s to finish. */
function bricks(axis: Axis, from: number, length: number, at: number, y: number, colour: string, offset = false): Placement[] {
  const out: Placement[] = [];
  let i = 0;
  const put = (id: string, n: number, c = colour) => {
    const v = from + i;
    out.push(axis === "x" ? P(id, v, y, at, 0, c) : P(id, at, y, v, n === 1 ? 0 : 1, c));
    i += n;
  };
  if (offset && length - i >= 3) put("brick-1x1", 1);
  while (length - i >= 4) put("brick-1x4", 4);
  while (length - i >= 2) put("brick-1x2", 2);
  while (length - i >= 1) put(i % 2 ? "round-brick-1x1" : "brick-1x1", 1, i % 2 ? DARK : colour);
  return out;
}

/** One layer of plates along a run. */
function plates(axis: Axis, from: number, length: number, at: number, y: number, colour: string, offset = false): Placement[] {
  const out: Placement[] = [];
  let i = 0;
  const put = (id: string, n: number) => {
    const v = from + i;
    out.push(axis === "x" ? P(id, v, y, at, 0, colour) : P(id, at, y, v, n === 1 ? 0 : 1, colour));
    i += n;
  };
  if (offset && length - i >= 3) put("plate-1x1", 1);
  while (length - i >= 4) put("plate-1x4", 4);
  while (length - i >= 2) put("plate-1x2", 2);
  while (length - i >= 1) put("plate-1x1", 1);
  return out;
}

/** A gap in a wall run: `at` cells in, `len` long, from course `k0` to before `k1`. */
interface Gap {
  at: number;
  len: number;
  k0: number;
  k1: number;
}
const DOOR = (at: number): Gap => ({ at, len: 4, k0: 0, k1: 6 });
const WINDOW = (at: number): Gap => ({ at, len: 2, k0: 2, k1: 4 });

/** The pieces of a run of `length` cells left between its gaps at course k. */
function segments(length: number, gaps: readonly Gap[], k: number): [number, number][] {
  const open = gaps.filter((g) => k >= g.k0 && k < g.k1).sort((a, b) => a.at - b.at);
  const out: [number, number][] = [];
  let i = 0;
  for (const g of open) {
    if (g.at > i) out.push([i, g.at - i]);
    i = g.at + g.len;
  }
  if (i < length) out.push([i, length - i]);
  return out;
}

interface Walls {
  left: number;
  back: number;
  w: number;
  d: number;
  base: number;
  log: string;
  band: string;
  front?: readonly Gap[];
  rear?: readonly Gap[];
  /** Gaps in the side walls, counted from the back corner's next cell. */
  sides?: readonly Gap[];
}

/**
 * Timber walls 18 plates high round a w × d rectangle: six courses that
 * alternate a course of log bricks with three layers of plates (the middle
 * one a darker band), as the official walls alternate logs and stacked
 * plates. Doors and windows stand in real gaps, placed in course order so
 * each rests on what is below it. A band of plates caps the wall top.
 */
function walls(c: Walls): Placement[] {
  const out: Placement[] = [];
  const front = c.back + c.d - 1;
  const right = c.left + c.w - 1;
  const runs: { axis: Axis; from: number; length: number; at: number; gaps: readonly Gap[]; rot: Rotation }[] = [
    { axis: "x", from: c.left, length: c.w, at: c.back, gaps: c.rear ?? [], rot: 0 },
    { axis: "x", from: c.left, length: c.w, at: front, gaps: c.front ?? [], rot: 0 },
    { axis: "z", from: c.back + 1, length: c.d - 2, at: c.left, gaps: c.sides ?? [], rot: 1 },
    { axis: "z", from: c.back + 1, length: c.d - 2, at: right, gaps: c.sides ?? [], rot: 1 },
  ];
  // doors stand on the platform before any course
  for (const r of runs) for (const g of r.gaps) if (g.k0 === 0) out.push(r.axis === "x" ? P("door-1x4x6", r.from + g.at, c.base, r.at, 0, DARK) : P("door-1x4x6", r.at, c.base, r.from + g.at, 1, DARK));
  for (let k = 0; k < 6; k++) {
    const y0 = c.base + 3 * k;
    for (const r of runs) {
      for (const [i, n] of segments(r.length, r.gaps, k)) {
        if (k % 2 === 0) out.push(...bricks(r.axis, r.from + i, n, r.at, y0, c.log, k % 4 === 2 && n > 3));
        else for (let j = 0; j < 3; j++) out.push(...plates(r.axis, r.from + i, n, r.at, y0 + j, j === 1 ? c.band : c.log, (j + k) % 2 === 1 && n > 3));
      }
      // windows stand in their gaps once the course below them is laid
      for (const g of r.gaps) if (g.k0 === k && g.k0 > 0) out.push(r.axis === "x" ? P("window-1x2x2", r.from + g.at, y0, r.at, 0, DARK) : P("window-1x2x2", r.at, y0, r.from + g.at, 1, DARK));
    }
  }
  const top = c.base + 18;
  out.push(...plates("x", c.left, c.w, c.back, top, BAND), ...plates("x", c.left, c.w, front, top, BAND));
  for (const x of [c.left, right]) out.push(...plates("z", c.back + 1, c.d - 2, x, top, BAND));
  return out;
}

/**
 * A 45° gable 8 studs wide whose ridge runs front to back, on a deck of
 * plates at `deck`: two courses of 2×2 slopes, with 2×4 bricks under the
 * upper course. `d` is 6.
 */
function gableAlongZ(left: number, back: number, deck: number, colour: string): Placement[] {
  const out: Placement[] = [];
  const right = left + 7;
  for (const x of [left, left + 2, left + 4, left + 6]) out.push(P("plate-2x4", x, deck, back, 1, colour), P("plate-2x2", x, deck, back + 4, 0, colour));
  out.push(P("brick-2x4", left + 2, deck + 1, back, 1, colour), P("brick-2x4", left + 4, deck + 1, back, 1, colour));
  out.push(P("brick-2x4", left + 2, deck + 1, back + 4, 0, colour));
  for (const z of [back, back + 2, back + 4]) {
    out.push(P("slope-2x2", left, deck + 1, z, 3, colour), P("slope-2x2", right - 1, deck + 1, z, 1, colour));
    out.push(P("slope-2x2", left + 2, deck + 4, z, 3, colour), P("slope-2x2", left + 4, deck + 4, z, 1, colour));
  }
  return out;
}

/**
 * A low gable 4 studs deep whose ridge runs across, its long faces to the
 * front and the back: one course of 2×2 slopes on a deck of 2×4 plates.
 */
function gableAlongX(left: number, back: number, w: number, deck: number, colour: string): Placement[] {
  const out: Placement[] = [];
  for (let x = left; x < left + w; x += 4) out.push(P("plate-2x4", x, deck, back, 0, colour), P("plate-2x4", x, deck, back + 2, 0, colour));
  for (let x = left; x < left + w; x += 2) out.push(P("slope-2x2", x, deck + 1, back + 2, 0, colour), P("slope-2x2", x, deck + 1, back, 2, colour));
  return out;
}

/** A post of round bricks and round plates, `h` plates tall, on the ground. */
function stilt(x: number, z: number, h: number): Placement[] {
  const out: Placement[] = [];
  let y = 0;
  while (h - y >= 3) out.push(P("round-brick-1x1", x, y, z, 0, DARK)), (y += 3);
  while (h - y >= 1) out.push(P("round-1x1", x, y, z, 0, DARK)), (y += 1);
  return out;
}

// The Lodge: 8 × 4 on the left platform, door to one side, windows round.
const LODGE = { left: 1, back: 4, base: 12 };
const lodge: Placement[] = [
  ...walls({ ...LODGE, w: 8, d: 4, log: LOG, band: DARK, front: [DOOR(1), WINDOW(5)], rear: [WINDOW(1), WINDOW(5)], sides: [WINDOW(0)] }),
  ...gableAlongX(LODGE.left, LODGE.back, 8, LODGE.base + 19, "forest"),
  // a rail on the porch's open side
  P("fence-1x4x1", 1, 12, 8, 1, DARK),
];

// The Commons: four 6×6 plates on stilts 11 plates tall, so the deck's top
// is flush with the left platform (12), in front of the trunk.
const commonsPosts: [number, number][] = [
  [1, 12], [1, 17], [6, 17], [7, 12], [12, 17], [13, 17], [18, 12], [19, 17], [24, 12], [24, 17],
];
const commons: Placement[] = [
  ...commonsPosts.flatMap(([x, z]) => stilt(x, z, 11)),
  ...[1, 7, 13, 19].map((x) => P("plate-6x6", x, 11, 12, 0, LOG)),
  // railings along the front, leaving the stairs and the far end open
  P("fence-1x4x1", 7, 12, 17, 0, DARK),
  P("fence-1x4x1", 11, 12, 17, 0, DARK),
  P("fence-1x4x1", 15, 12, 17, 0, DARK),
  // a long table and two benches
  P("brick-1x2", 10, 12, 14, 0, DARK),
  P("brick-1x2", 16, 12, 14, 0, DARK),
  P("plate-2x8", 10, 15, 14, 0, TRIM),
  ...plates("x", 10, 8, 12, 12, DARK),
  ...plates("x", 10, 8, 16, 12, DARK),
];

// Stairs: ground to the Commons, Commons to the middle platform, and a
// switchback from the bunkhouse porch up to the crown deck.
const stairs: Placement[] = [
  P("stairs-2x4", 3, 0, 18, 0, DARK),
  P("stairs-2x4", 23, 12, 13, 0, DARK),
  P("stairs-2x4", 21, 24, 11, 1, DARK),
];

// The Bunkhouse: 8 × 6 on the middle platform, its gable to the front.
const BUNK = { left: 23, back: 5, base: 24 };
const bunkhouse: Placement[] = [
  ...walls({ ...BUNK, w: 8, d: 6, log: LIGHT, band: LOG, front: [WINDOW(1), DOOR(3)], rear: [WINDOW(1), WINDOW(5)], sides: [WINDOW(1)] }),
  ...gableAlongZ(BUNK.left, BUNK.back, BUNK.base + 19, "navy"),
  P("fence-1x4x1", 27, 24, 12, 0, DARK),
];

// The Lookout: an open pavilion on the crown deck. Four posts 15 plates
// tall carry two 2×8 beams, a layer of plates across them, and a red gable.
const LOOK = { left: 12, back: 6, base: 36 };
const lookoutPosts: [number, number][] = [
  [12, 6], [19, 6], [12, 11], [19, 11],
];
const lookout: Placement[] = [
  ...lookoutPosts.flatMap(([x, z]) => [0, 3, 6, 9, 12].map((dy) => P("brick-1x1", x, LOOK.base + dy, z, 0, DARK))),
  // railings on three sides; the front stays open to the stairs
  P("fence-1x4x1", 13, 36, 6, 0, DARK),
  P("brick-1x2", 17, 36, 6, 0, DARK),
  P("fence-1x4x1", 12, 36, 7, 1, DARK),
  P("fence-1x4x1", 19, 36, 7, 1, DARK),
  P("plate-2x8", 12, 51, 6, 0, DARK),
  P("plate-2x8", 12, 51, 10, 0, DARK),
  ...gableAlongZ(LOOK.left, LOOK.back, 52, "brick-red"),
];

// A fire ring and log seats on the ground in front, and a few flowers.
const ground: Placement[] = [
  P("plate-6x6", 10, 0, 20, 0, "leaf"),
  ...([[12, 22], [13, 21], [14, 22], [13, 23]] as const).map(([x, z]) => P("round-1x1", x, 1, z, 0, "stone")),
  P("round-1x1", 13, 1, 22, 0, "orange"),
  P("round-1x1", 13, 2, 22, 0, "bright-yellow"),
  P("brick-1x4", 10, 1, 20, 0, DARK),
  P("brick-1x4", 12, 1, 25, 0, DARK),
  P("flower", 15, 1, 20, 0, "orange"),
  P("flower", 9, 0, 19, 0, "butter"),
  P("flower", 27, 0, 18, 0, "bright-red"),
];

const reference: Placement[] = [...lodge, ...commons, ...stairs, ...bunkhouse, ...lookout, ...ground];

export const TREEHOUSE_SCENE: SceneTemplate = {
  id: "treehouse-01",
  version: 1,
  bounds: { w: 32, d: 28, h: 72 },
  reference,
  kit,
  additions: {},
  maxPlayers: 6,
  fixed: { version: 1, pieces: TREE_PIECES },
};
