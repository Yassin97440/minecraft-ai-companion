import test from "node:test";
import assert from "node:assert/strict";
import { checkToolCall, isProtectedBlock } from "../src/policy.js";

const opts = { autoApproveBuilds: false, maxCollect: 32 };

test("les blocs sensibles sont protégés", () => {
  for (const b of ["chest", "furnace", "red_bed", "white_shulker_box", "oak_sign", "spawner"]) {
    assert.equal(isProtectedBlock(b), true, b);
  }
  assert.equal(isProtectedBlock("oak_log"), false);
});

test("collect_block : refus d'un bloc protégé et d'un trop gros volume", () => {
  assert.equal(checkToolCall("collect_block", { block: "chest", count: 1 }, "chat", opts).kind, "deny");
  assert.equal(checkToolCall("collect_block", { block: "oak_log", count: 100 }, "chat", opts).kind, "deny");
  assert.equal(checkToolCall("collect_block", { block: "oak_log", count: 10 }, "chat", opts).kind, "allow");
});

test("run_blueprint demande l'accord, sauf auto-approve", () => {
  assert.equal(checkToolCall("run_blueprint", { name: "cabin" }, "chat", opts).kind, "approve");
  assert.equal(checkToolCall("run_blueprint", { name: "cabin" }, "chat", { ...opts, autoApproveBuilds: true }).kind, "allow");
});

test("en mode autonome, seuls les tools de l'allowlist passent", () => {
  assert.equal(checkToolCall("run_blueprint", { name: "cabin" }, "idle", opts).kind, "deny");
  assert.equal(checkToolCall("give_to_player", {}, "idle", opts).kind, "deny");
  assert.equal(checkToolCall("emote", { action: "spin" }, "idle", opts).kind, "allow");
});
