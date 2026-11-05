import type { Cell, Rotation } from "./grid.ts";

// A part type: its shape for the rules (footprint, height, studs) and a
// separate `geometry` key the renderer looks up. Nothing here knows how a part
// is drawn, and nothing in the renderer decides where a part may go.
//
// Collision is the footprint box, w × d × h, for every type. That is exact for
// bricks and plates and an approximation for slopes and specials: two slopes
// cannot interlock and nothing can tuck under a slope's overhang.
//
// Connection: `studs` lists the footprint cells (at rotation 0) that can carry
// a part above, and `sockets` the cells with an anti-stud underneath (every
// footprint cell unless listed). An arch rests only on its legs and an
// inverted slope only on its back row, so neither is held up by a part
// under its hollow span or its overhang.

export type GeometryKey =
  | "window"
  | "fence"
  | "planter"
  | "brick"
  | "plate"
  | "slope45"
  | "slope45-double"
  | "door"
  | "flower"
  | "round-plate"
  | "round-brick"
  | "arch"
  | "slope45-inverted";

export interface PartDefinition {
  id: string;
  /** Stable code shown to players; it names the shape, never a colour. */
  code: string;
  name: string;
  category: "brick" | "plate" | "slope" | "special";
  /** Tray grouping. */
  group: "bricks" | "roofs" | "openings" | "details";
  /** Footprint at rotation 0, in studs: w along x, d along z. */
  w: number;
  d: number;
  /** Height in plates. */
  h: number;
  /** Footprint cells at rotation 0 that carry studs on top. */
  studs: "all" | readonly Cell[];
  /** Footprint cells at rotation 0 with an anti-stud underneath; all of them if absent. */
  sockets?: readonly Cell[];
  /** Rotations that give distinct results; symmetric parts list fewer. */
  rotations: readonly Rotation[];
  geometry: GeometryKey;
  /**
   * Composite parts have a fixed part (the door frame, the flower's leaves)
   * and one colourable region, which `colourRegion` names for the UI.
   */
  colourRegion?: string;
  defaultColour: string;
}

const ALL: readonly Rotation[] = [0, 1, 2, 3];
const HALF: readonly Rotation[] = [0, 1];
const ONE: readonly Rotation[] = [0];

// Slopes at rotation 0 keep their studs along the back row (z = 0) and fall
// towards the viewer (+z).
export const CATALOG: readonly PartDefinition[] = [
  { id: "brick-1x2", code: "B12", name: "Brick 1×2", group: "bricks", category: "brick", w: 2, d: 1, h: 3, studs: "all", rotations: HALF, geometry: "brick", defaultColour: "pale-mint" },
  { id: "brick-2x2", code: "B22", name: "Brick 2×2", group: "bricks", category: "brick", w: 2, d: 2, h: 3, studs: "all", rotations: ONE, geometry: "brick", defaultColour: "navy" },
  { id: "brick-2x4", code: "B24", name: "Brick 2×4", group: "bricks", category: "brick", w: 4, d: 2, h: 3, studs: "all", rotations: HALF, geometry: "brick", defaultColour: "pale-mint" },
  { id: "plate-2x2", code: "P22", name: "Plate 2×2", group: "bricks", category: "plate", w: 2, d: 2, h: 1, studs: "all", rotations: ONE, geometry: "plate", defaultColour: "leaf" },
  { id: "plate-2x8", code: "P28", name: "Plate 2×8", group: "bricks", category: "plate", w: 8, d: 2, h: 1, studs: "all", rotations: HALF, geometry: "plate", defaultColour: "white" },
  { id: "slope-2x1", code: "S21", name: "Slope 45° 2×1", group: "roofs", category: "slope", w: 1, d: 2, h: 3, studs: [{ x: 0, z: 0 }], rotations: ALL, geometry: "slope45", defaultColour: "navy" },
  { id: "slope-2x2", code: "S22", name: "Slope 45° 2×2", group: "roofs", category: "slope", w: 2, d: 2, h: 3, studs: [{ x: 0, z: 0 }, { x: 1, z: 0 }], rotations: ALL, geometry: "slope45", defaultColour: "navy" },
  // Ridge along z at rotation 0, falling towards −x and +x.
  { id: "ridge-2x2", code: "R22", name: "Ridge slope 2×2", group: "roofs", category: "slope", w: 2, d: 2, h: 3, studs: [], rotations: HALF, geometry: "slope45-double", defaultColour: "navy" },
  // One preassembled component: white frame, coloured door, knob. Faces +z at rotation 0.
  { id: "door-1x4x6", code: "D46", name: "Door with frame 1×4×6", group: "openings", category: "special", w: 4, d: 1, h: 18, studs: "all", rotations: ALL, geometry: "door", colourRegion: "door", defaultColour: "navy" },
  // One preassembled component: leaves, flower head and centre.
  { id: "flower", code: "F11", name: "Flower", group: "details", category: "special", w: 1, d: 1, h: 3, studs: [], rotations: ONE, geometry: "flower", colourRegion: "petals", defaultColour: "butter" },
  { id: "round-1x1", code: "R11", name: "Round plate 1×1", group: "details", category: "plate", w: 1, d: 1, h: 1, studs: "all", rotations: ONE, geometry: "round-plate", defaultColour: "brick-red" },
  // Scene version 2 additions (ADR 0003). Each fills a gap in a wall or a
  // spot on the ground like a brick: no sideways attachment.
  // A window frame with glass: frame colourable, studs on top like a brick.
  { id: "window-1x2x2", code: "W22", name: "Window 1×2×2", group: "openings", category: "special", w: 2, d: 1, h: 6, studs: "all", rotations: HALF, geometry: "window", colourRegion: "frame", defaultColour: "white" },
  // A low fence: two posts with studs, rails between.
  { id: "fence-1x4x1", code: "FN4", name: "Fence 1×4×1", group: "details", category: "special", w: 4, d: 1, h: 3, studs: [{ x: 0, z: 0 }, { x: 3, z: 0 }], rotations: HALF, geometry: "fence", defaultColour: "white" },
  // A planter box with its flowers as one part; the flowers' height is part
  // of its collision box, so nothing can be stacked into them.
  { id: "planter-1x2", code: "PL2", name: "Planter with flowers", group: "details", category: "special", w: 2, d: 1, h: 5, studs: [], rotations: HALF, geometry: "planter", colourRegion: "box", defaultColour: "bark" },
  // Medieval Castle parts (doc/research/0002-medieval-castle-reference.md).
  { id: "brick-1x1", code: "B11", name: "Brick 1×1", group: "bricks", category: "brick", w: 1, d: 1, h: 3, studs: "all", rotations: ONE, geometry: "brick", defaultColour: "stone" },
  { id: "brick-1x4", code: "B14", name: "Brick 1×4", group: "bricks", category: "brick", w: 4, d: 1, h: 3, studs: "all", rotations: HALF, geometry: "brick", defaultColour: "stone" },
  { id: "round-brick-1x1", code: "RB1", name: "Round brick 1×1", group: "bricks", category: "brick", w: 1, d: 1, h: 3, studs: "all", rotations: ONE, geometry: "round-brick", defaultColour: "stone" },
  { id: "plate-1x2", code: "P12", name: "Plate 1×2", group: "bricks", category: "plate", w: 2, d: 1, h: 1, studs: "all", rotations: HALF, geometry: "plate", defaultColour: "bark" },
  { id: "plate-2x4", code: "P24", name: "Plate 2×4", group: "bricks", category: "plate", w: 4, d: 2, h: 1, studs: "all", rotations: HALF, geometry: "plate", defaultColour: "sand" },
  { id: "plate-6x6", code: "P66", name: "Plate 6×6", group: "bricks", category: "plate", w: 6, d: 6, h: 1, studs: "all", rotations: ONE, geometry: "plate", defaultColour: "sand" },
  // Arches along x at rotation 0, standing on their two end cells.
  { id: "arch-1x4", code: "A14", name: "Arch 1×4", group: "openings", category: "special", w: 4, d: 1, h: 3, studs: "all", sockets: [{ x: 0, z: 0 }, { x: 3, z: 0 }], rotations: HALF, geometry: "arch", defaultColour: "stone" },
  { id: "arch-1x8x2", code: "A82", name: "Arch 1×8×2", group: "openings", category: "special", w: 8, d: 1, h: 6, studs: "all", sockets: [{ x: 0, z: 0 }, { x: 7, z: 0 }], rotations: HALF, geometry: "arch", defaultColour: "stone" },
  // Rests on its back row (z = 0) and widens towards +z, studs all over the top.
  { id: "inv-slope-2x2", code: "I22", name: "Inverted slope 45° 2×2", group: "roofs", category: "slope", w: 2, d: 2, h: 3, studs: "all", sockets: [{ x: 0, z: 0 }, { x: 1, z: 0 }], rotations: ALL, geometry: "slope45-inverted", defaultColour: "charcoal" },
];

const byId = new Map(CATALOG.map((p) => [p.id, p]));

export const partDef = (id: string): PartDefinition | undefined => byId.get(id);
