// Isometric brick drawings as SVG strings, for the brand mark and the
// homepage's hero. Original drawing code: three faces per brick and an
// elliptical stud with a highlight, in the spirit of CSS brick demos such as
// react-legos (MIT), but none of its code is used here.
//
// Coordinates are in studs: x to the right-back, y to the left-back, z up in
// plates (a brick is 3). Bricks are drawn back to front.

export interface IsoBrick {
  x: number;
  y: number;
  z: number;
  /** Studs along x and y, and height in plates. */
  w: number;
  d: number;
  h: number;
  colour: string;
  /** Leave the studs off (a smooth tile, or a part hidden under another). */
  smooth?: boolean;
  /** A see-through planned part, not a real one. */
  ghost?: boolean;
  /** Hovering above the rest, about to be placed: drawn over everything. */
  float?: boolean;
}

const U = 20; // one stud, in SVG units
const PLATE = 8; // one plate's height
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

const px = (x: number, y: number, z: number): [number, number] => [(x - y) * COS * U, (x + y) * SIN * U - z * PLATE];
const pts = (ps: [number, number][]): string => ps.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

/**
 * One 1×1 column of a brick: its two visible sides and top, plus a stud.
 * Drawing bricks column by column, back to front, keeps the painter's order
 * right for bricks of any size; each face is stroked in its own colour so
 * neighbouring columns of one brick meet without a seam.
 */
function column(b: IsoBrick, i: number, j: number): string {
  const x = b.x + i;
  const y = b.y + j;
  const { z, h, colour } = b;
  const top = z + h;
  const face = (ps: [number, number][], f: number) => {
    const c = shade(colour, f);
    return `<polygon points="${pts(ps)}" fill="${c}" stroke="${c}" stroke-width="0.6" stroke-linejoin="round"/>`;
  };
  // the right side first: its stroke would otherwise bleed onto the left side
  const out = [
    face([px(x + 1, y, z), px(x + 1, y + 1, z), px(x + 1, y + 1, top), px(x + 1, y, top)], 0.64),
    face([px(x, y + 1, z), px(x + 1, y + 1, z), px(x + 1, y + 1, top), px(x, y + 1, top)], 0.8),
    face([px(x, y, top), px(x + 1, y, top), px(x + 1, y + 1, top), px(x, y + 1, top)], 1.08),
  ];
  // a darker line where one brick ends, so neighbouring bricks read as separate
  const edge = shade(colour, 0.55);
  if (i === b.w - 1) out.push(`<polyline points="${pts([px(x + 1, y + 1, z), px(x + 1, y + 1, top), px(x + 1, y, top)])}" fill="none" stroke="${edge}" stroke-width="0.8"/>`);
  if (j === b.d - 1) out.push(`<polyline points="${pts([px(x, y + 1, top), px(x + 1, y + 1, top)])}" fill="none" stroke="${edge}" stroke-width="0.8"/>`);
  if (!b.smooth) {
    const [cx, cy] = px(x + 0.5, y + 0.5, top);
    const rx = 0.3 * U * COS * 1.15;
    const ry = rx * 0.58;
    const sh = 3.4;
    out.push(
      `<path d="M${(cx - rx).toFixed(1)},${cy.toFixed(1)} v${-sh} a${rx.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${(2 * rx).toFixed(1)},0 v${sh} a${rx.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${(-2 * rx).toFixed(1)},0z" fill="${shade(colour, 0.7)}"/>`,
      `<ellipse cx="${cx.toFixed(1)}" cy="${(cy - sh).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${shade(colour, 1.16)}"/>`,
    );
  }
  return out.join("");
}

/**
 * One SVG of the given bricks, its viewBox fitted round them. Columns are
 * drawn back to front (x + y, then z). A ghost or floating brick is drawn
 * last as one group, over everything. Each column is a
 * <g class="brick" style="--i;--z"> so a page can animate whole bricks.
 */
export function isoSvg(bricks: readonly IsoBrick[], label: string): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bricks) {
    for (const [cx, cy] of [px(b.x, b.y + b.d, b.z), px(b.x + b.w, b.y, b.z), px(b.x, b.y, b.z + b.h + 1), px(b.x + b.w, b.y + b.d, b.z)]) {
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    }
  }
  const solid = bricks.filter((b) => !b.ghost && !b.float);
  const cells: { b: IsoBrick; n: number; i: number; j: number }[] = [];
  solid.forEach((b, n) => {
    for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) cells.push({ b, n, i, j });
  });
  cells.sort((a, c) => a.b.x + a.i + a.b.y + a.j - (c.b.x + c.i + c.b.y + c.j) || a.b.z - c.b.z);
  const body = cells.map(({ b, n, i, j }) => `<g class="brick" style="--i:${n};--z:${b.z}">${column(b, i, j)}</g>`).join("");
  const over = bricks
    .filter((b) => b.ghost || b.float)
    .map((b) => {
      const cols: string[] = [];
      for (let k = 0; k < b.w + b.d - 1; k++) for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) if (i + j === k) cols.push(column(b, i, j));
      return `<g class="brick ${b.ghost ? "ghost" : "float"}" style="--z:${b.z}"${b.ghost ? ' opacity="0.42"' : ""}>${cols.join("")}</g>`;
    })
    .join("");
  const pad = 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + 2 * pad).toFixed(0)} ${(maxY - minY + 2 * pad).toFixed(0)}" role="img" aria-label="${label}">${body}${over}</svg>`;
}

/** The brand mark: a red 2×2 brick on a yellow plate. */
export const brandMark = (): string =>
  isoSvg(
    [
      { x: 0, y: 0, z: 0, w: 3, d: 3, h: 1, colour: "#ffcd00", smooth: true },
      { x: 0.5, y: 0.5, z: 1, w: 2, d: 2, h: 3, colour: "#e3241b" },
    ],
    "",
  ).replace('role="img" aria-label=""', 'aria-hidden="true"');
