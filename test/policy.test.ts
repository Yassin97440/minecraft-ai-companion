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

test("mine_tunnel : longueur plafonnée, interdit en mode autonome", () => {
  const o = { ...opts, maxTunnel: 24 };
  assert.equal(checkToolCall("mine_tunnel", { length: 10 }, "chat", o).kind, "allow");
  assert.equal(checkToolCall("mine_tunnel", { length: 99 }, "chat", o).kind, "deny");
  assert.equal(checkToolCall("mine_tunnel", { length: 5 }, "idle", o).kind, "deny");
  assert.equal(checkToolCall("sleep_in_bed", {}, "idle", o).kind, "deny");
  assert.equal(checkToolCall("look_around", {}, "idle", o).kind, "allow");
});

test("plan_needs (lecture seule) est autorisé en mode autonome, pas obtain_item (à venir)", () => {
  assert.equal(checkToolCall("plan_needs", { item: "stone_pickaxe" }, "idle", opts).kind, "allow");
  assert.equal(checkToolCall("plan_needs", { item: "stone_pickaxe" }, "chat", opts).kind, "allow");
  assert.equal(checkToolCall("obtain_item", { item: "stone_pickaxe" }, "idle", opts).kind, "deny");
});

test("obtain_item : quantité bornée par le garde-fou, autorisé en chat", () => {
  assert.equal(checkToolCall("obtain_item", { item: "stone_pickaxe" }, "chat", opts).kind, "allow");
  assert.equal(checkToolCall("obtain_item", { item: "cobblestone", count: 64 }, "chat", opts).kind, "allow");
  assert.equal(checkToolCall("obtain_item", { item: "cobblestone", count: 5000 }, "chat", opts).kind, "deny");
  assert.equal(checkToolCall("obtain_item", { item: "stick", count: 0 }, "chat", opts).kind, "deny");
});

test("en mode autonome, seuls les tools de l'allowlist passent", () => {
  assert.equal(checkToolCall("run_blueprint", { name: "cabin" }, "idle", opts).kind, "deny");
  assert.equal(checkToolCall("give_to_player", {}, "idle", opts).kind, "deny");
  assert.equal(checkToolCall("emote", { action: "spin" }, "idle", opts).kind, "allow");
});
