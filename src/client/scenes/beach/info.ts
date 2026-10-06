import type { SceneInfo } from "../registry.ts";

// The first scene. Its data id stays `street-01`, the id saved builds are
// keyed by, so no build needs migrating; only what's shown changed (ADR 0004).
export const beach: SceneInfo = {
  id: "street-01",
  title: "Beach Houses",
  setting: "A row of houses facing the sea, just before sunset",
  blurb:
    "Build on the empty plot between colourful neighbours, with the promenade and the beach in front. The kit holds everything for a small house with a pointed roof and its tree, and a few extras to make it your own.",
  cover: "/scenes/beach-houses.webp",
  coverAlt: "The empty plot between a pink and a turquoise beach house, with the sand and the evening sky beyond.",
  suggestedColours: ["coral", "turquoise", "bright-yellow", "white", "lavender", "bright-red"],
};
