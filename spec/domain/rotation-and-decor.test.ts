import { describe, expect, it } from "vitest";
import {
  applyPlacement,
  applyRotation,
  validatePlacement,
  validateRotation,
  type BuildState,
  type Placement,
} from "../../src/domain/rules.ts";
import { billOfMaterials, STREET_SCENE as scene } from "../../src/domain/scene.ts";

const fresh = (): BuildState => ({ parts: [], inventory: { ...scene.kit } });

let seq = 0;
function place(state: BuildState, p: Partial<Placement> & { partId: string }): BuildState {
  const full: Placement = { x: 0, y: 0, z: 0, rot: 0, colour: "navy", ...p };
  const rejection = validatePlacement(scene, state, full);
  if (rejection) throw new Error(`${full.partId}: ${rejection.message}`);
  return applyPlacement(state, full, `r${seq++}`);
}

describe("rotating a placed part", () => {
  it("turns it about its footprint centre, keeping its id, colour and stock", () => {
    const state = place(fresh(), { partId: "brick-2x4", x: 4, z: 2 });
    const id = state.parts[0].id;
    expect(validateRotation(scene, state, id, 1)).toBeNull();
    const after = applyRotation(state, id, 1);
    // 4×2 centred at (6, 3) becomes 2×4 centred at (6, 3)
    expect(after.parts[0]).toMatchObject({ id, x: 5, z: 1, rot: 1, colour: "navy" });
    expect(after.inventory).toEqual(state.inventory);
  });

  it("refuses a turn into another part, and changes nothing", () => {
    let state = place(fresh(), { partId: "brick-2x4", x: 4, z: 2 });
    state = place(state, { partId: "brick-2x2", x: 5, z: 0 });
    const r = validateRotation(scene, state, state.parts[0].id, 1);
    expect(r?.code).toBe("collision");
    expect(r?.message).toMatch(/^Can't turn it there/);
  });

  it("refuses a turn out of the plot", () => {
    const state = place(fresh(), { partId: "brick-2x4", x: 0, z: 0 });
    expect(validateRotation(scene, state, state.parts[0].id, 1)?.code).toBe("out_of_bounds");
  });

  it("refuses a turn that would leave a part resting on it unsupported", () => {
    let state = place(fresh(), { partId: "brick-2x4", x: 4, z: 2 });
    // a 1×2 across the brick's left end (cells x 4, z 2–3), which the turned
    // brick (x 5–6, z 1–4) no longer covers
    state = place(state, { partId: "brick-1x2", x: 4, y: 3, z: 2, rot: 1 });
    expect(validateRotation(scene, state, state.parts[0].id, 1)?.code).toBe("would_unsupport");
  });

  it("refuses a turn the part doesn't allow, or no turn at all", () => {
    const state = place(fresh(), { partId: "brick-2x2", x: 4, z: 2 });
    expect(validateRotation(scene, state, state.parts[0].id, 1)?.code).toBe("bad_rotation");
    expect(validateRotation(scene, state, state.parts[0].id, 0)?.code).toBe("no_change");
  });

  it("re-checks the turned part's own support", () => {
    // a 2×4 held up only by a 1×1 round under its left end; turned, its
    // footprint (x 5–6, z 1–4) leaves the round at (4, 2)
    let state = place(fresh(), { partId: "round-1x1", x: 4, z: 2 });
    state = place(state, { partId: "brick-2x4", x: 4, y: 1, z: 2 });
    expect(validateRotation(scene, state, state.parts[1].id, 1)?.code).toBe("unsupported");
  });
});

describe("decorative parts (scene version 2)", () => {
  it("adds part types without changing any existing quantity", () => {
    const v1Types = Object.keys(billOfMaterials(scene.reference));
    for (const id of v1Types) expect(scene.kit[id]).toBeGreaterThanOrEqual(billOfMaterials(scene.reference)[id]);
    for (const [id, n] of Object.entries(scene.additions[2])) {
      expect(scene.kit[id]).toBe(n);
      expect(v1Types).not.toContain(id);
    }
  });

  it("a window stands in a gap like a brick and carries studs on top", () => {
    let state = place(fresh(), { partId: "window-1x2x2", x: 3, z: 4 });
    expect(state.inventory["window-1x2x2"]).toBe(scene.kit["window-1x2x2"] - 1);
    state = place(state, { partId: "brick-1x2", x: 3, y: 6, z: 4 });
    expect(state.parts).toHaveLength(2);
  });

  it("a fence carries studs only on its posts", () => {
    const state = place(fresh(), { partId: "fence-1x4x1", x: 0, z: 7 });
    expect(validatePlacement(scene, state, { partId: "round-1x1", x: 0, y: 3, z: 7, rot: 0, colour: "white" })).toBeNull();
    expect(validatePlacement(scene, state, { partId: "round-1x1", x: 1, y: 3, z: 7, rot: 0, colour: "white" })?.code).toBe("unsupported");
  });

  it("nothing can be stacked into a planter's flowers", () => {
    const state = place(fresh(), { partId: "planter-1x2", x: 2, z: 6 });
    expect(validatePlacement(scene, state, { partId: "brick-1x2", x: 2, y: 3, z: 6, rot: 0, colour: "white" })?.code).toBe("collision");
    expect(validatePlacement(scene, state, { partId: "brick-1x2", x: 2, y: 5, z: 6, rot: 0, colour: "white" })?.code).toBe("unsupported");
  });

  it("each decorative part runs out at its quantity", () => {
    let state = fresh();
    for (let i = 0; i < scene.kit["planter-1x2"]; i++) state = place(state, { partId: "planter-1x2", x: i * 2, z: 7 });
    expect(validatePlacement(scene, state, { partId: "planter-1x2", x: 10, y: 0, z: 7, rot: 0, colour: "bark" })?.code).toBe("out_of_stock");
  });
});
