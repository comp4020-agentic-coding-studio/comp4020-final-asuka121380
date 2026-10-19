import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Command } from "../../src/domain/commands.ts";
import { localTransport } from "../../src/client/state/transport.ts";
import * as store from "../../src/client/state/store.ts";

const at = (x = 0, y = 0) => ({ partId: "brick-2x4", x, y, z: 0, rot: 0 as const, colour: "sky" });
let transport: ReturnType<typeof localTransport>;
async function seed(command: Command) {
  const result = await transport.send({ commandId: crypto.randomUUID(), expectedRevision: 0, command });
  expect(result.ok).toBe(true);
  await store.start(transport);
}

beforeEach(async () => {
  vi.stubGlobal("location", { search: "" });
  transport = localTransport();
  await store.start(transport);
  store.toggleDelete(false);
  store.select(null);
  store.selectPlan(null);
});
afterEach(() => vi.unstubAllGlobals());

it("deletes a plan through the delete target without changing real stock", async () => {
  await seed({ type: "propose-plan", plan: at() });
  const inventory = { ...store.getState().snapshot!.inventory };
  const id = store.getState().snapshot!.plans[0]!.id;
  store.toggleDelete(true);
  store.setTarget(id);
  await store.deleteObject(id);
  expect(store.getState().snapshot!.plans).toHaveLength(0);
  expect(store.getState().snapshot!.inventory).toEqual(inventory);
  expect(store.getState().targetId).toBeNull();
  expect(store.getState().deleting).toBe(true);
});

it("still removes real bricks and returns their stock", async () => {
  await seed({ type: "place", placement: at() });
  const stock = store.getState().snapshot!.inventory["brick-2x4"]!;
  await store.deleteObject(store.getState().snapshot!.parts[0]!.id);
  expect(store.getState().snapshot!.parts).toHaveLength(0);
  expect(store.getState().snapshot!.inventory["brick-2x4"]).toBe(stock + 1);
});

it("refuses removal of a supporting plan, then allows top-down deletion", async () => {
  await seed({ type: "propose-plan", plan: at() });
  await seed({ type: "propose-plan", plan: at(0, 3) });
  const [bottom, top] = store.getState().snapshot!.plans;
  store.toggleDelete(true);
  store.setTarget(bottom!.id);
  await store.deleteObject(bottom!.id);
  expect(store.getState().snapshot!.plans).toHaveLength(2);
  expect(store.getState().targetId).toBe(bottom!.id);
  expect(store.getState().notice!.kind).toBe("error");
  await store.deleteObject(top!.id);
  await store.deleteObject(bottom!.id);
  expect(store.getState().snapshot!.plans).toHaveLength(0);
});

it("keyboard cycling reaches plans and confirmation withdraws them", async () => {
  await seed({ type: "place", placement: at() });
  await seed({ type: "propose-plan", plan: at(4) });
  store.toggleDelete(true);
  store.setTarget(store.getState().snapshot!.parts[0]!.id);
  store.cycle(1);
  expect(store.getState().targetId).toBe(store.getState().snapshot!.plans[0]!.id);
  store.confirm();
  await vi.waitFor(() => expect(store.getState().snapshot!.plans).toHaveLength(0));
  expect(store.getState().snapshot!.parts).toHaveLength(1);
});

it("ignores a missing target without deleting another object", async () => {
  await seed({ type: "propose-plan", plan: at() });
  await store.deleteObject(null);
  await store.deleteObject("already-removed");
  expect(store.getState().snapshot!.plans).toHaveLength(1);
});
