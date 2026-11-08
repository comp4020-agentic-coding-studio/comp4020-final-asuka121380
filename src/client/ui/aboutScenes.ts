import { isoSvg, type IsoBrick } from "./iso.ts";

// The About page's illustrations (ADR 0014, "About page: the README's
// argument in pictures", 8 Nov 2026). Original drawings, made only from the
// site's one isometric brick primitive (`isoSvg`, ui/iso.ts): studded
// bricks, smooth tiles and the translucent "plan" brick the editor itself
// uses. No people, no minifigures, no third-party artwork.
//
// A scene that moves is drawn as a few LAYERS: separate <svg>s that share
// one viewBox, stacked in one box by the page's CSS, so a single layer (a
// roof that is still a plan, a highlight, a loose brick) can be animated
// without redrawing the rest. `layered()` fits that shared viewBox; isoSvg
// itself, and every scene other pages import from ui/brickScenes.ts, is
// left exactly as it was.
//
// Plain string output, no DOM or React: src/server/readme.ts imports this,
// so the Dockerfile's runtime stage copies it alongside iso.ts.

const RED = "#d2242c";
const RED_EDGE = "#9c141c";
const YELLOW = "#ffcf3d";
const YELLOW_EDGE = "#d99f00";
const BLUE = "#1f6fae";
const BLUE_DEEP = "#134f85";
const GREEN = "#2f9e5b";
const CREAM = "#fdf6ec";
const SAND = "#e6d4b8";
const WOOD = "#c8925a";
const WOOD_DARK = "#9a6a3c";
const SLATE = "#5d6b78";

export interface Layer {
  /** Short class suffix for the page's CSS (e.g. "roof" -> "layer-roof"). */
  name: string;
  bricks: IsoBrick[];
}

/** The same viewBox for every layer, fitted round all their bricks, so the layers stack exactly. */
function sharedViewBox(layers: Layer[]): string {
  // render everything once and read the viewBox isoSvg fitted round it
  const all = isoSvg(
    layers.flatMap((l) => l.bricks),
    "",
  );
  return all.match(/viewBox="([^"]+)"/)![1];
}

/**
 * Several layers of one scene, each its own <svg> with the shared viewBox,
 * wrapped in one element. Every layer is decorative (`aria-hidden`); the
 * page puts any description it needs on the wrapper.
 */
export function layered(cls: string, layers: Layer[]): string {
  const vb = sharedViewBox(layers);
  const svgs = layers
    .map((l) =>
      isoSvg(l.bricks, "")
        .replace(/viewBox="[^"]+"/, `viewBox="${vb}"`)
        .replace('role="img" aria-label=""', `aria-hidden="true" focusable="false" class="layer layer-${l.name}"`),
    )
    .join("");
  return `<div class="scene ${cls}" aria-hidden="true">${svgs}</div>`;
}

// ---- small reusable pieces --------------------------------------------------

/** A tabletop: one big smooth wooden tile with a darker front edge. */
const table = (x: number, y: number, w: number, d: number): IsoBrick[] => [{ x, y, z: -1, w, d, h: 1, colour: WOOD, smooth: true }];

/** A parts tray: a low rim round three compartments, each holding a few loose bricks. */
function partsTray(x: number, y: number): { tray: IsoBrick[]; contents: IsoBrick[] } {
  const tray: IsoBrick[] = [
    { x, y, z: 0, w: 7, d: 4, h: 1, colour: BLUE_DEEP, smooth: true },
    // rim
    { x, y, z: 1, w: 7, d: 1, h: 1, colour: BLUE, smooth: true },
    { x, y: y + 3, z: 1, w: 7, d: 1, h: 1, colour: BLUE, smooth: true },
    { x, y: y + 1, z: 1, w: 1, d: 2, h: 1, colour: BLUE, smooth: true },
    { x: x + 6, y: y + 1, z: 1, w: 1, d: 2, h: 1, colour: BLUE, smooth: true },
    // dividers
    { x: x + 2, y: y + 1, z: 1, w: 1, d: 2, h: 1, colour: BLUE, smooth: true },
    { x: x + 4, y: y + 1, z: 1, w: 1, d: 2, h: 1, colour: BLUE, smooth: true },
  ];
  const contents: IsoBrick[] = [
    { x: x + 1, y: y + 1, z: 1, w: 1, d: 2, h: 1, colour: RED },
    { x: x + 3, y: y + 1, z: 1, w: 1, d: 1, h: 1, colour: YELLOW },
    { x: x + 3, y: y + 2, z: 1, w: 1, d: 1, h: 1, colour: CREAM },
    { x: x + 5, y: y + 1, z: 1, w: 1, d: 2, h: 1, colour: GREEN },
  ];
  return { tray, contents };
}

/** The table's sign: a foot, a post and a wide red board facing the viewer, with a white nameplate strip, as on the homepage. */
const sign = (x: number, y: number): IsoBrick[] => [
  { x, y, z: 0, w: 3, d: 2, h: 1, colour: SLATE, smooth: true },
  { x: x + 1, y, z: 1, w: 1, d: 1, h: 5, colour: SLATE, smooth: true },
  // the board: red, a white nameplate band, red, then a studded red cap
  { x: x - 1, y, z: 6, w: 5, d: 1, h: 2, colour: RED, smooth: true },
  { x: x - 1, y, z: 8, w: 5, d: 1, h: 2, colour: CREAM, smooth: true },
  { x: x - 1, y, z: 10, w: 5, d: 1, h: 2, colour: RED, smooth: true },
  { x: x - 1, y, z: 12, w: 5, d: 1, h: 1, colour: RED_EDGE },
];

/** A creation shelf: two uprights and a board, a small two-colour creation standing on it. */
const shelf = (x: number, y: number): IsoBrick[] => [
  { x, y, z: 0, w: 1, d: 3, h: 8, colour: CREAM, smooth: true },
  { x: x + 5, y, z: 0, w: 1, d: 3, h: 8, colour: CREAM, smooth: true },
  { x, y, z: 8, w: 6, d: 3, h: 1, colour: RED, smooth: true },
  { x: x + 1.5, y: y + 0.5, z: 9, w: 1, d: 2, h: 3, colour: YELLOW },
  { x: x + 2.5, y: y + 0.5, z: 9, w: 2, d: 2, h: 3, colour: BLUE },
  { x: x + 1.5, y: y + 0.5, z: 12, w: 3, d: 2, h: 1, colour: RED_EDGE },
];

/** The shared build at the heart of the story: a small walled house on a sand plate, two builders' walls meeting. */
const sharedWalls = (x: number, y: number): IsoBrick[] => [
  { x, y, z: 0, w: 7, d: 5, h: 1, colour: SAND, smooth: true },
  { x, y, z: 1, w: 3, d: 5, h: 3, colour: RED },
  { x: x + 4, y, z: 1, w: 3, d: 5, h: 3, colour: YELLOW },
  { x: x + 3, y, z: 1, w: 1, d: 2, h: 3, colour: CREAM },
  { x, y, z: 4, w: 3, d: 5, h: 3, colour: RED_EDGE },
  { x: x + 4, y, z: 4, w: 3, d: 5, h: 3, colour: YELLOW_EDGE },
];

/** The roof someone proposed: one long blue span over both walls. */
const roof = (x: number, y: number, z: number, ghost: boolean): IsoBrick => ({ x, y, z, w: 7, d: 5, h: 2, colour: BLUE, ghost, float: ghost });

// ---- the five compositions --------------------------------------------------

/**
 * The opening: a corner of a building table. An unfinished build stands in
 * the middle (two walls, no roof yet), the parts tray waits beside it, and a
 * few loose bricks lie about. Layers: the table and tray, the build, the
 * tray's contents, the loose bricks, so the build can settle and the loose
 * bricks drop in once.
 */
export function openingScene(): string {
  const { tray, contents } = partsTray(10, 1);
  return layered("about-opening", [
    { name: "table", bricks: [...table(-1, -1, 19, 10), ...tray] },
    { name: "build", bricks: sharedWalls(1, 1) },
    { name: "contents", bricks: contents },
    {
      name: "loose",
      bricks: [
        { x: 2, y: 7, z: 0, w: 2, d: 1, h: 3, colour: BLUE },
        { x: 6, y: 7.5, z: 0, w: 1, d: 1, h: 3, colour: GREEN },
        { x: 14, y: 6.5, z: 0, w: 2, d: 2, h: 3, colour: RED },
      ],
    },
  ]);
}

/**
 * "A table before a menu": the homepage's objects on the table, the sign,
 * the parts tray and the creation shelf, each where a visitor would walk up
 * to it. A yellow glow plate under the tray marks the one being approached;
 * the page frames in towards it. Purely a picture: nothing here is a link
 * or a button.
 */
export function tableObjectsScene(): string {
  const { tray, contents } = partsTray(8, 3);
  return layered("about-table", [
    { name: "table", bricks: table(-3, -1, 24, 10) },
    { name: "glow", bricks: [{ x: 7.5, y: 2.5, z: -0.6, w: 8, d: 5, h: 0.6, colour: YELLOW, smooth: true }] },
    { name: "objects", bricks: [...sign(0, 3), ...tray, ...contents, ...shelf(16, 2)] },
  ]);
}

/**
 * "Social interaction with a purpose": the shared build with a proposed
 * roof. Layers: the walls; the roof as a plan (translucent, hovering, the
 * editor's own plan look); the roof real and seated; and a further open
 * plan (a translucent chimney) standing on the finished roof, so the still
 * picture shows both halves: a plan made real, and the next proposal. The
 * page shows the roof plan, then sets the real roof down into its place,
 * once.
 */
export function proposalScene(): string {
  return layered("about-proposal", [
    { name: "walls", bricks: sharedWalls(0, 0) },
    { name: "plan", bricks: [roof(0, 0, 9, true)] },
    { name: "real", bricks: [roof(0, 0, 7, false)] },
    { name: "next", bricks: [{ x: 4, y: 1, z: 9, w: 1, d: 2, h: 3, colour: YELLOW, ghost: true }] },
  ]);
}

/**
 * "Keeping what we made": the finished house kept on a display plinth, two
 * equal contributor markers in front of it. Layers: the plinth and markers,
 * the creation (which lifts on to the plinth once).
 */
export function keptScene(): string {
  return layered("about-kept", [
    {
      name: "plinth",
      bricks: [
        // a two-step display plinth
        { x: -1, y: -1, z: 0, w: 10, d: 10, h: 2, colour: RED_EDGE, smooth: true },
        { x: 0, y: 0, z: 2, w: 8, d: 7, h: 2, colour: CREAM, smooth: true },
        // two equal contributor markers on the front step, no names
        { x: 1, y: 7, z: 2, w: 1, d: 1, h: 1, colour: YELLOW },
        { x: 5, y: 7, z: 2, w: 1, d: 1, h: 1, colour: BLUE },
      ],
    },
    { name: "creation", bricks: liftedHouse(0, 0, 4) },
  ]);
}

/** The finished house (walls and the roof that was once a plan), standing at height z. */
function liftedHouse(x: number, y: number, z: number): IsoBrick[] {
  return [...sharedWalls(x, y), roof(x, y, 7, false)].map((b) => ({ ...b, z: b.z + z }));
}

/**
 * "One intention throughout": the whole account on one long table: the
 * sign, the parts tray, the shared house with its roof on, and the shelf
 * with a kept creation. Every earlier picture, joined into one place.
 */
export function intentionScene(): string {
  const { tray, contents } = partsTray(4, 7);
  return layered("about-intention", [
    { name: "table", bricks: table(-2, -2, 33, 14) },
    {
      name: "all",
      bricks: [...sign(1, 1), ...tray, ...contents, ...sharedWalls(12, 2), roof(12, 2, 7, false), ...shelf(23, 0)],
    },
  ]);
}

/** The chapter treatments, keyed by the README heading they illustrate. */
export const ABOUT_SCENES = {
  opening: openingScene,
  table: tableObjectsScene,
  proposal: proposalScene,
  kept: keptScene,
  intention: intentionScene,
} as const;
