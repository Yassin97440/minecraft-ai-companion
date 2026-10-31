import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK,
  HARMFUL,
  PRECIOUS,
  THRESHOLDS,
  chooseMeal,
  classify,
  createFoodDb,
  eatMeal,
  foodStock,
  formatFoodStatus,
  needsResupply,
  type MealActions,
} from "../src/food.js";

const db = createFoodDb("1.21.4");
const inv = (o: Record<string, number> = {}) => new Map(Object.entries(o));
const meal = (have: Record<string, number>, food: number, health = 20) => chooseMeal(inv(have), { food, health }, db);
const item = (m: ReturnType<typeof meal>) => ("item" in m ? m.item : `REFUS:${m.refusal}`);

test("registre : 41 aliments, et chaque nom des listes fermées existe (pas de faute de frappe)", () => {
  assert.equal(Object.keys(db).length, 41);
  for (const set of [HARMFUL, FALLBACK, PRECIOUS]) for (const n of set) assert.ok(db[n], `${n} absent du registre`);
});

test("classification : chaque aliment a UNE catégorie, les cas clés sont corrects", () => {
  const cats = new Map(Object.keys(db).map((n) => [n, classify(n)]));
  assert.equal(cats.size, 41);
  for (const n of ["cooked_beef", "cooked_porkchop", "cooked_chicken", "bread", "apple", "baked_potato", "cooked_salmon", "honey_bottle", "pumpkin_pie"]) {
    assert.equal(classify(n), "safe", n);
  }
  for (const n of ["spider_eye", "poisonous_potato", "pufferfish", "chorus_fruit", "suspicious_stew", "ominous_bottle"]) assert.equal(classify(n), "harmful", n);
  for (const n of ["beef", "porkchop", "chicken", "rotten_flesh", "cod"]) assert.equal(classify(n), "fallback", n);
  for (const n of ["golden_apple", "enchanted_golden_apple", "golden_carrot"]) assert.equal(classify(n), "precious", n);
});

test("régression : steak et poulet cuits sont mangeables (le défaut constaté en jeu)", () => {
  assert.equal(item(meal({ cooked_beef: 3 }, 8)), "cooked_beef");
  assert.equal(item(meal({ cooked_chicken: 2 }, 8)), "cooked_chicken");
});

test("choix : jamais de nuisible, même affamé", () => {
  assert.equal(item(meal({ spider_eye: 3, poisonous_potato: 2 }, 2)), "REFUS:only_harmful");
  assert.equal(item(meal({ spider_eye: 3, bread: 1 }, 2)), "bread");
});

test("choix : le cuit passe avant le cru, le sûr avant le secours", () => {
  assert.equal(item(meal({ beef: 5, cooked_beef: 1, apple: 2 }, 4)), "cooked_beef");
  assert.equal(item(meal({ beef: 5, apple: 2 }, 8)), "apple");
});

test("choix : aliments de secours seulement si la faim est critique", () => {
  assert.equal(item(meal({ beef: 5 }, 9)), "REFUS:only_precious_not_urgent");
  assert.equal(item(meal({ beef: 5 }, THRESHOLDS.criticalFood)), "beef");
  assert.equal(item(meal({ rotten_flesh: 2 }, 3)), "rotten_flesh");
});

test("choix : le précieux est réservé aux urgences de santé", () => {
  assert.equal(item(meal({ golden_apple: 1 }, 10, 20)), "REFUS:only_precious_not_urgent");
  assert.equal(item(meal({ golden_apple: 1 }, 10, 6)), "golden_apple");
  assert.equal(item(meal({ golden_apple: 1, bread: 1 }, 10, 6)), "bread", "le sûr reste prioritaire");
});

test("choix : le plus petit aliment qui comble le déficit, sinon le plus nourrissant", () => {
  // faim 18 : déficit 2 -> le plus petit cuit qui comble (pain 5 < steak 8)
  assert.equal(item(meal({ bread: 1, cooked_beef: 1 }, 18)), "bread");
  // faim 4 : déficit 16 -> aucun ne comble : le plus nourrissant (steak 8 > pain 5)
  assert.equal(item(meal({ bread: 1, cooked_beef: 1 }, 4)), "cooked_beef");
});

test("choix : repu ou sans aliment => refus avec la vraie raison", () => {
  const full = meal({ bread: 2 }, 20);
  assert.ok("refusal" in full && full.refusal === "full");
  assert.match("detail" in full ? full.detail : "", /^Je n'ai pas faim \(20\/20\)/);
  const none = meal({ oak_log: 3 }, 5);
  assert.ok("refusal" in none && none.refusal === "none");
  assert.match("detail" in none ? none.detail : "", /^Aucun aliment mangeable/);
});

test("choix : déterministe (mêmes entrées, même repas)", () => {
  const a = item(meal({ bread: 2, cooked_beef: 2, apple: 1, cooked_chicken: 1 }, 7));
  for (let i = 0; i < 10; i++) assert.equal(item(meal({ cooked_chicken: 1, apple: 1, cooked_beef: 2, bread: 2 }, 7)), a);
});

test("stock : points restaurables, nuisibles et précieux exclus du total", () => {
  const s = foodStock(inv({ cooked_beef: 3, bread: 2, beef: 1, spider_eye: 2, golden_apple: 1, oak_log: 9 }), db);
  assert.equal(s.total, 3 * 8 + 2 * 5 + 1 * 3);
  assert.equal(s.byCategory.harmful, 2 * 2);
  assert.ok(s.byCategory.precious > 0);
  assert.equal(s.items.oak_log, undefined);
});

test("approvisionnement : sous le stock cible ET faim basse, ou sortie prévue", () => {
  const low = foodStock(inv({ bread: 2 }), db);
  const full = foodStock(inv({ cooked_beef: 6 }), db);
  assert.equal(needsResupply(low, { food: 12, health: 20 }), true);
  assert.equal(needsResupply(low, { food: 18, health: 20 }), false, "pas encore faim");
  assert.equal(needsResupply(low, { food: 18, health: 20 }, true), true, "sortie longue prévue");
  assert.equal(needsResupply(full, { food: 5, health: 20 }), false, "stock suffisant");
});

test("texte food_status : faim, stock, réserve d'urgence, nuisibles", () => {
  const t = formatFoodStatus(12, inv({ cooked_beef: 3, bread: 2, golden_apple: 1, spider_eye: 2 }), db);
  assert.match(t, /^Faim 12\/20\. Stock: 34\/40 pts \(.*cooked_beef x3.*bread x2.*\)\. Réserve d'urgence: golden_apple x1\. Nuisible: spider_eye x2 \(ignoré\)\.$/);
  assert.match(formatFoodStatus(20, inv(), db), /Stock: 0\/40 pts \(aucun aliment\)/);
});

// ---------------------------------------------------------------- repas vérifié

function table(have: Record<string, number>, food: number, opts: { health?: number; lag?: boolean; failConsume?: string[]; noEffect?: boolean } = {}) {
  const state = { inv: new Map(Object.entries(have)), food, pending: 0 };
  const consumed: string[] = [];
  const a: MealActions = {
    inventory: () => new Map(state.inv),
    food: () => state.food,
    health: () => opts.health ?? 20,
    async consume(name) {
      consumed.push(name);
      if (opts.failConsume?.includes(name)) throw new Error("serveur lent");
      state.inv.set(name, (state.inv.get(name) ?? 0) - 1);
      if (opts.noEffect) return;
      // Serveur lent : la faim ne change qu'au moment de l'attente.
      if (opts.lag) state.pending = db[name].points;
      else state.food = Math.min(20, state.food + db[name].points);
    },
    async waitFoodChange(before) {
      if (state.pending) {
        state.food = Math.min(20, state.food + state.pending);
        state.pending = 0;
      }
      return state.food !== before;
    },
  };
  return { a, consumed, state };
}

test("repas : faim avant/après prouvée, résultat au format du contrat", async () => {
  const t = table({ cooked_beef: 2 }, 9);
  assert.equal(await eatMeal(t.a, db), "J'ai mangé cooked_beef : faim 9 -> 17.");
  assert.deepEqual(t.consumed, ["cooked_beef"]);
});

test("repas : un serveur lent à confirmer n'est pas pris pour un échec (piste 2 de la spec)", async () => {
  const t = table({ cooked_beef: 2 }, 9, { lag: true });
  assert.match(await eatMeal(t.a, db), /^J'ai mangé cooked_beef : faim 9 -> 17\./);
  assert.equal(t.consumed.length, 1, "un seul essai suffit");
});

test("repas : une exception est rapportée, jamais levée ; 2e essai avec un autre aliment", async () => {
  const t = table({ cooked_beef: 1, bread: 1 }, 4, { failConsume: ["cooked_beef"] });
  assert.match(await eatMeal(t.a, db), /^J'ai mangé bread/);
  assert.deepEqual(t.consumed, ["cooked_beef", "bread"]);
});

test("repas : faim inchangée après 2 essais => échec explicite, borné", async () => {
  const t = table({ cooked_beef: 1, bread: 1 }, 4, { noEffect: true });
  const r = await eatMeal(t.a, db);
  assert.match(r, /^Échec : ma faim n'a pas changé après 2 essais/);
  assert.equal(t.consumed.length, 2);
});

test("repas demandé : aliment précis, ou refus avec la vraie raison, sans rien consommer", async () => {
  const t = table({ cooked_beef: 1, spider_eye: 2, golden_apple: 1 }, 8);
  assert.match(await eatMeal(t.a, db, "spider_eye"), /^Impossible : spider_eye est nuisible/);
  assert.match(await eatMeal(t.a, db, "golden_apple"), /^Impossible : golden_apple est un aliment précieux réservé aux urgences/);
  assert.match(await eatMeal(t.a, db, "bread"), /^Je n'ai pas de bread/);
  assert.match(await eatMeal(t.a, db, "caillou"), /^Impossible : "caillou" n'est pas un aliment/);
  assert.deepEqual(t.consumed, []);
  assert.match(await eatMeal(t.a, db, "cooked_beef"), /^J'ai mangé cooked_beef/);
});

test("repas : repu => « Je n'ai pas faim », sans consommer", async () => {
  const t = table({ bread: 3 }, 20);
  assert.equal(await eatMeal(t.a, db), "Je n'ai pas faim (20/20).");
  assert.deepEqual(t.consumed, []);
});

test("repas : pomme dorée autorisée quand la vie est basse", async () => {
  const t = table({ golden_apple: 1 }, 15, { health: 5 });
  assert.match(await eatMeal(t.a, db), /^J'ai mangé golden_apple/);
});
