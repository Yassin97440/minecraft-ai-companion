import test from "node:test";
import assert from "node:assert/strict";
import { decideReflex, type DangerState } from "../src/survival.js";
import { digHazardFrom, isGravityBlock } from "../src/world.js";

const calm: DangerState = {
  health: 20,
  food: 20,
  inLava: false,
  onFire: false,
  headBlocked: false,
  hostiles: [],
  hasWeapon: false,
  hasFood: true,
  shelterBlocks: 0,
};
const state = (over: Partial<DangerState>): DangerState => ({ ...calm, ...over });

test("rien à signaler : aucun réflexe", () => {
  assert.equal(decideReflex(calm).action, "none");
});

test("lave ou feu : sortir, avant tout le reste", () => {
  assert.equal(decideReflex(state({ inLava: true, hostiles: [{ name: "zombie", dist: 2 }] })).action, "escape_fire");
  assert.equal(decideReflex(state({ onFire: true })).action, "escape_fire");
});

test("bloc sur la tête (gravier) : dégager", () => {
  assert.equal(decideReflex(state({ headBlocked: true })).action, "clear_head");
});

test("creeper : toujours fuir, même avec une épée", () => {
  assert.equal(decideReflex(state({ hasWeapon: true, hostiles: [{ name: "creeper", dist: 5 }] })).action, "flee");
});

test("monstre proche : se battre si armé et en forme, sinon s'abriter ou fuir", () => {
  const zombie = [{ name: "zombie", dist: 5 }];
  assert.equal(decideReflex(state({ hasWeapon: true, hostiles: zombie })).action, "fight");
  assert.equal(decideReflex(state({ shelterBlocks: 20, hostiles: zombie })).action, "shelter");
  assert.equal(decideReflex(state({ hostiles: zombie })).action, "flee");
  assert.equal(decideReflex(state({ hasWeapon: true, hostiles: [...zombie, ...zombie, ...zombie, ...zombie] })).action, "flee");
});

test("vie basse : on ne se bat pas", () => {
  const r = decideReflex(state({ health: 4, hasWeapon: true, hostiles: [{ name: "zombie", dist: 6 }] }));
  assert.equal(r.action, "flee");
  assert.equal(decideReflex(state({ health: 4, shelterBlocks: 30, hostiles: [{ name: "skeleton", dist: 6 }] })).action, "shelter");
});

test("monstre lointain : on continue ce qu'on faisait", () => {
  assert.equal(decideReflex(state({ hasWeapon: true, hostiles: [{ name: "zombie", dist: 14 }] })).action, "none");
});

test("faim : manger seulement si on peut et si c'est calme", () => {
  assert.equal(decideReflex(state({ food: 6 })).action, "eat");
  assert.equal(decideReflex(state({ food: 6, hasFood: false })).action, "none");
  assert.equal(decideReflex(state({ food: 6, hostiles: [{ name: "zombie", dist: 9 }] })).action, "none");
  assert.equal(decideReflex(state({ health: 10, food: 15 })).action, "eat", "regénération");
});

test("creuser : gravier au-dessus et lave/eau voisine sont dangereux", () => {
  assert.match(digHazardFrom("gravel", []) ?? "", /gravel au-dessus/);
  assert.match(digHazardFrom("stone", ["stone", "lava"]) ?? "", /lava/);
  assert.match(digHazardFrom("air", ["water"]) ?? "", /water/);
  assert.equal(digHazardFrom("stone", ["stone", "dirt", undefined]), null);
  assert.equal(isGravityBlock("white_concrete_powder"), true);
  assert.equal(isGravityBlock("stone"), false);
});
