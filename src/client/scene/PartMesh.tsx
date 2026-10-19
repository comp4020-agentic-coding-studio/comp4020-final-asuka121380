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

// Faded: a part above a low preview, drawn see-through (ADR 0005).
const see = new Map<string, THREE.MeshStandardMaterial>();
function seeThrough(hex: string): THREE.MeshStandardMaterial {
  let m = see.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.38, transparent: true, opacity: 0.22, depthWrite: false });
    see.set(hex, m);
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
  /** A preview (valid/invalid), an existing plan, or the Plan-mode preview of one (ADR 0011). */
  ghost?: "valid" | "invalid" | "plan" | "plan-preview";
  /** Selected (amber), the delete tool's target (red), or a plan (blue): an outline plus a tint over the part. */
  highlight?: "select" | "delete" | "plan" | "marked";
  castShadow?: boolean;
  /** Scenery: drawn, never picked. */
  inert?: boolean;
  /** Drawn see-through; the pointer's hover looks through it (Workbench). */
  faded?: boolean;
  userData?: Record<string, unknown>;
}

const tint = {
  select: new THREE.MeshBasicMaterial({ color: "#f5a623", transparent: true, opacity: 0.22, depthWrite: false }),
  delete: new THREE.MeshBasicMaterial({ color: "#d0342c", transparent: true, opacity: 0.32, depthWrite: false }),
  plan: new THREE.MeshBasicMaterial({ color: "#1a5bb0", transparent: true, opacity: 0.16, depthWrite: false }),
  marked: new THREE.MeshBasicMaterial({ color: "#1a5bb0", transparent: true, opacity: 0.32, depthWrite: false }),
};

export function PartMesh({ placement, ghost, highlight, castShadow = true, inert, faded, userData }: Props) {
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
        // plans read as glassier than a real-part preview, with a blue cast
        opacity: ghost === "invalid" ? 0.3 : ghost === "plan" ? 0.42 : ghost === "plan-preview" ? 0.55 : 0.78,
        emissive: ghost === "invalid" ? "#7a1d14" : ghost === "valid" ? "#ffffff" : "#1a5bb0",
        emissiveIntensity: ghost === "invalid" ? 0.5 : ghost === "valid" ? 0.18 : 0.35,
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
              : faded
                ? seeThrough(piece.role === "main" ? colourHex(placement.colour) : piece.role)
                : piece.role === "main"
                ? plastic(colourHex(placement.colour))
                : piece.role === "#cfe6f2"
                  ? glassMaterial
                  : plastic(piece.role)
          }
          castShadow={!ghost && castShadow}
          receiveShadow={!ghost}
          userData={userData}
          raycast={inert ? () => null : undefined}
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
            color={
              ghost === "invalid" || highlight === "delete"
                ? "#c0392b"
                : highlight === "select"
                  ? "#e08a00"
                  : highlight === "plan" || highlight === "marked" || ghost === "plan" || ghost === "plan-preview"
                    ? "#1a5bb0"
                    : "#1b1b1b"
            }
            linewidth={1}
            transparent
            opacity={highlight === "marked" ? 1 : 0.9}
          />
        </lineSegments>
      )}
    </group>
  );
}
