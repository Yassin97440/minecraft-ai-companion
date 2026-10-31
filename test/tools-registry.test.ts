import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Journal, Memory } from "../src/memory.js";
import { IDLE_TOOLS } from "../src/policy.js";
import { createTools } from "../src/tools.js";
import { stubBot } from "../eval/fake-tools.js";

const ctx = () => ({
  journal: new Journal(path.join(os.tmpdir(), `j-${Math.random()}.json`)),
  memory: new Memory(path.join(os.tmpdir(), `m-${Math.random()}.json`)),
  run: { saidThisRun: false, interrupted: false },
  bot: stubBot(),
});

test("registre des tools : mêmes noms, sans doublon, et l'allowlist autonome ne cite que des tools qui existent", () => {
  const names = (createTools(ctx() as never) as { name: string }[]).map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "noms en double");
  assert.deepEqual([...names].sort(), [
    "build_structure", "chest_contents", "collect_block", "craft_item", "dig_out", "eat", "emote", "end_mission", "equip_item", "fight", "find_block",
    "flee", "food_status", "forget", "gear_up", "get_status", "give_to_player", "go_to", "go_to_player", "list_blueprints", "look_around", "mine_tunnel", "mission_progress",
    "obtain_item", "pickup_items", "place_block", "plan_needs", "remember", "run_blueprint", "say", "sleep_in_bed", "start_mission", "store_in_chest",
    "take_from_chest", "take_shelter", "wander",
  ]);
  for (const n of IDLE_TOOLS) assert.ok(names.includes(n), `IDLE_TOOLS cite un tool inconnu : ${n}`);
});
