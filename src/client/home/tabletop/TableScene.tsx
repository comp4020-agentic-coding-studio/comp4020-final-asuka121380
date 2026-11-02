import { ContactShadows, Environment, Html, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Batch } from "../../scene/scenery.ts";
import {
  at,
  BEACH_SLOT,
  beachMiniature,
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
  sceneTray,
  shelf,
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
      <hemisphereLight args={["#eef3fb", "#ecdcc6", 1.15]} />
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

/** Honey-coloured planks with a fine, quiet grain: seams every plank, streaks within. */
function woodGrain(): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g) => {
    g.fillStyle = "#e9c99b";
    g.fillRect(0, 0, 1024, 1024);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const planks = 6;
    const pw = 1024 / planks;
    for (let p = 0; p < planks; p++) {
      g.fillStyle = `rgba(${p % 2 ? "170,110,50" : "255,235,200"},${0.05 + rnd() * 0.05})`;
      g.fillRect(p * pw, 0, pw, 1024);
      for (let i = 0; i < 46; i++) {
        const x = p * pw + rnd() * pw;
        g.strokeStyle = `rgba(150,95,45,${0.03 + rnd() * 0.06})`;
        g.lineWidth = 0.6 + rnd() * 1.6;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= 1024; y += 64) g.lineTo(x + Math.sin(y / 170 + i) * (2 + rnd() * 3), y);
        g.stroke();
      }
      g.fillStyle = "rgba(120,75,35,0.28)";
      g.fillRect(p * pw, 0, 2, 1024);
    }
  }, [1.6, 1]);
}

/** The table top: the rounded slab with its grain on top and a plain edge. */
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
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({ map: woodGrain(), roughness: 0.7, clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.3 }), []);
  return <mesh geometry={geometry} material={material} receiveShadow castShadow raycast={() => null} />;
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

/** A label on the front of a cream strip in an object's frame, facing the object's +z. */
function StripLabel({ place, x, y, z, w, h, children }: { place: Place; x: number; y: number; z: number; w: number; h: number; children: string }) {
  return (
    <PrintedLabel position={at(place, x, y + h / 2, z)} rotation={new THREE.Euler(0, place.rot ?? 0, 0)} width={w * 0.96} height={h * 0.9}>
      {children}
    </PrintedLabel>
  );
}

/**
 * The booklet's open pages: "About" at the top of the left page over a
 * picture of the table's house; the right page shows one building step, a
 * brick coming down onto two others. Printed, so it lies flat on the paper.
 */
function BookletPrint({ place }: { place: Place }) {
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
    <mesh position={at(place, 0, bookletPageY + 0.01, 0)} rotation={new THREE.Euler(-Math.PI / 2, place.rot ?? 0, 0, "YXZ")} raycast={() => null} receiveShadow>
      <planeGeometry args={[BOOKLET.w - 0.2, BOOKLET.d - 0.1]} />
      <meshStandardMaterial map={tex} roughness={0.95} polygonOffset polygonOffsetFactor={-2} />
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

function Decoration({ layout }: { layout: Layout }) {
  const P = PLACES[layout];
  const ids = Object.keys(BUILT) as (keyof typeof BUILT)[];
  return (
    <>
      <Room />
      {ids.map((id) => (
        <Placed key={id} id={id} place={P[id]} />
      ))}
      <ProposedSlope place={P.creation} />
      <Bricks batch={LOOSE[layout]} />
      <BookletPrint place={P.booklet} />

      <StripLabel place={P.board} x={0} y={BOARD_HEADER.y} z={BOARD_HEADER.z + 0.07} w={BOARD.w - 1.0} h={BOARD_HEADER.h}>
        Join a room
      </StripLabel>
      <StripLabel place={P.shelf} x={0} y={SHELF_HEADER.y} z={SHELF_HEADER.z + 0.16} w={SHELF_HEADER.w} h={SHELF_HEADER.h}>
        Our creations
      </StripLabel>
      <StripLabel place={P.scenes} x={SCENE_LABEL.x} y={SCENE_LABEL.y} z={SCENE_LABEL.z + 0.16} w={SCENE_LABEL.w} h={SCENE_LABEL.h}>
        Beach Houses
      </StripLabel>
      <StripLabel place={P.friends} x={0} y={FRIENDS_LABEL.y} z={FRIENDS_LABEL.z + 0.16} w={FRIENDS_LABEL.w} h={FRIENDS_LABEL.h}>
        Friends
      </StripLabel>
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
      <ContactShadows key={props.layout} position={[0, 0.012, TABLE.z0 + TABLE.d / 2]} scale={[TABLE.w, TABLE.d]} resolution={1024} blur={1.4} far={2.5} opacity={0.5} color="#4a3220" frames={1} />
      <SignInSign onActivate={props.onActivateSignIn} label={props.signLabel} hint={props.signHint} buttonRef={props.signButtonRef} place={PLACES[props.layout].sign} roomy={props.layout === "narrow" && props.focus === "overview"} />
      <Lifecycle onReady={props.onReady} onContextLost={props.onContextLost} />
    </Canvas>
  );
}
