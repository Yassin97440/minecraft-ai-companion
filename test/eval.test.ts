import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createTools } from "../src/tools.js";
import { Journal, Memory } from "../src/memory.js";
import { calledTool, inventoryAtLeast } from "../eval/checks.js";
import { createFakeTools, stubBot, REAL_MEMORY_TOOLS } from "../eval/fake-tools.js";
import { FakeWorld } from "../eval/fake-world.js";
import { runScenario } from "../eval/scenario.js";
import { scenarios } from "../eval/scenarios.js";

const keys = (t: any): string[] => Object.keys(t.schema?.shape ?? {}).sort();

test("eval : tous les scénarios passent avec le modèle scripté", async () => {
  for (const s of scenarios) {
    const v = await runScenario(s);
    assert.deepEqual(v.failures, [], `${s.id}: ${v.failures.join(" ; ")}`);
  }
});

test("eval : les critères ne sont pas vacueux (un mauvais script échoue)", async () => {
  const base = scenarios.find((s) => s.id === "bois-nominal")!;
  // Le modèle ne fait que parler : l'inventaire reste vide, le critère doit le voir.
  const lazy = await runScenario({ ...base, script: [{ calls: [["say", { message: "J'ai 3 bûches." }]] }], checks: [inventoryAtLeast({ oak_log: 3 }), calledTool("collect_block")] });
  assert.equal(lazy.passed, false);
  assert.equal(lazy.failures.length, 2);
});

test("eval : le faux monde et les vrais tools ont les mêmes noms et champs d'entrée (contrat)", () => {
  const ctx = { journal: new Journal(path.join(os.tmpdir(), `j-${Math.random()}.json`)), memory: new Memory(path.join(os.tmpdir(), `m-${Math.random()}.json`)), run: { saidThisRun: false, interrupted: false } };
  const real = new Map<string, any>((createTools({ ...ctx, bot: stubBot() } as any) as any[]).map((t) => [t.name, t]));
  for (const fake of createFakeTools(new FakeWorld(), ctx)) {
    const twin = real.get(fake.name);
    assert.ok(twin, `${fake.name} n'existe pas dans les vrais tools`);
    // Un faux tool peut ignorer un champ optionnel du vrai, mais jamais en inventer un.
    const extra = keys(fake).filter((k) => !keys(twin).includes(k));
    assert.deepEqual(extra, [], `${fake.name} invente des champs: ${extra}`);
  }
  for (const n of REAL_MEMORY_TOOLS) assert.ok(real.has(n), n);
});

test("faux monde : craft_item pose l'établi (4 planches en plus) et vérifie les matériaux", async () => {
  const w = new FakeWorld({ inventory: { oak_planks: 6, stick: 2 } });
  const ctx = { journal: new Journal(path.join(os.tmpdir(), `j-${Math.random()}.json`)), memory: new Memory(path.join(os.tmpdir(), `m-${Math.random()}.json`)), run: { saidThisRun: false, interrupted: false } };
  const craft = createFakeTools(w, ctx).find((t) => t.name === "craft_item")!;
  assert.match(String(await craft.invoke({ item: "wooden_pickaxe", count: 1 })), /^Matériaux manquants : 1 oak_planks/);
  w.add("oak_planks", 1);
  assert.match(String(await craft.invoke({ item: "wooden_pickaxe", count: 1 })), /\+1 wooden_pickaxe/);
  assert.equal(w.count("oak_planks"), 0);
});
