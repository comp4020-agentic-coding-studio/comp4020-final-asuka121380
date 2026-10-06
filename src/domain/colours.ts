// Colour is chosen at placement and is never an inventory dimension. The ids
// are what gets stored; the hex values are appearance only.

export interface Colour {
  id: string;
  name: string;
  hex: string;
}

export const COLOURS: readonly Colour[] = [
  { id: "white", name: "White", hex: "#f2f1ec" },
  { id: "pale-mint", name: "Pale mint", hex: "#cfe9df" },
  { id: "navy", name: "Navy", hex: "#2c4a7c" },
  { id: "sky", name: "Sky blue", hex: "#7fa9d6" },
  { id: "leaf", name: "Leaf green", hex: "#4caf5c" },
  { id: "forest", name: "Forest green", hex: "#2f5a45" },
  { id: "bark", name: "Bark brown", hex: "#6a3b27" },
  { id: "sand", name: "Sand", hex: "#dcc9a0" },
  { id: "butter", name: "Butter yellow", hex: "#f2c94c" },
  { id: "brick-red", name: "Brick red", hex: "#b8392f" },
  { id: "rose", name: "Rose pink", hex: "#e3a3b6" },
  { id: "stone", name: "Stone grey", hex: "#a6a9ab" },
  { id: "charcoal", name: "Charcoal", hex: "#4d5156" },
  // 6 Oct 2026 (ADR 0004): brighter colours, added only. Existing ids and
  // their meaning never change, so every saved build stays valid.
  { id: "bright-red", name: "Bright red", hex: "#e3241b" },
  { id: "coral", name: "Coral", hex: "#ff7059" },
  { id: "orange", name: "Orange", hex: "#f6871f" },
  { id: "bright-yellow", name: "Bright yellow", hex: "#ffcd00" },
  { id: "turquoise", name: "Turquoise", hex: "#1fb4ab" },
  { id: "lavender", name: "Lavender", hex: "#a68fdb" },
];

const byId = new Map(COLOURS.map((c) => [c.id, c]));

export const isColour = (id: unknown): id is string => typeof id === "string" && byId.has(id);

export const colourHex = (id: string): string => byId.get(id)?.hex ?? "#ff00ff";

export const colourName = (id: string): string => byId.get(id)?.name ?? id;
