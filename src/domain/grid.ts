// The build grid. x runs along the street, z runs from the back of the plot
// (0) towards the viewer, and y counts plate heights (a brick is 3 plates).
// A part's (x, y, z) is the minimum corner of its rotated footprint.

export type Rotation = 0 | 1 | 2 | 3;

export const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

export interface Cell {
  x: number;
  z: number;
}

export interface Size {
  w: number;
  d: number;
}

// One quarter turn, matching three.js `rotation.y = +90°` applied to a part
// whose geometry is centred on its footprint. Repeating it gives every
// rotation, so the grid and the renderer cannot disagree.
function quarterTurn(c: Cell, size: Size): { cell: Cell; size: Size } {
  return { cell: { x: c.z, z: size.w - 1 - c.x }, size: { w: size.d, d: size.w } };
}

export function rotateCell(c: Cell, size: Size, r: Rotation): Cell {
  let cell = c;
  let s = size;
  for (let i = 0; i < r; i++) ({ cell, size: s } = quarterTurn(cell, s));
  return cell;
}

export function rotatedSize(size: Size, r: Rotation): Size {
  return r % 2 === 0 ? size : { w: size.d, d: size.w };
}

export const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
