import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import type { Placement } from "../../domain/rules.ts";
import { ENVIRONMENTS } from "../scenes/environments.tsx";
import { scene } from "../state/store.ts";
import { PartMesh } from "./PartMesh.tsx";
import { Plot } from "./Plot.tsx";

// A read-only view of a saved or published construction (ADR 0009): the
// same scenery and part rendering as the live editor, but with no store, no
// pointer handling and no placement — viewing never risks changing anything.
// Used for a collection item and a showcase entry.

function Surroundings() {
  const Env = ENVIRONMENTS[scene.id];
  return Env ? (
    <Suspense fallback={null}>
      <Env />
    </Suspense>
  ) : null;
}

export function SnapshotView({ parts }: { parts: readonly Placement[] }) {
  const centre = new THREE.Vector3(scene.bounds.w / 2, 4, scene.bounds.d / 2);
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.5, far: 1000, position: [centre.x + 16, centre.y + 14, centre.z + 22] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1 }}
    >
      <OrbitControls target={centre} minPolarAngle={0.05} maxPolarAngle={1.45} minDistance={10} maxDistance={70} enableDamping dampingFactor={0.12} />
      <Surroundings />
      <Plot />
      {parts.map((p, i) => (
        <PartMesh key={i} placement={p} />
      ))}
    </Canvas>
  );
}
