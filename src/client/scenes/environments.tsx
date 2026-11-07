import { lazy, type ComponentType, type LazyExoticComponent } from "react";

// Each scene's 3D surroundings and light, by template id, loaded only by the
// editor and only when needed (ADR 0004). The metadata the homepage reads
// is in registry.ts and doesn't pull any of this in.

export const ENVIRONMENTS: Readonly<Record<string, LazyExoticComponent<ComponentType>>> = {
  "street-01": lazy(() => import("./beach/Environment.tsx").then((m) => ({ default: m.BeachEnvironment }))),
  "castle-01": lazy(() => import("./castle/Environment.tsx").then((m) => ({ default: m.CastleEnvironment }))),
  "treehouse-01": lazy(() => import("./treehouse/Environment.tsx").then((m) => ({ default: m.WoodlandEnvironment }))),
};
