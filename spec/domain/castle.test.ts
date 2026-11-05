import { describe, expect, it } from "vitest";
import { CATALOG, partDef } from "../../src/domain/catalog.ts";
import { allocate, CASTLE_REQUIRED, CASTLE_SCENE as castle } from "../../src/domain/castle.ts";
import {
  applyPlacement,
  applyRecolour,
  applyRemoval,
  applyRotation,
  socketCells,
  validatePlacement,
  validateRecolour,
  validateRemoval,
  validateRotation,
  type BuildState,
  type Placement,
} from "../../src/domain/rules.ts";
import { billOfMaterials, SCENES, STREET_SCENE } from "../../src/domain/scene.ts";

// ADR 0015: the Medieval Castle scene. Its kit is the primary model's counted
// requirement (doc/research/0002-medieval-castle-reference.md) with a 30%
// allowance, its reference must be buildable inside that kit and its bounds,
// and its two new support shapes (arches and inverted slopes) are held up
// only where the drawn part actually has something to rest on.

const fresh = (): BuildState => ({ parts: [], inventory: { ...castle.kit } });

let seq = 0;
function place(state: BuildState, p: Placement): BuildState {
  const rejection = validatePlacement(castle, state, p);
  if (rejection) throw new Error(`${p.partId} at ${p.x},${p.y},${p.z}: ${rejection.message}`);
  return applyPlacement(state, p, `c${seq++}`);
}

const P = (partId: string, x: number, y: number, z: number, rot: Placement["rot"] = 0, colour = "stone"): Placement => ({ partId, x, y, z, rot, colour });

describe("castle kit: allocated quantity = ceil(required × 1.30)", () => {
  it("applies the formula to every part type, with no other quantities", () => {
    expect(Object.keys(castle.kit).sort()).toEqual(Object.keys(CASTLE_REQUIRED).sort());
    for (const [id, required] of Object.entries(CASTLE_REQUIRED)) {
      expect(castle.kit[id], id).toBe(Math.ceil(required * 1.3 - 1e-9));
      expect(castle.kit[id], id).toBeGreaterThanOrEqual(required);
    }
  });

  it("rounds exact multiples without floating-point drift", () => {
    // 10 × 1.3 is 13.000000000000002 in floating point; the kit must say 13, not 14
    expect(allocate(10)).toBe(13);
    expect(allocate(30)).toBe(39);
    expect(allocate(1)).toBe(2);
    expect(allocate(176)).toBe(229);
  });

  it("matches the research record's table", () => {
    expect(castle.kit).toEqual({
      "brick-1x1": 229,
      "brick-1x2": 197,
      "brick-1x4": 78,
      "round-brick-1x1": 95,
      "brick-2x2": 15,
      "brick-2x4": 7,
      "plate-1x2": 65,
      "plate-2x2": 8,
      "plate-2x4": 8,
      "plate-2x8": 11,
      "plate-6x6": 15,
      "round-1x1": 17,
      "slope-2x1": 34,
      "slope-2x2": 13,
      "ridge-2x2": 6,
      "inv-slope-2x2": 39,
      "arch-1x4": 21,
      "arch-1x8x2": 4,
      "door-1x4x6": 2,
      "window-1x2x2": 7,
    });
  });

  it("is one shared, colour-agnostic count per part type, and every part exists in the catalogue", () => {
    for (const [id, n] of Object.entries(castle.kit)) {
      expect(partDef(id), id).toBeTruthy();
      expect(Number.isInteger(n) && n > 0, id).toBe(true);
    }
  });
});

describe("castle reference", () => {
  it("is built entirely within the kit and the bounds, every part through the rules", () => {
    let s = fresh();
    for (const p of castle.reference) s = place(s, p);
    const bom = billOfMaterials(castle.reference);
    for (const [id, n] of Object.entries(bom)) expect(n, id).toBeLessThanOrEqual(castle.kit[id]);
    for (const [id, k] of Object.entries(castle.kit)) expect(s.inventory[id] + (bom[id] ?? 0), id).toBe(k);
  });

  it("has the adapted features: a gate arch, two towers, battlements, a hall door, windows and a roof", () => {
    const bom = billOfMaterials(castle.reference);
    expect(bom["arch-1x8x2"]).toBeGreaterThanOrEqual(1);
    expect(bom["plate-6x6"]).toBeGreaterThanOrEqual(4); // two tower bases and two tower roofs
    expect(bom["inv-slope-2x2"]).toBeGreaterThanOrEqual(10); // the wall-walk
    expect(bom["door-1x4x6"]).toBe(1);
    expect(bom["window-1x2x2"]).toBeGreaterThanOrEqual(2);
    expect(bom["ridge-2x2"]).toBeGreaterThanOrEqual(1);
  });

  it("leaves the front edge of the plot open: nothing in the two front rows", () => {
    for (const p of castle.reference) {
      const def = partDef(p.partId)!;
      const depth = p.rot % 2 === 0 ? def.d : def.w;
      expect(p.z + depth, `${p.partId} at z ${p.z}`).toBeLessThanOrEqual(castle.bounds.d - 2);
    }
  });

  it("is a new scene, not a change to Beach Houses", () => {
    expect(castle.id).toBe("castle-01");
    expect(castle.version).toBe(1);
    expect(castle.maxPlayers).toBe(4);
    expect(SCENES[castle.id]).toBe(castle);
    expect(STREET_SCENE.id).toBe("street-01");
    expect(STREET_SCENE.maxPlayers).toBe(2);
    expect(STREET_SCENE.version).toBe(2);
    for (const id of ["brick-1x1", "arch-1x4", "inv-slope-2x2", "plate-6x6"]) expect(id in STREET_SCENE.kit, id).toBe(false);
  });

  it("refuses a castle part in a Beach Houses room", () => {
    const s: BuildState = { parts: [], inventory: { ...STREET_SCENE.kit, "brick-1x1": 1 } };
    expect(validatePlacement(STREET_SCENE, s, P("brick-1x1", 0, 0, 0))?.code).toBe("unknown_part");
  });
});

describe("arches stand on their legs only", () => {
  it("an arch 1×4 is held by a part under either leg", () => {
    let s = place(fresh(), P("brick-1x1", 0, 0, 0));
    expect(validatePlacement(castle, s, P("arch-1x4", 0, 3, 0))).toBeNull();
    s = place(fresh(), P("brick-1x1", 3, 0, 0));
    expect(validatePlacement(castle, s, P("arch-1x4", 0, 3, 0))).toBeNull();
  });

  it("a part under the opening alone does not hold it up", () => {
    const s = place(place(fresh(), P("brick-1x1", 1, 0, 0)), P("brick-1x1", 2, 0, 0));
    expect(validatePlacement(castle, s, P("arch-1x4", 0, 3, 0))?.code).toBe("unsupported");
  });

  it("a part in the opening still collides with the arch's box", () => {
    let s = place(place(fresh(), P("brick-1x1", 0, 0, 0)), P("brick-1x1", 3, 0, 0));
    s = place(place(s, P("brick-1x1", 1, 0, 0)), P("brick-1x1", 1, 3, 0));
    expect(validatePlacement(castle, s, P("arch-1x4", 0, 3, 0))?.code).toBe("collision");
  });

  it("a leg's only support can't be removed, while a brick beside the opening can", () => {
    let s = place(fresh(), P("brick-1x1", 0, 0, 0));
    const leg = s.parts[0].id;
    s = place(s, P("brick-1x1", 1, 0, 0));
    const under = s.parts[1].id;
    s = place(s, P("arch-1x4", 0, 3, 0));
    expect(validateRemoval(s, leg)?.code).toBe("would_unsupport");
    expect(validateRemoval(s, under)).toBeNull();
  });

  it("carries a part on its top, over the opening", () => {
    let s = place(place(fresh(), P("brick-1x1", 0, 0, 0)), P("brick-1x1", 3, 0, 0));
    s = place(s, P("arch-1x4", 0, 3, 0));
    expect(validatePlacement(castle, s, P("brick-1x2", 1, 6, 0))).toBeNull();
  });

  it("turned a quarter, its legs are at the two ends along z", () => {
    const def = partDef("arch-1x8x2")!;
    expect(socketCells(def, { x: 5, z: 2, rot: 1 })).toEqual([
      { x: 5, z: 9 },
      { x: 5, z: 2 },
    ]);
    let s = place(fresh(), P("brick-1x1", 5, 0, 9));
    expect(validatePlacement(castle, s, P("arch-1x8x2", 5, 3, 2, 1))).toBeNull();
    s = place(fresh(), P("brick-1x2", 5, 0, 4, 1));
    expect(validatePlacement(castle, s, P("arch-1x8x2", 5, 3, 2, 1))?.code).toBe("unsupported");
  });

  it("rotating a placed arch re-checks its legs", () => {
    let s = place(place(fresh(), P("brick-1x1", 4, 0, 5)), P("brick-1x1", 7, 0, 5));
    s = place(s, P("arch-1x4", 4, 3, 5));
    const arch = s.parts[2].id;
    // a quarter turn about the footprint's centre: x 5, z 4..7, legs at z 4 and z 7, which nothing holds
    expect(validateRotation(castle, s, arch, 1)?.code).toBe("unsupported");
  });
});

describe("inverted slopes rest on their back row", () => {
  it("is held by a part under its back row and widens over empty space", () => {
    const s = place(fresh(), P("brick-1x2", 0, 0, 0));
    expect(validatePlacement(castle, s, P("inv-slope-2x2", 0, 3, 0))).toBeNull();
  });

  it("is not held by a part under its overhang alone", () => {
    const s = place(fresh(), P("brick-1x2", 0, 0, 1));
    expect(validatePlacement(castle, s, P("inv-slope-2x2", 0, 3, 0))?.code).toBe("unsupported");
  });

  it("carries a part on any of its four studs, including over the overhang", () => {
    let s = place(fresh(), P("brick-1x2", 0, 0, 0));
    s = place(s, P("inv-slope-2x2", 0, 3, 0));
    expect(validatePlacement(castle, s, P("brick-1x2", 0, 6, 1))).toBeNull();
  });

  it("each rotation rests on the side its back row faces", () => {
    const def = partDef("inv-slope-2x2")!;
    const cells = (rot: Placement["rot"]) => socketCells(def, { x: 0, z: 0, rot }).map((c) => `${c.x},${c.z}`).sort();
    expect(cells(0)).toEqual(["0,0", "1,0"]);
    expect(cells(1)).toEqual(["0,0", "0,1"]);
    expect(cells(2)).toEqual(["0,1", "1,1"]);
    expect(cells(3)).toEqual(["1,0", "1,1"]);
  });
});

describe("the other new castle parts", () => {
  it("recolour, rotate and remove like any part, and stock is conserved", () => {
    let s = fresh();
    s = place(s, P("plate-6x6", 4, 0, 4));
    s = place(s, P("brick-1x4", 5, 1, 6));
    s = place(s, P("round-brick-1x1", 9, 1, 9));
    s = place(s, P("plate-2x4", 4, 1, 8, 1));
    s = place(s, P("plate-1x2", 8, 1, 8));
    const [, b14, round, , p12] = s.parts.map((p) => p.id);
    expect(validateRecolour(s, round, "brick-red")).toBeNull();
    s = applyRecolour(s, round, "brick-red");
    expect(validateRotation(castle, s, b14, 1)).toBeNull();
    s = applyRotation(s, b14, 1);
    expect(validateRemoval(s, p12)).toBeNull();
    s = applyRemoval(s, p12);
    for (const [id, k] of Object.entries(castle.kit)) {
      expect(s.inventory[id] + s.parts.filter((p) => p.partId === id).length, id).toBe(k);
    }
  });

  it("a part with no explicit sockets rests on its whole footprint, exactly as before", () => {
    for (const def of CATALOG.filter((d) => !d.sockets)) {
      expect(socketCells(def, { x: 0, z: 0, rot: 0 })).toHaveLength(def.w * def.d);
    }
  });
});
