import * as THREE from "three";

// Solid scenery the camera must never end up inside, such as a neighbour's
// house met while orbiting far out. A scene's environment registers its
// boxes when it mounts. The camera rig only reads them; they are appearance,
// never part of the build or the rules.

const boxes: THREE.Box3[] = [];
const MARGIN = 0.8;

/** Replace the registered boxes; returns a function that clears them again. */
export function setObstacles(next: THREE.Box3[]): () => void {
  boxes.splice(0, boxes.length, ...next.map((b) => b.clone().expandByScalar(MARGIN)));
  return () => {
    boxes.length = 0;
  };
}

const ray = new THREE.Ray();
const hit = new THREE.Vector3();

/**
 * If the camera is inside an obstacle, move it towards the target until it
 * is just out of it, and say so. A house between the camera and the plot is
 * left alone: that's an ordinary view, and the player can orbit past it.
 */
export function keepCameraOutside(camera: THREE.Vector3, target: THREE.Vector3): boolean {
  let moved = false;
  for (const box of boxes) {
    // a target panned into the box's margin would send the camera through it
    if (!box.containsPoint(camera) || box.containsPoint(target)) continue;
    ray.set(camera, target.clone().sub(camera).normalize());
    // from inside, the ray meets the box where it leaves it
    if (!ray.intersectBox(box, hit)) continue;
    camera.copy(hit).addScaledVector(ray.direction, 0.05);
    moved = true;
  }
  return moved;
}
