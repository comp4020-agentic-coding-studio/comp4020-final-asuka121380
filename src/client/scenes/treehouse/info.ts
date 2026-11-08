import type { SceneInfo } from "../registry.ts";

// The third scene (ADR 0016). The kit, plot and the tree's fixed structure
// are in src/domain/treehouse.ts.
export const treehouse: SceneInfo = {
  id: "treehouse-01",
  size: "Large",
  title: "Woodland Commons",
  setting: "A great tree in a forest clearing, on an early-autumn afternoon",
  blurb:
    "Build a settlement in and around one great tree. Its trunk carries three fixed platforms, low, middle and high, ready for cabins; add stairs, railings, walkways and more platforms of your own. The kit, counted from the official tree house's cabins, holds plenty for six builders to make cabins, decks and stairs of their own.",
  cover: "/scenes/woodland-commons.webp",
  coverAlt:
    "A great tree in a sunny forest clearing, with three empty wooden platforms on its trunk at three heights, under a sparse canopy of green and gold leaves.",
  inspiration: {
    label: "Tree-house inspiration",
    alt: "One idea for the kit, built round the great tree: on the tree's low platform a wide timber lodge with a green roof opens onto a shared deck on stilts in front of the trunk, with a long table; stairs climb from the ground to the deck and on to a light timber bunkhouse with a blue gable on the middle platform; a second flight climbs to an open lookout with a red roof on the trunk's crown. A fire ring sits on the ground in front.",
    note: {
      fixed: "The great tree, its branches and three platforms are already there. They aren't in your kit, and nobody has to build them.",
      built: "Everything else in the picture, the cabins, shared deck, stairs, railings and fire ring, is one idea for what the kit builds round them.",
    },
    size: [360, 420],
  },
  suggestedColours: ["nougat", "bark", "sand", "navy", "leaf", "forest", "orange", "bright-red"],
  startColour: "nougat",
  plot: { colour: "#8fae5a", vary: 0.08 },
  frame: { across: 20, above: 32, below: 17 },
  camera: { centreY: 15, panHeight: 32, maxDistance: 130, polar: 1.3, targetAt: 0.6 },
  foliageToggle: true,
};
