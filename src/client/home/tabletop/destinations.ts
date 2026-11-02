import * as THREE from "three";
import { at, dir, obstacles, PLACES, signFaceY, type ObjectId, type Place } from "./build.ts";

// The tabletop's camera destinations (ADR 0014). A destination is derived
// from the object it serves: where the object stands, which way its face
// points, and how it wants to be looked at. Turning or moving an object in
// `PLACES` moves its camera with it; there is no free orbit on the homepage.

export type Vec3 = readonly [number, number, number];

export interface Pose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export type Focus = "overview" | "sign-in";

export type Layout = "wide" | "narrow";

/** Narrow = a phone in portrait, where the focused panel is a bottom sheet. */
export const layoutFor = (width: number, height: number): Layout => (width < 760 || width / height < 0.8 ? "narrow" : "wide");

/**
 * How an object wants to be seen. The camera sits `distance` out along the
 * object's face direction, `elevation` degrees above level, looking at
 * `target` (in the object's own frame). Moving `target` sideways in that
 * frame puts the object off-centre, leaving room for a panel. Later
 * entrances add one entry each: the booklet wants a steep, downward view;
 * the board a frontal one; a tray an elevated one.
 */
export interface Viewing {
  object: ObjectId;
  target: Vec3;
  distance: number;
  elevation: number;
  fov: number;
}

export const VIEWINGS: Record<Layout, Partial<Record<Exclude<Focus, "overview">, Viewing>>> = {
  wide: {
    // Square to the sign's face, a little above it; looking a few studs to
    // its right puts the sign in the left of the frame and leaves clear
    // tabletop on the right for the panel.
    "sign-in": { object: "sign", target: [5.2, signFaceY - 0.6, 0], distance: 23, elevation: 16, fov: 36 },
  },
  narrow: {
    // Square to the face and higher; looking below the sign raises it into
    // the band above the sheet.
    "sign-in": { object: "sign", target: [0, signFaceY - 3.6, 0], distance: 26, elevation: 22, fov: 40 },
  },
};

const OVERVIEW: Record<Layout, Pose> = {
  // a seat in front of the table, slightly raised, looking at the house
  wide: { position: [1, 25, 44], target: [0, 1.2, -2.5], fov: 34 },
  // looking down over the table, so a tall screen holds all of it
  narrow: { position: [0, 50, 44], target: [0, 0, 0], fov: 52 },
};

function poseFromViewing(v: Viewing, place: Place): Pose {
  const target = new THREE.Vector3(...at(place, ...v.target));
  const s = place.scale ?? 1;
  const el = THREE.MathUtils.degToRad(v.elevation);
  // the object's face points along its own +z, turned with it
  const offset = dir(place, 0, 0, 1)
    .multiplyScalar(Math.cos(el) * v.distance * s)
    .add(new THREE.Vector3(0, Math.sin(el) * v.distance * s, 0));
  return { position: target.clone().add(offset).toArray() as Vec3, target: target.toArray() as Vec3, fov: v.fov };
}

export function poseFor(layout: Layout, focus: Focus): Pose {
  if (focus === "overview") return OVERVIEW[layout];
  const v = VIEWINGS[layout][focus]!;
  return poseFromViewing(v, PLACES[layout][v.object]);
}

/** How long a move takes; reduced motion makes it a cut. */
export const TRAVEL_MS = 700;

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The camera's path between two poses: a quadratic curve whose control point
 * is lifted just enough that no sample enters an obstacle box, so a move
 * never passes through the house, the board, the shelf or the sign. The
 * lift is capped: a gentle arc, never a fly-over.
 */
export interface Path {
  from: THREE.Vector3;
  control: THREE.Vector3;
  to: THREE.Vector3;
}

const SAMPLES = 32;
const MAX_LIFT = 14;

export function bezier(out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}

function blocked(p: Path, boxes: THREE.Box3[]): boolean {
  const point = new THREE.Vector3();
  for (let i = 1; i < SAMPLES; i++) {
    bezier(point, p.from, p.control, p.to, i / SAMPLES);
    if (boxes.some((b) => b.containsPoint(point))) return true;
  }
  return false;
}

export function pathBetween(from: THREE.Vector3, to: THREE.Vector3, layout: Layout): Path {
  const boxes = obstacles(layout).map((b) => b.clone().expandByScalar(0.8));
  const mid = from.clone().lerp(to, 0.5);
  const path: Path = { from: from.clone(), control: mid.clone(), to: to.clone() };
  for (let lift = 1; lift <= MAX_LIFT && blocked(path, boxes); lift++) path.control.y = mid.y + lift;
  return path;
}

/** Whether a path keeps out of every obstacle box (used by the browser checks through `?debug`). */
export function pathClear(p: Path, layout: Layout): boolean {
  return !blocked(p, obstacles(layout));
}
