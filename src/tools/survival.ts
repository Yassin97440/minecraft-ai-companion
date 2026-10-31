/** Survie : équipement, manger, dormir, sortir d'un trou, ramasser, combat, fuite, abri. */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import pathfinderPkg from "mineflayer-pathfinder";
import { eatBest, fight, flee, gearUp, shelter } from "../survival.js";
import { goto, sleep } from "../actions.js";
import { formatPos, holeDepth, hostiles, inventoryDiff, inventorySummary, inventoryTotals, surfaceY } from "../world.js";
import type { ToolEnv } from "./env.js";

const { goals } = pathfinderPkg;

const ARMOR_SLOTS: [string, "head" | "torso" | "legs" | "feet"][] = [
  ["_helmet", "head"],
  ["_chestplate", "torso"],
  ["_leggings", "legs"],
  ["_boots", "feet"],
];
export function survivalTools(env: ToolEnv) {
  const { ctx, bot, memory } = env;

  const equipItem = tool(
    async ({ item }) => {
      const stack = bot.inventory.items().find((i) => i.name === item) ?? bot.inventory.items().find((i) => i.name.includes(item));
      if (!stack) return `Je n'ai pas de "${item}". Inventaire: ${inventorySummary(bot)}`;
      const armor = ARMOR_SLOTS.find(([suffix]) => stack.name.endsWith(suffix));
      const dest = armor ? armor[1] : stack.name === "shield" ? "off-hand" : "hand";
      await bot.equip(stack, dest);
      const worn = bot.inventory.slots[bot.getEquipmentDestSlot(dest)]?.name === stack.name;
      return worn ? `${stack.name} équipé (${dest}).` : `Échec : ${stack.name} n'est pas équipé (main: ${bot.heldItem?.name ?? "vide"}).`;
    },
    {
      name: "equip_item",
      description: "Mettre un item en main (hache, pioche, épée...) ou une armure sur soi. Nom exact ou partiel.",
      schema: z.object({ item: z.string() }),
    },
  );

  const eat = tool(async () => eatBest(bot), {
    name: "eat",
    description: "Manger la meilleure nourriture de l'inventaire.",
    schema: z.object({}),
  });

  const sleepInBed = tool(
    async () => {
      const t = bot.time.timeOfDay;
      const canSleep = (t >= 12542 && t < 23459) || bot.thunderState > 0;
      if (!canSleep) return `Impossible de dormir maintenant (il fait jour, heure ${t}). On peut dormir à partir de 12542 ou pendant un orage.`;
      const here = bot.entity.position;
      const beds = bot
        .findBlocks({ matching: (b) => bot.isABed(b), maxDistance: 48, count: 6 })
        .sort((a, b) => a.distanceTo(here) - b.distanceTo(here));
      if (!beds.length) return "Aucun lit dans un rayon de 48 blocs. Demande au joueur d'en poser un ou de m'indiquer où il est.";

      let lastError = "";
      for (const pos of beds) {
        const bed = bot.blockAt(pos);
        if (!bed) continue;
        try {
          await goto(bot, new goals.GoalGetToBlock(pos.x, pos.y, pos.z), 25_000);
          await bot.sleep(bed);
        } catch (err) {
          lastError = (err as Error).message;
          continue;
        }
        if (bot.isSleeping) {
          memory.set("lit", "place", "lit où je dors", pos);
          return `Je dors dans le lit en ${formatPos(pos)}. Je me réveillerai au matin (la nuit ne passe que si tous les joueurs dorment).`;
        }
      }
      return `Je n'ai pas réussi à dormir (${lastError || "aucun lit accessible"}). Monstres proches ? Lit occupé ou bloqué ?`;
    },
    {
      name: "sleep_in_bed",
      description: "Aller dans le lit le plus proche et dormir. Seulement la nuit ou pendant un orage.",
      schema: z.object({}),
    },
  );

  const digOut = tool(
    async () => {
      const depth0 = holeDepth(bot);
      if (depth0 < 2) return `Je ne suis pas dans un trou (profondeur ${depth0}).`;
      const target = surfaceY(bot);
      const start = formatPos(bot.entity.position);
      try {
        await goto(bot, new goals.GoalY(target), 40_000);
      } catch (err) {
        return `Impossible de sortir pour l'instant (${(err as Error).message}). Depuis ${start}, profondeur restante: ${holeDepth(bot)} blocs. Essaie de creuser ou de poser des blocs.`;
      }
      const depth1 = holeDepth(bot);
      return depth1 < 2 ? `Sorti du trou : je suis en ${formatPos(bot.entity.position)}.` : `Pas encore sorti : profondeur restante ${depth1} blocs (position ${formatPos(bot.entity.position)}).`;
    },
    {
      name: "dig_out",
      description: "Sortir d'un trou ou d'une mine en remontant vers la surface (creuse si nécessaire).",
      schema: z.object({}),
    },
  );

  const pickupItems = tool(
    async ({ radius }) => {
      const r = Math.min(radius ?? 16, 32);
      const before = inventoryTotals(bot);
      const tried = new Set<number>();
      const deadline = Date.now() + 45_000;
      let seen = 0;
      while (Date.now() < deadline && !ctx.run.interrupted) {
        const drop = Object.values(bot.entities)
          .filter((e) => e.name === "item" && !tried.has(e.id) && e.position.distanceTo(bot.entity.position) <= r)
          .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
        if (!drop) break;
        tried.add(drop.id);
        seen++;
        await goto(bot, new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 1), 8_000).catch(() => {});
        await sleep(300);
      }
      const diff = inventoryDiff(before, inventoryTotals(bot));
      if (!seen) return `Aucun objet au sol dans un rayon de ${r} blocs.`;
      // Affaires de la mort récupérées : on oublie le lieu (sinon le bot y retournerait au prochain redémarrage).
      if (/^\+/.test(diff)) memory.resolveDeath(bot.entity.position);
      return `${seen} objet(s) visité(s). Inventaire réel: ${diff}.`;
    },
    {
      name: "pickup_items",
      description:
        "Ramasser les objets tombés au sol autour de toi (jusqu'à 32 blocs) : après une mort (va d'abord à l'endroit où tu es mort, ils disparaissent au bout de 5 min), après avoir cassé un bloc, ou des items jetés.",
      schema: z.object({ radius: z.number().int().min(2).max(32).optional() }),
    },
  );

  const fightTool = tool(async () => fight(bot), {
    name: "fight",
    description:
      "Combattre les monstres hostiles proches (épée ou hache, armure équipée automatiquement). Se retire si la vie tombe trop bas. " +
      "À éviter sans arme ni armure : préfère flee ou take_shelter. Ne s'attaque jamais aux joueurs ni aux animaux.",
    schema: z.object({}),
  });

  const fleeTool = tool(async () => flee(bot), {
    name: "flee",
    description: "Fuir les monstres proches (creeper, groupe, vie basse). Court à l'opposé pendant quelques secondes.",
    schema: z.object({}),
  });

  const takeShelter = tool(async () => shelter(bot), {
    name: "take_shelter",
    description:
      "S'enfermer dans un abri de 13 blocs pleins (cobblestone, terre, planches...) autour de soi pour échapper aux monstres ou passer la nuit. Pour en sortir : casser un bloc de l'abri.",
    schema: z.object({}),
  });

  const gearUpTool = tool(async () => gearUp(bot), {
    name: "gear_up",
    description: "Équiper la meilleure armure, un bouclier et la meilleure arme de l'inventaire. À faire après avoir récupéré ou crafté de l'équipement.",
    schema: z.object({}),
  });

  return { equipItem, eat, sleepInBed, digOut, pickupItems, fightTool, fleeTool, takeShelter, gearUpTool };
}
