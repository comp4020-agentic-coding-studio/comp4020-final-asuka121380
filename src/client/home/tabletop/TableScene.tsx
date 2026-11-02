import { ContactShadows, Environment, Html, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Batch } from "../../scene/scenery.ts";
import {
  at,
  BEACH_SLOT,
  beachMiniature,
  boardLabelY,
  booklet,
  BOOKLET,
  creation,
  experiment,
  loose,
  nameplates,
  noticeboard,
  PALETTE,
  partsTray,
  PLACES,
  PROPOSED,
  roofIdeas,
  room,
  sceneTray,
  SCENE_TRAY,
  shelf,
  shelfLabelY,
  sign,
  SIGN,
  signFaceY,
  signFaceZ,
  signTop,
  table,
  type ObjectId,
  type Place,
} from "./build.ts";
import { bezier, easeInOutCubic, pathBetween, pathClear, poseFor, prefersReducedMotion, TRAVEL_MS, type Focus, type Layout, type Path, type Pose } from "./destinations.ts";

// The tabletop (ADR 0014): a shared building table in daylight, seen from a
// seat in front of it. Phase 1: the sign is the one working entrance; every
// other object is decoration with a painted label, never a control.

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

// ---- materials ---------------------------------------------------------------

// The table's own plastic, so tuning it never touches the game's shared
// materials (PartMesh's `plastic`): a little glossier, with a faint clearcoat
// so edges and studs catch the light.
const plastics = new Map<string, THREE.MeshPhysicalMaterial>();
function tablePlastic(hex: string): THREE.Material {
  let m = plastics.get(hex);
  if (!m) {
    const wood = hex === PALETTE.wood || hex === PALETTE.woodEdge || hex === PALETTE.woodLeg || hex === PALETTE.woodSeam;
    const matte = wood || hex === PALETTE.wall || hex === PALETTE.floor || hex === PALETTE.cork || hex === PALETTE.paper || hex === PALETTE.paperShade;
    m = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: matte ? 0.85 : 0.34,
      metalness: 0,
      clearcoat: matte ? 0 : 0.35,
      clearcoatRoughness: 0.45,
      envMapIntensity: matte ? 0.35 : 0.9,
    });
    plastics.set(hex, m);
  }
  return m;
}
const glass = new THREE.MeshPhysicalMaterial({ color: PALETTE.glass, roughness: 0.08, metalness: 0, transmission: 0, opacity: 0.85, transparent: true, envMapIntensity: 1.4 });

/** One mesh per colour, never pickable; the table's own materials. */
function Bricks({ batch, shadows = true }: { batch: () => Batch; shadows?: boolean }) {
  const meshes = useMemo(() => batch().build(), [batch]);
  return (
    <>
      {meshes.map(({ colour, geometry }) => (
        <mesh key={colour} geometry={geometry} material={colour === PALETTE.glass ? glass : tablePlastic(colour)} castShadow={shadows} receiveShadow raycast={() => null} />
      ))}
    </>
  );
}

// ---- camera ------------------------------------------------------------------

/**
 * Moves the camera between the designed poses along a gentle arc that keeps
 * out of the objects (destinations.ts). Position and look-at target travel
 * together, so the view turns towards the sign's face as it approaches.
 * A new request mid-move starts from wherever the camera is; arrival is
 * reported from the frame that lands, not from a timer.
 */
function CameraRig({ focus, layout, reducedMotion, onArrive }: Pick<SceneProps, "focus" | "layout" | "reducedMotion" | "onArrive">) {
  const { camera, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const target = useRef(new THREE.Vector3(...poseFor(layout, "overview").target));
  const move = useRef<{ path: Path; tFrom: THREE.Vector3; tTo: THREE.Vector3; fovFrom: number; fovTo: number; start: number; focus: Focus } | null>(null);
  const lastPath = useRef<Path | null>(null);
  const first = useRef(true);

  const jump = (to: Pose) => {
    cam.position.set(...to.position);
    target.current.set(...to.target);
    cam.fov = to.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(target.current);
    invalidate();
  };

  useEffect(() => {
    const to = poseFor(layout, focus);
    if (first.current || reducedMotion) {
      first.current = false;
      move.current = null;
      jump(to);
      onArrive(focus);
      return;
    }
    const path = pathBetween(cam.position, new THREE.Vector3(...to.position), layout);
    lastPath.current = path;
    move.current = { path, tFrom: target.current.clone(), tTo: new THREE.Vector3(...to.target), fovFrom: cam.fov, fovTo: to.fov, start: performance.now(), focus };
    invalidate();
  }, [focus, reducedMotion]);

  // A layout change (rotation, resize across the breakpoint) re-frames at once
  // without replaying the move or re-announcing arrival.
  const lastLayout = useRef(layout);
  useEffect(() => {
    if (lastLayout.current === layout) return;
    lastLayout.current = layout;
    const wasMoving = !!move.current;
    move.current = null;
    jump(poseFor(layout, focus));
    if (wasMoving) onArrive(focus);
  }, [layout]);

  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = move.current;
    if (!m) return;
    const t = Math.min(1, (performance.now() - m.start) / TRAVEL_MS);
    const k = easeInOutCubic(t);
    bezier(p, m.path.from, m.path.control, m.path.to, k);
    cam.position.copy(p);
    target.current.lerpVectors(m.tFrom, m.tTo, k);
    cam.fov = m.fovFrom + (m.fovTo - m.fovFrom) * k;
    cam.updateProjectionMatrix();
    cam.lookAt(target.current);
    if (t >= 1) {
      move.current = null;
      onArrive(m.focus);
    } else {
      invalidate();
    }
  });

  // `?debug`: the browser checks read the camera, and whether the last path kept clear of the objects
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("debug")) return;
    const w = window as unknown as { __tableCamera: () => object };
    w.__tableCamera = () => ({
      position: cam.position.toArray(),
      target: target.current.toArray(),
      moving: !!move.current,
      lastPathClear: lastPath.current ? pathClear(lastPath.current, lastLayout.current) : null,
      lastPathLift: lastPath.current ? +(lastPath.current.control.y - (lastPath.current.from.y + lastPath.current.to.y) / 2).toFixed(2) : null,
    });
  }, [cam]);
  return null;
}

// ---- light -------------------------------------------------------------------

/**
 * Daylight from a window on the left: a warm key with moderately soft
 * shadows, a cool sky fill from above, a faint bounce from the right, and a
 * small environment of soft light panels (built here, nothing fetched) that
 * gives plastic its edge and stud highlights.
 */
function Daylight() {
  const targetObj = useMemo(() => new THREE.Object3D(), []);
  return (
    <>
      <primitive object={targetObj} />
      <hemisphereLight args={["#eef4ff", "#f3e2c6", 1.25]} />
      <directionalLight
        position={[-38, 34, 16]}
        target={targetObj}
        intensity={2.6}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-radius={6}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={10}
        shadow-camera-far={120}
      />
      <directionalLight position={[34, 16, 24]} intensity={0.45} color="#f4f0ff" />
      <Environment frames={1} resolution={128} environmentIntensity={0.55}>
        <color attach="background" args={["#f2ece2"]} />
        <Lightformer form="rect" intensity={2.4} color="#fff3df" position={[-10, 6, 4]} scale={[8, 6, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[0, 10, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.6} color="#e9f0ff" position={[10, 4, 2]} scale={[6, 4, 1]} rotation-y={-Math.PI / 2} />
      </Environment>
    </>
  );
}

/** Soft window light falling across the wall behind the table: two panes of warm brightness, no window modelled. */
function WindowLight() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.filter = "blur(10px)";
    g.fillStyle = "#fff";
    for (const [x, y] of [[30, 30], [136, 30], [30, 136], [136, 136]]) g.fillRect(x, y, 90, 90);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[-24, 14, -29.4]} rotation={[0, 0, 0.08]} raycast={() => null}>
      <planeGeometry args={[30, 24]} />
      <meshBasicMaterial map={tex} color="#fff6e6" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
    </mesh>
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
const INK = { paper: "#2d63ad", cream: "#8f2a1f", yellow: "#3b302a" } as const;

/**
 * Drawn into a texture on a real plane (not HTML over the canvas), so a
 * nearer object hides it as it would hide paint. Not in the DOM at all.
 */
function PaintedLabel({ position, rotationY = 0, rotationX = 0, children, tone = "paper", small = false }: { position: [number, number, number]; rotationY?: number; rotationX?: number; children: string; tone?: keyof typeof INK; small?: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const fontPx = small ? 30 : 46;
  const [label, setLabel] = useState<{ tex: THREE.CanvasTexture; w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    let tex: THREE.CanvasTexture | null = null;
    const font = `700 ${fontPx * 4}px "Fredoka Variable", ui-rounded, system-ui, sans-serif`;
    const draw = () => {
      if (!live) return;
      const c = document.createElement("canvas");
      const g = c.getContext("2d")!;
      g.font = font;
      const pad = fontPx * 4 * 0.2;
      c.width = Math.ceil(g.measureText(children).width + pad * 2);
      c.height = Math.ceil(fontPx * 4 * 1.3);
      g.font = font;
      g.fillStyle = INK[tone];
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(children, c.width / 2, c.height / 2 + fontPx * 0.2);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      setLabel({ tex, w: c.width / 4 / FACE_PX, h: c.height / 4 / FACE_PX });
      invalidate();
    };
    // the display face may still be loading; draw with it once it has
    document.fonts.load(font, children).then(draw, draw);
    return () => {
      live = false;
      tex?.dispose();
    };
  }, [children, tone, fontPx, invalidate]);
  if (!label) return null;
  return (
    <mesh position={position} rotation={new THREE.Euler(rotationX, rotationY, 0, "YXZ")} raycast={() => null}>
      <planeGeometry args={[label.w, label.h]} />
      <meshBasicMaterial map={label.tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
    </mesh>
  );
}

// ---- the sign: the one working entrance ---------------------------------------

/**
 * The sign as a physical object: its whole assembly responds to the pointer
 * through a generous invisible hit box, and its face is a real <button>
 * (keyboard, touch, screen readers). Both call the same action.
 */
function SignInSign({ onActivate, label, hint, buttonRef, place, roomy }: { onActivate: () => void; label: string; hint: string | null; buttonRef: SceneProps["signButtonRef"]; place: Place; roomy: boolean }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const lift = useRef<THREE.Group>(null);
  const batch = useMemo(() => () => sign(), []);
  const { invalidate, camera, size } = useThree();
  const active = hover || focused;
  const [pad, setPad] = useState<HTMLDivElement | null>(null);
  const group = useRef<THREE.Group>(null);
  // The touch pad covers the sign as drawn, never smaller than a thumb: sized
  // from the sign's corners projected through the camera.
  const corners = useMemo(() => [-1, 1].flatMap((sx) => [0, signTop].map((y) => new THREE.Vector3((sx * (SIGN.frameW + 0.6)) / 2, y, 0))), []);
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

  // a restrained lift, eased over a few frames, only while hovered or focused
  useFrame(() => {
    const g = lift.current;
    if (!g) return;
    const goal = active ? 0.22 : 0;
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
        <Bricks batch={batch} />
        <mesh
          position={[0, signTop / 2, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
          }}
          onPointerOut={() => setHover(false)}
          onClick={hit}
        >
          <boxGeometry args={[SIGN.frameW + 1.6, signTop + 0.6, 3]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <Html transform position={[0, signFaceY, signFaceZ]} distanceFactor={DISTANCE_FACTOR} zIndexRange={[20, 10]}>
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
      </group>
      {/* a soft warm pool on the table under the sign, while hovered or focused */}
      <mesh position={[0, 0.02, 0.6]} rotation-x={-Math.PI / 2} raycast={() => null} visible={active}>
        <circleGeometry args={[5, 40]} />
        <meshBasicMaterial color="#ffe08a" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {roomy && (
        // A phone's overview draws the sign small. This screen-space pad,
        // centred on the sign and never smaller than a thumb, routes a tap to
        // the same action; it is not a second control (hidden from assistive
        // technology and the tab order: the face above is the button).
        <Html position={[0, signTop / 2, 0]} center zIndexRange={[19, 10]}>
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
  );
}

// ---- the rest of the table ----------------------------------------------------

/** A proposed slope on the house's open roof side, see-through like a plan in the game. */
function ProposedSlope({ place }: { place: Place }) {
  const { x, y, z, len, depth } = PROPOSED;
  const geometry = useMemo(() => {
    const h = 1.2;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(depth, 0);
    s.lineTo(depth, 0.16);
    s.lineTo(1, h);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    // falls towards −z: the back side of the roof
    g.rotateY(Math.PI);
    g.translate(x, y, z + depth);
    return g;
  }, []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry]);
  return (
    <group position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0}>
      <mesh geometry={geometry} raycast={() => null}>
        <meshStandardMaterial color="#7fb0ff" transparent opacity={0.38} emissive="#1a5bb0" emissiveIntensity={0.25} depthWrite={false} />
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
const BUILT: Record<Exclude<ObjectId, "sign">, () => Batch> = {
  creation: once(creation),
  parts: once(partsTray),
  scenes: once(() => {
    const b = sceneTray();
    b.merge(beachMiniature());
    return b;
  }),
  board: once(noticeboard),
  shelf: once(shelf),
  booklet: once(booklet),
  experiment: once(experiment),
  roofIdeas: once(roofIdeas),
  nameplates: once(nameplates),
};
const LOOSE = { wide: once(() => loose("wide")), narrow: once(() => loose("narrow")) };
const ROOM = once(room);
const TABLE = once(table);

function Placed({ id, place }: { id: keyof typeof BUILT; place: Place }) {
  return (
    <group position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0} scale={place.scale ?? 1}>
      <Bricks batch={BUILT[id]} />
    </group>
  );
}

function Decoration({ layout }: { layout: Layout }) {
  const P = PLACES[layout];
  return (
    <>
      <Bricks batch={ROOM} shadows={false} />
      <WindowLight />
      <Bricks batch={TABLE} />
      <Placed id="creation" place={P.creation} />
      <ProposedSlope place={P.creation} />
      <Placed id="parts" place={P.parts} />
      <Placed id="scenes" place={P.scenes} />
      <Placed id="board" place={P.board} />
      <Placed id="shelf" place={P.shelf} />
      <Placed id="booklet" place={P.booklet} />
      <Placed id="experiment" place={P.experiment} />
      <Placed id="roofIdeas" place={P.roofIdeas} />
      <Placed id="nameplates" place={P.nameplates} />
      <Bricks batch={LOOSE[layout]} />

      <PaintedLabel position={at(P.board, 0, boardLabelY, 0.28)} rotationY={P.board.rot} tone="paper">
        Join a room
      </PaintedLabel>
      <PaintedLabel position={at(P.shelf, 0, shelfLabelY + 0.02, 0.93)} rotationY={P.shelf.rot} tone="cream">
        Our creations
      </PaintedLabel>
      {/* printed on the tray's front edge, below the one scene it holds */}
      <PaintedLabel position={at(P.scenes, BEACH_SLOT.x, 0.46, SCENE_TRAY.d / 2 + 0.08)} rotationY={P.scenes.rot} small tone="cream">
        Beach Houses
      </PaintedLabel>
      <PaintedLabel position={at(P.booklet, -BOOKLET.w / 4 + 0.5, BOOKLET.pageY + 0.02, -1.9)} rotationX={-Math.PI / 2} rotationY={P.booklet.rot} small tone="paper">
        About
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
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0, powerPreference: "low-power" }}
      // the sign's real <button> face renders inside this wrapper, so the
      // wrapper must stay in the accessibility tree; the <canvas> has no role
    >
      <color attach="background" args={[PALETTE.wall]} />
      <Daylight />
      <CameraRig focus={props.focus} layout={props.layout} reducedMotion={reduced} onArrive={props.onArrive} />
      <Decoration layout={props.layout} />
      {/* soft contact shadows under everything, drawn once (the table doesn't move) */}
      <ContactShadows key={props.layout} position={[0, 0.012, 0]} scale={[58, 40]} resolution={1024} blur={1.6} far={3} opacity={0.42} color="#5b4630" frames={1} />
      <SignInSign onActivate={props.onActivateSignIn} label={props.signLabel} hint={props.signHint} buttonRef={props.signButtonRef} place={PLACES[props.layout].sign} roomy={props.layout === "narrow" && props.focus === "overview"} />
      <Lifecycle onReady={props.onReady} onContextLost={props.onContextLost} />
    </Canvas>
  );
}
