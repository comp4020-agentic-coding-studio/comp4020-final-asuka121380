// The tabletop's designed camera poses (ADR 0014). A destination is a place to
// look from and a point to look at; there is no free orbit on the homepage.
// Each later entrance adds one entry here and one object, nothing else.

export type Vec3 = readonly [number, number, number];

export interface Pose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export type Focus = "overview" | "sign-in";

export type Layout = "wide" | "narrow";

/** Narrow = a phone in portrait, where the focused panel is a bottom sheet. */
export const layoutFor = (width: number, height: number): Layout => (width < 760 || width / height < 0.8 ? "narrow" : "wide");

// Table units are studs. The table's front edge is at z = 18, its centre at the
// origin; the visitor sits in front of it, a little above the surface. Each
// layout pairs with its own arrangement of the objects (build.ts, PLACES).
// The narrow poses were fitted by projecting the objects' corners at 390×844.
const POSES: Record<Layout, Record<Focus, Pose>> = {
  wide: {
    overview: { position: [0, 22, 39], target: [0, 1.5, -1.5], fov: 34 },
    // The sign sits in the left third with the tabletop and the house behind
    // it; the panel stands in the right-hand side of the screen.
    "sign-in": { position: [-2.5, 11.5, 30], target: [-5.6, 3.2, 6], fov: 36 },
  },
  narrow: {
    // looking down over the table, so a tall screen holds all of it
    overview: { position: [0, 58, 34], target: [0, 0, 1], fov: 52 },
    // The whole sign in the band above the bottom sheet (the sheet takes the
    // lower ~60%, so the target sits high in the frame).
    "sign-in": { position: [-5.5, 20, 50], target: [-5.5, 0.4, 11.5], fov: 38 },
  },
};

export const poseFor = (layout: Layout, focus: Focus): Pose => POSES[layout][focus];

/** How long a move takes; reduced motion makes it a cut. */
export const TRAVEL_MS = 650;

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
