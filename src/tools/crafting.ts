/** Fabrication et obtention : craft_item, place_block, plan_needs, obtain_item (exécuteur borné). */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import pathfinderPkg from "mineflayer-pathfinder";
import { config } from "../config.js";
import { createRecipeDb, planNeedsText, type RecipeDb } from "../needs.js";
import { obtainItem, type Actions } from "../obtain.js";
import { goto, sleep, type V3 } from "../actions.js";
import { formatPos, inventoryDiff, inventorySummary, inventoryTotals, itemCount } from "../world.js";
import type { ToolEnv } from "./env.js";
import type { miningTools } from "./mining.js";

const { goals } = pathfinderPkg;


export function craftingTools(env: ToolEnv, mining: { collectBlock: ReturnType<typeof miningTools>["collectBlock"] }) {
  const { ctx, bot, journal, memory, placeAt, freeSpotNear } = env;
  const { collectBlock } = mining;

  const craftItem = tool(
    async ({ item, count }) => {
      const def = bot.registry.itemsByName[item];
      if (!def) return `Item inconnu: "${item}".`;
      const before = inventoryTotals(bot);
      let table = null;
      let recipes = bot.recipesFor(def.id, null, 1, null);
      if (!recipes.length) {
        const tableId = bot.registry.blocksByName.crafting_table.id;
        table = bot.findBlock({ matching: tableId, maxDistance: 32 });
        // Pas d'établi, mais la recette serait faisable avec : on en craft un (4 planches) et on le pose.
        if (!table && bot.recipesFor(def.id, null, 1, true as any).length > 0) {
          if (itemCount(bot, "crafting_table") === 0) {
            const tableRecipe = bot.recipesFor(bot.registry.itemsByName.crafting_table.id, null, 1, null)[0];
            if (tableRecipe) await bot.craft(tableRecipe, 1).catch(() => {});
          }
          const spot = itemCount(bot, "crafting_table") > 0 ? freeSpotNear() : null;
          if (spot && !(await placeAt("crafting_table", spot))) table = bot.blockAt(spot);
        }
        if (table) {
          await goto(bot, new goals.GoalGetToBlock(table.position.x, table.position.y, table.position.z), 15_000);
          recipes = bot.recipesFor(def.id, null, 1, table);
        }
      }
      const recipe = recipes[0];
      if (!recipe) {
        // Dit précisément ce qui manque (ex: torch => stick manquant : crafte-le d'abord).
        const missingFor = bot.recipesAll(def.id, null, true).map((r) => {
          const miss: string[] = [];
          for (const d of r.delta) {
            if (d.count >= 0) continue;
            const name = bot.registry.items[d.id]?.name ?? String(d.id);
            const lack = -d.count - itemCount(bot, name);
            if (lack > 0) miss.push(`${name} x${lack}`);
          }
          return miss;
        });
        if (!missingFor.length) return `Impossible de crafter ${item} : aucune recette connue.`;
        const best = missingFor.sort((a, b) => a.length - b.length)[0];
        return best.length
          ? `Impossible de crafter ${item} : il manque ${best.join(", ")} (crafte d'abord les ingrédients intermédiaires).`
          : `Impossible de crafter ${item} ici : il faut un établi à proximité (aucun trouvé dans 32 blocs).`;
      }
      const times = Math.ceil(count / recipe.result.count);
      try {
        await bot.craft(recipe, times, table ?? undefined);
      } catch (err) {
        await sleep(700); // le serveur peut être lent à confirmer : un seul nouvel essai
        try {
          await bot.craft(recipe, times, table ?? undefined);
        } catch (err2) {
          return `Échec du craft de ${item} : ${(err2 as Error).message ?? (err as Error).message}. Le serveur est peut-être surchargé.`;
        }
      }
      return `Crafté ${item}. Inventaire réel: ${inventoryDiff(before, inventoryTotals(bot))}.`;
    },
    {
      name: "craft_item",
      description: "Crafter un item (utilise un établi proche si la recette est 3x3).",
      schema: z.object({ item: z.string(), count: z.number().int().min(1).max(64) }),
    },
  );

  const placeBlockTool = tool(
    async ({ item, x, y, z: zc }) => {
      if (itemCount(bot, item) === 0) return `Impossible : je n'ai pas de ${item}. Inventaire: ${inventorySummary(bot)}`;
      let spot: V3 | null;
      if (x !== undefined && y !== undefined && zc !== undefined) {
        spot = bot.entity.position.floored().offset(Math.floor(x) - Math.floor(bot.entity.position.x), Math.floor(y) - Math.floor(bot.entity.position.y), Math.floor(zc) - Math.floor(bot.entity.position.z));
      } else {
        spot = freeSpotNear();
        if (!spot) return "Impossible : aucune case libre avec un sol plein à proximité. Déplace-toi sur un terrain dégagé.";
      }
      const error = await placeAt(item, spot);
      if (error) return `Échec : ${item} non posé en ${formatPos(spot)} (${error}).`;
      if (item === "bed" || item.endsWith("_bed")) memory.set("lit", "place", "lit que j'ai posé", spot);
      return `${item} posé en ${formatPos(spot)} (case réellement occupée par ${bot.blockAt(spot)?.name ?? "?"}).`;
    },
    {
      name: "place_block",
      description:
        "Poser un bloc ou objet de l'inventaire : établi (crafting_table), four, coffre, torche, bloc de construction... Sans coordonnées, il le pose sur une case libre devant toi. " +
        "Avec x,y,z : sur cette case vide, contre un bloc plein voisin. Les torches se posent aussi au mur.",
      schema: z.object({ item: z.string(), x: z.number().optional(), y: z.number().optional(), z: z.number().optional() }),
    },
  );

  let recipeDb: RecipeDb | undefined;

  const planNeedsTool = tool(
    async ({ item, count }) => {
      recipeDb ??= createRecipeDb(String(bot.version).replace(/^(\d+\.\d+(?:\.\d+)?).*/, "$1"));
      return planNeedsText(item, count ?? 1, inventoryTotals(bot), recipeDb);
    },
    {
      name: "plan_needs",
      description:
        "Lecture seule : calcule ce qu'il faut pour obtenir un objet (ex: stone_pickaxe), compte tenu de ton inventaire : ce que tu as, ce qui manque, et le plan ordonné " +
        "(récolter, fondre, fabriquer, poser un établi). À appeler AVANT de te lancer dans une fabrication, puis suis le plan avec collect_block et craft_item. N'agit pas sur le monde.",
      schema: z.object({ item: z.string().describe("Nom anglais de l'objet, ex: stone_pickaxe, torch, iron_ingot"), count: z.number().int().min(1).optional() }),
    },
  );

  /** Actions réelles de l'exécuteur `obtainItem` : elles réutilisent les tools existants (refus de blocs dangereux, établi auto, etc.). */
  const realActions: Actions = {
    inventory: () => inventoryTotals(bot),
    interrupted: () => ctx.run.interrupted,
    now: Date.now,
    async gather(step, wanted) {
      const notes: string[] = [];
      for (const block of step.blocks) {
        if (ctx.run.interrupted) break;
        const before = itemCount(bot, step.item);
        // Même plafond que la politique : max `maxCollect` blocs par appel ; l'exécuteur rappelle pour le reste.
        notes.push(String(await collectBlock.invoke({ block, count: Math.min(wanted, config.limits.maxCollect) })));
        if (itemCount(bot, step.item) > before) break; // cette source a donné : inutile d'essayer l'autre
      }
      return notes.join(" | ");
    },
    craft: async (item, wanted) => String(await craftItem.invoke({ item, count: Math.min(wanted, 64) })),
    smelt: async () => "Impossible : la fonte n'est pas encore implémentée (tranche suivante de la spec 001).",
    placeStation: async (station) => String(await placeBlockTool.invoke({ item: station })),
  };

  const obtainItemTool = tool(
    async ({ item, count }) => {
      recipeDb ??= createRecipeDb(String(bot.version).replace(/^(\d+\.\d+(?:\.\d+)?).*/, "$1"));
      const report = await obtainItem(item, count ?? 1, realActions, recipeDb);
      journal.append("obtain", `${item} x${count ?? 1} : ${report.status} (${report.actionsRun} actions)`);
      return report.message;
    },
    {
      name: "obtain_item",
      description:
        "Obtenir un objet de bout en bout (récolter, fabriquer, poser l'établi) en UN seul appel : le code déroule le plan de plan_needs, vérifie l'inventaire à chaque étape " +
        "et s'arrête de lui-même (budget d'actions, échecs, reprise de main du joueur). À préférer à l'enchaînement manuel de collect_block/craft_item pour fabriquer un outil, " +
        "une arme, un établi, des torches... Ne l'appelle qu'une fois par objectif ; s'il échoue, lis le message et explique-le au joueur.",
      schema: z.object({ item: z.string().describe("Nom anglais de l'objet, ex: stone_pickaxe"), count: z.number().int().min(1).optional() }),
    },
  );

  return { craftItem, placeBlockTool, planNeedsTool, obtainItemTool };
}
