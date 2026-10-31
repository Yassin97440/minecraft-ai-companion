import test from "node:test";
import assert from "node:assert/strict";
import { createRecipeDb, formatPlan, planNeeds, planNeedsText, type NeedsPlan, type RecipeDb, type Step } from "../src/needs.js";
import { TIERS } from "../src/sources.js";

const db = createRecipeDb("1.21.4");
const inv = (o: Record<string, number> = {}) => new Map(Object.entries(o));
const plan = (item: string, count = 1, have: Record<string, number> = {}) => {
  const p = planNeeds(item, count, inv(have), db);
  assert.ok(p.ok, JSON.stringify(p));
  return p as NeedsPlan;
};

/** Rejoue un plan sur un inventaire : prouve qu'il est EXÉCUTABLE (outil avant récolte, établi avant fabrication). */
function simulate(steps: Step[], have: Record<string, number>) {
  const stock = new Map(Object.entries(have));
  const n = (k: string) => stock.get(k) ?? 0;
  const put = (k: string, v: number) => stock.set(k, n(k) + v);
  let table = false;
  let furnace = false;
  for (const s of steps) {
    if (s.type === "gather") {
      if (s.tool) {
        const ok = TIERS.slice(TIERS.indexOf(s.tool.tier)).some((t) => n(`${t}_${s.tool!.kind}`) > 0);
        assert.ok(ok, `outil ${s.tool.tier}_${s.tool.kind} absent avant de récolter ${s.item}`);
      }
      put(s.item, s.count);
    } else if (s.type === "place_station") {
      assert.ok(n(s.station) > 0, `${s.station} posé sans l'avoir`);
      put(s.station, -1);
      if (s.station === "crafting_table") table = true;
      else furnace = true;
    } else if (s.type === "smelt") {
      assert.ok(furnace, "fonte sans four posé");
      assert.ok(n(s.input) >= s.count, `pas assez de ${s.input}`);
      assert.ok(n(s.fuel) > 0, `pas de combustible ${s.fuel}`);
      put(s.input, -s.count);
      put(s.output, s.count);
      put(s.fuel, -Math.ceil(s.count / 8));
    } else {
      if (s.station === "table") assert.ok(table, `fabrication de ${s.item} sans établi posé`);
      const recipe = db
        .recipesFor(s.item)
        .find((r) => Object.entries(r.ingredients).every(([k, v]) => n(k) >= v * Math.ceil(s.count / r.yields)));
      assert.ok(recipe, `aucune recette de ${s.item} réalisable avec ${[...stock].map(([k, v]) => `${k}x${v}`).join(",")}`);
      const times = Math.ceil(s.count / recipe.yields);
      for (const [k, v] of Object.entries(recipe.ingredients)) put(k, -v * times);
      put(s.item, times * recipe.yields);
    }
  }
  return stock;
}

test("objets de référence : le plan est exécutable et atteint l'objectif (inventaire vide)", () => {
  const goals: [string, number][] = [
    ["oak_planks", 8], ["stick", 4], ["crafting_table", 1], ["wooden_pickaxe", 1], ["wooden_axe", 1], ["wooden_sword", 1],
    ["stone_pickaxe", 1], ["stone_sword", 1], ["stone_axe", 1], ["furnace", 1], ["torch", 8], ["chest", 1],
    ["iron_ingot", 3], ["iron_pickaxe", 1], ["iron_sword", 1], ["iron_chestplate", 1], ["diamond_pickaxe", 1], ["bucket", 1], ["shield", 1], ["bread", 1],
  ];
  const refused: string[] = [];
  for (const [item, count] of goals) {
    const p = planNeeds(item, count, inv(), db);
    if (!p.ok) {
      refused.push(item);
      continue;
    }
    const stock = simulate(p.steps, {});
    assert.ok((stock.get(item) ?? 0) >= count, `${item} : objectif non atteint`);
  }
  // `bread` exige du blé : aucune source dans les tables => refus honnête, pas un plan inventé.
  assert.deepEqual(refused, ["bread"]);
});

test("exemple du contrat : pioche en pierre avec 2 planches", () => {
  const p = plan("stone_pickaxe", 1, { oak_planks: 2 });
  assert.deepEqual(p.have, { oak_planks: 2 });
  assert.equal(p.missing.cobblestone, 3);
  assert.equal(p.missing.crafting_table, 1);
  const kinds = p.steps.map((s) => s.type);
  assert.ok(kinds.indexOf("place_station") < kinds.lastIndexOf("craft"), "l'établi est posé avant la dernière fabrication");
  assert.match(formatPlan(p), /^Objectif : 1 stone_pickaxe\.\nPossédé : oak_planks x2\.\nManque : .*cobblestone x3/);
});

test("ordre : l'outil minimal est fabriqué avant de récolter le minerai", () => {
  const p = plan("iron_ingot", 3);
  const order = p.steps.map((s) => (s.type === "gather" ? `gather:${s.item}` : s.type === "craft" ? `craft:${s.item}` : s.type));
  assert.ok(order.indexOf("craft:stone_pickaxe") < order.indexOf("gather:raw_iron"));
  assert.ok(order.indexOf("gather:raw_iron") < order.indexOf("smelt"));
  assert.ok(order.lastIndexOf("place_station") < order.indexOf("smelt"));
});

test("déjà possédé : rien à faire, et un outil possédé n'est pas refabriqué", () => {
  const done = plan("wooden_pickaxe", 1, { wooden_pickaxe: 1 });
  assert.deepEqual(done.steps, []);
  assert.match(formatPlan(done), /Rien à faire/);
  const p = plan("iron_ingot", 3, { stone_pickaxe: 1, cobblestone: 8 });
  assert.ok(!p.steps.some((s) => s.type === "craft" && s.item === "stone_pickaxe"));
});

test("recette alternative : ce qu'on possède évite de récolter, et le chêne est préféré à égalité", () => {
  const birch = plan("stick", 4, { birch_planks: 2 });
  assert.deepEqual(birch.steps.map((s) => s.type), ["craft"]);
  assert.deepEqual(birch.missing, {});
  const blank = plan("stick", 4);
  assert.ok(blank.steps.some((s) => s.type === "gather" && s.item === "oak_log"), "chêne par défaut");
  assert.ok(plan("stone_pickaxe").steps.some((s) => s.type === "gather" && s.item === "cobblestone"), "cobblestone plutôt que deepslate");
});

test("pas de détour absurde : lingots depuis un bloc de fer possédé, jamais de boucle bloc <-> lingot", () => {
  const p = plan("iron_ingot", 2, { iron_block: 1 });
  assert.deepEqual(p.steps.map((s) => s.type), ["craft"]);
  const none = plan("iron_ingot", 1);
  assert.ok(none.steps.some((s) => s.type === "smelt"));
  assert.ok(!none.steps.some((s) => s.type === "craft" && (s.item === "iron_block" || s.item === "iron_nugget")));
});

test("refus motivés : inconnu, hors périmètre, quantité, source manquante", () => {
  const r = (item: string, count = 1) => planNeeds(item, count, inv(), db) as { ok: false; reason: string; detail: string };
  assert.equal(r("banane").reason, "unknown_item");
  assert.equal(r("blaze_rod").reason, "out_of_scope");
  assert.equal(r("netherite_ingot").reason, "out_of_scope");
  assert.equal(r("cobblestone", 999).reason, "quantity_cap");
  assert.equal(r("diamond_sword", 65).reason, "quantity_cap");
  assert.equal(r("stick", 0).reason, "quantity_cap");
  assert.equal(r("leather").reason, "not_craftable");
  assert.match(formatPlan(r("banane") as never), /^Impossible : /);
});

test("déterminisme : mêmes entrées, même plan", () => {
  const a = JSON.stringify(plan("iron_pickaxe", 1, { oak_planks: 3 }));
  assert.equal(JSON.stringify(plan("iron_pickaxe", 1, { oak_planks: 3 })), a);
});

test("l'inventaire d'entrée n'est jamais modifié", () => {
  const have = inv({ oak_planks: 2 });
  planNeeds("stone_pickaxe", 1, have, db);
  assert.deepEqual([...have], [["oak_planks", 2]]);
});

test("borne dure : un registre pathologique est refusé sans bloquer", () => {
  // Chaque objet a 6 recettes, chacune demandant 3 objets du niveau suivant : l'arbre explose sans la borne.
  const huge: RecipeDb = {
    isItem: () => true,
    toolFor: () => null,
    recipesFor: (item) => {
      const d = Number(item.slice(1)) || 0;
      return Array.from({ length: 6 }, (_, i) => ({
        ingredients: { [`i${d + 1}`]: 1, [`j${d + 1}_${i}`]: 1, [`k${d + 1}_${i}`]: 1 },
        yields: 1,
        station: "hand" as const,
      }));
    },
  };
  const t0 = Date.now();
  const p = planNeeds("i0", 1, new Map(), huge);
  assert.equal(p.ok && "ok", false);
  assert.equal((p as { reason?: string }).reason, "too_complex");
  assert.ok(Date.now() - t0 < 5000, "doit s'arrêter vite");
});

test("planNeedsText : texte stable pour le modèle", () => {
  assert.match(planNeedsText("torch", 4, inv({ stick: 2, coal: 1, oak_planks: 3 }), db), /Plan : .*craft torch x4/);
});
