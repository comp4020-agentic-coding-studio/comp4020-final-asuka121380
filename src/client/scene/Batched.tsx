import { useMemo } from "react";
import * as THREE from "three";
import { plastic } from "./PartMesh.tsx";
import { GLASS, type Batch } from "./scenery.ts";

// Fixed scenery, drawn as one mesh per colour and never pickable. Glass and
// lit lanterns get their own materials; everything else is the parts' plastic.

export const LANTERN = "#ffd9a0";
const glass = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.4 });
const lantern = new THREE.MeshStandardMaterial({ color: LANTERN, emissive: "#ffc670", emissiveIntensity: 0.6 });

export function Batched({ batch, shadows = true }: { batch: () => Batch; shadows?: boolean }) {
  const meshes = useMemo(() => batch().build(), [batch]);
  return (
    <>
      {meshes.map(({ colour, geometry }) => (
        <mesh
          key={colour}
          geometry={geometry}
          material={colour === GLASS ? glass : colour === LANTERN ? lantern : plastic(colour)}
          castShadow={shadows}
          receiveShadow
          raycast={() => null}
        />
      ))}
    </>
  );
}
