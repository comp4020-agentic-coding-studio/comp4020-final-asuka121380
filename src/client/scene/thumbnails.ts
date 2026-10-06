import * as THREE from "three";
import { CATALOG, partDef } from "../../domain/catalog.ts";
import { colourHex } from "../../domain/colours.ts";
import type { Placement } from "../../domain/rules.ts";
import { partGeometry, PLATE } from "./geometry.ts";
import { partTransform, plastic } from "./PartMesh.tsx";

// Tray pictures and the target picture, rendered once from the same part
// geometry the game places, by one offscreen renderer that is thrown away
// afterwards. No canvas keeps rendering per thumbnail.

export interface Pictures {
  parts: Record<string, string>;
  target: string;
}

function group(placements: readonly Placement[]): THREE.Group {
  const g = new THREE.Group();
  for (const p of placements) {
    const def = partDef(p.partId)!;
    const { position, rotationY } = partTransform(p);
    const pg = new THREE.Group();
    pg.position.set(...position);
    pg.rotation.y = rotationY;
    for (const piece of partGeometry(def).pieces) {
      pg.add(new THREE.Mesh(piece.geometry, plastic(piece.role === "main" ? colourHex(p.colour) : piece.role)));
    }
    g.add(pg);
  }
  return g;
}

function shoot(renderer: THREE.WebGLRenderer, subject: THREE.Object3D, w: number, h: number, dir: THREE.Vector3): string {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight("#fff4e2", "#9c8f78", 1.6));
  const sun = new THREE.DirectionalLight("#ffe7c7", 2.2);
  sun.position.set(-3, 6, 5);
  s.add(sun);
  s.add(subject);

  // frame the subject's bounding sphere
  const sphere = new THREE.Box3().setFromObject(subject).getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 500);
  const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(28 / 2)) * 1.02;
  cam.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
  cam.lookAt(sphere.center);

  renderer.setSize(w, h, false);
  renderer.render(s, cam);
  s.remove(subject);
  return renderer.domElement.toDataURL("image/png");
}

let cached: Promise<Pictures> | null = null;

export function pictures(reference: readonly Placement[]): Promise<Pictures> {
  cached ??= new Promise((resolve) => {
    // let the first frame of the real scene go first
    setTimeout(() => {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.setClearColor(0x000000, 0);
      const parts: Record<string, string> = {};
      for (const def of CATALOG) {
        const p: Placement = { partId: def.id, x: 0, y: 0, z: 0, rot: 0, colour: def.defaultColour };
        const g = group([p]);
        // tall parts read better a little further round
        parts[def.id] = shoot(renderer, g, 128, 128, new THREE.Vector3(0.9, def.h * PLATE > 2 ? 0.6 : 0.9, 1.4));
      }
      const target = shoot(renderer, group(reference), 360, 300, new THREE.Vector3(0.55, 0.45, 1));
      renderer.dispose();
      renderer.forceContextLoss();
      resolve({ parts, target });
    }, 50);
  });
  return cached;
}
