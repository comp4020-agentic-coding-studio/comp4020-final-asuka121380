import { describe, expect, it } from "vitest";
import { partDef } from "../../src/domain/catalog.ts";
import {
  applyPlacement,
  applyProposePlan,
  applyRealizePlan,
  fitHeights,
  plannedRemaining,
  plannedStructure,
  planFits,
  validatePlacement,
  validatePlan,
  validateRealizePlan,
  validateRemoval,
  validateRotation,
  validateWithdrawPlan,
  type BuildState,
  type Placement,
  type Plan,
} from "../../src/domain/rules.ts";
import { STREET_SCENE as scene } from "../../src/domain/scene.ts";

// ADR 0012 (author, 19 Oct 2026): plans obey construction geometry against
// real parts plus standing open plans. This supersedes ADR 0009's "plans
// never need support and may overlap anything"; only stock stays exempt.

const fresh = (): BuildState => ({ parts: [], inventory: { ...scene.kit }, plans: [] });
const b24 = (x: number, y: number, z: number, extra: Partial<Placement> = {}): Placement => ({ partId: "brick-2x4", x, y, z, rot: 0, colour: "sky", ...extra });

let seq = 0;
let clock = 0;
function plan(state: BuildState, p: Placement): BuildState {
  const r = validatePlan(scene, state, p);
  if (r) throw new Error(`plan ${p.partId}@${p.x},${p.y},${p.z}: ${r.message}`);
  return applyProposePlan(state, p, `p${seq++}`, "a", new Date(1_800_000_000_000 + clock++).toISOString());
}
function real(state: BuildState, p: Placement): BuildState {
  const r = validatePlacement(scene, state, p);
  if (r) throw new Error(`place ${p.partId}@${p.x},${p.y},${p.z}: ${r.message}`);
  return { ...applyPlacement(state, p, `r${seq++}`), plans: state.plans };
}
const lastPlan = (s: BuildState): Plan => s.plans![s.plans!.length - 1];
/** A plan written by the earlier version, bypassing validation, as in a legacy database. */
const legacy = (s: BuildState, p: Placement): BuildState => applyProposePlan(s, p, `legacy${seq++}`, "old", new Date(1_700_000_000_000 + clock++).toISOString());

describe("where a new plan may go", () => {
  it("on the plot", () => {
    expect(validatePlan(scene, fresh(), b24(0, 0, 0))).toBeNull();
  });

  it("on a real brick's studs", () => {
    const s = real(fresh(), b24(0, 0, 0));
    expect(validatePlan(scene, s, b24(0, 3, 0))).toBeNull();
    expect(validatePlan(scene, s, b24(2, 3, 1))).toBeNull(); // partly overhanging: one stud is enough, as for real parts
  });

  it("on another standing plan, and a roof on a planned wall", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    expect(validatePlan(scene, s, { partId: "slope-2x2", x: 0, y: 6, z: 0, rot: 0, colour: "navy" })).toBeNull();
  });

  it("not floating in empty space", () => {
    expect(validatePlan(scene, fresh(), b24(0, 3, 0))?.code).toBe("unsupported");
  });

  it("not as an exact duplicate, nor overlapping a plan horizontally or vertically", () => {
    const s = plan(fresh(), b24(4, 0, 2));
    expect(validatePlan(scene, s, b24(4, 0, 2))?.code).toBe("collision");
    expect(validatePlan(scene, s, b24(6, 0, 3))?.code).toBe("collision"); // partial, sideways
    expect(validatePlan(scene, s, { partId: "plate-2x2", x: 4, y: 2, z: 2, rot: 0, colour: "sky" })?.code).toBe("collision"); // partial, vertical
    expect(validatePlan(scene, s, b24(4, 0, 2))?.message).toMatch(/Another plan/);
  });

  it("not inside a real part", () => {
    const s = real(fresh(), b24(0, 0, 0));
    expect(validatePlan(scene, s, b24(1, 0, 1))?.code).toBe("collision");
  });

  it("right next to, or stacked on, without touching anything", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    expect(validatePlan(scene, s, b24(4, 0, 0))).toBeNull();
    expect(validatePlan(scene, s, b24(0, 0, 2))).toBeNull();
    s = plan(s, b24(4, 0, 0));
    expect(validatePlan(scene, s, b24(2, 3, 0))).toBeNull(); // bridging two plans
  });

  it("keeps the catalogue's stud rules: nothing rests on a slope's face or a ridge, planned or real", () => {
    let s = plan(fresh(), { partId: "slope-2x2", x: 0, y: 0, z: 0, rot: 0, colour: "navy" });
    expect(validatePlan(scene, s, { partId: "brick-1x2", x: 0, y: 3, z: 1, rot: 0, colour: "sky" })?.code).toBe("unsupported");
    expect(validatePlan(scene, s, { partId: "brick-1x2", x: 0, y: 3, z: 0, rot: 0, colour: "sky" })).toBeNull();
    s = plan(s, { partId: "ridge-2x2", x: 4, y: 0, z: 0, rot: 0, colour: "navy" });
    expect(validatePlan(scene, s, { partId: "plate-2x2", x: 4, y: 3, z: 0, rot: 0, colour: "sky" })?.code).toBe("unsupported");
  });

  it("whatever the stock: planning beyond the real kit is allowed", () => {
    let s: BuildState = { ...fresh(), inventory: { ...scene.kit, "planter-1x2": 0 } };
    s = plan(s, { partId: "planter-1x2", x: 0, y: 0, z: 0, rot: 0, colour: "bark" });
    s = plan(s, { partId: "planter-1x2", x: 2, y: 0, z: 0, rot: 0, colour: "bark" });
    expect(plannedRemaining(s)["planter-1x2"]).toBe(-2);
  });

  it("is still out of bounds outside the plot", () => {
    expect(validatePlan(scene, fresh(), b24(scene.bounds.w - 2, 0, 0))?.code).toBe("out_of_bounds");
  });
});

describe("real parts only ever rest on real support", () => {
  it("a real brick can't sit on a plan", () => {
    const s = plan(fresh(), b24(0, 0, 0));
    expect(validatePlacement(scene, s, b24(0, 3, 0))?.code).toBe("unsupported");
  });

  it("a real brick may still be placed where a plan is (plans reserve nothing)", () => {
    const s = plan(fresh(), b24(0, 0, 0));
    expect(validatePlacement(scene, s, b24(0, 0, 0))).toBeNull();
  });

  it("realizing needs real support and real stock; a failed realization leaves the plan", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    const upper = lastPlan(s);
    expect(validateRealizePlan(scene, s, upper.id).rejection?.code).toBe("unsupported");
    const lower = s.plans![0];
    expect(validateRealizePlan(scene, s, lower.id).rejection).toBeNull();
    const none: BuildState = { ...s, inventory: { ...s.inventory, "brick-2x4": 0 } };
    expect(validateRealizePlan(scene, none, lower.id).rejection?.code).toBe("out_of_stock");
    expect(none.plans!.find((p) => p.id === lower.id)?.status).toBe("open");
  });

  it("realizing the wall keeps the planned roof standing, and only then can the roof be realized", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    const [wall, roof] = s.plans!;
    const stock = s.inventory["brick-2x4"];
    s = applyRealizePlan(s, wall.id, "real-wall", "b");
    expect(planFits(s).get(roof.id)).toBe("standing");
    expect(s.inventory["brick-2x4"]).toBe(stock - 1);
    expect(plannedRemaining(s)["brick-2x4"]).toBe(stock - 2);
    expect(validateRealizePlan(scene, s, roof.id).rejection).toBeNull();
  });
});

describe("support can't be pulled from under a standing plan", () => {
  it("withdrawing a plan that alone holds up another is refused; with other support it's allowed", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    const base = s.plans![0];
    expect(validateWithdrawPlan(s, base.id)?.code).toBe("plan_depends");
    expect(validateWithdrawPlan(s, base.id)?.message).toMatch(/planned Brick 2×4 rests on it/);
    // an alternative support under the top plan's other end
    let t = plan(fresh(), b24(0, 0, 0));
    t = plan(t, b24(4, 0, 0));
    t = plan(t, b24(2, 3, 0));
    expect(validateWithdrawPlan(t, t.plans![0].id)).toBeNull();
  });

  it("removing a real part that alone holds up a plan is refused", () => {
    let s = real(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    const r = validateRemoval(s, s.parts[0].id);
    expect(r?.code).toBe("plan_depends");
    expect(r?.message).toMatch(/plan/);
  });

  it("turning a real part out from under a plan is refused", () => {
    // turned about its centre, a 2×4 at x4–7,z2–3 becomes x5–6,z1–4: x7 loses its studs
    let s = real(fresh(), b24(4, 0, 2));
    s = plan(s, { partId: "brick-1x2", x: 7, y: 3, z: 2, rot: 1, colour: "sky" }); // rests only on x7
    expect(validateRotation(scene, s, s.parts[0].id, 1)?.code).toBe("plan_depends");
  });

  it("turning a real part INTO a plan is fine: the plan is kept and shown as conflicting", () => {
    let s = real(fresh(), b24(4, 0, 2));
    s = plan(s, { partId: "brick-1x2", x: 5, y: 0, z: 0, rot: 0, colour: "sky" });
    expect(validateRotation(scene, s, s.parts[0].id, 1)).toBeNull();
  });

  it("nothing cascades: the refused operation changes nothing", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    const before = JSON.stringify(s);
    validateWithdrawPlan(s, s.plans![0].id);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("legacy and overtaken plans stay visible and recoverable", () => {
  it("a floating or overlapping legacy plan is reported, not removed, and never supports or blocks", () => {
    let s = legacy(fresh(), b24(0, 6, 0)); // floating
    s = legacy(s, b24(8, 0, 2));
    s = legacy(s, b24(8, 0, 2)); // exact duplicate
    const fits = planFits(s);
    expect([...fits.values()]).toEqual(["unsupported", "standing", "conflict"]);
    // the floating one gives no support, the duplicate blocks nothing
    expect(validatePlan(scene, s, b24(0, 9, 0))?.code).toBe("unsupported");
    expect(plannedStructure(s).filter((p) => p.id.startsWith("plan:"))).toHaveLength(1);
  });

  it("invalid plans can always be withdrawn, and don't block unrelated real work", () => {
    let s = legacy(fresh(), b24(0, 6, 0));
    s = legacy(s, b24(0, 9, 0)); // floating on a floating plan
    expect(validateWithdrawPlan(s, s.plans![0].id)).toBeNull();
    expect(validateWithdrawPlan(s, s.plans![1].id)).toBeNull();
    s = real(s, b24(8, 0, 4));
    expect(validateRemoval(s, s.parts[0].id)).toBeNull();
  });

  it("a real part later built into a plan's space makes it a conflict, and it then supports nothing", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = real(s, b24(2, 0, 1));
    expect(planFits(s).get(s.plans![0].id)).toBe("conflict");
    // over the plan's x0–1 only, where no real stud is: the conflicting plan holds nothing up
    expect(validatePlan(scene, s, { partId: "brick-2x2", x: 0, y: 3, z: 0, rot: 0, colour: "sky" })?.code).toBe("unsupported");
  });
});

describe("heights offered by the preview agree with validation", () => {
  it("Plan-mode heights include a planned top, Build-mode heights don't", () => {
    let s = plan(fresh(), b24(0, 0, 0));
    s = plan(s, b24(0, 3, 0));
    const def = partDef("brick-2x4")!;
    const plannedHeights = fitHeights(scene, def, { x: 0, z: 0, rot: 0 }, plannedStructure(s));
    const realHeights = fitHeights(scene, def, { x: 0, z: 0, rot: 0 }, s.parts);
    expect(plannedHeights).toEqual([6]);
    expect(realHeights).toEqual([0]);
    for (const y of plannedHeights) expect(validatePlan(scene, s, b24(0, y, 0))).toBeNull();
    for (let y = 0; y < 12; y++) if (!plannedHeights.includes(y)) expect(validatePlan(scene, s, b24(0, y, 0))).not.toBeNull();
  });
});
