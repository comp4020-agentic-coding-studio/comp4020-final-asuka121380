import * as THREE from "three";
import { at, dir, obstacles, PLACES, signFaceY, type ObjectId, type Place } from "./build.ts";
import type { Entrance, Focus, Layout } from "./focus.ts";

export { layoutFor, prefersReducedMotion, TRAVEL_MS, type Entrance, type Focus, type Layout } from "./focus.ts";

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
  /** Radians to swing the approach round from the face's normal (positive towards the object's +x), where something stands straight in front of it. */
  yaw?: number;
}

export const VIEWINGS: Record<Layout, Record<Entrance, Viewing>> = {
  wide: {
    // Square to the sign's face, a little above it; looking a few studs to
    // its right puts the sign in the left of the frame and leaves the
    // table's quiet right-hand end, and the wall behind it, for the panel.
    "sign-in": { object: "sign", target: [5.4, signFaceY - 1.4, 0], distance: 26, elevation: 27, fov: 36 },
    // Every other panel stands on the right, so each object sits a little
    // left of centre: the target is shifted along the object's own +x.
    // The scene tray from above and in front, so the miniature and its base read.
    scenes: { object: "scenes", target: [6.4, 0.4, 0.8], distance: 30, elevation: 44, fov: 36 },
    // The noticeboard nearly face-on, a little above its middle.
    // swung in from its left so the house never stands between
    rooms: { object: "board", target: [7.2, 4.2, 0], distance: 30, elevation: 20, fov: 36, yaw: -0.4 },
    // The shelf's display side, face-on.
    shelf: { object: "shelf", target: [8.4, 6, 0], distance: 32, elevation: 14, fov: 36 },
    // Close on the envelope and its name stand.
    friends: { object: "friends", target: [5.4, 1.2, 0.4], distance: 22, elevation: 30, fov: 36 },
    // The booklet from above, turned to read.
    about: { object: "booklet", target: [0, 0.4, 0.2], distance: 20, elevation: 58, fov: 36 },
  },
  narrow: {
    // Square to the face and steep, so the tabletop (not the house) is
    // behind the sign; looking below the sign raises it into the band above
    // the sheet.
    "sign-in": { object: "sign", target: [0, signFaceY - 5.5, -1.5], distance: 34, elevation: 44, fov: 40 },
    // On a phone each panel is a bottom sheet; the object sits in the band
    // above it, so each looks a little below the object.
    scenes: { object: "scenes", target: [-2.9, -8, 3], distance: 44, elevation: 34, fov: 40, yaw: -0.8 },
    // from high and a little to its left: the house stands in front of it
    rooms: { object: "board", target: [0, -1.6, 0], distance: 34, elevation: 50, fov: 40, yaw: -0.5 },
    // swung in from its right, past the house
    shelf: { object: "shelf", target: [0, 1.6, 0], distance: 36, elevation: 24, fov: 40, yaw: 0.8 },
    friends: { object: "friends", target: [0, -4, 1], distance: 22, elevation: 36, fov: 40, yaw: -0.5 },
    about: { object: "booklet", target: [0, -3.6, -1], distance: 24, elevation: 36, fov: 40, yaw: 0.3 },
  },
};

const OVERVIEW: Record<Layout, Pose> = {
  // a seat at the front of the table: low enough to feel seated, high
  // enough that the board and shelf still show over the house
  wide: { position: [-1, 29, 60], target: [0, 2.5, -6], fov: 36 },
  // looking down over the table, so a tall screen holds all of it
  narrow: { position: [0, 52, 40], target: [0, 0, -2], fov: 52 },
};

function poseFromViewing(v: Viewing, place: Place): Pose {
  const target = new THREE.Vector3(...at(place, ...v.target));
  const s = place.scale ?? 1;
  const el = THREE.MathUtils.degToRad(v.elevation);
  // the object's face points along its own +z, turned with it (and swung by `yaw`)
  const yaw = v.yaw ?? 0;
  const offset = dir(place, Math.sin(yaw), 0, Math.cos(yaw))
    .multiplyScalar(Math.cos(el) * v.distance * s)
    .add(new THREE.Vector3(0, Math.sin(el) * v.distance * s, 0));
  return { position: target.clone().add(offset).toArray() as Vec3, target: target.toArray() as Vec3, fov: v.fov };
}

export function poseFor(layout: Layout, focus: Focus): Pose {
  if (focus === "overview") return OVERVIEW[layout];
  const v = VIEWINGS[layout][focus];
  return poseFromViewing(v, PLACES[layout][v.object]);
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
