import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import { partDef } from "../../domain/catalog.ts";
import { rotatedSize } from "../../domain/grid.ts";
import { footprint } from "../../domain/rules.ts";
import {
  aimAt,
  commitHeld,
  focusTarget,
  getState,
  onFootprint,
  planFitsNow,
  preview,
  deleteObject,
  scene,
  select,
  selectPlan,
  restoreHeld,
  setTarget,
  useApp,
  type Held,
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
// Camera (ADR 0003, remapped by ADR 0012): perspective, free 360° orbit about
// a movable observation centre, down to a near top view, never below ground,
// zoom and pan bounded around the plot. Mouse: left is building only; right
// drag orbits, Shift+right or middle drag pans, the wheel zooms towards the
// centre. The Orbit/Pan tools give a left drag those jobs instead. Touch:
// one finger orbits, two fingers pan and pinch. A press that moves more than
// a few pixels is a camera drag and never edits on release.

const PLOT_CENTRE = new THREE.Vector3(scene.bounds.w / 2, 4, scene.bounds.d / 2);
// the observation centre may go a margin past the plot and up the tallest build
const PAN_MIN = new THREE.Vector3(-4, 0, -4);
const PAN_MAX = new THREE.Vector3(scene.bounds.w + 4, (scene.bounds.h * 0.4) + 2, scene.bounds.d + 4);
// low enough that a strip of horizon shows above the street
const DEFAULT_POLAR = 1.32;
const DEFAULT_AZIMUTH = 0.2;
const MIN_DISTANCE = 6;
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
  const navTool = useApp((s) => s.navTool);

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
    } else if (request.kind === "focus") {
      // frame the selection from the current heading and pitch, a little
      // tighter than the part's size needs, and make it the new centre
      const p = focusTarget();
      if (!p) return;
      const def = partDef(p.partId)!;
      const sz = rotatedSize(def, p.rot);
      const centre = new THREE.Vector3(p.x + sz.w / 2, (p.y + def.h / 2) * PLATE, p.z + sz.d / 2).clamp(PAN_MIN, PAN_MAX);
      const radius = Math.max(sz.w, sz.d, def.h * PLATE);
      const near = THREE.MathUtils.clamp(radius * 3.2 + 6, MIN_DISTANCE + 1, 30);
      const from = new THREE.Spherical().setFromVector3(cam.position.clone().sub(c.target));
      c.target.copy(centre);
      cam.position.copy(centre).add(new THREE.Vector3().setFromSphericalCoords(near, THREE.MathUtils.clamp(from.phi, 0.35, 1.25), from.theta));
      keepCameraOutside(cam.position, c.target);
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
    // let the damping settle at once, so a test can read the camera right after a gesture
    (window as unknown as { __settleCamera: () => void }).__settleCamera = () => {
      for (let i = 0; i < 60; i++) controls.current?.update();
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

  // left is the builder's button unless a navigation tool claims it
  const mouseButtons = {
    LEFT: navTool === "orbit" ? THREE.MOUSE.ROTATE : navTool === "pan" ? THREE.MOUSE.PAN : (-1 as THREE.MOUSE),
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE, // Shift+right pans: OrbitControls swaps ROTATE to PAN under Shift
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
      // pans across the ground and up/down with the view, so taller builds can be inspected
      screenSpacePanning
      mouseButtons={mouseButtons}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      onChange={clampPan}
    />
  );
}

const placedIdOf = (e: ThreeEvent<PointerEvent | MouseEvent>): string | null =>
  (e.object.userData.placedId as string | undefined) ?? null;
const planIdOf = (e: ThreeEvent<PointerEvent | MouseEvent>): string | null => (e.object.userData.planId as string | undefined) ?? null;

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
    const s = getState().snapshot;
    // a plan's top is a surface too, but only Plan mode ever aims at one (onMove/onClick)
    const placed = s?.parts.find((q) => q.id === placedIdOf(e)) ?? s?.plans.find((q) => q.id === planIdOf(e));
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

/**
 * While holding a part in Build mode, the pointer looks through plans to the
 * real surface behind them: a plan never blocks real building (ADR 0009). In
 * Plan mode a plan's surface is aimable, so a roof can be planned on a
 * planned wall (ADR 0011).
 */
const seeThroughPlan = (e: ThreeEvent<PointerEvent | MouseEvent>): boolean => {
  const s = getState();
  return !!s.held && s.mode === "build" && !!planIdOf(e);
};

/** A pointer that stays within REST_PX of where it aimed for REST_MS has paused there deliberately. */
const REST_MS = 120;
const REST_PX = 6;

function Build({ isDrag, pressed }: { isDrag: (e: MouseEvent) => boolean; pressed: () => boolean }) {
  const snapshot = useApp((s) => s.snapshot);
  const drops = useApp((s) => s.drops);
  const navTool = useApp((s) => s.navTool);
  const held = useApp((s) => s.held);
  const mode = useApp((s) => s.mode);
  const colour = useApp((s) => s.colour);
  const selectedId = useApp((s) => s.selectedId);
  const selectedPlanId = useApp((s) => s.selectedPlanId);
  const marks = useApp((s) => s.marks);
  // a mark fades after 6s (ADR 0009); this forces a re-render so it actually
  // disappears on screen rather than only on the next unrelated state change
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (Object.keys(marks).length === 0) return;
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [marks]);
  const deleting = useApp((s) => s.deleting);
  const targetId = useApp((s) => s.targetId);
  // preview() reads only these
  const pv = useMemo(() => preview(getState()), [held, colour, snapshot, mode]);
  const fits = useMemo(() => planFitsNow(getState()), [snapshot]);
  const planning = mode === "plan";
  // the last surface the mouse aimed at: the preview only re-aims when the
  // pointer moves to another one, so jiggling the mouse never undoes a
  // height chosen with Higher/Lower
  const lastAim = useRef<string | null>(null);
  const heldPart = held?.partId;
  useEffect(() => {
    lastAim.current = null;
  }, [heldPart, navTool]);

  // Where the hovering preview has been, with times. Reaching for a dock or
  // header control crosses the exposed scene, which re-aims the preview on
  // the way; when the pointer arrives on a control, the preview goes back to
  // where it last rested, so the control acts on what the player was
  // looking at, not on wherever the pointer happened to cross.
  // Where the hovering preview has been. Reaching for a dock or header
  // control usually sweeps across the exposed scene, re-aiming the preview
  // on the way. When the pointer arrives on a control, the preview goes back
  // to the last spot the pointer actually paused on (or to where it stood
  // before the hover began), so the control acts on what the player was
  // looking at. A spot counts as paused on once the pointer stayed within
  // REST_PX of it for REST_MS; a sweep never does.
  // `seed`: the preview as set by keys, buttons, a commit or an earlier trip.
  type Spot = { held: Held; x: number; y: number; at: number; leftAt: number | null; seed?: boolean };
  const trail = useRef<Spot[]>([]);
  const fromHover = useRef<Held | null>(null);
  const seed = (h: Held | null): void => {
    trail.current = h?.anchor ? [{ held: h, x: NaN, y: NaN, at: performance.now(), leftAt: null, seed: true }] : [];
  };
  useEffect(() => {
    if (!held || held === fromHover.current) return;
    seed(held);
  }, [held]);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const last = trail.current[trail.current.length - 1];
      if (last && !last.seed && last.leftAt === null && Math.hypot(e.clientX - last.x, e.clientY - last.y) > REST_PX) last.leftAt = performance.now();
    };
    const paused = (s: Spot, now: number) => s.seed || (s.leftAt ?? now) - s.at >= REST_MS;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !(e.target instanceof Element) || !e.target.closest(".dock, .overlay, .help")) return;
      const t = trail.current;
      const now = performance.now();
      if (t.length >= 2 && !paused(t[t.length - 1], now)) {
        for (let i = t.length - 2; i >= 0; i--) {
          if (paused(t[i], now)) {
            restoreHeld(t[i].held);
            break;
          }
        }
      }
      seed(getState().held);
      lastAim.current = null;
    };
    window.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerover", onOver);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerover", onOver);
    };
  }, []);

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
    if (e.object.userData.ghost || e.object.userData.faded || seeThroughPlan(e)) return;
    e.stopPropagation();
    const s = getState();
    // a camera drag (any button held, or a navigation tool) freezes the preview in the world
    if (pressed() || s.navTool) return;
    if (s.held) {
      const aim = aimOf(e);
      if (aim && aimKey(aim) !== lastAim.current) {
        lastAim.current = aimKey(aim);
        aimAt(aim.cell, aim.level, aim.snap);
        const now = getState().held;
        fromHover.current = now;
        const ne = e.nativeEvent as PointerEvent;
        if (now) trail.current = [...trail.current.slice(-20), { held: now, x: ne.clientX, y: ne.clientY, at: performance.now(), leftAt: null }];
      }
    } else if (s.deleting) {
      setTarget(planIdOf(e) ?? placedIdOf(e));
    }
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (seeThroughPlan(e)) return; // the next surface along the ray gets this click
    e.stopPropagation();
    // only a plain left click edits; a camera drag, or any click with a navigation tool on, never does
    if (isDrag(e.nativeEvent) || (e.nativeEvent as MouseEvent).button !== 0 || getState().navTool) return;
    const s = getState();
    const touch = (e.nativeEvent as PointerEvent).pointerType !== "mouse";
    if (s.held) {
      // A click or tap inside the preview's footprint commits exactly the
      // preview on screen, never re-aimed (ADR 0005): a real part in Build
      // mode, a plan in Plan mode (ADR 0011). Anywhere else it only aims.
      // With a mouse, hover has already put the preview under the pointer,
      // so one click commits; a finger has no hover, so its first tap
      // previews and a second tap on the preview commits.
      if (e.object.userData.ghost) {
        void commitHeld();
        return;
      }
      const aim = aimOf(e);
      if (!aim) return;
      const shown = preview(s)?.placement;
      if (shown && onFootprint(shown, aim.cell)) {
        void commitHeld();
        return;
      }
      lastAim.current = aimKey(aim);
      aimAt(aim.cell, aim.level, aim.snap);
      return;
    }
    const id = placedIdOf(e);
    if (s.deleting) {
      // likewise, the first tap names the target and the second removes it
      const target = planIdOf(e) ?? id;
      if (!target) setTarget(null);
      else if (!touch || s.targetId === target) void deleteObject(target);
      else setTarget(target);
      return;
    }
    const planId = planIdOf(e);
    if (planId) {
      selectPlan(planId);
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
          dropAt={drops[p.id]}
          userData={{ placedId: p.id, faded: faded.has(p.id) }}
        />
      ))}
      {/* transparent plans: never block real construction, never cost stock
          (ADR 0009). Drawn regardless of held/deleting, like real parts; only
          their click handling (selection) is suppressed in those states. */}
      {snapshot?.plans.map((plan) => {
        const mark = marks[plan.id];
        const recentlyMarked = mark && Date.now() - mark.at < 6000; // a restrained, fading pulse
        const selected = !held && !deleting && plan.id === selectedPlanId;
        return (
          <PartMesh
            key={plan.id}
            placement={plan}
            ghost={fits.get(plan.id) === "standing" ? "plan" : "plan-bad"}
            // selection wins over a mark, so the plan you're acting on is never ambiguous
            highlight={deleting && plan.id === targetId ? "delete" : selected ? "plan" : recentlyMarked ? "marked" : undefined}
            userData={{ planId: plan.id }}
          />
        );
      })}
      {pv && (
        <>
          <PartMesh placement={pv.placement} ghost={pv.modeRejection ? "invalid" : planning ? "plan-preview" : "valid"} userData={{ ghost: true }} />
          <GhostLabel placement={pv.placement} ok={!pv.modeRejection} plan={planning} />
        </>
      )}
    </group>
  );
}

// A label over the preview, so fit / no fit, and plan / real, are said in words, not just colour.
function GhostLabel({ placement: p, ok, plan }: { placement: { partId: string; x: number; y: number; z: number; rot: number }; ok: boolean; plan: boolean }) {
  const def = partDef(p.partId)!;
  const w = p.rot % 2 === 0 ? def.w : def.d;
  const d = p.rot % 2 === 0 ? def.d : def.w;
  return (
    <Html position={[p.x + w / 2, (p.y + def.h) * PLATE + 0.7, p.z + d / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <span className={`ghost-label${ok ? (plan ? " plan" : "") : " bad"}`}>{plan ? (ok ? "◇ Plan here" : "✕ Can't plan") : ok ? "✓ Fits" : "✕ Can't place"}</span>
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
  const buttons = useRef(0);
  useEffect(() => {
    // whether any button is down right now, from anywhere: the drag may leave the canvas
    const track = (e: PointerEvent) => (buttons.current = e.buttons);
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("pointerup", track, true);
    window.addEventListener("pointermove", track, true);
    return () => {
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("pointerup", track, true);
      window.removeEventListener("pointermove", track, true);
    };
  }, []);
  const pressed = () => buttons.current !== 0;
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
        if (!isDrag(e) && e.button === 0 && !s.navTool && !s.held && !s.deleting) select(null);
      }}
      // the right button orbits; the browser's own menu would interrupt it
      onContextMenu={(e) => e.preventDefault()}
    >
      <CameraRig dock={dock} />
      <Surroundings />
      <Build isDrag={isDrag} pressed={pressed} />
    </Canvas>
  );
}
