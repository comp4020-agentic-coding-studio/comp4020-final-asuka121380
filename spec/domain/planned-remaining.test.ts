import { describe, expect, it } from "vitest";
import {
  applyPlacement,
  applyProposePlan,
  applyRealizePlan,
  applyWithdrawPlan,
  plannedRemaining,
  validatePlacement,
  validatePlan,
  validateRealizePlan,
  type BuildState,
  type Placement,
} from "../../src/domain/rules.ts";
import { STREET_SCENE as scene } from "../../src/domain/scene.ts";

// ADR 0011: planning demand is derived from open plans, never stored, may go
// negative, and never changes what real stock allows.

const at = (x: number, y = 0, z = 0): Placement => ({ partId: "brick-2x4", x, y, z, rot: 0, colour: "sky" });
let seq = 0;
const propose = (s: BuildState, p: Placement): BuildState => {
  expect(validatePlan(scene, s, p)).toBeNull();
  return applyProposePlan(s, p, `plan${seq++}`, "a", "t");
};

describe("plannedRemaining", () => {
  it("is real stock minus open plans, per part type, and can go below zero", () => {
    let s: BuildState = { parts: [], inventory: { "brick-2x4": 3, "brick-2x2": 4 }, plans: [] };
    for (let i = 0; i < 5; i++) s = propose(s, at(i * 2));
    expect(plannedRemaining(s)["brick-2x4"]).toBe(-2);
    expect(plannedRemaining(s)["brick-2x2"]).toBe(4);
    expect(s.inventory["brick-2x4"]).toBe(3); // planning never touches real stock
  });

  it("goes back up when a plan is withdrawn, and ignores realized plans", () => {
    let s: BuildState = { parts: [], inventory: { "brick-2x4": 3 }, plans: [] };
    s = propose(s, at(0));
    s = propose(s, at(4));
    expect(plannedRemaining(s)["brick-2x4"]).toBe(1);
    s = applyWithdrawPlan(s, s.plans![0].id);
    expect(plannedRemaining(s)["brick-2x4"]).toBe(2);
    const id = s.plans![1].id;
    expect(validateRealizePlan(scene, s, id).rejection).toBeNull();
    s = applyRealizePlan(s, id, "real0", "b");
    // realized: real stock is consumed once, and the plan no longer counts as demand
    expect(s.inventory["brick-2x4"]).toBe(2);
    expect(plannedRemaining(s)["brick-2x4"]).toBe(2);
  });

  it("never blocks a real placement while real stock remains, however negative demand is", () => {
    let s: BuildState = { parts: [], inventory: { "brick-2x4": 1 }, plans: [] };
    for (let i = 0; i < 4; i++) s = propose(s, at(i * 2, 0, 4));
    expect(plannedRemaining(s)["brick-2x4"]).toBe(-3);
    expect(validatePlacement(scene, s, at(0))).toBeNull();
    s = applyPlacement(s, at(0), "real1");
    expect(validatePlacement(scene, s, at(6))?.code).toBe("out_of_stock");
  });

  it("refuses to realize a plan with no real stock left, leaving it open", () => {
    let s: BuildState = { parts: [], inventory: { "brick-2x4": 0 }, plans: [] };
    s = propose(s, at(0)); // plans may be proposed with nothing in stock
    const { rejection } = validateRealizePlan(scene, s, s.plans![0].id);
    expect(rejection?.code).toBe("out_of_stock");
    expect(s.plans![0].status).toBe("open");
  });
});
