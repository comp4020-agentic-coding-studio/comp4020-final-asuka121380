import { ContactShadows, Environment, Html, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Batch } from "../../scene/scenery.ts";
import { CASTLE_SCENE, TREEHOUSE_SCENE } from "../../../domain/scene.ts";
import {
  at,
  beachMiniature,
  castleMiniature,
  treehouseMiniature,
  SCENE_TRAY_TOP,
  BOARD,
  BOARD_HEADER,
  booklet,
  BOOKLET,
  bookletPageY,
  creation,
  friends,
  FRIENDS_LABEL,
  loose,
  MATTE,
  nameplate,
  noticeboard,
  PALETTE,
  partsTray,
  PLACES,
  proposedSlope,
  roofIdeas,
  SCENE_LABEL,
  SCENE_TRAY,
  sceneTray,
  shelf,
  SHELF,
  SHELF_HEADER,
  sign,
  SIGN,
  signFaceY,
  signFaceZ,
  signTop,
  type ObjectId,
  type Place,
} from "./build.ts";
import { SIDE_X, SKETCHES, sketchTape, storage, TABLE, tableFrame, tableTop, WALL_Z, walls, WINDOW, windowFrame } from "./room.ts";
import { bezier, easeInOutCubic, pathBetween, pathClear, poseFor, prefersReducedMotion, TRAVEL_MS, type Entrance, type Focus, type Layout, type Path, type Pose } from "./destinations.ts";

// The tabletop (ADR 0014): a shared building table in daylight, seen from a
// seat in front of it. Six objects are entrances: the scene tray, the
// noticeboard, the creation shelf, the Friends stand, the booklet and the
// sign. Each is clickable as a whole (an invisible hit box round it), and
// its printed name is a real <button> for keyboards, touch and screen
// readers; both do the same thing. Everything else on the table is
// decoration, never a control.

export interface SceneProps {
  focus: Focus;
  layout: Layout;
  reducedMotion: boolean;
  /** The camera has reached `focus` (or cut there). */
  onArrive: (focus: Focus) => void;
  /** An entrance was chosen: its object clicked or tapped, or its label button pressed. */
  onActivate: (entrance: Entrance) => void;
  signLabel: string;
  signHint: string | null;
  /** Real pending room invitations, shown as a small count on the Friends stand; 0 shows nothing. */
  invitations: number;
  /** Each entrance's label is a real button; the page focuses it again on return. */
  entranceRefs: Record<Entrance, RefObject<HTMLButtonElement | null>>;
  onReady: () => void;
  onContextLost: () => void;
}

// ---- choosing an entrance: one press, one choice ----------------------------
//
// A browser sends `click` only to the element under BOTH the press and the
// release. On the table the thing pressed can move away in between — the
// hover lift raises the object and its label, and during a camera move every
// object slides across the screen — so the release lands on the canvas, the
// click goes to their common ancestor, and the choice silently vanishes
// (reproduced: evidence 0017). So a choice is made by the press: pressing an
// entrance's object, label or touch pad arms it, and releasing within a
// small distance chooses it, wherever the release lands. There is no time
// limit on the hold: a genuine press-and-release that never moved is never
// discarded just because it took a while (ADR 0014's "do not silently
// discard an activation"); a pointer that leaves and never returns is
// cleared by `pointercancel`, not a guessed timeout. The click that follows
// a pointer gesture is then ignored, so one gesture is one choice; a
// keyboard's Enter or Space (a click with no pointer gesture) still chooses
// through `click`.

const PRESS_SLOP_PX = 14;
let pressed: { entrance: Entrance; x: number; y: number; choose: (e: Entrance) => void } | null = null;
// the pointer gesture that has just chosen: the one `click` it produces is spent
let spentClick = false;

function armPress(entrance: Entrance, x: number, y: number, choose: (e: Entrance) => void): void {
  pressed = { entrance, x, y, choose };
  // `?debug`: the browser checks can see which entrance a press armed
  (window as unknown as { __lastPress?: string }).__lastPress = entrance;
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    () => {
      // a new gesture: nothing from the last one is still waiting to be spent
      spentClick = false;
    },
    true,
  );
  window.addEventListener(
    "pointerup",
    (e) => {
      const p = pressed;
      pressed = null;
      if (!p || e.button !== 0) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP_PX) return;
      spentClick = true;
      p.choose(p.entrance);
    },
    true,
  );
  window.addEventListener("pointercancel", () => (pressed = null), true);
  // the click (if any) that follows the release: already chosen, so spend it
  window.addEventListener(
    "click",
    (e) => {
      if (spentClick && e.detail > 0) {
        spentClick = false;
        e.stopPropagation();
      }
    },
    true,
  );
}

// ---- materials ---------------------------------------------------------------

// The table's own plastic, so tuning it never touches the game's shared
// materials (PartMesh's `plastic`): a little glossier, with a faint clearcoat
// so edges and studs catch the light.
const plastics = new Map<string, THREE.MeshPhysicalMaterial>();
function tablePlastic(hex: string): THREE.Material {
  let m = plastics.get(hex);
  if (!m) {
    const matte = MATTE.has(hex);
    m = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: matte ? 0.88 : 0.3,
      metalness: 0,
      clearcoat: matte ? 0 : 0.3,
      clearcoatRoughness: 0.4,
      envMapIntensity: matte ? 0.25 : 0.85,
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

// built once, each around its own origin; placing them is a transform, so a
// resize across the breakpoint rebuilds nothing
function once<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
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
 * Daylight through the window in the left wall: a warm sun low enough to
 * reach across the table, its shadow moderately soft; the window's frame
 * casts real shadow bars because the wall round it blocks the sun. A cool
 * sky fill from above keeps colours in the shadows, a faint bounce comes from
 * the right, and a small environment of soft panels (built here, nothing
 * fetched) gives plastic its edge and stud highlights.
 */
function Daylight() {
  const targetObj = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(4, 0, -4);
    return o;
  }, []);
  return (
    <>
      <primitive object={targetObj} />
      <hemisphereLight args={["#eef3fb", "#d9c6ad", 1.1]} />
      <directionalLight
        position={[-70, 50, 22]}
        target={targetObj}
        intensity={2.9}
        color="#ffeed6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={5}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={44}
        shadow-camera-bottom={-44}
        shadow-camera-near={20}
        shadow-camera-far={170}
      />
      <directionalLight position={[40, 22, 30]} intensity={0.4} color="#f1f3ff" />
      <Environment frames={1} resolution={128} environmentIntensity={0.5}>
        <color attach="background" args={["#ece9e3"]} />
        <Lightformer form="rect" intensity={2.6} color="#fff1dc" position={[-10, 5, 0]} scale={[6, 7, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.1} color="#ffffff" position={[0, 10, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#e9f0ff" position={[10, 4, 2]} scale={[6, 4, 1]} rotation-y={-Math.PI / 2} />
      </Environment>
    </>
  );
}

/** A canvas texture, drawn once. */
function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/**
 * Pale honey planks with a quiet grain: a few broad, soft bands of colour
 * per plank and a handful of faint, wandering lines, so the top reads as wood
 * from the seat and doesn't turn into stripes up close. Blurred while drawn,
 * so no line is crisper than the texture's own resolution.
 */
function woodGrain(): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g) => {
    g.fillStyle = "#ebcda2";
    g.fillRect(0, 0, 1024, 1024);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const planks = 5;
    const pw = 1024 / planks;
    g.filter = "blur(3px)";
    for (let p = 0; p < planks; p++) {
      // each plank a touch lighter or warmer than its neighbours
      g.fillStyle = `rgba(${p % 2 ? "196,140,80" : "255,240,214"},${0.05 + rnd() * 0.05})`;
      g.fillRect(p * pw, 0, pw, 1024);
      // broad soft bands, then a few fine wandering lines
      for (let i = 0; i < 5; i++) {
        const x = p * pw + rnd() * pw;
        g.strokeStyle = `rgba(176,120,62,${0.035 + rnd() * 0.03})`;
        g.lineWidth = 8 + rnd() * 14;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= 1024; y += 32) g.lineTo(x + Math.sin(y / 260 + i * 1.7) * (6 + rnd() * 2), y);
        g.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const x = p * pw + rnd() * pw;
        g.strokeStyle = `rgba(150,98,50,${0.03 + rnd() * 0.035})`;
        g.lineWidth = 1 + rnd() * 1.2;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= 1024; y += 32) g.lineTo(x + Math.sin(y / 210 + i) * (3 + rnd() * 2), y);
        g.stroke();
      }
    }
    g.filter = "none";
    // the joints between planks: a fine, soft seam
    for (let p = 1; p < planks; p++) {
      g.fillStyle = "rgba(128,84,42,0.16)";
      g.fillRect(p * pw - 1, 0, 2, 1024);
    }
  }, [1.4, 1]);
}

/**
 * The table top: the rounded slab, its grain on top only. The edge and the
 * underside take a plain wood colour, so the grain never smears down the
 * front edge as stripes.
 */
function TableTop() {
  const geometry = useMemo(() => {
    const g = tableTop();
    // planar UVs from x and z, so the grain runs front to back across the top
    const pos = g.getAttribute("position");
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + TABLE.w / 2) / TABLE.w;
      uv[i * 2 + 1] = (pos.getZ(i) - TABLE.z0) / TABLE.d;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }, []);
  const materials = useMemo(
    () => [
      // ExtrudeGeometry's groups: 0 = the two caps (top and underside), 1 = the sides
      new THREE.MeshPhysicalMaterial({ map: woodGrain(), roughness: 0.72, clearcoat: 0.1, clearcoatRoughness: 0.6, envMapIntensity: 0.3 }),
      new THREE.MeshPhysicalMaterial({ color: "#dcb07c", roughness: 0.75, envMapIntensity: 0.25 }),
    ],
    [],
  );
  return <mesh geometry={geometry} material={materials} receiveShadow castShadow raycast={() => null} />;
}

/** The view through the window: a pale sky over soft, low greenery. Not modelled. */
function WindowView() {
  const tex = useMemo(
    () =>
      canvasTexture(256, 256, (g) => {
        const sky = g.createLinearGradient(0, 0, 0, 256);
        sky.addColorStop(0, "#cfe5f6");
        sky.addColorStop(1, "#f2f6f2");
        g.fillStyle = sky;
        g.fillRect(0, 0, 256, 256);
        g.filter = "blur(6px)";
        g.fillStyle = "#a9c99c";
        for (const [x, y, r] of [[30, 230, 60], [110, 245, 70], [200, 225, 65], [250, 250, 50]]) {
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      }),
    [],
  );
  const W = WINDOW;
  return (
    <mesh position={[SIDE_X - 6, (W.y0 + W.y1) / 2, (W.z0 + W.z1) / 2]} rotation-y={Math.PI / 2} raycast={() => null}>
      <planeGeometry args={[(W.z1 - W.z0) * 1.6, (W.y1 - W.y0) * 1.4]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

const ROOM = once(walls);
const WINDOW_FRAME = once(windowFrame);
const STORAGE = once(storage);
const TABLE_FRAME = once(tableFrame);
const TAPE = once(sketchTape);

/** Three loose sketches taped to the back wall: a roof idea, a window arrangement, colour swatches. No words. */
function Sketches() {
  const textures = useMemo(
    () =>
      SKETCHES.map((sk) =>
        canvasTexture(256, Math.round((256 * sk.h) / sk.w), (g) => {
          const W = 256;
          const H = g.canvas.height;
          g.fillStyle = "#fbf9f3";
          g.fillRect(0, 0, W, H);
          g.lineWidth = 3;
          g.lineJoin = "round";
          g.strokeStyle = "#5b6f8f";
          if (sk.kind === "roof") {
            // a house outline with two roof pitches tried
            g.strokeRect(70, 120, 116, 60);
            g.beginPath();
            g.moveTo(60, 122);
            g.lineTo(128, 62);
            g.lineTo(196, 122);
            g.stroke();
            g.setLineDash([6, 6]);
            g.strokeStyle = "#d0463b";
            g.beginPath();
            g.moveTo(60, 122);
            g.lineTo(128, 40);
            g.lineTo(196, 122);
            g.stroke();
          } else if (sk.kind === "window") {
            // a wall elevation with windows placed and one moved
            g.strokeRect(36, 40, 184, 220);
            for (const [x, y] of [[62, 74], [150, 74], [62, 170]]) {
              g.strokeRect(x, y, 44, 52);
              g.beginPath();
              g.moveTo(x + 22, y);
              g.lineTo(x + 22, y + 52);
              g.stroke();
            }
            g.setLineDash([5, 5]);
            g.strokeStyle = "#2b63b8";
            g.strokeRect(150, 170, 44, 52);
          } else {
            // colour swatches, as bricks seen from above
            for (const [i, c] of [PALETTE.houseWall, PALETTE.red, PALETTE.white, PALETTE.yellow, PALETTE.blue].entries()) {
              g.fillStyle = c;
              g.fillRect(22 + i * 44, 50, 36, 60);
              g.strokeStyle = "rgba(0,0,0,0.25)";
              g.lineWidth = 1.5;
              g.strokeRect(22 + i * 44, 50, 36, 60);
            }
          }
        }),
      ),
    [],
  );
  return (
    <>
      {SKETCHES.map((sk, i) => (
        <mesh key={sk.kind} position={[sk.x, sk.y, WALL_Z + 0.04]} rotation-z={sk.tilt} raycast={() => null} receiveShadow>
          <planeGeometry args={[sk.w, sk.h]} />
          <meshStandardMaterial map={textures[i]} roughness={0.95} />
        </mesh>
      ))}
      <Bricks batch={TAPE} shadows={false} />
    </>
  );
}

/** The room round the table: walls, window and view, the storage shelf, the sketches, the table's frame and top. */
function Room() {
  return (
    <>
      <Bricks batch={ROOM} shadows={false} />
      <Bricks batch={WINDOW_FRAME} />
      <WindowView />
      <Bricks batch={STORAGE} />
      <Sketches />
      <TableTop />
      <Bricks batch={TABLE_FRAME} />
    </>
  );
}

// ---- labels ------------------------------------------------------------------

// drei's transformed HTML draws 400 / distanceFactor CSS pixels per world
// unit; a large ratio keeps text crisp when the camera comes close
const DISTANCE_FACTOR = 4.4;
const FACE_PX = 400 / DISTANCE_FACTOR;

/**
 * A label printed on an object's name strip: part of the picture, not a
 * control. Drawn into a texture on a real plane (not HTML over the canvas),
 * so a nearer object hides it as it would hide paint, and it is not in the
 * DOM at all, so it never suggests that an unfinished entrance works (the
 * Quick links do that job). The text is fitted to the strip it sits on.
 */
function PrintedLabel({ position, rotation, width, height, children }: { position: [number, number, number]; rotation: THREE.Euler; width: number; height: number; children: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    let t: THREE.CanvasTexture | null = null;
    const px = 160;
    const font = (size: number) => `600 ${size}px "Fredoka Variable", ui-rounded, system-ui, sans-serif`;
    const draw = () => {
      if (!live) return;
      t = canvasTexture(Math.round(width * px), Math.round(height * px), (g) => {
        const W = g.canvas.width;
        const H = g.canvas.height;
        let size = H * 0.62;
        g.font = font(size);
        const room = W * 0.9;
        const m = g.measureText(children).width;
        if (m > room) size *= room / m;
        g.font = font(size);
        g.fillStyle = PALETTE.ink;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(children, W / 2, H / 2 + size * 0.06);
      });
      setTex(t);
      invalidate();
    };
    // the display face may still be loading; draw with it once it has
    document.fonts.load(font(40), children).then(draw, draw);
    return () => {
      live = false;
      t?.dispose();
    };
  }, [children, width, height, invalidate]);
  if (!tex) return null;
  return (
    <mesh position={position} rotation={rotation} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** A label printed on a strip in an object's own frame, facing its +z: lifted with the object. */
function LocalLabel({ x, y, z, w, h, children }: { x: number; y: number; z: number; w: number; h: number; children: string }) {
  const rotation = useMemo(() => new THREE.Euler(0, 0, 0), []);
  return (
    <PrintedLabel position={[x, y + h / 2, z]} rotation={rotation} width={w * 0.96} height={h * 0.9}>
      {children}
    </PrintedLabel>
  );
}

/**
 * The booklet's open pages: "About" at the top of the left page over a
 * picture of the table's house; the right page shows one building step, a
 * brick coming down onto two others. Printed, so it lies flat on the paper.
 */
function BookletPrint() {
  const invalidate = useThree((s) => s.invalidate);
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    let t: THREE.CanvasTexture | null = null;
    const draw = () => {
      if (!live) return;
      t = canvasTexture(1024, 720, (g) => {
        const iso = (x: number, y: number, w: number, h: number, d: number, top: string, left: string, right: string) => {
          // a brick in a simple isometric view: x, y is the top face's front corner
          const dx = d * 0.87;
          const dy = d * 0.5;
          const wx = w * 0.87;
          const wy = w * 0.5;
          g.lineJoin = "round";
          g.strokeStyle = "rgba(40,30,25,0.55)";
          g.lineWidth = 2;
          const face = (pts: number[][], c: string) => {
            g.fillStyle = c;
            g.beginPath();
            pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
            g.closePath();
            g.fill();
            g.stroke();
          };
          face([[x, y], [x + wx, y - wy], [x + wx - dx, y - wy - dy], [x - dx, y - dy]], top);
          face([[x, y], [x - dx, y - dy], [x - dx, y - dy + h], [x, y + h]], left);
          face([[x, y], [x + wx, y - wy], [x + wx, y - wy + h], [x, y + h]], right);
        };
        g.fillStyle = "#fdfbf6";
        g.fillRect(0, 0, 1024, 720);
        // a soft shadow down the fold
        const fold = g.createLinearGradient(472, 0, 552, 0);
        fold.addColorStop(0, "rgba(0,0,0,0)");
        fold.addColorStop(0.5, "rgba(80,60,40,0.12)");
        fold.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = fold;
        g.fillRect(472, 0, 80, 720);
        g.fillStyle = PALETTE.ink;
        g.font = `600 112px "Fredoka Variable", ui-rounded, system-ui, sans-serif`;
        g.fillText("About", 52, 140);
        // a point on an iso box's face: u along its width, v down from its top edge
        const W = (p: number[], u: number, v = 0) => [p[0] + u * 0.87, p[1] - u * 0.5 + v];
        const D = (p: number[], u: number, v = 0) => [p[0] - u * 0.87, p[1] - u * 0.5 + v];
        const poly = (pts: number[][], c: string) => {
          g.fillStyle = c;
          g.strokeStyle = "rgba(40,30,25,0.55)";
          g.lineWidth = 2;
          g.beginPath();
          pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
          g.closePath();
          g.fill();
          g.stroke();
        };
        // left page: the table's house, finished, on its plate
        iso(250, 560, 250, 14, 190, "#7cc488", "#5fae6c", "#6dba7a");
        const p = [262, 452];
        const bw = 150;
        const bd = 100;
        const bh = 96;
        iso(p[0], p[1], bw, bh, bd, "#e9eef4", "#c3d8ee", PALETTE.houseWall);
        // the door and a window on the front face
        poly([W(p, 30, 40), W(p, 52, 40), W(p, 52, bh), W(p, 30, bh)], PALETTE.blue);
        poly([W(p, 84, 34), W(p, 120, 34), W(p, 120, 66), W(p, 84, 66)], "#bfe0f0");
        // the gable roof: ridge along the width, over the middle of the depth
        const r = 70;
        const r0 = D(p, bd / 2, -r);
        const r1 = [r0[0] + bw * 0.87, r0[1] - bw * 0.5];
        poly([p, D(p, bd), r0], "#c3d8ee");
        poly([[p[0] - 10, p[1] + 6], [W(p, bw)[0] + 8, W(p, bw)[1] + 2], [r1[0] + 6, r1[1] - 3], [r0[0] - 6, r0[1] + 2]], PALETTE.red);
        // right page: the step number box, then one brick lowered onto two
        g.strokeStyle = PALETTE.ink;
        g.lineWidth = 3;
        g.strokeRect(590, 70, 70, 70);
        iso(760, 600, 230, 14, 160, "#b7bcc2", "#9aa0a7", "#a9aeb4");
        iso(740, 520, 70, 46, 60, "#f2f2ee", "#d9d9d4", "#e6e6e1");
        iso(850, 456, 70, 46, 60, "#f2f2ee", "#d9d9d4", "#e6e6e1");
        iso(800, 300, 140, 46, 60, "#ef5148", PALETTE.red, "#e03c33");
        g.fillStyle = PALETTE.blue;
        g.beginPath();
        g.moveTo(820, 368);
        g.lineTo(840, 368);
        g.lineTo(840, 398);
        g.lineTo(856, 398);
        g.lineTo(830, 428);
        g.lineTo(804, 398);
        g.lineTo(820, 398);
        g.closePath();
        g.fill();
      });
      setTex(t);
      invalidate();
    };
    document.fonts.load(`600 40px "Fredoka Variable"`, "About").then(draw, draw);
    return () => {
      live = false;
      t?.dispose();
    };
  }, [invalidate]);
  if (!tex) return null;
  return (
    <mesh position={[0, bookletPageY + 0.01, 0]} rotation-x={-Math.PI / 2} raycast={() => null} receiveShadow>
      <planeGeometry args={[BOOKLET.w - 0.2, BOOKLET.d - 0.1]} />
      <meshStandardMaterial map={tex} roughness={0.95} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

// ---- the entrances -------------------------------------------------------------

/**
 * Where an entrance's parts are, in its object's own frame: the hit box
 * round the whole object, the label strip that is its button, and the warm
 * pool drawn on the table while it is hovered or focused.
 */
interface EntranceShape {
  /** The invisible box that takes the pointer: centre and size. */
  hit: { c: [number, number, number]; s: [number, number, number] };
  /** The label button, laid on the printed name strip (or the sign's face). */
  label: { x: number; y: number; z: number; w: number; h: number; tilt?: number };
  /** The warm pool on the table: centre and radius. */
  pool: { x: number; z: number; r: number };
}

const SHAPES: Record<Entrance, EntranceShape> = {
  "sign-in": {
    hit: { c: [0, signTop / 2, 0], s: [SIGN.frameW + 1.6, signTop + 0.6, 3] },
    label: { x: 0, y: signFaceY, z: signFaceZ, w: SIGN.faceW, h: SIGN.faceH },
    pool: { x: 0, z: 0.6, r: 5 },
  },
  scenes: {
    // the tray, its taller miniatures and the name stand in front; the box
    // starts at the table, so a press just below the stand still lands in it
    // while the hovered object lifts
    hit: { c: [0, (SCENE_TRAY_TOP + 0.4) / 2, 1.2], s: [SCENE_TRAY.w + 1, SCENE_TRAY_TOP + 0.4, SCENE_TRAY.d + 4.6] },
    label: { x: SCENE_LABEL.x, y: SCENE_LABEL.y + SCENE_LABEL.h / 2, z: SCENE_LABEL.z + 0.17, w: SCENE_LABEL.w * 0.96, h: SCENE_LABEL.h * 0.9 },
    pool: { x: 0, z: 0.6, r: 8.5 },
  },
  rooms: {
    hit: { c: [0, (BOARD.y + BOARD.h + 1) / 2, 0], s: [BOARD.w + 2.2, BOARD.y + BOARD.h + 1.2, 3.2] },
    label: { x: 0, y: BOARD_HEADER.y + BOARD_HEADER.h / 2, z: BOARD_HEADER.z + 0.08, w: (BOARD.w - 1.0) * 0.96, h: BOARD_HEADER.h * 0.9 },
    pool: { x: 0, z: 1.2, r: 7 },
  },
  shelf: {
    hit: { c: [0, (SHELF_HEADER.y + SHELF_HEADER.h) / 2, 0], s: [SHELF.w + 0.6, SHELF_HEADER.y + SHELF_HEADER.h + 0.4, SHELF.d + 0.8] },
    label: { x: 0, y: SHELF_HEADER.y + SHELF_HEADER.h / 2, z: SHELF_HEADER.z + 0.17, w: SHELF_HEADER.w * 0.96, h: SHELF_HEADER.h * 0.9 },
    pool: { x: 0, z: 1.6, r: 8 },
  },
  friends: {
    hit: { c: [0, 1.4, 0], s: [7.4, 3.4, 6.6] },
    label: { x: 0, y: FRIENDS_LABEL.y + FRIENDS_LABEL.h / 2, z: FRIENDS_LABEL.z + 0.17, w: FRIENDS_LABEL.w * 0.96, h: FRIENDS_LABEL.h * 0.9 },
    pool: { x: 0, z: 0.4, r: 5 },
  },
  about: {
    hit: { c: [0, 0.6, 0], s: [BOOKLET.w + 1.2, 1.6, BOOKLET.d + 1.2] },
    // "About" is printed at the top of the left page; its button lies flat there
    label: { x: -2.6, y: bookletPageY + 0.03, z: -2.2, w: 3.8, h: 1.25, tilt: -Math.PI / 2 },
    pool: { x: 0, z: 0, r: 7 },
  },
};

/**
 * One entrance as a physical object: the whole assembly takes the pointer
 * through a generous invisible hit box, lifts a little and casts a warm pool
 * on the table while hovered or focused, and its printed name is a real
 * <button> (keyboard, touch, screen readers). Both call the same action.
 * Nothing moves unless someone points at it or focuses it.
 */
function EntranceObject({
  entrance,
  place,
  onActivate,
  buttonRef,
  ariaLabel,
  roomy,
  children,
  face,
  faceClass = "entrance-face",
  extra,
}: {
  entrance: Entrance;
  place: Place;
  onActivate: (e: Entrance) => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  /** A phone's overview: add a thumb-sized pad over the object. */
  roomy: boolean;
  /** The object's own bricks, lifted with it. */
  children?: React.ReactNode;
  /** What the label button shows; empty for a printed label that stays painted on. */
  face?: React.ReactNode;
  faceClass?: string;
  /** Anything else drawn with the object, not lifted (the invitation count). */
  extra?: React.ReactNode;
}) {
  const shape = SHAPES[entrance];
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const lift = useRef<THREE.Group>(null);
  const group = useRef<THREE.Group>(null);
  const { invalidate, camera, size } = useThree();
  const active = hover || focused;
  const [pad, setPad] = useState<HTMLDivElement | null>(null);
  const scale = place.scale ?? 1;

  // The touch pad covers the object as drawn, never smaller than a thumb:
  // sized from the hit box's corners projected through the camera.
  const corners = useMemo(() => {
    const [cx, cy, cz] = shape.hit.c;
    const [sx, sy, sz] = shape.hit.s;
    const out: THREE.Vector3[] = [];
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) out.push(new THREE.Vector3(cx + (dx * sx) / 2, Math.max(0, cy + (dy * sy) / 2), cz + (dz * sz) / 2));
    return out;
  }, [shape]);
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
    const w = `${Math.max(64, Math.round(maxX - minX))}px`;
    const h = `${Math.max(56, Math.round(maxY - minY))}px`;
    if (pad.style.width !== w) pad.style.width = w;
    if (pad.style.height !== h) pad.style.height = h;
  });

  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
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

  const L = shape.label;
  const tilt = L.tilt ?? 0;
  return (
    <group ref={group} position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0} scale={scale}>
      <group ref={lift}>
        {children}
        <mesh
          position={shape.hit.c}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
          }}
          onPointerOut={() => setHover(false)}
          onPointerDown={(e) => {
            // only the nearest object under the pointer arms
            e.stopPropagation();
            if (e.nativeEvent.button === 0) armPress(entrance, e.nativeEvent.clientX, e.nativeEvent.clientY, onActivate);
          }}
        >
          <boxGeometry args={shape.hit.s} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <Html transform position={[L.x, L.y, L.z]} rotation-x={tilt} distanceFactor={DISTANCE_FACTOR} zIndexRange={[20, 10]}>
          <button
            ref={buttonRef}
            type="button"
            className={`${faceClass}${active ? " is-active" : ""}`}
            aria-label={ariaLabel}
            aria-haspopup="dialog"
            data-entrance={entrance}
            style={{ width: `${L.w * FACE_PX}px`, height: `${L.h * FACE_PX}px` }}
            onPointerDown={(e) => {
              // the canvas also listens on this container: one press, one object
              e.stopPropagation();
              if (e.button === 0) armPress(entrance, e.clientX, e.clientY, onActivate);
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Enter or Space (no pointer gesture); a pointer press chose on release
              if (e.detail === 0) onActivate(entrance);
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            {typeof face === "string" ? <span className="entrance-face-text">{face}</span> : face}
          </button>
        </Html>
      </group>
      {extra}
      {/* a soft warm pool on the table under the object, while hovered or focused */}
      <mesh position={[shape.pool.x, 0.02, shape.pool.z]} rotation-x={-Math.PI / 2} raycast={() => null} visible={active}>
        <circleGeometry args={[shape.pool.r, 40]} />
        <meshBasicMaterial color="#ffe08a" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {roomy && (
        // A phone's overview draws the objects small. This screen-space pad,
        // centred on the object and never smaller than a thumb, routes a tap
        // to the same action; it is not a second control (hidden from
        // assistive technology and the tab order: the label is the button).
        <Html position={shape.hit.c} center zIndexRange={[19, 10]}>
          <div
            className="entrance-touch"
            data-entrance={entrance}
            ref={setPad}
            aria-hidden="true"
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button === 0) armPress(entrance, e.clientX, e.clientY, onActivate);
            }}
          />
        </Html>
      )}
    </group>
  );
}

/** The sign's own bricks, built once. */
const SIGN_BRICKS = once(sign);

// ---- the rest of the table ----------------------------------------------------

/** The next slope of the house's unfinished roof side, see-through like a plan in the game. */
function ProposedSlope({ place }: { place: Place }) {
  const geometry = useMemo(() => proposedSlope(), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry]);
  return (
    <group position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0}>
      <mesh geometry={geometry} raycast={() => null}>
        <meshStandardMaterial color="#7fb0ff" transparent opacity={0.4} emissive="#1a5bb0" emissiveIntensity={0.25} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color="#2a6fc4" transparent opacity={0.85} />
      </lineSegments>
    </group>
  );
}

const BUILT: Record<Exclude<ObjectId, "sign">, () => Batch> = {
  creation: once(creation),
  parts: once(partsTray),
  scenes: once(() => {
    const b = sceneTray();
    b.merge(beachMiniature());
    b.merge(castleMiniature(CASTLE_SCENE.reference, CASTLE_SCENE.bounds));
    b.merge(treehouseMiniature(TREEHOUSE_SCENE.reference, TREEHOUSE_SCENE.fixed?.pieces ?? [], TREEHOUSE_SCENE.bounds));
    return b;
  }),
  board: once(noticeboard),
  shelf: once(shelf),
  booklet: once(booklet),
  roofIdeas: once(roofIdeas),
  nameplate: once(nameplate),
  friends: once(friends),
};
const LOOSE = { wide: once(() => loose("wide")), narrow: once(() => loose("narrow")) };

function Placed({ id, place }: { id: keyof typeof BUILT; place: Place }) {
  return (
    <group position={[place.x, 0, place.z]} rotation-y={place.rot ?? 0} scale={place.scale ?? 1}>
      <Bricks batch={BUILT[id]} />
    </group>
  );
}

/** The table's decoration: the room, the house and everything that is not an entrance. */
function Decoration({ layout }: { layout: Layout }) {
  const P = PLACES[layout];
  return (
    <>
      <Room />
      {(["creation", "parts", "roofIdeas", "nameplate"] as const).map((id) => (
        <Placed key={id} id={id} place={P[id]} />
      ))}
      <ProposedSlope place={P.creation} />
      <Bricks batch={LOOSE[layout]} />
    </>
  );
}

/** An object's bricks in its own frame (its entrance places and lifts them). */
const Own = ({ id }: { id: keyof typeof BUILT }) => <Bricks batch={BUILT[id]} />;

/**
 * A count of real pending room invitations, on a small yellow tag by the
 * Friends envelope. Shown only when there are some; it never pulses.
 */
function InvitationTag({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Html transform position={[2.2, 2.5, -0.9]} distanceFactor={DISTANCE_FACTOR} zIndexRange={[18, 10]} pointerEvents="none">
      <span className="invite-tag" aria-hidden="true">
        {count}
      </span>
    </Html>
  );
}

function Entrances({ props }: { props: SceneProps }) {
  const P = PLACES[props.layout];
  const roomy = props.layout === "narrow" && props.focus === "overview";
  const common = { onActivate: props.onActivate, roomy };
  const invites = props.invitations > 0 ? `, ${props.invitations} room invitation${props.invitations === 1 ? "" : "s"} waiting` : "";
  return (
    <>
      <EntranceObject {...common} entrance="scenes" place={P.scenes} buttonRef={props.entranceRefs.scenes} ariaLabel="Scene tray: choose a scene and how to build" face="Scenes">
        <Own id="scenes" />
        <LocalLabel x={SCENE_LABEL.x} y={SCENE_LABEL.y} z={SCENE_LABEL.z + 0.16} w={SCENE_LABEL.w} h={SCENE_LABEL.h}>
          Scenes
        </LocalLabel>
      </EntranceObject>
      <EntranceObject {...common} entrance="rooms" place={P.board} buttonRef={props.entranceRefs.rooms} ariaLabel="Noticeboard: join a room" face="Join a room">
        <Own id="board" />
        <LocalLabel x={0} y={BOARD_HEADER.y} z={BOARD_HEADER.z + 0.07} w={BOARD.w - 1.0} h={BOARD_HEADER.h}>
          Join a room
        </LocalLabel>
      </EntranceObject>
      <EntranceObject {...common} entrance="shelf" place={P.shelf} buttonRef={props.entranceRefs.shelf} ariaLabel="Creation shelf: your collection and the public showcase" face="Our creations">
        <Own id="shelf" />
        <LocalLabel x={0} y={SHELF_HEADER.y} z={SHELF_HEADER.z + 0.16} w={SHELF_HEADER.w} h={SHELF_HEADER.h}>
          Our creations
        </LocalLabel>
      </EntranceObject>
      <EntranceObject {...common} entrance="friends" place={P.friends} buttonRef={props.entranceRefs.friends} ariaLabel={`Friends and invitations${invites}`} face="Friends" extra={<InvitationTag count={props.invitations} />}>
        <Own id="friends" />
        <LocalLabel x={0} y={FRIENDS_LABEL.y} z={FRIENDS_LABEL.z + 0.16} w={FRIENDS_LABEL.w} h={FRIENDS_LABEL.h}>
          Friends
        </LocalLabel>
      </EntranceObject>
      <EntranceObject {...common} entrance="about" place={P.booklet} buttonRef={props.entranceRefs.about} ariaLabel="Instruction booklet: about this project (opens the README)" face="About">
        <Own id="booklet" />
        <BookletPrint />
      </EntranceObject>
      <EntranceObject
        {...common}
        entrance="sign-in"
        place={P.sign}
        buttonRef={props.entranceRefs["sign-in"]}
        ariaLabel={props.signHint ? `${props.signLabel}: ${props.signHint}` : props.signLabel}
        faceClass="sign-face"
        face={
          <>
            <span className="sign-face-label">{props.signLabel}</span>
            {props.signHint && <span className="sign-face-hint">{props.signHint}</span>}
          </>
        }
      >
        <Bricks batch={SIGN_BRICKS} />
      </EntranceObject>
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
      <fog attach="fog" args={["#ece8e1", 90, 260]} />
      <Daylight />
      <CameraRig focus={props.focus} layout={props.layout} reducedMotion={reduced} onArrive={props.onArrive} />
      <Decoration layout={props.layout} />
      {/* soft contact shadows under everything, drawn once (the table doesn't move) */}
      <ContactShadows key={props.layout} position={[0, 0.012, TABLE.z0 + TABLE.d / 2]} scale={[TABLE.w, TABLE.d]} resolution={1024} blur={1.2} far={3} opacity={0.62} color="#3f2a1a" frames={1} />
      <Entrances props={props} />
      <Lifecycle onReady={props.onReady} onContextLost={props.onContextLost} />
    </Canvas>
  );
}
