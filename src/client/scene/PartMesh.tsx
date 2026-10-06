import { useMemo } from "react";
import * as THREE from "three";
import { partDef } from "../../domain/catalog.ts";
import { colourHex } from "../../domain/colours.ts";
import { rotatedSize } from "../../domain/grid.ts";
import type { Placement } from "../../domain/rules.ts";
import { outlineGeometry, partGeometry, PLATE } from "./geometry.ts";

// Shared materials: one per colour, so a street of parts costs a handful.
const solid = new Map<string, THREE.MeshStandardMaterial>();
export function plastic(hex: string): THREE.MeshStandardMaterial {
  let m = solid.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.38, metalness: 0 });
    solid.set(hex, m);
  }
  return m;
}

const glassMaterial = new THREE.MeshStandardMaterial({ color: "#cfe6f2", roughness: 0.1, metalness: 0, transparent: true, opacity: 0.7 });

/** Where a part's centred geometry goes in the world. */
export function partTransform(p: Placement): { position: [number, number, number]; rotationY: number } {
  const def = partDef(p.partId)!;
  const s = rotatedSize(def, p.rot);
  return { position: [p.x + s.w / 2, p.y * PLATE, p.z + s.d / 2], rotationY: (p.rot * Math.PI) / 2 };
}

interface Props {
  placement: Placement;
  ghost?: "valid" | "invalid";
  /** Selected (amber) or the delete tool's target (red): an outline plus a tint over the part. */
  highlight?: "select" | "delete";
  castShadow?: boolean;
  /** Scenery: drawn, never picked. */
  inert?: boolean;
  userData?: Record<string, unknown>;
}

const tint = {
  select: new THREE.MeshBasicMaterial({ color: "#f5a623", transparent: true, opacity: 0.22, depthWrite: false }),
  delete: new THREE.MeshBasicMaterial({ color: "#d0342c", transparent: true, opacity: 0.32, depthWrite: false }),
};

export function PartMesh({ placement, ghost, highlight, castShadow = true, inert, userData }: Props) {
  const def = partDef(placement.partId)!;
  const { pieces } = partGeometry(def);
  const { position, rotationY } = partTransform(placement);
  const outline = outlineGeometry(def);
  const ghostMaterial = useMemo(
    () =>
      ghost &&
      new THREE.MeshStandardMaterial({
        color: colourHex(placement.colour),
        transparent: true,
        opacity: ghost === "invalid" ? 0.3 : 0.78,
        emissive: ghost === "invalid" ? "#7a1d14" : "#ffffff",
        emissiveIntensity: ghost === "invalid" ? 0.5 : 0.18,
        depthWrite: false,
      }),
    [ghost, placement.colour],
  );

  return (
    <group position={position} rotation-y={rotationY} userData={userData}>
      {pieces.map((piece, i) => (
        <mesh
          key={i}
          geometry={piece.geometry}
          material={
            ghostMaterial
              ? ghostMaterial
              : piece.role === "main"
                ? plastic(colourHex(placement.colour))
                : piece.role === "#cfe6f2"
                  ? glassMaterial
                  : plastic(piece.role)
          }
          castShadow={!ghost && castShadow}
          receiveShadow={!ghost}
          userData={userData}
          raycast={ghost || inert ? () => null : undefined}
        />
      ))}
      {highlight && (
        <mesh material={tint[highlight]} raycast={() => null} position-y={(def.h * PLATE) / 2} renderOrder={2}>
          <boxGeometry args={[def.w + 0.06, def.h * PLATE + 0.06, def.d + 0.06]} />
        </mesh>
      )}
      {(ghost || highlight) && (
        <lineSegments geometry={outline} raycast={() => null} renderOrder={3}>
          <lineBasicMaterial
            color={ghost === "invalid" || highlight === "delete" ? "#c0392b" : highlight === "select" ? "#e08a00" : "#1b1b1b"}
            linewidth={1}
            transparent
            opacity={0.9}
          />
        </lineSegments>
      )}
    </group>
  );
}
