import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
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

/**
 * How a see-through part is drawn. Real-part preview: `valid`/`invalid`.
 * Plans (ADR 0011/0012): `plan` (standing, subdued blue), `plan-bad` (a plan
 * that now conflicts or floats, dashed-red cast), `plan-preview` (the held
 * Plan-mode preview, a brighter blue). An invalid preview of either kind is
 * `invalid`.
 */
type Ghost = "valid" | "invalid" | "plan" | "plan-bad" | "plan-preview";

interface Props {
  placement: Placement;
  ghost?: Ghost;
  /**
   * Selected (amber), the delete tool's target (red), a selected plan (cyan,
   * with a doubled outline and a stronger surface), or a plan someone marked
   * (blue): an outline plus a tint over the part.
   */
  highlight?: "select" | "delete" | "plan" | "marked";
  /**
   * performance.now() when this part was committed, to play the short drop
   * into place (Workbench decides when). Visual only: the part's real
   * position is already final for every rule and command.
   */
  dropAt?: number;
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
  // a selected plan: a clearly brighter cyan body over the subdued blue, never opaque
  plan: new THREE.MeshBasicMaterial({ color: "#2ee6ff", transparent: true, opacity: 0.42, depthWrite: false }),
  marked: new THREE.MeshBasicMaterial({ color: "#7b5cff", transparent: true, opacity: 0.3, depthWrite: false }),
};

const GHOST_STYLE: Record<Ghost, { opacity: number; emissive: string; intensity: number }> = {
  valid: { opacity: 0.78, emissive: "#ffffff", intensity: 0.18 },
  invalid: { opacity: 0.3, emissive: "#7a1d14", intensity: 0.5 },
  plan: { opacity: 0.32, emissive: "#1a5bb0", intensity: 0.45 },
  "plan-bad": { opacity: 0.28, emissive: "#9b1c14", intensity: 0.5 },
  "plan-preview": { opacity: 0.55, emissive: "#1f7fe0", intensity: 0.4 },
};

const EDGE: Record<string, string> = {
  invalid: "#c0392b",
  "plan-bad": "#d0342c",
  delete: "#c0392b",
  select: "#e08a00",
  plan: "#00e0ff",
  marked: "#7b5cff",
  "plan-ghost": "#2a6fc4",
  "plan-preview": "#1f7fe0",
  default: "#1b1b1b",
};

// `?debug` only: the lift each animating part was drawn at, frame by frame, so browser tests can see the drop happened (and ended at rest)
const DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");
function recordDrop(id: string, y: number): void {
  const w = window as unknown as { __drops?: Record<string, number[]> };
  (w.__drops ??= {})[id] = [...(w.__drops[id] ?? []), y];
}

/** Half a plate of travel, ~180 ms, ease-out, no bounce (ADR 0012); skipped for reduced motion by Workbench. */
const DROP = { from: 0.2, ms: 180 };
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

export function PartMesh({ placement, ghost, highlight, castShadow = true, inert, faded, userData, dropAt }: Props) {
  const def = partDef(placement.partId)!;
  const { pieces } = partGeometry(def);
  const { position, rotationY } = partTransform(placement);
  const outline = outlineGeometry(def);
  const selectedPlan = highlight === "plan";
  const ghostMaterial = useMemo(() => {
    if (!ghost) return null;
    const st = GHOST_STYLE[ghost];
    return new THREE.MeshStandardMaterial({
      color: colourHex(placement.colour),
      transparent: true,
      // a selected plan's surface is a touch more solid, never as solid as a real part
      opacity: selectedPlan ? Math.min(0.5, st.opacity + 0.14) : st.opacity,
      emissive: st.emissive,
      emissiveIntensity: st.intensity,
      depthWrite: false,
    });
  }, [ghost, placement.colour, selectedPlan]);
  const edge = EDGE[ghost === "invalid" || ghost === "plan-bad" ? ghost : (highlight ?? (ghost === "plan" ? "plan-ghost" : ghost === "plan-preview" ? "plan-preview" : "default"))];

  // the drop: only this group's local y moves, for a few frames, then rests at 0
  const lift = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = lift.current;
    if (!g || dropAt === undefined) return;
    const t = Math.min(1, (performance.now() - dropAt) / DROP.ms);
    const y = t >= 1 ? 0 : DROP.from * (1 - easeOut(t));
    if (g.position.y !== y) {
      g.position.y = y;
      if (DEBUG) recordDrop(String(userData?.placedId ?? ""), y);
    }
  });

  return (
    <group position={position} rotation-y={rotationY} userData={userData}>
      <group ref={lift} position-y={dropAt !== undefined && performance.now() - dropAt < DROP.ms ? DROP.from : 0}>
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
          <lineBasicMaterial color={edge} linewidth={1} transparent opacity={selectedPlan || highlight === "marked" ? 1 : ghost === "plan" ? 0.7 : 0.9} depthTest={!selectedPlan} />
        </lineSegments>
      )}
      {/* WebGL lines are one pixel wide: a selected plan gets two more, slightly larger outlines, so its edge reads as a thick cyan band through anything in front */}
      {selectedPlan &&
        [0.06, 0.12].map((g, i) => (
          <lineSegments
            key={g}
            geometry={outline}
            raycast={() => null}
            renderOrder={4 + i}
            scale={[1 + (2 * g) / def.w, 1 + (2 * g) / (def.h * PLATE), 1 + (2 * g) / def.d]}
            position-y={-g}
          >
            <lineBasicMaterial color={i === 0 ? "#ffffff" : "#00d8ff"} linewidth={1} transparent opacity={1} depthTest={false} />
          </lineSegments>
        ))}
      </group>
    </group>
  );
}
