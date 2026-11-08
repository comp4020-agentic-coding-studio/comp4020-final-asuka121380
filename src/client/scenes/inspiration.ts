import type * as THREE from "three";

// Scene-specific context for the editor's inspiration picture (ADR 0016),
// loaded only by the editor. A scene with a fixed structure shows it round
// the reference build, so the picture explains what the kit builds round
// what is already there.

export type InspirationContext = () => Promise<{ subject: THREE.Group; frame: THREE.Box3 }>;

export const INSPIRATION_CONTEXT: Readonly<Record<string, InspirationContext>> = {
  "treehouse-01": () => import("./treehouse/inspiration.ts").then((m) => m.inspirationContext()),
};
