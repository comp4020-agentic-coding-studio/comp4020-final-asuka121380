import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { partDef } from "../../domain/catalog.ts";
import { footprint } from "../../domain/rules.ts";
import {
  aimAt,
  getState,
  onFootprint,
  placeHeld,
  preview,
  remove,
  scene,
  select,
  setTarget,
  useApp,
} from "../state/store.ts";
import { setViewAzimuth } from "../state/view.ts";
import { PLATE } from "./geometry.ts";
import { PartMesh } from "./PartMesh.tsx";
import { ENVIRONMENTS } from "../scenes/environments.tsx";
import { keepCameraOutside } from "./obstacles.ts";
import { Plot } from "./Plot.tsx";

// The 3D workbench: camera, light, the street and the player's parts, and the
// pointer path into the same store actions the dock and the keyboard use.
//
// Camera (ADR 0003): perspective, free 360° orbit, down to a near top view,
// never below ground, zoom and pan bounded around the plot.
// Gestures: mouse left-drag orbits, right-drag or shift-drag pans, wheel
// zooms; on a trackpad click-drag orbits and two-finger scroll zooms; on
// touch one finger orbits, two fingers pinch and pan. A press that moves more
// than a few pixels is a camera drag and never edits on release.

const PLOT_CENTRE = new THREE.Vector3(scene.bounds.w / 2, 4, scene.bounds.d / 2);
const PAN_MIN = new THREE.Vector3(-6, 0, -5);
const PAN_MAX = new THREE.Vector3(scene.bounds.w + 6, 8, scene.bounds.d + 6);
// low enough that a strip of horizon shows above the street
const DEFAULT_POLAR = 1.32;
const DEFAULT_AZIMUTH = 0.2;
const MIN_DISTANCE = 14;
const MAX_DISTANCE = 95;
// where the orbit target sits in the screen above the dock, from the top:
// below the middle, leaving headroom for roofs and the horizon
const TARGET_AT = 0.6;
// what the opening view frames around the target: the plot's width, a
// two-storey house above (the reference house tops out near 12 units), and
// the plot's front edge below
const FRAME = { across: 12, above: 11, below: 6 };
const DRAG_PX = { mouse: 6, pen: 6, touch: 10 } as const;

/** The angles from the orbit target to the edges of the screen the dock leaves clear. */
function viewAngles(camera: THREE.PerspectiveCamera, width: number, height: number, dock: number) {
  const focal = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const targetY = TARGET_AT * (height - dock);
  return {
    across: Math.atan(width / 2 / focal),
    above: Math.atan(targetY / focal),
    below: Math.atan((height - dock - targetY) / focal),
    // pixels to shift the lens down so the target lands at targetY
    offsetY: height / 2 - targetY,
  };
}

function fitDistance(camera: THREE.PerspectiveCamera, width: number, height: number, dock: number, top: boolean): number {
  const a = viewAngles(camera, width, height, dock);
  // seen from above the plot is 8 deep on screen and sits a target-height below
  const d = top
    ? Math.max(FRAME.across / Math.tan(a.across), 5 / Math.tan(Math.min(a.above, a.below))) + PLOT_CENTRE.y
    : Math.max(FRAME.across / Math.tan(a.across), FRAME.above / Math.tan(a.above), FRAME.below / Math.tan(a.below));
  return THREE.MathUtils.clamp(d, 24, MAX_DISTANCE);
}

function CameraRig({ dock }: { dock: number }) {
  const { camera, size } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const request = useApp((s) => s.camera);

  // put the target in the part of the screen the dock doesn't cover, by
  // shifting the lens; the lens itself stays the same size
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const { offsetY } = viewAngles(cam, size.width, size.height, dock);
    cam.setViewOffset(size.width, size.height, 0, offsetY, size.width, size.height);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, dock]);

  // only a request moves the camera; a resize doesn't. The one exception is
  // the dock's first measurement, which refits the opening view.
  const measured = dock > 0;
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const c = controls.current;
    if (!c) return;
    const dist = fitDistance(cam, size.width, size.height, dock, request.kind === "top");
    if (request.kind === "reset") {
      c.target.copy(PLOT_CENTRE);
      cam.position.copy(PLOT_CENTRE).add(new THREE.Vector3().setFromSphericalCoords(dist, DEFAULT_POLAR, DEFAULT_AZIMUTH));
    } else {
      // straight down over whatever the camera is looking at, keeping the
      // heading, so "up" on screen means the same as before (ADR 0005); the
      // polar limit keeps it a hair off vertical so orbiting still works
      cam.position.copy(c.target).add(new THREE.Vector3().setFromSphericalCoords(dist, 0.02, c.getAzimuthalAngle()));
    }
    c.update();
    setViewAzimuth(c.getAzimuthalAngle());
  }, [request.n, measured]);

  // `?debug` lets the browser tests read the camera; it changes nothing
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("debug")) return;
    (window as unknown as { __camera: () => object }).__camera = () => {
      const c = controls.current;
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c?.target ?? PLOT_CENTRE));
      return {
        position: camera.position.toArray(),
        target: c?.target.toArray(),
        distance: s.radius,
        polar: s.phi,
        azimuth: s.theta,
        dock,
        size: [size.width, size.height],
      };
    };
    // put the camera at an azimuth and polar angle round the plot, so the
    // browser tests can check screen-relative moves from every side; it
    // moves the view only, never the build
    (window as unknown as { __orbit: (azimuth: number, polar: number) => void }).__orbit = (azimuth, polar) => {
      const c = controls.current;
      if (!c) return;
      const dist = camera.position.distanceTo(c.target);
      camera.position.copy(c.target).add(new THREE.Vector3().setFromSphericalCoords(dist, polar, azimuth));
      keepCameraOutside(camera.position, c.target);
      c.update();
      setViewAzimuth(c.getAzimuthalAngle());
    };
    // a world point to page pixels, so the browser tests can click a stud
    (window as unknown as { __project: (x: number, y: number, z: number) => { x: number; y: number } }).__project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
  }, [camera, dock, size.width, size.height]);

  // pan stays near the plot: move target and camera together back inside;
  // the camera never ends up inside a neighbour's house; and the heading is
  // reported for the screen-relative arrow keys
  const clampPan = () => {
    const c = controls.current;
    if (!c) return;
    setViewAzimuth(c.getAzimuthalAngle());
    const clamped = c.target.clone().clamp(PAN_MIN, PAN_MAX);
    if (!clamped.equals(c.target)) {
      const d = clamped.sub(c.target);
      c.target.add(d);
      camera.position.add(d);
    }
    keepCameraOutside(camera.position, c.target);
  };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={PLOT_CENTRE}
      enableDamping
      dampingFactor={0.12}
      minPolarAngle={0.02}
      maxPolarAngle={1.36}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      screenSpacePanning={false}
      onChange={clampPan}
    />
  );
}

const placedIdOf = (e: ThreeEvent<PointerEvent | MouseEvent>): string | null =>
  (e.object.userData.placedId as string | undefined) ?? null;

interface Aim {
  cell: { x: number; z: number };
  /** The height, in plates, of the surface the pointer is on. */
  level: number;
  /** A side face's height is approximate: it may drop to a level that fits. */
  snap: boolean;
}

/**
 * What the pointer is aiming at, surface and all (ADR 0005): on the plot,
 * that cell at height 0; on a part's top face, that cell at the part's top;
 * on a side face, the cell in front of it at the plate level it was hit.
 */
function aimOf(e: ThreeEvent<PointerEvent | MouseEvent>): Aim | null {
  if (!e.face) return null;
  const normal = e.face.normal.clone().transformDirection(e.object.matrixWorld);
  const p = e.point.clone();
  let level: number;
  const side = normal.y <= 0.5;
  if (!side) {
    p.addScaledVector(normal, -0.01);
    const placed = getState().snapshot?.parts.find((q) => q.id === placedIdOf(e));
    level = placed ? placed.y + partDef(placed.partId)!.h : 0;
  } else {
    p.addScaledVector(normal, 0.5);
    level = Math.max(0, Math.floor(e.point.y / PLATE + 1e-6));
  }
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  if (x < 0 || z < 0 || x >= scene.bounds.w || z >= scene.bounds.d) return null;
  return { cell: { x, z }, level, snap: side };
}

const aimKey = (a: Aim): string => `${a.cell.x},${a.cell.z},${a.level}`;

function Build({ isDrag }: { isDrag: (e: MouseEvent) => boolean }) {
  const snapshot = useApp((s) => s.snapshot);
  const held = useApp((s) => s.held);
  const colour = useApp((s) => s.colour);
  const selectedId = useApp((s) => s.selectedId);
  const deleting = useApp((s) => s.deleting);
  const targetId = useApp((s) => s.targetId);
  // preview() reads only these
  const pv = useMemo(() => preview(getState()), [held, colour, snapshot]);
  // the last surface the mouse aimed at: the preview only re-aims when the
  // pointer moves to another one, so jiggling the mouse never undoes a
  // height chosen with Higher/Lower
  const lastAim = useRef<string | null>(null);
  const heldPart = held?.partId;
  useEffect(() => {
    lastAim.current = null;
  }, [heldPart]);

  // parts above a low preview are faded, and hover looks through them to the
  // surfaces beneath; nothing about them changes (ADR 0005)
  const faded = useMemo(() => {
    const out = new Set<string>();
    if (!pv || !snapshot) return out;
    const def = partDef(pv.placement.partId)!;
    const top = pv.placement.y + def.h;
    const near = footprint(def, pv.placement);
    for (const q of snapshot.parts) {
      if (q.y < top) continue;
      const qd = partDef(q.partId)!;
      if (footprint(qd, q).some((c) => near.some((n) => Math.abs(n.x - c.x) <= 1 && Math.abs(n.z - c.z) <= 1))) out.add(q.id);
    }
    return out;
  }, [pv, snapshot]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== "mouse") return;
    // hover looks through the preview itself and through faded parts: without
    // stopPropagation, the next thing along the ray gets this event
    if (e.object.userData.ghost || e.object.userData.faded) return;
    e.stopPropagation();
    const s = getState();
    if (s.held) {
      const aim = aimOf(e);
      if (aim && aimKey(aim) !== lastAim.current) {
        lastAim.current = aimKey(aim);
        aimAt(aim.cell, aim.level, aim.snap);
      }
    } else if (s.deleting) {
      setTarget(placedIdOf(e));
    }
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isDrag(e.nativeEvent)) return;
    const s = getState();
    const touch = (e.nativeEvent as PointerEvent).pointerType !== "mouse";
    if (s.held) {
      // A click or tap inside the preview's footprint commits exactly the
      // preview on screen, never re-aimed (ADR 0005). Anywhere else it only
      // aims. With a mouse, hover has already put the preview under the
      // pointer, so one click places; a finger has no hover, so its first
      // tap previews and a second tap on the preview places.
      if (e.object.userData.ghost) {
        void placeHeld();
        return;
      }
      const aim = aimOf(e);
      if (!aim) return;
      const shown = preview(s)?.placement;
      if (shown && onFootprint(shown, aim.cell)) {
        void placeHeld();
        return;
      }
      lastAim.current = aimKey(aim);
      aimAt(aim.cell, aim.level, aim.snap);
      return;
    }
    const id = placedIdOf(e);
    if (s.deleting) {
      // likewise, the first tap names the target and the second removes it
      if (!id) setTarget(null);
      else if (!touch || s.targetId === id) void remove(id);
      else setTarget(id);
      return;
    }
    select(id);
  };

  return (
    <group onPointerMove={onMove} onClick={onClick}>
      <Plot />
      {snapshot?.parts.map((p) => (
        <PartMesh
          key={p.id}
          placement={p}
          highlight={deleting && p.id === targetId ? "delete" : !held && !deleting && p.id === selectedId ? "select" : undefined}
          faded={faded.has(p.id)}
          userData={{ placedId: p.id, faded: faded.has(p.id) }}
        />
      ))}
      {pv && (
        <>
          <PartMesh placement={pv.placement} ghost={pv.rejection ? "invalid" : "valid"} userData={{ ghost: true }} />
          <GhostLabel placement={pv.placement} ok={!pv.rejection} />
        </>
      )}
    </group>
  );
}

// A label over the preview, so fit / no fit is said in words, not just colour.
function GhostLabel({ placement: p, ok }: { placement: { partId: string; x: number; y: number; z: number; rot: number }; ok: boolean }) {
  const def = partDef(p.partId)!;
  const w = p.rot % 2 === 0 ? def.w : def.d;
  const d = p.rot % 2 === 0 ? def.d : def.w;
  return (
    <Html position={[p.x + w / 2, (p.y + def.h) * PLATE + 0.7, p.z + d / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <span className={`ghost-label${ok ? "" : " bad"}`}>{ok ? "✓ Fits" : "✕ Can't place"}</span>
    </Html>
  );
}

/** The scene's surroundings and light, from the scene registry. */
function Surroundings() {
  const Env = ENVIRONMENTS[scene.id];
  return Env ? (
    <Suspense fallback={null}>
      <Env />
    </Suspense>
  ) : null;
}

export function Workbench({ dock }: { dock: number }) {
  const down = useRef<{ x: number; y: number; type: string } | null>(null);
  const isDrag = (e: MouseEvent): boolean => {
    const d = down.current;
    if (!d) return false;
    const limit = DRAG_PX[d.type as keyof typeof DRAG_PX] ?? 6;
    return Math.hypot(e.clientX - d.x, e.clientY - d.y) > limit;
  };

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.5, far: 1000, position: [20, 26, 40] }}
      // neutral tone mapping keeps saturated colours recognisable (ADR 0004)
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1 }}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY, type: e.pointerType };
      }}
      // a hovered target clears when the mouse leaves; a finger "leaves" after
      // every tap, which would wipe the target the first tap named
      onPointerLeave={(e) => e.pointerType === "mouse" && getState().deleting && setTarget(null)}
      onPointerMissed={(e) => {
        const s = getState();
        if (!isDrag(e) && !s.held && !s.deleting) select(null);
      }}
    >
      <CameraRig dock={dock} />
      <Surroundings />
      <Build isDrag={isDrag} />
    </Canvas>
  );
}
