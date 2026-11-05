import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { plastic } from "./PartMesh.tsx";

// The editable plot, the same in every scene: a studded base plate the size
// of the template's bounds, with a low edge. Its invisible top face at y = 0
// is the only thing outside the build that the pointer can aim at.

const PLATE_COLOUR = "#d4d1ca";
const EDGE = "#ece6da";

/** A scene's plot surface: its colour, and how much 2×2 flagstones may vary in shade (0 = none). */
export interface PlotTone {
  colour: string;
  vary: number;
}

const flag = (x: number, z: number): number => {
  const s = Math.sin(Math.floor(x / 2) * 127.1 + Math.floor(z / 2) * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function Plot({ w, d, tone }: { w: number; d: number; tone?: PlotTone }) {
  const studs = useRef<THREE.InstancedMesh>(null);
  const colour = tone?.colour ?? PLATE_COLOUR;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        studs.current!.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.09, z + 0.5));
        if (tone?.vary) studs.current!.setColorAt(i, c.set("#ffffff").multiplyScalar(1 - tone.vary + flag(x, z) * tone.vary * 2));
        i++;
      }
    }
    studs.current!.instanceMatrix.needsUpdate = true;
    if (studs.current!.instanceColor) studs.current!.instanceColor.needsUpdate = true;
  }, [w, d, tone?.vary]);
  return (
    <group>
      <mesh position={[w / 2, -0.07, d / 2]} material={plastic(colour)} receiveShadow raycast={() => null}>
        <boxGeometry args={[w, 0.14, d]} />
      </mesh>
      <instancedMesh ref={studs} args={[undefined, plastic(colour), w * d]} receiveShadow castShadow raycast={() => null}>
        <cylinderGeometry args={[0.3, 0.3, 0.18, 14]} />
      </instancedMesh>
      {/* a low edge on three sides; the front stays open to the street or shore */}
      {(
        [
          [0.3, d + 0.3, -0.15, d / 2 - 0.15],
          [0.3, d + 0.3, w + 0.15, d / 2 - 0.15],
          [w + 0.6, 0.3, w / 2, -0.15],
        ] as const
      ).map(([sx, sz, x, z], i) => (
        <mesh key={i} position={[x, 0.0, z]} material={plastic(EDGE)} receiveShadow castShadow raycast={() => null}>
          <boxGeometry args={[sx, 0.3, sz]} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[w / 2, 0, d / 2]} userData={{ plot: true }}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
