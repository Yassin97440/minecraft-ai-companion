/** Coffres et dons : lister, déposer, prendre, donner au joueur. */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { goto } from "../actions.js";
import { findPlayer, formatPos, inventoryDiff, inventoryTotals, itemCount } from "../world.js";
import type { ToolEnv } from "./env.js";

const { goals } = pathfinderPkg;


export function chestsTools(env: ToolEnv) {
  const { bot, memory } = env;

  const CONTAINERS = ["chest", "trapped_chest", "barrel"];

  const chestArgs = z.object({
    x: z.number().optional().describe("Coordonnées d'un coffre précis ; sinon le plus proche"),
    y: z.number().optional(),
    z: z.number().optional(),
  });

  /** Va au coffre demandé (ou au plus proche), l'ouvre, exécute `fn`, puis le referme. */
  async function withChest<T>(
    args: { x?: number; y?: number; z?: number },
    fn: (chest: Awaited<ReturnType<Bot["openContainer"]>>, where: string, at: { x: number; y: number; z: number }) => Promise<T>,
  ): Promise<T | string> {
    const ids = CONTAINERS.map((n) => bot.registry.blocksByName[n]?.id).filter((i): i is number => i !== undefined);
    const here = bot.entity.position;
    let pos;
    if (args.x !== undefined && args.y !== undefined && args.z !== undefined) {
      pos = bot.blockAt(bot.entity.position.floored().offset(Math.floor(args.x) - Math.floor(here.x), Math.floor(args.y) - Math.floor(here.y), Math.floor(args.z) - Math.floor(here.z)));
      if (!pos || !CONTAINERS.includes(pos.name)) return `Il n'y a pas de coffre en ${args.x}, ${args.y}, ${args.z}.`;
    } else {
      const found = bot.findBlocks({ matching: ids, maxDistance: 32, count: 8 }).sort((a, b) => a.distanceTo(here) - b.distanceTo(here));
      pos = found.length ? bot.blockAt(found[0]) : null;
      if (!pos) return "Aucun coffre dans un rayon de 32 blocs.";
    }
    const where = formatPos(pos.position);
    try {
      await goto(bot, new goals.GoalGetToBlock(pos.position.x, pos.position.y, pos.position.z), 20_000);
    } catch (err) {
      return `Impossible d'atteindre le coffre en ${where} (${(err as Error).message}).`;
    }
    let chest;
    try {
      chest = await bot.openContainer(pos);
    } catch (err) {
      return `Impossible d'ouvrir le coffre en ${where} (${(err as Error).message}).`;
    }
    try {
      memory.set(`coffre ${where}`, "place", "coffre", pos.position);
      return await fn(chest, where, pos.position);
    } finally {
      chest.close();
    }
  }

  const summarize = (items: { name: string; count: number }[]) => {
    const totals = new Map<string, number>();
    for (const i of items) totals.set(i.name, (totals.get(i.name) ?? 0) + i.count);
    return totals.size ? [...totals].map(([n, c]) => `${n} x${c}`).join(", ") : "(vide)";
  };

  const chestContents = tool(
    async (args) =>
      withChest(args, async (chest, where, at) => {
        memory.set(`coffre ${where}`, "place", `coffre contenant : ${summarize(chest.containerItems())}`, at);
        return `Coffre en ${where} : ${summarize(chest.containerItems())}`;
      }),
    {
      name: "chest_contents",
      description: "Aller au coffre (le plus proche, ou à des coordonnées) et lister son contenu.",
      schema: chestArgs,
    },
  );

  const storeInChest = tool(
    async ({ item, count, ...where }) =>
      withChest(where, async (chest, at) => {
        const before = inventoryTotals(bot);
        const keep = /(_pickaxe|_axe|_shovel|_hoe|_sword|_helmet|_chestplate|_leggings|_boots|^shield$|^bow$|^torch$)/;
        const stacks =
          item === "*"
            ? bot.inventory.items().filter((i) => !keep.test(i.name) && !bot.registry.foods[i.type])
            : bot.inventory.items().filter((i) => i.name === item);
        if (!stacks.length) return `Rien à déposer : je n'ai pas ${item === "*" ? "de ressources" : `de ${item}`}.`;
        let left = item === "*" || count === undefined ? Infinity : count;
        for (const s of stacks) {
          if (left <= 0) break;
          const n = Math.min(s.count, left);
          try {
            await chest.deposit(s.type, null, n);
            left -= n;
          } catch (err) {
            if (left === (item === "*" || count === undefined ? Infinity : count)) return `Échec du dépôt (${(err as Error).message}). Coffre plein ?`;
            break;
          }
        }
        return `Déposé dans le coffre en ${at}. Inventaire réel: ${inventoryDiff(before, inventoryTotals(bot))}.`;
      }),
    {
      name: "store_in_chest",
      description:
        "Déposer des items dans un coffre. item = nom exact, ou \"*\" pour toutes les ressources (garde outils, armures, nourriture, torches). count optionnel.",
      schema: chestArgs.extend({ item: z.string(), count: z.number().int().min(1).optional() }),
    },
  );

  const takeFromChest = tool(
    async ({ item, count, ...where }) =>
      withChest(where, async (chest, at) => {
        const before = inventoryTotals(bot);
        const stacks = chest.containerItems().filter((i) => i.name === item);
        if (!stacks.length) return `Pas de ${item} dans le coffre en ${at} (contenu : ${summarize(chest.containerItems())}).`;
        let left = count;
        for (const s of stacks) {
          if (left <= 0) break;
          const n = Math.min(s.count, left);
          try {
            await chest.withdraw(s.type, null, n);
            left -= n;
          } catch (err) {
            return `Échec du retrait (${(err as Error).message}). Inventaire plein ?`;
          }
        }
        return `Pris dans le coffre en ${at}. Inventaire réel: ${inventoryDiff(before, inventoryTotals(bot))}.`;
      }),
    {
      name: "take_from_chest",
      description: "Prendre des items dans un coffre (64 max par appel). Ne vide pas les coffres du joueur sans qu'il le demande.",
      schema: chestArgs.extend({ item: z.string(), count: z.number().int().min(1).max(64) }),
    },
  );

  const giveToPlayer = tool(
    async ({ player, item, count }) => {
      const target = findPlayer(bot, player)?.entity;
      if (!target) return `Je ne vois pas ${player}.`;
      const stack = bot.inventory.items().find((i) => i.name === item);
      if (!stack) return `Je n'ai pas de ${item}.`;
      const before = itemCount(bot, item);
      await goto(bot, new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), 15_000);
      await bot.lookAt(target.position.offset(0, target.height, 0));
      await bot.toss(stack.type, null, Math.min(count, before));
      const given = before - itemCount(bot, item);
      return given > 0 ? `Donné ${given} ${item} à ${player} (jeté à ses pieds).` : `Échec : rien n'a quitté mon inventaire.`;
    },
    {
      name: "give_to_player",
      description: "Donner des items de son inventaire à un joueur.",
      schema: z.object({ player: z.string(), item: z.string(), count: z.number().int().min(1) }),
    },
  );

  return { chestContents, storeInChest, takeFromChest, giveToPlayer };
}
