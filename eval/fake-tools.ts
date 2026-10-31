import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { createTools } from "../src/tools.js";
import { createRecipeDb, planNeedsText } from "../src/needs.js";
import { obtainItem, type Actions } from "../src/obtain.js";
import { inventoryDiff } from "../src/world.js";
import type { Ctx } from "../src/world.js";
import { DROPS, FOODS, RECIPES, dist, fmt, type FakeWorld } from "./fake-world.js";

/**
 * Tools du faux monde. Mêmes NOMS et mêmes champs d'entrée que les vrais (vérifié par `test/eval-contract.test.ts`),
 * mêmes conventions : ils mesurent l'effet réel et les échecs commencent par un mot reconnu par `FAILURE`.
 * Les tools qui ne touchent que la mémoire (missions, remember, forget) sont les VRAIS : seul le monde est simulé.
 */

/** Faux bot : accepte n'importe quel accès, pour pouvoir instancier les vrais tools sans Minecraft. */
export function stubBot(): any {
  const handler: ProxyHandler<any> = { get: (_t, prop) => (prop === "then" ? undefined : new Proxy(() => {}, handler)), apply: () => undefined };
  return new Proxy(() => {}, handler);
}

const inv = (w: FakeWorld) => new Map(w.inventory);
const recipeDb = createRecipeDb("1.21.4");

export const REAL_MEMORY_TOOLS = ["remember", "forget", "start_mission", "mission_progress", "end_mission"];

export function createFakeTools(world: FakeWorld, ctx: Pick<Ctx, "journal" | "memory" | "run">): StructuredToolInterface[] {
  const real: StructuredToolInterface[] = createTools({ ...ctx, bot: stubBot() } as Ctx);
  const realByName = new Map<string, StructuredToolInterface>(real.map((t) => [t.name, t]));

  const say = tool(
    async ({ message }) => {
      world.said.push(message);
      ctx.run.saidThisRun = true;
      return "Message envoyé dans le chat.";
    },
    { name: "say", description: "Parler dans le chat.", schema: z.object({ message: z.string() }) },
  );

  const getStatus = tool(async () => world.snapshot(), { name: "get_status", description: "État actuel.", schema: z.object({}) });

  const lookAround = tool(
    async ({ radius }) => {
      const r = radius ?? 16;
      const counts = new Map<string, number>();
      for (const b of world.blocks) if (dist(b.pos, world.pos) <= r) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
      const seen = [...counts].map(([n, c]) => `${n} x${c}`).join(", ") || "rien d'utile";
      return `Autour (${r} blocs) : ${seen}. ${world.snapshot()}`;
    },
    { name: "look_around", description: "Regarder autour.", schema: z.object({ radius: z.number().int().min(4).max(32).optional() }) },
  );

  const findBlock = tool(
    async ({ block, maxDistance }) => {
      const b = world.nearest(block, maxDistance ?? 32);
      return b ? `Trouvé ${block} en ${fmt(b.pos)} (à ${Math.round(dist(b.pos, world.pos))} blocs).` : `Aucun ${block} dans un rayon de ${maxDistance ?? 32} blocs.`;
    },
    { name: "find_block", description: "Trouver le bloc le plus proche.", schema: z.object({ block: z.string(), maxDistance: z.number().int().min(4).max(64).optional() }) },
  );

  // Le planificateur est pur : le faux monde utilise le VRAI, seul l'inventaire est simulé.
  const planNeeds = tool(async ({ item, count }) => planNeedsText(item, count ?? 1, new Map(world.inventory), recipeDb), {
    name: "plan_needs",
    description: "Calculer ce qu'il faut pour obtenir un objet.",
    schema: z.object({ item: z.string(), count: z.number().int().min(1).optional() }),
  });

  const goTo = tool(
    async ({ x, y, z }) => {
      const target = { x, y, z };
      if (dist(target, world.pos) > 200) return `Pas arrivé : trop loin (${Math.round(dist(target, world.pos))} blocs).`;
      world.pos = target;
      return `Arrivé en ${fmt(world.pos)}.`;
    },
    { name: "go_to", description: "Marcher jusqu'à des coordonnées.", schema: z.object({ x: z.number(), y: z.number(), z: z.number() }) },
  );

  const collectBlock = tool(
    async ({ block, count }) => {
      const spec = DROPS[block];
      if (!spec) return `Impossible : je ne sais pas récolter "${block}".`;
      if (spec.needs && !world.hasAny(spec.needs)) return `Impossible : ${block} demande un outil (${spec.needs[0]} ou mieux), je n'en ai pas.`;
      if (!world.nearest(block, 64)) return `Aucun ${block} à proximité (64 blocs).`;
      const before = inv(world);
      for (let i = 0; i < count; i++) {
        const b = world.nearest(block, 64);
        if (!b) break;
        world.pos = { ...b.pos };
        world.blocks.splice(world.blocks.indexOf(b), 1);
        world.add(spec.item, 1);
      }
      const diff = inventoryDiff(before, world.inventory);
      return `Inventaire réel: ${diff} (demandé ${count}).`;
    },
    { name: "collect_block", description: "Récolter des blocs.", schema: z.object({ block: z.string(), count: z.number().int().min(1) }) },
  );

  const craftItem = tool(
    async ({ item, count }) => {
      const r = RECIPES[item];
      if (!r) return `Impossible : pas de recette pour "${item}".`;
      const times = Math.ceil(count / r.yields);
      // Comme le vrai craft_item : s'il faut un établi et qu'il n'y en a pas, il en pose un (4 planches en plus).
      const tableCost = r.table && !world.tablePlaced && world.count("crafting_table") === 0 ? 4 : 0;
      const total = new Map<string, number>(Object.entries(r.needs).map(([k, v]) => [k, v * times]));
      if (tableCost) total.set("oak_planks", (total.get("oak_planks") ?? 0) + tableCost);
      const missing = [...total].filter(([k, v]) => world.count(k) < v).map(([k, v]) => `${v - world.count(k)} ${k}`);
      if (missing.length) return `Matériaux manquants : ${missing.join(", ")}.`;
      const before = inv(world);
      if (tableCost) world.tablePlaced = true;
      for (const [k, v] of total) world.add(k, -v);
      world.add(r.out, times * r.yields);
      return `Fabriqué. Inventaire réel: ${inventoryDiff(before, world.inventory)}.`;
    },
    { name: "craft_item", description: "Fabriquer un objet.", schema: z.object({ item: z.string(), count: z.number().int().min(1).max(64) }) },
  );

  const eat = tool(
    async () => {
      const food = [...world.inventory.keys()].filter((k) => FOODS[k]).sort((a, b) => FOODS[b] - FOODS[a])[0];
      if (world.food >= 20) return "Je n'ai pas faim (20/20).";
      if (!food) return "Je n'ai aucune nourriture mangeable.";
      const before = world.food;
      world.add(food, -1);
      world.food = Math.min(20, world.food + FOODS[food]);
      return `J'ai mangé ${food} : faim ${before} -> ${world.food}.`;
    },
    { name: "eat", description: "Manger.", schema: z.object({}) },
  );

  const pickupItems = tool(
    async ({ radius }) => {
      const r = radius ?? 16;
      const before = inv(world);
      let seen = 0;
      for (const d of [...world.drops]) {
        if (dist(d.pos, world.pos) > r) continue;
        seen++;
        world.add(d.name, d.count);
        world.drops.splice(world.drops.indexOf(d), 1);
      }
      if (!seen) return `Aucun objet au sol dans un rayon de ${r} blocs.`;
      const diff = inventoryDiff(before, world.inventory);
      if (/^\+/.test(diff)) ctx.memory.resolveDeath(world.pos);
      return `${seen} objet(s) visité(s). Inventaire réel: ${diff}.`;
    },
    { name: "pickup_items", description: "Ramasser les objets au sol.", schema: z.object({ radius: z.number().int().min(2).max(32).optional() }) },
  );

  const sleepInBed = tool(
    async () => {
      if (!world.bed) return "Aucun lit à proximité.";
      if (!world.isNight()) return "Impossible : on ne peut dormir que la nuit.";
      world.pos = { ...world.bed };
      world.time = 0;
      return "Réveillé : le jour se lève.";
    },
    { name: "sleep_in_bed", description: "Dormir.", schema: z.object({}) },
  );

  const flee = tool(
    async () => {
      if (!world.hostiles.length) return "Rien à fuir.";
      const names = world.hostiles.map((h) => h.name).join(", ");
      world.hostiles = [];
      return `Je me suis éloigné de ${names}.`;
    },
    { name: "flee", description: "Fuir les monstres.", schema: z.object({}) },
  );

  // L'exécuteur est le VRAI (src/obtain.ts) ; seules les actions sont simulées, en réutilisant les faux tools ci-dessus.
  const actions: Actions = {
    inventory: () => inv(world),
    interrupted: () => ctx.run.interrupted,
    now: Date.now,
    async gather(step, wanted) {
      const notes: string[] = [];
      for (const block of step.blocks) {
        const before = world.count(step.item);
        notes.push(String(await collectBlock.invoke({ block, count: Math.min(wanted, 32) })));
        if (world.count(step.item) > before) break;
      }
      return notes.join(" | ");
    },
    craft: async (item, wanted) => String(await craftItem.invoke({ item, count: Math.min(wanted, 64) })),
    smelt: async () => "Impossible : la fonte n'est pas simulée.",
    async placeStation(station) {
      if (world.count(station) < 1) return `Impossible : pas de ${station} en inventaire.`;
      world.add(station, -1);
      if (station === "crafting_table") world.tablePlaced = true;
      return `${station} posé.`;
    },
  };
  const obtainItemFake = tool(async ({ item, count }) => (await obtainItem(item, count ?? 1, actions, recipeDb)).message, {
    name: "obtain_item",
    description: "Obtenir un objet de bout en bout.",
    schema: z.object({ item: z.string(), count: z.number().int().min(1).optional() }),
  });

  const fakes = [say, getStatus, lookAround, findBlock, planNeeds, obtainItemFake, goTo, collectBlock, craftItem, eat, pickupItems, sleepInBed, flee];
  const reals = REAL_MEMORY_TOOLS.map((n) => realByName.get(n)!).filter(Boolean);
  return [...fakes, ...reals];
}
