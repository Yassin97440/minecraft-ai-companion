import test from "node:test";
import assert from "node:assert/strict";
import { createRecipeDb } from "../src/needs.js";
import { obtainItem, type Actions, type Budget } from "../src/obtain.js";

const db = createRecipeDb("1.21.4");

/** Faux monde minimal pour l'exécuteur : un inventaire, des actions qui le modifient, des compteurs d'appels. */
function world(have: Record<string, number> = {}, opts: { gatherPerCall?: number; lie?: boolean; failGather?: boolean; interruptAfter?: number; clock?: { t: number; tick: number } } = {}) {
  const inv = new Map(Object.entries(have));
  const add = (k: string, v: number) => inv.set(k, (inv.get(k) ?? 0) + v);
  const calls: string[] = [];
  const clock = opts.clock ?? { t: 0, tick: 0 };
  const actions: Actions = {
    inventory: () => new Map(inv),
    interrupted: () => opts.interruptAfter !== undefined && calls.length >= opts.interruptAfter,
    now: () => clock.t,
    async gather(step, count) {
      calls.push(`gather ${step.item}`);
      clock.t += clock.tick;
      if (opts.failGather) return "aucune source dans 48 blocs";
      if (opts.lie) return `${count} ${step.item} ramassés`; // annonce un succès, n'ajoute rien
      add(step.item, Math.min(count, opts.gatherPerCall ?? count));
      return "ok";
    },
    async craft(item, count) {
      calls.push(`craft ${item}`);
      clock.t += clock.tick;
      // Recette réelle du registre : consomme les ingrédients, sinon échoue.
      const r = db.recipesFor(item).find((x) => Object.entries(x.ingredients).every(([k, v]) => (inv.get(k) ?? 0) >= v * Math.ceil(count / x.yields)));
      if (!r) return `Impossible de crafter ${item}`;
      const times = Math.ceil(count / r.yields);
      for (const [k, v] of Object.entries(r.ingredients)) add(k, -v * times);
      add(item, times * r.yields);
      return "ok";
    },
    async smelt() {
      calls.push("smelt");
      return "Impossible : la fonte n'est pas implémentée";
    },
    async placeStation(station) {
      calls.push(`place ${station}`);
      if ((inv.get(station) ?? 0) < 1) return "Impossible : pas de station";
      add(station, -1);
      return "posé";
    },
  };
  return { actions, inv, calls };
}

test("nominal : de rien à une pioche en pierre, chaque étape vérifiée", async () => {
  const w = world();
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "done", r.message);
  assert.equal(w.inv.get("stone_pickaxe"), 1);
  assert.match(r.message, /^Obtenu 1 stone_pickaxe\. Inventaire réel: .*\+1 stone_pickaxe/);
  assert.equal(r.obtained.stone_pickaxe, 1);
  assert.ok(r.actionsRun <= 15, `${r.actionsRun} actions`);
  assert.ok(w.calls.indexOf("place crafting_table") < w.calls.lastIndexOf("craft stone_pickaxe"));
});

test("déjà possédé : aucune action", async () => {
  const w = world({ stone_pickaxe: 1 });
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "done");
  assert.match(r.message, /^Rien à faire/);
  assert.deepEqual(w.calls, []);
});

test("refus du planificateur : aucune action, message Impossible", async () => {
  const w = world();
  for (const item of ["banane", "blaze_rod", "leather"]) {
    const r = await obtainItem(item, 1, w.actions, db);
    assert.equal(r.status, "failed");
    assert.match(r.message, /^Impossible : /);
  }
  assert.deepEqual(w.calls, []);
});

test("échec de récolte : 3 essais sans progrès, puis arrêt avec ce qui a été obtenu", async () => {
  const w = world({}, { failGather: true });
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "failed");
  assert.match(r.message, /^Échec à l'étape 1\/\d+ \(gather oak_log x3/);
  assert.match(r.message, /aucune source/);
  assert.equal(w.calls.length, 3, "exactement 3 essais, pas un de plus");
  assert.equal(r.failedStep?.type, "gather");
});

test("progrès conservé : l'échec tardif rapporte les étapes déjà faites", async () => {
  // Les bûches existent (récolte OK) mais la pierre est introuvable.
  const w = world();
  const real = w.actions.gather;
  w.actions.gather = async (step, count) => (step.item === "cobblestone" ? "plus de pierre dans 48 blocs" : real(step, count));
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "failed");
  assert.match(r.message, /gather cobblestone/);
  assert.ok((r.obtained.wooden_pickaxe ?? 0) === 1, `obtenu: ${JSON.stringify(r.obtained)}`);
  assert.match(r.message, /Obtenu jusque-là : .*wooden_pickaxe/);
});

test("vérification : une action qui annonce un succès sans effet est un échec", async () => {
  const w = world({}, { lie: true });
  const r = await obtainItem("wooden_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "failed");
  assert.equal(w.inv.get("oak_log") ?? 0, 0);
  assert.equal(w.calls.length, 3);
});

test("récolte partielle : on rappelle pour le reste, dans le budget", async () => {
  const w = world({}, { gatherPerCall: 1 });
  const r = await obtainItem("wooden_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "done", r.message);
  assert.equal(w.calls.filter((c) => c === "gather oak_log").length, 3);
});

test("interruption : le joueur reprend la main => arrêt avant toute nouvelle action", async () => {
  const w = world({}, { interruptAfter: 2 });
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "interrupted");
  assert.match(r.message, /^Interrompu par le joueur à l'étape/);
  assert.equal(w.calls.length, 2, "aucune action après l'interruption");
});

test("budget d'actions : arrêt exact, aucun appel au-delà", async () => {
  const budget: Budget = { maxSteps: 4, maxFailStreak: 3, maxMs: 480_000 };
  const w = world();
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db, budget);
  assert.equal(r.status, "budget");
  assert.match(r.message, /^Échec : budget épuisé \(4 actions\)/);
  assert.equal(w.calls.length, 4);
});

test("budget de temps : horloge injectée, arrêt dès le dépassement", async () => {
  const clock = { t: 0, tick: 100_000 };
  const w = world({}, { clock });
  const r = await obtainItem("stone_pickaxe", 1, w.actions, db, { maxSteps: 40, maxFailStreak: 3, maxMs: 250_000 });
  assert.equal(r.status, "budget");
  assert.match(r.message, /budget de temps épuisé/);
  assert.ok(w.calls.length <= 4, `${w.calls.length} actions`);
});

test("fonte non implémentée : échec explicite, pas de faux succès", async () => {
  const w = world({ raw_iron: 3, furnace: 1, coal: 1 });
  const r = await obtainItem("iron_ingot", 3, w.actions, db);
  assert.equal(r.status, "failed");
  assert.match(r.message, /smelt raw_iron/);
  assert.match(r.message, /fonte n'est pas implémentée/);
  assert.equal(w.inv.get("iron_ingot") ?? 0, 0);
});

test("un tool qui lève une exception est traité comme un échec borné", async () => {
  const w = world();
  w.actions.gather = async () => {
    throw new Error("pathfinder planté");
  };
  const r = await obtainItem("wooden_pickaxe", 1, w.actions, db);
  assert.equal(r.status, "failed");
  assert.match(r.message, /pathfinder planté/);
});
