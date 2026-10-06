import { describe, expect, it } from "vitest";
import { partDef } from "../../src/domain/catalog.ts";
import { applyPlacement, fitHeights, validatePlacement, type BuildState, type Placement } from "../../src/domain/rules.ts";
import { STREET_SCENE as scene } from "../../src/domain/scene.ts";

// The heights a preview can offer at one footprint (ADR 0005): a higher part
// must not hide a valid lower position, and an invalid one stays refused.

const fresh = (): BuildState => ({ parts: [], inventory: { ...scene.kit } });

let seq = 0;
function place(state: BuildState, p: Partial<Placement> & { partId: string }): BuildState {
  const full: Placement = { x: 0, y: 0, z: 0, rot: 0, colour: "navy", ...p };
  const rejection = validatePlacement(scene, state, full);
  if (rejection) throw new Error(`${full.partId}: ${rejection.message}`);
  return applyPlacement(state, full, `f${seq++}`);
}

const heights = (state: BuildState, partId: string, x: number, z: number) =>
  fitHeights(scene, partDef(partId)!, { x, z, rot: 0 }, state.parts);

describe("fit heights", () => {
  it("on an empty plot, only the plot itself", () => {
    expect(heights(fresh(), "brick-2x2", 4, 2)).toEqual([0]);
  });

  it("under a brick overhang there is still room on the plot, as well as on top", () => {
    // a 2×2 pillar at x 0–1, and a 2×4 on it reaching out over x 2–3
    let s = place(fresh(), { partId: "brick-2x2", x: 0, z: 0 });
    s = place(s, { partId: "brick-2x4", x: 0, y: 3, z: 0 });
    expect(heights(s, "brick-2x2", 2, 0)).toEqual([0, 6]);
    expect(validatePlacement(scene, s, { partId: "brick-2x2", x: 2, y: 0, z: 0, rot: 0, colour: "navy" })).toBeNull();
  });

  it("a gap too low for the part is refused, not offered", () => {
    // two plates of pillar, then a 2×4 overhang only two plates up
    let s = place(fresh(), { partId: "plate-2x2", x: 0, z: 0 });
    s = place(s, { partId: "plate-2x2", x: 0, y: 1, z: 0 });
    s = place(s, { partId: "brick-2x4", x: 0, y: 2, z: 0 });
    expect(heights(s, "brick-2x2", 2, 0)).toEqual([5]);
    expect(validatePlacement(scene, s, { partId: "brick-2x2", x: 2, y: 0, z: 0, rot: 0, colour: "navy" })?.code).toBe("collision");
    // a plate still fits in that gap
    expect(heights(s, "plate-2x2", 2, 0)).toContain(0);
  });

  it("floating levels are never offered", () => {
    const s = place(fresh(), { partId: "brick-2x2", x: 0, z: 0 });
    const hs = heights(s, "brick-2x2", 1, 0);
    // overlapping the pillar half-way: on its top only
    expect(hs).toEqual([3]);
    for (const y of [1, 2, 4, 5]) {
      expect(validatePlacement(scene, s, { partId: "brick-2x2", x: 1, y, z: 0, rot: 0, colour: "navy" })).not.toBeNull();
    }
  });
});
