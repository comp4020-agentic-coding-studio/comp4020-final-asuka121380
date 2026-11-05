import type { SceneInfo } from "../registry.ts";

// The second scene (ADR 0015). The kit and plot are in src/domain/castle.ts.
export const castle: SceneInfo = {
  id: "castle-01",
  title: "Medieval Castle",
  setting: "A stone courtyard in a green valley, on a clear afternoon",
  blurb:
    "Build a castle on the paved courtyard at the end of the road, with the mountains behind it. The kit holds enough for a gatehouse, two towers, the curtain walls round a small courtyard and a roofed hall, with some spare to make it your own.",
  cover: "/scenes/medieval-castle.webp",
  coverAlt: "The empty paved courtyard at the end of a stone road, with grass, a few low ruins and wooded hills and mountains beyond, under a clear afternoon sky.",
  targetLabel: "Target castle",
  targetAlt:
    "The target: a stone castle with a round-arched gate between two square towers, battlements along the walls, and a hall with a blue gable roof behind the gate.",
  suggestedColours: ["stone", "charcoal", "white", "bark", "sand", "navy", "brick-red", "bright-yellow"],
  startColour: "stone",
  plot: { colour: "#c3c0b8", vary: 0.06 },
  frame: { across: 22, above: 13, below: 10 },
};
