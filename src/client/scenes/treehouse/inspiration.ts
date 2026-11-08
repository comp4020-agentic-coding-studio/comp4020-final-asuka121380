import * as THREE from "three";
import { PLATE } from "../../scene/geometry.ts";
import { plastic } from "../../scene/PartMesh.tsx";
import type { Batch } from "../../scene/scenery.ts";
import { canopyBatch, PIECES, treeBatch } from "./tree.ts";

// What the inspiration picture shows round the reference build (ADR 0016):
// the scene's own fixed tree, from the same geometry and coordinates the
// editor draws, and a thinned canopy that only hints at the crown above, so
// the cabins can be seen standing on their platforms. Picture only: none of
// it is in the build, the kit or the saved parts.

function meshes(b: Batch): THREE.Group {
  const g = new THREE.Group();
  for (const { colour, geometry } of b.build()) g.add(new THREE.Mesh(geometry, plastic(colour)));
  return g;
}

export function inspirationContext(): { subject: THREE.Group; frame: THREE.Box3 } {
  const subject = new THREE.Group();
  subject.add(meshes(treeBatch()));
  subject.add(meshes(canopyBatch(0.3)));
  // frame the tree to a little above the plot's ceiling: enough crown to be
  // recognised, no more, so the leaves never crowd the cabins
  const top = Math.max(...PIECES.map((f) => (f.y + f.h) * PLATE));
  const frame = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(32, top + 4, 28));
  return { subject, frame };
}
