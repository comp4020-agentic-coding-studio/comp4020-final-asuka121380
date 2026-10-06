// Which way the camera faces, for moving the preview relative to the screen
// (ADR 0005). The 3D view reports its azimuth here; the arrow keys and the
// direction buttons ask it which grid step "left" or "up" means right now.
//
// Azimuth is three.js's spherical theta of the camera around its target:
// 0 when the camera is on +z (in front of the plot) looking towards −z.

const QUARTER = Math.PI / 2;
// how far past a diagonal the camera must turn before the mapping switches,
// so it doesn't flip back and forth while orbiting near 45°
const HYSTERESIS = (10 * Math.PI) / 180;

let azimuth = 0;
let quadrant = 0;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function setViewAzimuth(a: number): void {
  azimuth = a;
  if (Math.abs(wrap(a - quadrant * QUARTER)) > QUARTER / 2 + HYSTERESIS) {
    quadrant = (((Math.round(a / QUARTER) % 4) + 4) % 4);
  }
}

/** The quadrant the mapping is snapped to: 0 front, 1 right side, 2 back, 3 left side. */
export const viewQuadrant = (): number => quadrant;

/**
 * One grid step for a screen direction: `right` is +1 for screen-right,
 * `up` is +1 for away from the viewer. Always along a grid axis.
 */
export function screenToGrid(right: number, up: number): { dx: number; dz: number } {
  const t = quadrant * QUARTER;
  // screen-right is (cos t, −sin t) and away is (−sin t, −cos t) on the plot
  const rx = Math.round(Math.cos(t));
  const rz = Math.round(-Math.sin(t));
  const ax = Math.round(-Math.sin(t));
  const az = Math.round(-Math.cos(t));
  return { dx: right * rx + up * ax, dz: right * rz + up * az };
}
