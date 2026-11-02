import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { Batched } from "../../scene/Batched.tsx";
import type { Batch } from "../../scene/scenery.ts";
import {
  at,
  BEACH_SLOT,
  beachMiniature,
  boardLabelY,
  booklet,
  creation,
  friends,
  NAMEPLATE,
  PALETTE,
  noticeboard,
  partsTray,
  PLACES,
  placed,
  PROPOSED,
  room,
  sceneTray,
  shelf,
  shelfLabelY,
  sign,
  SIGN,
  signFaceY,
  spare,
  table,
  type ObjectId,
  type Place,
} from "./build.ts";
import { easeInOutCubic, poseFor, prefersReducedMotion, TRAVEL_MS, type Focus, type Layout, type Pose } from "./destinations.ts";

/** One plate, in studs: the height of a base plate under the sign and the nameplates. */
const PLATE_Y = 0.4;

// The tabletop (ADR 0014): one composed table seen from a seat in front of it.
// Phase 1: the sign is the one working entrance; every other object is
// decoration with a plain painted label, never a control.

export interface SceneProps {
  focus: Focus;
  layout: Layout;
  reducedMotion: boolean;
  /** The camera has reached `focus` (or cut there). */
  onArrive: (focus: Focus) => void;
  onActivateSignIn: () => void;
  signLabel: string;
  signHint: string | null;
  /** The sign's face is a real button; the page focuses it on return. */
  signButtonRef: RefObject<HTMLButtonElement | null>;
  onReady: () => void;
  onContextLost: () => void;
}

// ---- camera ------------------------------------------------------------------

const lerp3 = (out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, t: number) => out.copy(a).lerp(b, t);

/**
 * Moves the camera between the designed poses. A new request mid-move starts
 * from wherever the camera is now, so repeated or reversed activation never
 * jumps. Arrival is reported from the frame that lands, not from a timer.
 */
function CameraRig({ focus, layout, reducedMotion, onArrive }: Pick<SceneProps, "focus" | "layout" | "reducedMotion" | "onArrive">) {
  const { camera, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const target = useRef(new THREE.Vector3(...poseFor(layout, "overview").target));
  const move = useRef<{ from: { p: THREE.Vector3; t: THREE.Vector3; fov: number }; to: Pose; start: number; focus: Focus } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const to = poseFor(layout, focus);
    // the opening frame, a resize, or reduced motion: go straight there
    if (first.current || reducedMotion) {
      first.current = false;
      move.current = null;
      cam.position.set(...to.position);
      target.current.set(...to.target);
      cam.fov = to.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(target.current);
      invalidate();
      onArrive(focus);
      return;
    }
    move.current = { from: { p: cam.position.clone(), t: target.current.clone(), fov: cam.fov }, to, start: performance.now(), focus };
    invalidate();
  }, [focus, reducedMotion]);

  // A layout change (rotation, resize across the breakpoint) re-frames at once
  // without replaying the move or re-announcing arrival.
  const lastLayout = useRef(layout);
  useEffect(() => {
    if (lastLayout.current === layout) return;
    lastLayout.current = layout;
    const to = poseFor(layout, move.current?.focus ?? focus);
    const wasMoving = !!move.current;
    move.current = null;
    cam.position.set(...to.position);
    target.current.set(...to.target);
    cam.fov = to.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(target.current);
    invalidate();
    if (wasMoving) onArrive(focus);
  }, [layout]);

  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpT = useMemo(() => new THREE.Vector3(), []);
  const goalP = useMemo(() => new THREE.Vector3(), []);
  const goalT = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = move.current;
    if (!m) return;
    const t = Math.min(1, (performance.now() - m.start) / TRAVEL_MS);
    const k = easeInOutCubic(t);
    goalP.set(...m.to.position);
    goalT.set(...m.to.target);
    lerp3(tmpP, m.from.p, goalP, k);
    lerp3(tmpT, m.from.t, goalT, k);
    cam.position.copy(tmpP);
    target.current.copy(tmpT);
    cam.fov = m.from.fov + (m.to.fov - m.from.fov) * k;
    cam.updateProjectionMatrix();
    cam.lookAt(target.current);
    if (t >= 1) {
      move.current = null;
      onArrive(m.focus);
    } else {
      invalidate();
    }
  });

  // `?debug`: the browser checks read where the camera is and whether it moves
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("debug")) return;
    (window as unknown as { __tableCamera: () => object }).__tableCamera = () => ({
      position: cam.position.toArray(),
      target: target.current.toArray(),
      moving: !!move.current,
    });
  }, [cam]);
  return null;
}

// ---- light -------------------------------------------------------------------

/** Warm, soft light from the upper left and a little in front; one shadow-caster. */
function Light() {
  const targetObj = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 0, 0);
    return o;
  }, []);
  return (
    <>
      <primitive object={targetObj} />
      <hemisphereLight args={["#fff6e8", "#d9b88f", 1.15]} />
      <directionalLight
        position={[-26, 42, 28]}
        target={targetObj}
        intensity={2.3}
        color="#fff0dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={10}
        shadow-camera-far={110}
      />
      {/* a faint cool fill from the right, so shadowed sides aren't flat brown */}
      <directionalLight position={[30, 18, 20]} intensity={0.35} color="#e4ecff" />
    </>
  );
}

// ---- labels ------------------------------------------------------------------

// drei's transformed HTML draws 400 / distanceFactor CSS pixels per world
// unit; a large ratio keeps text crisp when the camera comes close
const DISTANCE_FACTOR = 4.4;
const FACE_PX = 400 / DISTANCE_FACTOR;

/**
 * A painted label on an object's surface: part of the picture, not a control.
 * Inert to the pointer and hidden from assistive technology, so it never
 * suggests that an unfinished entrance works (the Quick links do that job).
 */
function PaintedLabel({ position, rotationY = 0, rotationX = 0, children, tone = "paper", small = false }: { position: [number, number, number]; rotationY?: number; rotationX?: number; children: ReactNode; tone?: "paper" | "cream" | "yellow"; small?: boolean }) {
  return (
    <Html transform position={position} rotation={new THREE.Euler(rotationX, rotationY, 0, "YXZ")} distanceFactor={DISTANCE_FACTOR} pointerEvents="none" zIndexRange={[10, 0]}>
      <span className={`painted-label painted-${tone}${small ? " painted-small" : ""}`} aria-hidden="true">
        {children}
      </span>
    </Html>
  );
}

// ---- the sign: the one working entrance ---------------------------------------

/**
 * The sign as a physical object: its whole board, posts and base respond to
 * the pointer through a generous invisible hit box, and its face is a real
 * <button> (keyboard, touch, screen readers). Both paths call the same action.
 */
function SignInSign({ onActivate, label, hint, buttonRef, place, roomy }: { onActivate: () => void; label: string; hint: string | null; buttonRef: SceneProps["signButtonRef"]; place: Place; roomy: boolean }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const lift = useRef<THREE.Group>(null);
  const batch = useMemo(() => () => sign(), []);
  const { invalidate } = useThree();
  const active = hover || focused;
  const [pad, setPad] = useState<HTMLDivElement | null>(null);
  const group = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  // The pad covers the sign as drawn, never smaller than a thumb. It is sized
  // from the sign's own corners projected through the camera, so it follows
  // resizes and camera moves exactly, without waiting on drei's HTML layout.
  const corners = useMemo(
    () => [-1, 1].flatMap((sx) => [0, PLATE_Y + SIGN.postH + SIGN.faceH + 1.2].map((y) => new THREE.Vector3((sx * (SIGN.faceW + 1)) / 2, y, 0))),
    [],
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const g = group.current;
    if (!pad || !g) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(g.matrixWorld).project(camera);
      const x = ((tmp.x + 1) / 2) * size.width;
      const y = ((1 - tmp.y) / 2) * size.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const w = `${Math.max(120, Math.round(maxX - minX))}px`;
    const h = `${Math.max(88, Math.round(maxY - minY))}px`;
    if (pad.style.width !== w) pad.style.width = w;
    if (pad.style.height !== h) pad.style.height = h;
  });

  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  // a restrained lift towards the visitor, eased over a few frames
  useFrame(() => {
    const g = lift.current;
    if (!g) return;
    const goal = active ? 0.28 : 0;
    const d = goal - g.position.y;
    if (Math.abs(d) < 0.002) {
      if (g.position.y !== goal) {
        g.position.y = goal;
        invalidate();
      }
      return;
    }
    g.position.y += d * 0.25;
    invalidate();
  });

  const hit = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onActivate();
  };

  return (
    <group ref={group} position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0} scale={place.scale ?? 1}>
    <group ref={lift}>
      <Batched batch={batch} />
      {/* the sign's whole assembly, a little larger than it looks */}
      <mesh
        position={[0, 3.5, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={hit}
      >
        <boxGeometry args={[SIGN.faceW + 2.4, 7.4, 3.4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {/* a soft glow on the table under the sign, shown on hover or focus */}
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} raycast={() => null} visible={active}>
        <circleGeometry args={[5.4, 40]} />
        <meshBasicMaterial color="#ffe27a" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <Html transform position={[0, signFaceY, 0.47]} distanceFactor={DISTANCE_FACTOR} zIndexRange={[20, 10]}>
        <button
          ref={buttonRef}
          type="button"
          className={`sign-face${active ? " is-active" : ""}`}
          aria-label={hint ? `${label}: ${hint}` : label}
          aria-haspopup="dialog"
          style={{ width: `${SIGN.faceW * FACE_PX}px`, height: `${SIGN.faceH * FACE_PX}px` }}
          onClick={(e) => {
            // the canvas also listens on this container: one action per click
            e.stopPropagation();
            onActivate();
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <span className="sign-face-label">{label}</span>
          {hint && <span className="sign-face-hint">{hint}</span>}
        </button>
      </Html>
      {roomy && (
        // A phone's overview draws the sign small. This screen-space pad,
        // centred on the sign and never smaller than a thumb, routes a tap to
        // the same action; it is not a second control (hidden from assistive
        // technology and the tab order: the face above is the button).
        <Html position={[0, (PLATE_Y + SIGN.postH + SIGN.faceH + 1.2) / 2, 0]} center zIndexRange={[19, 10]}>
          <div
            className="sign-touch"
            ref={setPad}
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              onActivate();
            }}
          />
        </Html>
      )}
    </group>
    </group>
  );
}

// ---- the rest of the table ----------------------------------------------------

function ProposedBrick({ place }: { place: Place }) {
  const { x, y, z, w, d, h } = PROPOSED;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w - 0.04, h - 0.04, d - 0.04)), []);
  return (
    <group position={at(place, x + w / 2, y + h / 2, z + d / 2)} rotation-y={place.rot ?? 0}>
      <mesh raycast={() => null}>
        <boxGeometry args={[w - 0.04, h - 0.04, d - 0.04]} />
        <meshStandardMaterial color="#6fa8ff" transparent opacity={0.34} emissive="#1a5bb0" emissiveIntensity={0.35} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color="#2a6fc4" transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}

// built once, each around its own origin; placing them is a transform, so a
// resize across the breakpoint rebuilds nothing
const once = (f: () => Batch) => {
  let b: Batch | null = null;
  return () => (b ??= f());
};
const BUILT: Record<ObjectId | "spare" | "spareLong", () => Batch> = {
  creation: once(creation),
  parts: once(partsTray),
  sign: once(sign),
  scenes: once(() => {
    const b = sceneTray();
    b.merge(beachMiniature());
    return b;
  }),
  board: once(noticeboard),
  shelf: once(shelf),
  friends: once(friends),
  booklet: once(booklet),
  spare: once(() => spare(1, 1, PALETTE.yellow)),
  spareLong: once(() => spare(2, 3, PALETTE.red)),
};
const ROOM = once(room);
const TABLE = once(table);

function Placed({ id, place }: { id: keyof typeof BUILT; place: Place }) {
  return (
    <group position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0}>
      <Batched batch={BUILT[id]} />
    </group>
  );
}

function Decoration({ layout }: { layout: Layout }) {
  const P = PLACES[layout];
  // two spare pieces, as if just picked up and put down
  const spares: Place[] = layout === "wide" ? [{ x: -5.6, z: 4.5 }, { x: 6.6, z: 6.8, rot: 0.3 }] : [{ x: -9, z: 4.5 }, { x: 11.5, z: 2.5, rot: 0.3 }];
  return (
    <>
      <Batched batch={ROOM} shadows={false} />
      <Batched batch={TABLE} />
      <Placed id="creation" place={P.creation} />
      <ProposedBrick place={P.creation} />
      <Placed id="parts" place={P.parts} />
      {spares.map((p, i) => (
        <Placed key={i} id={i ? "spareLong" : "spare"} place={p} />
      ))}
      <Placed id="scenes" place={P.scenes} />
      <Placed id="board" place={P.board} />
      <Placed id="shelf" place={P.shelf} />
      <Placed id="friends" place={P.friends} />
      <Placed id="booklet" place={P.booklet} />

      <PaintedLabel position={at(P.board, 0, boardLabelY, 0.25)} tone="paper">
        Join a room
      </PaintedLabel>
      <PaintedLabel position={at(P.shelf, 0, shelfLabelY, 0.9)} tone="cream">
        Our creations
      </PaintedLabel>
      {/* on the miniature's own strip of sand, in front of the houses */}
      <PaintedLabel position={at(P.scenes, BEACH_SLOT.x, 0.42, BEACH_SLOT.z + 1.95)} rotationX={-Math.PI / 2} small tone="cream">
        Beach Houses
      </PaintedLabel>
      <PaintedLabel position={at(P.booklet, 0, 0.42, -1.4)} rotationX={-Math.PI / 2} rotationY={P.booklet.rot ?? 0} tone="yellow">
        About
      </PaintedLabel>
      <PaintedLabel position={at(P.friends, NAMEPLATE.x, PLATE_Y + 0.45, NAMEPLATE.z + 0.13)} rotationY={(P.friends.rot ?? 0) + NAMEPLATE.rot} small tone="yellow">
        Friends
      </PaintedLabel>
    </>
  );
}


// ---- readiness and failure -----------------------------------------------------

/** Tells the page once the first frame has actually drawn, and if the GPU context is lost. */
function Lifecycle({ onReady, onContextLost }: Pick<SceneProps, "onReady" | "onContextLost">) {
  const { gl } = useThree();
  const told = useRef(false);
  useFrame(() => {
    if (told.current) return;
    told.current = true;
    requestAnimationFrame(() => onReady());
  });
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onContextLost();
    };
    el.addEventListener("webglcontextlost", lost);
    return () => el.removeEventListener("webglcontextlost", lost);
  }, [gl]);
  return null;
}

export default function TableScene(props: SceneProps) {
  const reduced = props.reducedMotion || prefersReducedMotion();
  const start = poseFor(props.layout, "overview");
  return (
    <Canvas
      className="table-canvas"
      frameloop="demand"
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: start.fov, near: 0.5, far: 400, position: [...start.position] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.02, powerPreference: "low-power" }}
      // the sign's real <button> face renders inside this wrapper, so the
      // wrapper must stay in the accessibility tree; the <canvas> has no role
    >
      <color attach="background" args={["#f1e6d0"]} />
      <fog attach="fog" args={["#f1e6d0", 70, 150]} />
      <Light />
      <CameraRig focus={props.focus} layout={props.layout} reducedMotion={reduced} onArrive={props.onArrive} />
      <Decoration layout={props.layout} />
      <SignInSign onActivate={props.onActivateSignIn} label={props.signLabel} hint={props.signHint} buttonRef={props.signButtonRef} place={PLACES[props.layout].sign} roomy={props.layout === "narrow" && props.focus === "overview"} />
      <Lifecycle onReady={props.onReady} onContextLost={props.onContextLost} />
    </Canvas>
  );
}
