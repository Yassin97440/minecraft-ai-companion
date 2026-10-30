import test from "node:test";
import assert from "node:assert/strict";
import { BLUEPRINTS, footprintBox, macroArgs, missingMaterials, resolveMaterials, resolveParams } from "../src/blueprints.js";

const inv = (items: Record<string, number>) => (i: string) => items[i] ?? 0;

test("sans paramètre : le bois dont on a le plus de planches", () => {
  const r = resolveParams({}, inv({ acacia_planks: 70, oak_planks: 3 }));
  assert.ok(r.ok);
  assert.equal(r.params.wood, "acacia");
  assert.equal(r.params.wall, "acacia_planks");
  assert.equal(r.params.door, "acacia_door");
});

test("inventaire vide : retombe sur le chêne", () => {
  const r = resolveParams({}, inv({}));
  assert.ok(r.ok);
  assert.equal(r.params.wall, "oak_planks");
});

test("mur en planches d'acacia : la porte est assortie", () => {
  const r = resolveParams({ wall: "acacia_planks" }, inv({}));
  assert.ok(r.ok);
  assert.equal(r.params.door, "acacia_door");
});

test("mur en pierre : bois pour la porte pris dans l'inventaire", () => {
  const r = resolveParams({ wall: "cobblestone" }, inv({ spruce_planks: 4 }));
  assert.ok(r.ok);
  assert.equal(r.params.wall, "cobblestone");
  assert.equal(r.params.door, "spruce_door");
});

test("matériau hors liste refusé (pas d'injection dans la commande)", () => {
  assert.equal(resolveParams({ wall: 'stone"} run say hi' }, inv({})).ok, false);
  assert.equal(resolveParams({ wood: "diamond" }, inv({})).ok, false);
  assert.equal(resolveParams({ wall: "bedrock" }, inv({})).ok, false);
});

test("cabane tout en acacia : mur et sol sont le même item, les coûts s'additionnent", () => {
  const r = resolveParams({ wood: "acacia" }, inv({}));
  assert.ok(r.ok);
  const mats = resolveMaterials(BLUEPRINTS.cabin, r.params);
  assert.deepEqual(mats, { acacia_planks: 288 + 150, acacia_door: 1 });
  const missing = missingMaterials(mats, inv({ acacia_planks: 400 }));
  assert.deepEqual(missing, { acacia_planks: 38, acacia_door: 1 });
});

test("cabane en pierre avec sol en bois : coûts séparés, torches facultatives", () => {
  const r = resolveParams({ wood: "birch", wall: "cobblestone" }, inv({}));
  assert.ok(r.ok);
  const mats = resolveMaterials(BLUEPRINTS.cabin, r.params);
  assert.deepEqual(mats, { cobblestone: 288, birch_planks: 150, birch_door: 1 });
  assert.equal("torch" in mats, false);
});

test("emprise de la cabane : 10x15, sol sous les pieds, 4 blocs de haut", () => {
  const box = footprintBox(BLUEPRINTS.cabin, { x: 10.4, y: 64, z: -3.2 });
  assert.deepEqual(box.min, { x: 12, y: 63, z: -2 }); // décalée de 2 devant/à droite
  assert.deepEqual(box.max, { x: 21, y: 67, z: 12 }); // 10 de large (x), 15 de profondeur (z)
});

test("ferme à poules en bouleau", () => {
  const r = resolveParams({ wood: "birch" }, inv({}));
  assert.ok(r.ok);
  assert.deepEqual(resolveMaterials(BLUEPRINTS.chicken_farm, r.params), {
    birch_planks: 25,
    birch_fence: 15,
    birch_fence_gate: 1,
    hay_block: 2,
    egg: 3,
  });
});

test("arguments de macro pour le datapack", () => {
  const r = resolveParams({ wood: "acacia", wall: "stone_bricks" }, inv({}));
  assert.ok(r.ok);
  assert.equal(
    macroArgs(r.params, { stone_bricks: 288, acacia_planks: 150, acacia_door: 1 }),
    '{wall:"stone_bricks",planks:"acacia_planks",fence:"acacia_fence",gate:"acacia_fence_gate",door:"acacia_door",' +
      "wallN:288,planksN:150,fenceN:0,gateN:0,doorN:1}",
  );
});
