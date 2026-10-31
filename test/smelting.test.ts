import test from "node:test";
import assert from "node:assert/strict";
import { SMELT_MS_PER_ITEM, runFurnace, type FurnaceLike, type SmeltJob } from "../src/smelting.js";

/** Faux four : cuit 1 objet par SMELT_MS_PER_ITEM de temps virtuel ; trace tout ce que le code lui demande. */
function fakeFurnace(opts: { stuck?: boolean } = {}) {
  const log: string[] = [];
  let input = 0;
  let fuel = 0;
  let cooked = 0;
  let progress = 0;
  let clock = 0;
  const furnace: FurnaceLike = {
    async putInput(_t, _m, n) {
      log.push(`input ${n}`);
      input += n;
    },
    async putFuel(_t, _m, n) {
      log.push(`fuel ${n}`);
      fuel += n;
    },
    outputItem: () => (cooked > 0 ? { count: cooked } : null),
    async takeOutput() {
      log.push(`output ${cooked}`);
      cooked = 0;
    },
    async takeInput() {
      log.push(`take-input ${input}`);
      input = 0;
    },
    async takeFuel() {
      log.push("take-fuel");
      fuel = 0;
    },
    close() {},
  };
  const deps = (interruptAt = Infinity) => ({
    now: () => clock,
    interrupted: () => clock >= interruptAt,
    sleep: async (ms: number) => {
      clock += ms;
      if (opts.stuck) return; // le four ne cuit rien (pas de combustible, par ex.)
      progress += ms;
      while (progress >= SMELT_MS_PER_ITEM && input > 0) {
        progress -= SMELT_MS_PER_ITEM;
        input--;
        cooked++;
      }
    },
  });
  return { furnace, log, deps, state: () => ({ input, fuel, cooked, clock }) };
}
const job: SmeltJob = { inputType: 1, fuelType: 2, count: 3, fuelUnits: 1 };

test("fonte nominale : charge combustible et minerai, attend, récupère tout", async () => {
  const f = fakeFurnace();
  const r = await runFurnace(f.furnace, job, f.deps());
  assert.equal(r.stopped, "done");
  assert.equal(r.collected, 3);
  assert.deepEqual(f.log.slice(0, 2), ["fuel 1", "input 3"]);
  assert.ok(f.log.some((l) => l.startsWith("output")));
  assert.equal(f.state().input, 0, "rien ne reste dans le four");
  assert.ok(f.state().clock >= 30_000 && f.state().clock <= 33_000, `temps virtuel ${f.state().clock}`);
});

test("interruption du joueur : arrêt, l'ingrédient non cuit est repris", async () => {
  const f = fakeFurnace();
  const r = await runFurnace(f.furnace, job, f.deps(15_000));
  assert.equal(r.stopped, "interrupted");
  assert.ok(r.collected < 3);
  assert.match(r.note, /interrompu par le joueur/);
  assert.ok(f.log.includes("take-input 2") || f.log.includes("take-input 1") || r.collected > 0);
  assert.equal(f.state().input, 0);
});

test("four bloqué : délai dépassé, borné, ingrédient et combustible repris", async () => {
  const f = fakeFurnace({ stuck: true });
  const r = await runFurnace(f.furnace, job, f.deps());
  assert.equal(r.stopped, "timeout");
  assert.equal(r.collected, 0);
  assert.match(r.note, /délai dépassé/);
  assert.ok(f.state().clock <= 3 * SMELT_MS_PER_ITEM + 15_000 + 1000, "arrêt au plus tard à l'échéance");
  assert.ok(f.log.includes("take-input 3"));
  assert.ok(f.log.includes("take-fuel"));
});

test("erreurs de récupération finale ignorées : le résultat reste rapporté", async () => {
  const f = fakeFurnace();
  f.furnace.takeInput = async () => {
    throw new Error("fenêtre fermée");
  };
  const r = await runFurnace(f.furnace, job, f.deps());
  assert.equal(r.stopped, "done");
});
