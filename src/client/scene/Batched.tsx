import { useMemo } from "react";
import * as THREE from "three";
import { plastic } from "./PartMesh.tsx";
import { buildColoured, GLASS, type Batch } from "./scenery.ts";

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

// The parts' plastic, with the colour from each vertex: the same look as
// `plastic(colour)` for every shade at once.
const vertexPlastic = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.38, metalness: 0 });

/** A batch of many shades as one mesh: one draw call instead of one per colour (ADR 0016). */
export function BatchedColoured({ batch, shadows = true }: { batch: () => Batch; shadows?: boolean }) {
  const geometry = useMemo(() => buildColoured(batch()), [batch]);
  return <mesh geometry={geometry} material={vertexPlastic} castShadow={shadows} receiveShadow raycast={() => null} />;
}
