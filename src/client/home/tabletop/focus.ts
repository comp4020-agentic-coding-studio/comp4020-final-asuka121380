// The table's navigation state (ADR 0014), with no three.js: the homepage's
// entry script imports this, and must never pull in three.js before the
// WebGL probe has passed (the scene's own chunk, TableScene, loads lazily
// after it). The camera geometry that serves each focus lives in
// destinations.ts, which only the scene imports.

/** Where the camera can be: the overview, or in front of one entrance. */
export type Focus = "overview" | "sign-in" | "scenes" | "rooms" | "friends" | "shelf" | "about";
export type Entrance = Exclude<Focus, "overview">;

/** Each entrance: the object it lives on, its name on the table, and what activating it opens. */
export const ENTRANCES: readonly { focus: Entrance; label: string; hint: string }[] = [
  { focus: "scenes", label: "Scene tray", hint: "choose a scene and start building" },
  { focus: "rooms", label: "Noticeboard", hint: "join a room" },
  { focus: "shelf", label: "Creation shelf", hint: "your collection and the showcase" },
  { focus: "friends", label: "Friends", hint: "friends and invitations" },
  { focus: "about", label: "Booklet", hint: "about this project" },
  { focus: "sign-in", label: "Sign in", hint: "your account" },
];

const FOCI = new Set<string>(ENTRANCES.map((e) => e.focus));
export const isEntrance = (s: string | null): s is Entrance => !!s && FOCI.has(s);

export type Layout = "wide" | "narrow";

/** Narrow = a phone in portrait, where the focused panel is a bottom sheet. */
export const layoutFor = (width: number, height: number): Layout => (width < 760 || width / height < 0.8 ? "narrow" : "wide");

/** How long a move takes; reduced motion makes it a cut. */
export const TRAVEL_MS = 700;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
