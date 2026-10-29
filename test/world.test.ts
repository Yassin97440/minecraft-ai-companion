import test from "node:test";
import assert from "node:assert/strict";
import { inventoryDiff } from "../src/world.js";

test("inventoryDiff décrit ce qui a vraiment changé", () => {
  const before = new Map([["stone", 3], ["bread", 2]]);
  const after = new Map([["stone", 3], ["bread", 1], ["cobblestone", 12], ["coal", 2]]);
  assert.equal(inventoryDiff(before, after), "-1 bread, +12 cobblestone, +2 coal");
  assert.equal(inventoryDiff(before, before), "aucun changement d'inventaire");
});
