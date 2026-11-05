import { isoSvg, type IsoBrick } from "./iso.ts";

// A small family of isometric brick scenes for the non-gameplay pages
// (ADR 0014, "Bolder artistic pass"), built from the same `isoSvg` 3D
// brick-drawing primitive the saved-creation previews already use
// (`creationPreview.ts`) — one brick-rendering system for the whole site,
// not a second, flatter icon language invented just for decoration. Every
// scene here is plain, original geometry: studded bricks, a visible
// baseplate, and (where the moment calls for it) a translucent "ghost"
// piece in the same look the real editor uses for a plan, never a flat
// rounded rectangle standing in for a brick.
//
// These are deliberately small, readable compositions (a handful of
// bricks, not a whole house every time) sized to read clearly at both
// card scale and hero scale — `isoSvg`'s viewBox already fits itself to
// whatever bricks are passed, so each scene is used at whatever pixel
// size its context needs.

const RED = "#d2242c";
const RED_EDGE = "#9c141c";
const RED_DEEP = "#7a0f17";
const YELLOW = "#ffcf3d";
const YELLOW_EDGE = "#d99f00";
const BLUE = "#1f6fae";
const BLUE_DEEP = "#134f85";
const CREAM = "#fdf6ec";
const BASE = "#cdb9a4";

/** A small baseplate with one brick already standing on it: a ready, self-contained way to start alone. */
export const soloPlotScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 5, d: 5, h: 1, colour: YELLOW, smooth: true },
      { x: 1, y: 1, z: 1, w: 2, d: 2, h: 2, colour: RED },
      { x: 1, y: 1, z: 3, w: 2, d: 2, h: 1, colour: RED_EDGE },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');

/** A baseplate with two different-coloured bricks meeting at its centre: starting a room meant to be shared. */
export const sharedPlotScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 5, d: 5, h: 1, colour: RED, smooth: true },
      { x: 0.5, y: 2.5, z: 1, w: 2, d: 2, h: 2, colour: BLUE },
      { x: 2.5, y: 0.5, z: 1, w: 2, d: 2, h: 2, colour: YELLOW },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');

/**
 * The hero scene for About's opening (brief, 5 Nov 2026): a wide shared
 * baseplate with three differently-coloured contributions already built
 * (red, yellow, blue — never a finished building), one deliberate gap
 * left in the near corner, and a translucent proposed piece (`ghost`,
 * the exact visual language the real editor uses for a plan) approaching
 * it. Large and detailed enough to carry a page opening on its own,
 * rather than one tiny icon repeated.
 */
export const unfinishedCreationScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 11, d: 8, h: 1, colour: BASE, smooth: true },
      { x: 0, y: 0, z: 1, w: 3, d: 8, h: 2, colour: RED },
      { x: 0, y: 0, z: 3, w: 3, d: 8, h: 1, colour: RED_EDGE },
      { x: 8, y: 0, z: 1, w: 3, d: 8, h: 2, colour: YELLOW },
      { x: 8, y: 0, z: 3, w: 3, d: 8, h: 1, colour: YELLOW_EDGE },
      { x: 3, y: 5, z: 1, w: 2, d: 3, h: 2, colour: BLUE },
      { x: 3, y: 5, z: 3, w: 2, d: 3, h: 1, colour: BLUE_DEEP },
      { x: 5, y: 5, z: 1, w: 3, d: 3, h: 3, colour: RED_EDGE, ghost: true, float: true },
    ],
    "An unfinished shared creation: three different contributions built around one open gap, with a proposed piece approaching it",
  );

/**
 * Chapter 1 of About's narrative (brief: "separate contributions approach
 * an unfinished structure"): the same baseplate and red/yellow built
 * sections as the hero, without the blue piece or the ghost yet —
 * earlier in the same story, not a disconnected illustration.
 */
export const contributionsApproachScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 9, d: 6, h: 1, colour: BASE, smooth: true },
      { x: 0, y: 0, z: 1, w: 3, d: 6, h: 2, colour: RED },
      { x: 0, y: 0, z: 3, w: 3, d: 6, h: 1, colour: RED_EDGE },
      { x: 6, y: 0, z: 1, w: 3, d: 6, h: 2, colour: YELLOW },
      { x: 6, y: 0, z: 3, w: 3, d: 6, h: 1, colour: YELLOW_EDGE },
      // the proposed blue piece, still apart, not yet in the gap
      { x: 3, y: 1, z: 1, w: 2, d: 2, h: 2, colour: BLUE, ghost: true, float: true },
    ],
    "",
  ).replace(/role="img" aria-label=""/, 'aria-hidden="true"');

/**
 * Chapter 2 (brief: "a proposed piece finds its place"): the blue piece
 * now real and seated in the gap, completing the shared wall — the same
 * scene one beat later, the visual payoff of chapter 1's approach.
 */
export const pieceSettlesScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 9, d: 6, h: 1, colour: BASE, smooth: true },
      { x: 0, y: 0, z: 1, w: 3, d: 6, h: 2, colour: RED },
      { x: 0, y: 0, z: 3, w: 3, d: 6, h: 1, colour: RED_EDGE },
      { x: 6, y: 0, z: 1, w: 3, d: 6, h: 2, colour: YELLOW },
      { x: 6, y: 0, z: 3, w: 3, d: 6, h: 1, colour: YELLOW_EDGE },
      { x: 3, y: 1, z: 1, w: 2, d: 2, h: 2, colour: BLUE },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');

/**
 * Chapter 3 (brief: "the creation becomes part of a small setting"): the
 * completed structure from chapter 2, now one house among a couple of
 * plainer silhouette neighbours on a shared strip of ground — "build
 * somewhere, not in a void".
 */
export const neighbourhoodScene = (): string =>
  isoSvg(
    [
      // a plain neighbour silhouette directly beside, same ground level
      { x: -3, y: 0, z: 0, w: 2, d: 3, h: 1, colour: "#e9ddc9", smooth: true },
      { x: -3, y: 0.5, z: 1, w: 2, d: 2, h: 2, colour: "#d8c7a8" },
      // the shared house itself, centred, in full colour
      { x: 0, y: 0, z: 0, w: 6, d: 5, h: 1, colour: BASE, smooth: true },
      { x: 0, y: 0, z: 1, w: 2, d: 5, h: 2, colour: RED },
      { x: 4, y: 0, z: 1, w: 2, d: 5, h: 2, colour: YELLOW },
      { x: 2, y: 1, z: 1, w: 2, d: 2, h: 2, colour: BLUE },
      { x: 0, y: 0, z: 3, w: 6, d: 5, h: 1, colour: RED_EDGE, smooth: true },
      // a second plain neighbour, the other side
      { x: 6, y: 1, z: 0, w: 2, d: 3, h: 1, colour: "#e9ddc9", smooth: true },
      { x: 6.5, y: 1.5, z: 1, w: 1.5, d: 2, h: 1.5, colour: "#d8c7a8" },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');

/**
 * Chapter 4 / the collection-and-showcase family (brief: "a saved version
 * rests on a display base with equal contributor markers"): the same
 * small house, now sitting on a raised yellow display plinth with two
 * same-sized coloured nameplate studs in front — never implying who
 * exactly, just that it was more than one person, without inventing names.
 */
export const displayedCreationScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 8, d: 6, h: 1, colour: YELLOW, smooth: true },
      { x: 1.5, y: 1, z: 1, w: 2, d: 4, h: 2, colour: RED },
      { x: 4.5, y: 1, z: 1, w: 2, d: 4, h: 2, colour: BLUE },
      { x: 1.5, y: 1, z: 3, w: 5, d: 4, h: 1, colour: RED_EDGE, smooth: true },
      // two equal-sized contributor nameplate studs, clear of the house, front edge
      { x: 0.5, y: 5.3, z: 1, w: 1.5, d: 1.5, h: 0.8, colour: RED_EDGE },
      { x: 6, y: 5.3, z: 1, w: 1.5, d: 1.5, h: 0.8, colour: BLUE_DEEP },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');

/**
 * A small, low "beam" brick — a long low 1-plate-high strip — used as a
 * structural accent beside section headings, standing in for a shared
 * length of brick rather than a generic rule or divider line.
 */
export const headingBeamScene = (colour: string = RED): string =>
  isoSvg([{ x: 0, y: 0, z: 0, w: 6, d: 1, h: 1, colour }], "").replace('role="img" aria-label=""', 'aria-hidden="true"');

/**
 * The empty-state illustration family (replacing the earlier flat
 * line-and-dot "shelf" silhouette, brief: "recognisable objects with
 * depth and purpose"): an empty baseplate on its own, with a faint ghost
 * outline of a single stud hovering over it — somewhere ready to be
 * built on, honestly showing nothing has been placed yet, never
 * fabricating content.
 */
export const emptyPlotScene = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 6, d: 4, h: 1, colour: "#e6d9c4", smooth: true },
      { x: 2, y: 1, z: 1, w: 2, d: 2, h: 1, colour: YELLOW_EDGE, ghost: true, float: true },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');

/** A small brick-clip shape (two short pegs over a slot), used to pin an invitation or a credential-style card, standing in for a plain bordered box. */
export const clipScene = (): string => `
<svg class="brick-clip" viewBox="0 0 48 20" aria-hidden="true">
  <rect x="4" y="10" width="40" height="7" rx="2" fill="${RED_EDGE}"/>
  <rect x="10" y="2" width="8" height="12" rx="2" fill="${RED}"/>
  <rect x="30" y="2" width="8" height="12" rx="2" fill="${RED}"/>
</svg>`;

export type { IsoBrick };
