import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import {
  getState,
  placePreview,
  preview,
  scene,
  select,
  setTool,
  useApp,
} from "../state/store.ts";
import { PartMesh } from "./PartMesh.tsx";
import { Street } from "./Street.tsx";

// The 3D workbench: camera, light, the street and the player's parts, and the
// pointer path into the same store actions the buttons and keys use.

const TARGET = new THREE.Vector3(scene.bounds.w / 2, 4.6, scene.bounds.d / 2);
// near frontal, slightly raised, a little oblique
const VIEW_DIR = new THREE.Vector3(0.3, 0.5, 1).normalize();

export type Framing = "plot" | "street";

/** Studs visible across the canvas for each framing. */
const SPAN: Record<Framing, number> = { plot: 21, street: 46 };

function CameraRig({ framing, resetKey }: { framing: Framing; resetKey: number }) {
  const { camera, size } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    // fit the span to the narrower of width and (scaled) height
    const span = SPAN[framing];
    ortho.zoom = Math.min(size.width / span, (size.height * 1.9) / span);
    ortho.position.copy(TARGET).addScaledVector(VIEW_DIR, 80);
    ortho.lookAt(TARGET);
    ortho.updateProjectionMatrix();
    controls.current?.target.copy(TARGET);
    controls.current?.update();
  }, [camera, size.width, size.height, framing, resetKey]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      enableDamping={false}
      minAzimuthAngle={-0.75}
      maxAzimuthAngle={0.75}
      minPolarAngle={0.55}
      maxPolarAngle={1.32}
      minZoom={8}
      maxZoom={160}
      screenSpacePanning
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

function Build() {
  const snapshot = useApp((s) => s.snapshot);
  const mode = useApp((s) => s.tool.mode);
  const selectedId = useApp((s) => s.selectedId);
  const tool = useApp((s) => s.tool);
  // preview() reads only the tool and the snapshot
  const pv = useMemo(() => preview(getState()), [tool, snapshot]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (getState().tool.mode !== "build" || e.pointerType !== "mouse") return;
    e.stopPropagation();
    const cell = aimedCell(e);
    if (cell) setTool({ anchor: cell, lift: 0 });
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // that was a drag of the camera
    const { tool } = getState();
    if (tool.mode === "select") {
      const id = e.object.userData.placedId as string | undefined;
      select(id ?? null);
      return;
    }
    const cell = aimedCell(e);
    if (!cell) return;
    const pointer = (e.nativeEvent as PointerEvent).pointerType;
    const same = tool.anchor && tool.anchor.x === cell.x && tool.anchor.z === cell.z;
    // a mouse has already previewed by hovering; touch previews on the first tap
    if (pointer === "mouse" || same) void placePreview();
    else setTool({ anchor: cell, lift: 0 });
  };

  return (
    <group onPointerMove={onMove} onClick={onClick}>
      <Street />
      {snapshot?.parts.map((p) => (
        <PartMesh
          key={p.id}
          placement={p}
          highlighted={mode === "select" && p.id === selectedId}
          userData={{ placedId: p.id }}
        />
      ))}
      {pv && <PartMesh placement={pv.placement} ghost={pv.rejection ? "invalid" : "valid"} />}
    </group>
  );
}

function Sun() {
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(TARGET.x, 0, TARGET.z);
    return o;
  }, []);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={[TARGET.x - 22, 38, TARGET.z + 30]}
        target={target}
        intensity={2.4}
        color="#ffe3bd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
    </>
  );
}

export function Workbench({ framing, resetKey }: { framing: Framing; resetKey: number }) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 40, 80], near: 0.1, far: 400, zoom: 30 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => getState().tool.mode === "select" && select(null)}
    >
      <CameraRig framing={framing} resetKey={resetKey} />
      <hemisphereLight args={["#fff4e2", "#a99a7c", 1.15]} />
      <Sun />
      <Build />
    </Canvas>
  );
}
