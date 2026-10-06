import { describe, expect, it } from "vitest";
import { CATALOG, partDef } from "../../src/domain/catalog.ts";
import { ROTATIONS, rotateCell } from "../../src/domain/grid.ts";
import {
  applyPlacement,
  applyRecolour,
  applyRemoval,
  validatePlacement,
  validateRecolour,
  validateRemoval,
  type BuildState,
  type Placement,
} from "../../src/domain/rules.ts";
import { billOfMaterials, STREET_SCENE as scene } from "../../src/domain/scene.ts";

const fresh = (): BuildState => ({ parts: [], inventory: { ...scene.kit } });

let seq = 0;
function place(state: BuildState, p: Placement): BuildState {
  const rejection = validatePlacement(scene, state, p);
  if (rejection) throw new Error(`${p.partId} at ${p.x},${p.y},${p.z}: ${rejection.message}`);
  return applyPlacement(state, p, `t${seq++}`);
}

// K[p] = held + placed, for every part type
function conserved(state: BuildState): void {
  for (const [id, k] of Object.entries(scene.kit)) {
    const placed = state.parts.filter((p) => p.partId === id).length;
    expect(state.inventory[id] + placed, id).toBe(k);
    expect(state.inventory[id], id).toBeGreaterThanOrEqual(0);
  }
}

const brick = (x: number, y: number, z: number, extra: Partial<Placement> = {}): Placement => ({
  partId: "brick-2x2",
  x,
  y,
  z,
  rot: 0,
  colour: "navy",
  ...extra,
});

describe("grid", () => {
  it("four quarter turns bring every cell back", () => {
    for (const def of CATALOG) {
      for (let x = 0; x < def.w; x++) {
        for (let z = 0; z < def.d; z++) {
          let c = { x, z };
          let size = { w: def.w, d: def.d };
          for (let i = 0; i < 4; i++) {
            c = rotateCell(c, size, 1);
            size = { w: size.d, d: size.w };
          }
          expect(c).toEqual({ x, z });
        }
      }
    }
  });

  it("every catalogue rotation is a real rotation", () => {
    for (const def of CATALOG) for (const r of def.rotations) expect(ROTATIONS).toContain(r);
  });
});

describe("the reference model and the kit", () => {
  it("the kit covers the reference's bill of materials", () => {
    for (const [id, n] of Object.entries(billOfMaterials(scene.reference))) {
      expect(partDef(id), id).toBeDefined();
      expect(scene.kit[id], id).toBeGreaterThanOrEqual(n);
    }
  });

  it("the whole reference assembles, in instruction order, through the players' rules", () => {
    let state = fresh();
    for (const p of scene.reference) state = place(state, p);
    expect(state.parts).toHaveLength(scene.reference.length);
    conserved(state);
  });
});

describe("placement", () => {
  it("charges exactly one piece", () => {
    const state = place(fresh(), brick(0, 0, 0));
    expect(state.inventory["brick-2x2"]).toBe(scene.kit["brick-2x2"] - 1);
    conserved(state);
  });

  it("rejects a part with none left, and charges nothing", () => {
    let state = fresh();
    for (let i = 0; i < scene.kit["brick-2x2"]; i++) state = place(state, brick((i % 8) * 2, 0, Math.floor(i / 8) * 2));
    const before = state;
    expect(validatePlacement(scene, state, brick(0, 0, 6))?.code).toBe("out_of_stock");
    expect(state).toBe(before);
    conserved(state);
  });

  it("rejects overlaps, but not stacking on studs", () => {
    const state = place(fresh(), brick(0, 0, 0));
    expect(validatePlacement(scene, state, brick(1, 0, 1))?.code).toBe("collision");
    expect(validatePlacement(scene, state, brick(1, 3, 1))).toBeNull();
  });

  it("rejects floating parts", () => {
    expect(validatePlacement(scene, fresh(), brick(0, 3, 0))?.code).toBe("unsupported");
  });

  it("rejects parts on a slope's sloped face, which has no studs", () => {
    // slope at rotation 0: studs on its back row (z = 0), falls towards +z
    const state = place(fresh(), { partId: "slope-2x2", x: 0, y: 0, z: 0, rot: 0, colour: "navy" });
    expect(validatePlacement(scene, state, { ...brick(0, 3, 1), partId: "brick-1x2" })?.code).toBe("unsupported");
    expect(validatePlacement(scene, state, { ...brick(0, 3, 0), partId: "brick-1x2" })).toBeNull();
  });

  it("rejects parts outside the plot", () => {
    expect(validatePlacement(scene, fresh(), brick(scene.bounds.w - 1, 0, 0))?.code).toBe("out_of_bounds");
    expect(validatePlacement(scene, fresh(), brick(-1, 0, 0))?.code).toBe("out_of_bounds");
  });

  it("rejects unknown parts, rotations, colours and fractional positions", () => {
    expect(validatePlacement(scene, fresh(), brick(0, 0, 0, { partId: "minifig" }))?.code).toBe("unknown_part");
    expect(validatePlacement(scene, fresh(), brick(0, 0, 0, { rot: 1 }))?.code).toBe("bad_rotation");
    expect(validatePlacement(scene, fresh(), brick(0, 0, 0, { colour: "gold" }))?.code).toBe("bad_colour");
    expect(validatePlacement(scene, fresh(), brick(0.5, 0, 0))?.code).toBe("bad_position");
  });
});

describe("removal", () => {
  it("returns the piece to the kit", () => {
    const state = place(fresh(), brick(0, 0, 0));
    const id = state.parts[0].id;
    expect(validateRemoval(state, id)).toBeNull();
    const after = applyRemoval(state, id);
    expect(after.parts).toHaveLength(0);
    conserved(after);
  });

  it("refuses to strand a part, without removing anything", () => {
    let state = place(fresh(), brick(0, 0, 0));
    state = place(state, brick(0, 3, 0));
    const r = validateRemoval(state, state.parts[0].id);
    expect(r?.code).toBe("would_unsupport");
    expect(r?.message).toMatch(/only support/);
  });

  it("allows removing one of two supports", () => {
    let state = place(fresh(), brick(0, 0, 0));
    state = place(state, brick(2, 0, 0));
    state = place(state, { partId: "brick-2x4", x: 0, y: 3, z: 0, rot: 0, colour: "navy" });
    expect(validateRemoval(state, state.parts[0].id)).toBeNull();
  });

  it("won't take a wall out from under the finished house", () => {
    let state = fresh();
    for (const p of scene.reference) state = place(state, p);
    expect(validateRemoval(state, state.parts[0].id)?.code).toBe("would_unsupport");
    const ridge = state.parts.find((p) => p.partId === "ridge-2x2")!;
    expect(validateRemoval(state, ridge.id)).toBeNull();
  });

  it("can't remove the same part twice", () => {
    const state = place(fresh(), brick(0, 0, 0));
    const after = applyRemoval(state, state.parts[0].id);
    expect(validateRemoval(after, state.parts[0].id)?.code).toBe("not_found");
  });
});

describe("recolouring", () => {
  it("changes neither shape nor stock", () => {
    const state = place(fresh(), brick(0, 0, 0));
    const id = state.parts[0].id;
    expect(validateRecolour(state, id, "rose")).toBeNull();
    const after = applyRecolour(state, id, "rose");
    expect(after.parts[0]).toEqual({ ...state.parts[0], colour: "rose" });
    expect(after.inventory).toEqual(state.inventory);
  });
});
