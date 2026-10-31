import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { DEATH_TTL_MS, MISSION_TTL_MS, Memory } from "../src/memory.js";
import { canResumeAfterReflex, enqueue, MAX_QUEUE, RESUME_COOLDOWN_MS, type Queued } from "../src/instructions.js";

const tmp = () => path.join(os.tmpdir(), `memory-${Math.random()}.json`);
function clocked() {
  let t = 1_000_000;
  const file = tmp();
  return { file, memory: new Memory(file, () => t), advance: (ms: number) => (t += ms), at: () => t };
}

test("mémoire : 60+ coffres n'évincent ni la mort, ni la base, ni le lit", () => {
  const { memory } = clocked();
  memory.set("mort", "place", "mort", { x: 1, y: 2, z: 3 });
  memory.set("lit", "place", "lit", { x: 4, y: 5, z: 6 });
  for (let i = 0; i < 80; i++) memory.set(`coffre ${i}`, "place", "coffre", { x: i, y: 0, z: 0 });
  const keys = memory.entries().map((e) => e.key);
  assert.ok(keys.includes("mort") && keys.includes("lit"));
  assert.equal(memory.entries().length, 60);
  assert.ok(!keys.includes("coffre 0"), "le plus ancien coffre est évincé");
  assert.ok(keys.includes("coffre 79"));
});

test("mort : retrouvée après redémarrage, expire après 5 min, effaçable", () => {
  const { file, memory, advance, at } = clocked();
  memory.set("mort", "place", "mort", { x: 10, y: 64, z: -5 });
  const restarted = new Memory(file, at); // même fichier = redémarrage du bot
  assert.deepEqual(restarted.pendingDeath()?.pos, { x: 10, y: 64, z: -5 });
  advance(DEATH_TTL_MS + 1);
  assert.equal(restarted.pendingDeath(), null);

  memory.set("mort", "place", "mort", { x: 1, y: 1, z: 1 });
  assert.ok(memory.pendingDeath());
  memory.forget("mort");
  assert.equal(memory.pendingDeath(), null);
});

test("mission : expire sans progrès, un objectif coché la prolonge", () => {
  const { memory, advance } = clocked();
  memory.startMission("fer", ["10 fer", "3 diamants"]);
  advance(MISSION_TTL_MS - 1000);
  assert.ok(memory.activeMission());
  memory.markObjective("fer");
  advance(MISSION_TTL_MS - 1000);
  assert.ok(memory.activeMission(), "le progrès a remis le compteur à zéro");
  advance(2000);
  assert.equal(memory.activeMission(), null);
  assert.match(memory.format(), /dernière mission, abandonnée.*expirée/);
});

test("file d'instructions : bornée et sans doublon", () => {
  const q: Queued[] = [];
  assert.equal(enqueue(q, { username: "Système", text: "danger écarté" }), true);
  assert.equal(enqueue(q, { username: "Système", text: "danger écarté" }), false);
  for (let i = 0; i < 20; i++) enqueue(q, { username: "joueur", text: `msg ${i}` });
  assert.equal(q.length, MAX_QUEUE);
  assert.equal(q.at(-1)?.text, "msg 19");
});

test("relance après réflexe : une seule par épisode de danger", () => {
  assert.equal(canResumeAfterReflex(0, 1_000_000), true);
  assert.equal(canResumeAfterReflex(1_000_000, 1_000_000 + 4000), false);
  assert.equal(canResumeAfterReflex(1_000_000, 1_000_000 + RESUME_COOLDOWN_MS), true);
});
