import type { SceneInfo } from "../registry.ts";

// The third scene (ADR 0016). The kit, plot and the tree's fixed structure
// are in src/domain/treehouse.ts.
export const treehouse: SceneInfo = {
  id: "treehouse-01",
  size: "Large",
  title: "Woodland Commons",
  setting: "A great tree in a forest clearing, on an early-autumn afternoon",
  blurb:
    "Build a settlement in and around one great tree. Its trunk carries three fixed platforms, low, middle and high, ready for cabins; add stairs, railings, walkways and more platforms of your own. The kit holds enough for three timber cabins and their stairs, with plenty to spare for six builders.",
  cover: "/scenes/woodland-commons.webp",
  coverAlt:
    "A great tree in a sunny forest clearing, with three empty wooden platforms on its trunk at three heights, under a sparse canopy of green and gold leaves.",
  targetLabel: "Target tree house",
  targetAlt:
    "The target: three timber cabins with blue gable roofs on the tree's three platforms, joined by stairs from the ground and up to the crown, with porch railings and a picnic spot below.",
  suggestedColours: ["nougat", "bark", "sand", "navy", "leaf", "forest", "orange", "bright-red"],
  startColour: "nougat",
  plot: { colour: "#8fae5a", vary: 0.08 },
  frame: { across: 20, above: 24, below: 9 },
  camera: { centreY: 10, panHeight: 32, maxDistance: 120 },
  foliageToggle: true,
};
