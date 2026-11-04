import { partDef } from "../../domain/catalog.ts";
import { colourHex } from "../../domain/colours.ts";
import { rotatedSize } from "../../domain/grid.ts";
import { isoSvg, type IsoBrick } from "./iso.ts";

// A small picture of a saved construction, drawn from its real parts as an
// isometric SVG: no WebGL, no three.js, nothing that keeps rendering. Used by
// the collection and showcase cards and the table's shelf preview, so a
// glance at someone's work never loads a 3D scene per card. Each part is
// drawn as its footprint and height; slopes, windows and details read as
// blocks of their colour, which is honest about being a sketch. The full
// view (SnapshotView) is still the place to see the real shapes.

export interface PreviewPart {
  partId: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  colour: string;
}

/**
 * The construction as an SVG string, or null when it has no parts. The
 * game's x runs right and z towards the viewer; iso's x runs right-back and
 * y left-back, so z is flipped to keep the house's front facing out.
 */
export function creationSvg(parts: readonly PreviewPart[], label: string): string | null {
  if (parts.length === 0) return null;
  const bricks: IsoBrick[] = [];
  let maxZ = 0;
  for (const p of parts) {
    const def = partDef(p.partId);
    if (!def) continue;
    const s = rotatedSize(def, (p.rot & 3) as 0 | 1 | 2 | 3);
    maxZ = Math.max(maxZ, p.z + s.d);
  }
  for (const p of parts) {
    const def = partDef(p.partId);
    if (!def) continue;
    const s = rotatedSize(def, (p.rot & 3) as 0 | 1 | 2 | 3);
    bricks.push({
      x: p.x,
      y: maxZ - (p.z + s.d),
      z: p.y,
      w: s.w,
      d: s.d,
      h: def.h,
      colour: colourHex(p.colour),
      smooth: def.category === "slope" || def.category === "special" || def.studs === undefined || (Array.isArray(def.studs) && def.studs.length === 0),
    });
  }
  return bricks.length ? isoSvg(bricks, label) : null;
}
