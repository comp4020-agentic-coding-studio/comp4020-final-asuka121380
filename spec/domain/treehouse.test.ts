import { describe, expect, it } from "vitest";
import { partDef } from "../../src/domain/catalog.ts";
import { COLOURS } from "../../src/domain/colours.ts";
import { CASTLE_SCENE, SCENES, STREET_SCENE, billOfMaterials, type SceneTemplate } from "../../src/domain/scene.ts";
import { TREE_PIECES, TREEHOUSE_REQUIRED, TREEHOUSE_SCENE as tree } from "../../src/domain/treehouse.ts";
import {
  applyCommand,
  applyPlacement,
  applyProposePlan,
  fitHeights,
  plannedStructure,
  planFits,
  validateCommand,
  validatePlacement,
  validatePlan,
  validateRemoval,
  validateRotation,
  validateWithdrawPlan,
  type BuildState,
  type Placement,
} from "../../src/domain/rules.ts";

// ADR 0016: Woodland Commons. A scene's fixed structure (the tree) is part
// of the rules: its trunk, roots and branches block every part and plan, its
// three platforms carry parts like studs, and no command can touch it. The
// kit is the cabins' counted requirement with the 30% allowance, and the
// reference assembly is buildable inside it through the same rules.

const fresh = (): BuildState => ({ parts: [], inventory: { ...tree.kit } });

let seq = 0;
function place(state: BuildState, p: Placement, scene: SceneTemplate = tree): BuildState {
  const rejection = validatePlacement(scene, state, p);
  if (rejection) throw new Error(`${p.partId} at ${p.x},${p.y},${p.z}: ${rejection.message}`);
  return applyPlacement(state, p, `t${seq++}`);
}

const P = (partId: string, x: number, y: number, z: number, rot: Placement["rot"] = 0, colour = "nougat"): Placement => ({ partId, x, y, z, rot, colour });

const piece = (id: string) => TREE_PIECES.find((f) => f.id === id)!;
const LEFT = piece("deck-left"); // top 12
const RIGHT = piece("deck-right"); // top 24
const CROWN = piece("deck-crown"); // top 36
const TRUNK = piece("trunk-lower");
const top = (f: typeof LEFT) => f.y + f.h;

describe("the tree's fixed structure", () => {
  it("is explicit scene configuration with stable ids, and only the platforms carry studs", () => {
    expect(tree.fixed?.version).toBe(1);
    expect(new Set(TREE_PIECES.map((f) => f.id)).size).toBe(TREE_PIECES.length);
    expect(TREE_PIECES.filter((f) => f.studs).map((f) => f.id).sort()).toEqual(["deck-crown", "deck-left", "deck-right"]);
    for (const f of TREE_PIECES) expect(f.studs, f.id).toBe(f.kind === "deck");
    // one support per height zone above the ground
    expect([top(LEFT), top(RIGHT), top(CROWN)]).toEqual([12, 24, 36]);
  });

  it("is frozen with the scene id: saved builds rest on exactly these boxes", () => {
    // Changing any of these would strand saved builds. A different tree is a
    // new scene id, never an edit here (ADR 0016).
    expect(TREE_PIECES.map((f) => [f.id, f.kind, f.x, f.y, f.z, f.w, f.d, f.h, f.studs])).toEqual([
      ["trunk-lower", "trunk", 13, 0, 1, 6, 10, 35, false],
      ["trunk-stem", "trunk", 13, 35, 1, 6, 4, 37, false],
      ["root-left", "root", 11, 0, 5, 2, 4, 3, false],
      ["root-right", "root", 19, 0, 4, 2, 4, 3, false],
      ["root-front", "root", 14, 0, 11, 3, 1, 2, false],
      ["branch-left", "branch", 2, 8, 7, 11, 2, 3, false],
      ["branch-right", "branch", 19, 20, 7, 11, 2, 3, false],
      ["deck-left", "deck", 1, 11, 4, 8, 8, 1, true],
      ["deck-right", "deck", 23, 23, 5, 8, 8, 1, true],
      ["deck-crown", "deck", 11, 35, 5, 10, 8, 1, true],
    ]);
    expect([tree.id, tree.version, tree.fixed?.version]).toEqual(["treehouse-01", 1, 1]);
  });

  it("fits inside the plot, keeps the front rows open, and no two boxes overlap", () => {
    const cells = new Set<string>();
    for (const f of TREE_PIECES) {
      expect(f.x >= 0 && f.z >= 0 && f.y >= 0, f.id).toBe(true);
      expect(f.x + f.w <= tree.bounds.w && f.z + f.d <= tree.bounds.d && f.y + f.h <= tree.bounds.h, f.id).toBe(true);
      expect(f.z + f.d, f.id).toBeLessThanOrEqual(tree.bounds.d - 8);
      for (let x = f.x; x < f.x + f.w; x++)
        for (let z = f.z; z < f.z + f.d; z++)
          for (let y = f.y; y < f.y + f.h; y++) {
            const k = `${x},${y},${z}`;
            expect(cells.has(k), `${f.id} overlaps at ${k}`).toBe(false);
            cells.add(k);
          }
    }
  });

  it("each platform is held by the trunk or a branch directly beneath it", () => {
    for (const deck of [LEFT, RIGHT, CROWN]) {
      const under = TREE_PIECES.filter(
        (f) => f !== deck && f.y + f.h === deck.y && f.x < deck.x + deck.w && deck.x < f.x + f.w && f.z < deck.z + deck.d && deck.z < f.z + f.d,
      );
      expect(under.length, deck.id).toBeGreaterThan(0);
    }
  });

  it("other scenes have none, and keep their rules exactly", () => {
    expect(STREET_SCENE.fixed).toBeUndefined();
    expect(CASTLE_SCENE.fixed).toBeUndefined();
    // the same cell in a castle room is open ground
    expect(validatePlacement(CASTLE_SCENE, { parts: [], inventory: { ...CASTLE_SCENE.kit } }, P("brick-1x1", TRUNK.x + 1, 0, TRUNK.z + 1, 0, "stone"))).toBeNull();
  });
});

describe("supports: the platforms carry parts, nothing else in the tree does", () => {
  it("a part rests on a platform's top face anywhere over it", () => {
    for (const deck of [LEFT, RIGHT, CROWN]) {
      expect(validatePlacement(tree, fresh(), P("brick-1x2", deck.x, top(deck), deck.z)), deck.id).toBeNull();
      expect(validatePlacement(tree, fresh(), P("plate-2x2", deck.x + deck.w - 2, top(deck), deck.z + deck.d - 2)), deck.id).toBeNull();
    }
  });

  it("a part partly over a platform's edge is held by the studs it touches", () => {
    expect(validatePlacement(tree, fresh(), P("plate-2x4", LEFT.x + LEFT.w - 2, top(LEFT), LEFT.z + 2))).toBeNull();
  });

  it("a part just beside a platform, or one plate above it, is unsupported", () => {
    expect(validatePlacement(tree, fresh(), P("brick-1x1", LEFT.x + LEFT.w, top(LEFT), LEFT.z))?.code).toBe("unsupported");
    expect(validatePlacement(tree, fresh(), P("brick-1x1", LEFT.x, top(LEFT) + 1, LEFT.z))?.code).toBe("unsupported");
  });

  it("the top of a branch or root has no studs: nothing rests on it", () => {
    const branch = piece("branch-left");
    // the branch's cells beyond the platform, where its top face is open
    const x = branch.x + branch.w - 1;
    expect(x).toBeGreaterThanOrEqual(LEFT.x + LEFT.w);
    expect(validatePlacement(tree, fresh(), P("brick-1x1", x, branch.y + branch.h, branch.z))?.code).toBe("unsupported");
    const root = piece("root-front");
    expect(validatePlacement(tree, fresh(), P("brick-1x1", root.x, root.y + root.h, root.z))?.code).toBe("unsupported");
  });

  it("a part on a platform supports the next part up, as on the plot", () => {
    let s = place(fresh(), P("brick-1x2", RIGHT.x, top(RIGHT), RIGHT.z));
    expect(validatePlacement(tree, s, P("brick-1x2", RIGHT.x, top(RIGHT) + 3, RIGHT.z))).toBeNull();
    s = place(s, P("brick-1x2", RIGHT.x, top(RIGHT) + 3, RIGHT.z));
    expect(s.parts).toHaveLength(2);
  });
});

describe("volumes: nothing is built through the tree", () => {
  it("refuses a part inside the trunk, a root, a branch or a platform, naming it", () => {
    const cases: [string, Placement][] = [
      ["trunk", P("brick-1x1", TRUNK.x + 2, 0, TRUNK.z + 2)],
      ["trunk", P("brick-1x1", TRUNK.x + 2, 30, TRUNK.z + 2)],
      ["root", P("brick-1x1", piece("root-left").x, 0, piece("root-left").z)],
      ["branch", P("brick-1x1", piece("branch-left").x + 1, piece("branch-left").y, piece("branch-left").z)],
      ["platform", P("plate-1x1", LEFT.x, LEFT.y, LEFT.z)],
    ];
    for (const [what, p] of cases) {
      const r = validatePlacement(tree, fresh(), p);
      expect(r?.code, what).toBe("collision");
      expect(r?.message, what).toMatch(/tree|platform/);
    }
  });

  it("refuses a tall part that would pass up through a platform from below", () => {
    // a door standing on the ground under the left platform reaches plate 18, through it
    expect(validatePlacement(tree, fresh(), P("door-1x4x6", LEFT.x + 1, 0, LEFT.z + 2))?.code).toBe("collision");
  });

  it("no height over the trunk is offered, and over a platform the lowest is its top", () => {
    const b11 = partDef("brick-1x1")!;
    const overTrunk = fitHeights(tree, b11, { x: TRUNK.x + 2, z: TRUNK.z + 2, rot: 0 }, []);
    // only above the trunk-stem's top (72) would be clear, which is the ceiling
    expect(overTrunk).toEqual([]);
    const overDeck = fitHeights(tree, b11, { x: LEFT.x + 1, z: LEFT.z + 1, rot: 0 }, []);
    // the ground under the platform (plates 0..8 clear of the branch) and the platform's top
    expect(overDeck).toContain(0);
    expect(overDeck).toContain(top(LEFT));
    expect(overDeck.filter((y) => y > 0 && y !== top(LEFT))).toEqual([]);
  });

  it("every height fitHeights offers is accepted by the server's check, and every refused one is refused", () => {
    const def = partDef("brick-1x2")!;
    for (const [x, z] of [
      [LEFT.x + 2, LEFT.z + 2],
      [RIGHT.x + 1, RIGHT.z + 6],
      [CROWN.x, CROWN.z + 1],
      [10, 20],
    ]) {
      const fits = new Set(fitHeights(tree, def, { x, z, rot: 0 }, []));
      for (let y = 0; y + def.h <= tree.bounds.h; y++) {
        const ok = validatePlacement(tree, fresh(), P("brick-1x2", x, y, z)) === null;
        expect(ok, `${x},${y},${z}`).toBe(fits.has(y));
      }
    }
  });
});

describe("Build and Plan treat the tree alike", () => {
  it("a plan rests on a platform, and is refused inside the trunk", () => {
    expect(validatePlan(tree, fresh(), P("brick-1x2", LEFT.x, top(LEFT), LEFT.z))).toBeNull();
    expect(validatePlan(tree, fresh(), P("brick-1x2", TRUNK.x, 12, TRUNK.z + 3))?.code).toBe("collision");
    expect(validatePlan(tree, fresh(), P("brick-1x2", LEFT.x, top(LEFT) + 1, LEFT.z))?.code).toBe("unsupported");
  });

  it("a plan on a platform stands, and carries a plan above it", () => {
    let s = applyProposePlan(fresh(), P("brick-1x2", CROWN.x, top(CROWN), CROWN.z), "p1", "a", "t");
    expect(planFits(s, s.parts, tree).get("p1")).toBe("standing");
    expect(validatePlan(tree, s, P("brick-1x2", CROWN.x, top(CROWN) + 3, CROWN.z))).toBeNull();
    s = applyProposePlan(s, P("brick-1x2", CROWN.x, top(CROWN) + 3, CROWN.z), "p2", "a", "t");
    expect(planFits(s, s.parts, tree).get("p2")).toBe("standing");
    expect(plannedStructure(s, tree).filter((p) => p.id.startsWith("plan:"))).toHaveLength(2);
    // withdrawing the lower plan would leave the upper one floating
    expect(validateWithdrawPlan(s, "p1", tree)?.code).toBe("plan_depends");
  });

  it("realizing a plan on a platform is a real placement on real support", () => {
    const s = applyProposePlan(fresh(), P("plate-2x2", RIGHT.x, top(RIGHT), RIGHT.z), "p1", "a", "t");
    expect(validateCommand(tree, s, { type: "realize-plan", planId: "p1" })).toBeNull();
    const after = applyCommand(s, { type: "realize-plan", planId: "p1" }, "r1", "a");
    expect(after.parts).toHaveLength(1);
    expect(after.inventory["plate-2x2"]).toBe(tree.kit["plate-2x2"] - 1);
  });

  it("Plan mode's heights match Build mode's over the tree", () => {
    const def = partDef("plate-2x2")!;
    for (const [x, z] of [
      [LEFT.x, LEFT.z],
      [TRUNK.x + 1, TRUNK.z + 1],
      [RIGHT.x + 2, RIGHT.z + 2],
    ]) {
      const s = fresh();
      expect(fitHeights(tree, def, { x, z, rot: 0 }, plannedStructure(s, tree))).toEqual(fitHeights(tree, def, { x, z, rot: 0 }, s.parts));
    }
  });
});

describe("rotation and removal next to the tree", () => {
  it("a part resting on a platform can always be removed: the platform stays", () => {
    const s = place(fresh(), P("brick-1x2", LEFT.x, top(LEFT), LEFT.z));
    expect(validateRemoval(s, s.parts[0].id, tree)).toBeNull();
    expect(validateCommand(tree, s, { type: "remove", placedId: s.parts[0].id })).toBeNull();
  });

  it("a part held by a platform AND a brick keeps the platform's support when the brick goes", () => {
    // a 2×4 plate half on the platform's edge, half on a brick column beside it
    let s = fresh();
    const x = LEFT.x + LEFT.w; // just right of the platform
    for (let y = 0; y < top(LEFT); y += 3) s = place(s, P("brick-1x2", x, y, LEFT.z + 1, 1));
    s = place(s, P("plate-2x4", LEFT.x + LEFT.w - 2, top(LEFT), LEFT.z + 1));
    const column = s.parts.filter((p) => p.partId === "brick-1x2");
    const topBrick = column[column.length - 1].id;
    expect(validateRemoval(s, topBrick, tree)).toBeNull();
    // without the scene, the platform is unknown and the brick looks like its only support
    expect(validateRemoval(s, topBrick)?.code).toBe("would_unsupport");
  });

  it("a part whose only support is a brick on the platform can't lose it", () => {
    let s = place(fresh(), P("brick-1x2", CROWN.x, top(CROWN), CROWN.z));
    s = place(s, P("brick-1x2", CROWN.x, top(CROWN) + 3, CROWN.z));
    expect(validateRemoval(s, s.parts[0].id, tree)?.code).toBe("would_unsupport");
  });

  it("turning a part into the trunk is refused; turning it on the platform is allowed", () => {
    // a 1×4 brick lying along the crown deck's back edge, against the trunk-stem
    const stem = piece("trunk-stem");
    let s = place(fresh(), P("brick-1x4", stem.x + 1, top(CROWN), stem.z + stem.d, 0));
    // a quarter turn about its centre puts it at z stem.z+stem.d−1 … +2: into the stem
    expect(validateRotation(tree, s, s.parts[0].id, 1)?.code).toBe("collision");
    s = place(fresh(), P("brick-1x4", CROWN.x + 3, top(CROWN), CROWN.z + 4, 0));
    expect(validateRotation(tree, s, s.parts[0].id, 1)).toBeNull();
  });

  it("no command names a fixed piece: they are not parts", () => {
    for (const f of TREE_PIECES) {
      expect(validateCommand(tree, fresh(), { type: "remove", placedId: f.id })?.code).toBe("not_found");
      expect(validateCommand(tree, fresh(), { type: "recolour", placedId: f.id, colour: "white" })?.code).toBe("not_found");
      expect(validateCommand(tree, fresh(), { type: "rotate", placedId: f.id, rot: 1 })?.code).toBe("not_found");
    }
  });
});

describe("the tree-house kit: allocated = ceil(required × 1.30)", () => {
  it("applies the formula to every type, with no other quantities", () => {
    expect(Object.keys(tree.kit).sort()).toEqual(Object.keys(TREEHOUSE_REQUIRED).sort());
    for (const [id, required] of Object.entries(TREEHOUSE_REQUIRED)) {
      expect(tree.kit[id], id).toBe(Math.ceil(required * 1.3 - 1e-9));
      expect(partDef(id), id).toBeTruthy();
    }
  });

  it("matches the research record's table", () => {
    expect(tree.kit).toEqual({
      "plate-1x2": 345,
      "plate-1x4": 208,
      "plate-2x2": 162,
      "brick-1x1": 140,
      "plate-1x1": 137,
      "plate-2x4": 91,
      "round-1x1": 51,
      "slope-2x2": 47,
      "brick-1x4": 45,
      "brick-1x2": 43,
      "round-brick-1x1": 36,
      "window-1x2x2": 26,
      "slope-2x1": 25,
      "plate-6x6": 16,
      "fence-1x4x1": 13,
      "brick-2x4": 12,
      "plate-2x8": 7,
      "arch-1x4": 6,
      "stairs-2x4": 6,
      "door-1x4x6": 4,
      flower: 4,
      "brick-2x2": 2,
    });
  });

  it("holds none of the tree: no trunk, branch or foliage part is in it", () => {
    for (const id of Object.keys(tree.kit)) expect(id).not.toMatch(/trunk|branch|leaf|foliage|tree/);
  });
});

describe("the tree-house reference", () => {
  it("is built entirely within the kit and the bounds, every part through the rules and around the tree", () => {
    let s = fresh();
    for (const p of tree.reference) s = place(s, p);
    const bom = billOfMaterials(tree.reference);
    for (const [id, n] of Object.entries(bom)) expect(n, id).toBeLessThanOrEqual(tree.kit[id]);
    for (const [id, k] of Object.entries(tree.kit)) expect(s.inventory[id] + (bom[id] ?? 0), id).toBe(k);
  });

  it("has two cabins with doors, a common deck, a crown lookout, stairs between the levels, railings, windows and three roofs", () => {
    const bom = billOfMaterials(tree.reference);
    // a lodge on the left platform and a bunkhouse on the right, each with a door in its wall
    for (const deck of [LEFT, RIGHT]) {
      const door = tree.reference.find((p) => p.partId === "door-1x4x6" && p.y === top(deck));
      expect(door, deck.id).toBeTruthy();
    }
    // the crown carries an open lookout rather than a third cabin
    expect(tree.reference.some((p) => p.y === top(CROWN))).toBe(true);
    // the common deck: big plates on stilts, level with the left platform
    expect(tree.reference.filter((p) => p.partId === "plate-6x6" && p.y + 1 === top(LEFT)).length).toBeGreaterThanOrEqual(4);
    // stairs climb from the ground, from the common deck, and from the right platform's level
    for (const y of [0, top(LEFT), top(RIGHT)]) expect(tree.reference.some((p) => p.partId === "stairs-2x4" && p.y === y), `stairs at ${y}`).toBe(true);
    expect(bom["fence-1x4x1"]).toBeGreaterThanOrEqual(3);
    expect(bom["window-1x2x2"]).toBeGreaterThanOrEqual(6);
    expect(bom["slope-2x2"]).toBeGreaterThanOrEqual(24);
  });

  it("is smaller than the kit: one idea, not a list of what must be built", () => {
    const bom = billOfMaterials(tree.reference);
    const used = Object.values(bom).reduce((a, b) => a + b, 0);
    const kit = Object.values(tree.kit).reduce((a, b) => a + b, 0);
    expect(used).toBeLessThan(kit);
  });

  it("reaches all three height zones", () => {
    const heights = tree.reference.map((p) => p.y + partDef(p.partId)!.h);
    expect(Math.max(...heights)).toBeGreaterThan(top(CROWN) + 18);
    expect(tree.reference.some((p) => p.y === 0)).toBe(true);
  });
});

describe("a new scene, nothing changed for the others", () => {
  it("is registered with six places, and the other scenes keep theirs", () => {
    expect(tree.id).toBe("treehouse-01");
    expect(tree.version).toBe(1);
    expect(tree.maxPlayers).toBe(6);
    expect(SCENES[tree.id]).toBe(tree);
    expect(STREET_SCENE.maxPlayers).toBe(2);
    expect(CASTLE_SCENE.maxPlayers).toBe(4);
    expect(STREET_SCENE.version).toBe(2);
    expect(CASTLE_SCENE.version).toBe(1);
  });

  it("the new parts are only in this kit, and the new colour is added at the end", () => {
    for (const id of ["plate-1x1", "plate-1x4", "stairs-2x4"]) {
      expect(id in STREET_SCENE.kit, id).toBe(false);
      expect(id in CASTLE_SCENE.kit, id).toBe(false);
    }
    expect(COLOURS[COLOURS.length - 1].id).toBe("nougat");
    expect(COLOURS.findIndex((c) => c.id === "lavender")).toBe(COLOURS.length - 2);
  });

  it("refuses a tree-house part in a castle room", () => {
    const s: BuildState = { parts: [], inventory: { ...CASTLE_SCENE.kit, "stairs-2x4": 1 } };
    expect(validatePlacement(CASTLE_SCENE, s, P("stairs-2x4", 0, 0, 0))?.code).toBe("unknown_part");
  });
});

describe("stairs", () => {
  it("stand on the bottom step and carry the next flight on the top step only", () => {
    let s = place(fresh(), P("stairs-2x4", 4, 0, 18));
    // rot 0 rises towards z = 18 (the back row): its top step is z 18
    expect(validatePlacement(tree, s, P("stairs-2x4", 4, 12, 15))).toBeNull();
    // the lower steps carry nothing: over them at the flight's top there are no studs
    expect(validatePlacement(tree, s, P("brick-1x2", 4, 12, 20))?.code).toBe("unsupported");
    s = place(s, P("stairs-2x4", 4, 12, 15));
    expect(s.parts).toHaveLength(2);
  });

  it("a flight on the ground reaches the left platform's height and can lead onto it", () => {
    const def = partDef("stairs-2x4")!;
    expect(def.h).toBe(top(LEFT));
  });
});
