import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { partDef } from "../../domain/catalog.ts";
import {
  aimAt,
  getState,
  placeHeld,
  preview,
  remove,
  scene,
  select,
  setTarget,
  useApp,
} from "../state/store.ts";
import { PLATE } from "./geometry.ts";
import { PartMesh } from "./PartMesh.tsx";
import { Street } from "./Street.tsx";

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
      // straight down over whatever the camera is looking at; the polar
      // limit keeps it a hair off vertical so orbiting still works
      cam.position.set(c.target.x, c.target.y + dist, c.target.z + 0.01);
    }
    c.update();
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
    // a world point to page pixels, so the browser tests can click a stud
    (window as unknown as { __project: (x: number, y: number, z: number) => { x: number; y: number } }).__project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
  }, [camera, dock, size.width, size.height]);

  // pan stays near the plot: move target and camera together back inside
  const clampPan = () => {
    const c = controls.current;
    if (!c) return;
    const clamped = c.target.clone().clamp(PAN_MIN, PAN_MAX);
    if (clamped.equals(c.target)) return;
    const d = clamped.sub(c.target);
    c.target.add(d);
    camera.position.add(d);
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

/** The grid column a pointer is aiming at: on a top face, that column; on a side face, the one in front of it. */
function aimedCell(e: ThreeEvent<PointerEvent | MouseEvent>): { x: number; z: number } | null {
  if (!e.face) return null;
  const normal = e.face.normal.clone().transformDirection(e.object.matrixWorld);
  const p = e.point.clone();
  if (normal.y > 0.5) p.addScaledVector(normal, -0.01);
  else p.addScaledVector(normal, 0.5);
  const x = Math.floor(p.x);
  const z = Math.floor(p.z);
  if (x < 0 || z < 0 || x >= scene.bounds.w || z >= scene.bounds.d) return null;
  return { x, z };
}

const placedIdOf = (e: ThreeEvent<PointerEvent | MouseEvent>): string | null =>
  (e.object.userData.placedId as string | undefined) ?? null;

function Build({ isDrag }: { isDrag: (e: MouseEvent) => boolean }) {
  const snapshot = useApp((s) => s.snapshot);
  const held = useApp((s) => s.held);
  const colour = useApp((s) => s.colour);
  const selectedId = useApp((s) => s.selectedId);
  const deleting = useApp((s) => s.deleting);
  const targetId = useApp((s) => s.targetId);
  // preview() reads only these
  const pv = useMemo(() => preview(getState()), [held, colour, snapshot]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== "mouse") return;
    e.stopPropagation();
    const s = getState();
    if (s.held) {
      const cell = aimedCell(e);
      if (cell && (cell.x !== s.held.anchor?.x || cell.z !== s.held.anchor?.z)) aimAt(cell);
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
      // clicking placed parts while holding one aims through them, by the placement rules
      const cell = aimedCell(e);
      if (!cell) return;
      // touch has no hover: the first tap previews, a second tap on the preview places
      const shown = touch ? preview(s)?.placement : undefined;
      const def = shown && partDef(shown.partId);
      const onPreview =
        !!shown && !!def && cell.x >= shown.x && cell.x < shown.x + (shown.rot % 2 ? def.d : def.w) && cell.z >= shown.z && cell.z < shown.z + (shown.rot % 2 ? def.w : def.d);
      if (touch && onPreview) {
        void placeHeld();
        return;
      }
      aimAt(cell);
      if (!touch) void placeHeld();
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
      <Street />
      {snapshot?.parts.map((p) => (
        <PartMesh
          key={p.id}
          placement={p}
          highlight={deleting && p.id === targetId ? "delete" : !held && !deleting && p.id === selectedId ? "select" : undefined}
          userData={{ placedId: p.id }}
        />
      ))}
      {pv && (
        <>
          <PartMesh placement={pv.placement} ghost={pv.rejection ? "invalid" : "valid"} />
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

function Sun() {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(PLOT_CENTRE.x, 0, PLOT_CENTRE.z);
    return o;
  }, []);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={[PLOT_CENTRE.x - 26, 34, PLOT_CENTRE.z + 22]}
        target={target}
        intensity={2.6}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
    </>
  );
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
      shadows
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.5, far: 900, position: [20, 26, 40] }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
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
      <Sun />
      <Build isDrag={isDrag} />
    </Canvas>
  );
}
