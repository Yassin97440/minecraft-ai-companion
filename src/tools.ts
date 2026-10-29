import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { BLUEPRINTS, missingMaterials } from "./blueprints.js";
import { inHome } from "./policy.js";
import { inventorySummary, itemCount, snapshot, type Ctx } from "./world.js";

const { goals } = pathfinderPkg;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function goto(bot: Bot, goal: any, timeoutMs = 30_000) {
  const timer = setTimeout(() => bot.pathfinder.stop(), timeoutMs);
  try {
    await bot.pathfinder.goto(goal);
  } finally {
    clearTimeout(timer);
  }
}

const TIERS = ["netherite", "diamond", "iron", "stone", "golden", "wooden"];

async function equipBestTool(bot: Bot, block: { material?: string | null }) {
  const mat = block.material ?? "";
  const kind = mat.includes("pickaxe") ? "pickaxe" : mat.includes("shovel") ? "shovel" : mat.includes("hoe") ? "hoe" : mat.includes("axe") ? "axe" : null;
  if (!kind) return;
  const candidates = bot.inventory.items().filter((i) => i.name.endsWith(`_${kind}`));
  candidates.sort((a, b) => TIERS.findIndex((t) => a.name.startsWith(t)) - TIERS.findIndex((t) => b.name.startsWith(t)));
  if (candidates[0]) await bot.equip(candidates[0], "hand");
}

export function createTools(ctx: Ctx) {
  const { bot, journal } = ctx;

  const say = tool(
    async ({ message }) => {
      bot.chat(message.slice(0, 240));
      ctx.run.saidThisRun = true;
      return "Message envoyé dans le chat.";
    },
    {
      name: "say",
      description: "Parler dans le chat Minecraft. C'est ta SEULE façon de t'adresser au joueur. Messages courts.",
      schema: z.object({ message: z.string().describe("Texte du chat, 200 caractères max") }),
    },
  );

  const getStatus = tool(async () => snapshot(bot), {
    name: "get_status",
    description: "État actuel : position, vie, faim, heure, joueurs, créatures proches, inventaire.",
    schema: z.object({}),
  });

  const goToPlayer = tool(
    async ({ player }) => {
      const target = bot.players[player]?.entity;
      if (!target) return `Je ne vois pas ${player} (trop loin ou hors ligne).`;
      await goto(bot, new goals.GoalFollow(target, 2));
      return `Arrivé près de ${player}.`;
    },
    {
      name: "go_to_player",
      description: "Se rendre près d'un joueur visible.",
      schema: z.object({ player: z.string() }),
    },
  );

  const goTo = tool(
    async ({ x, y, z }) => {
      await goto(bot, new goals.GoalNear(x, y, z, 1));
      return `Arrivé en ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)}.`;
    },
    {
      name: "go_to",
      description: "Marcher jusqu'à des coordonnées (timeout 30 s).",
      schema: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    },
  );

  const wander = tool(
    async ({ radius }) => {
      const p = bot.entity.position;
      const r = Math.min(radius ?? 8, 15);
      const x = p.x + (Math.random() * 2 - 1) * r;
      const z = p.z + (Math.random() * 2 - 1) * r;
      await goto(bot, new goals.GoalNearXZ(x, z, 1), 15_000);
      return "Petite balade terminée.";
    },
    {
      name: "wander",
      description: "Se balader au hasard autour de soi (15 blocs max).",
      schema: z.object({ radius: z.number().optional() }),
    },
  );

  const emote = tool(
    async ({ action }) => {
      switch (action) {
        case "jump":
          bot.setControlState("jump", true);
          await sleep(300);
          bot.setControlState("jump", false);
          break;
        case "wave":
          for (let i = 0; i < 4; i++) {
            bot.swingArm("right");
            await sleep(250);
          }
          break;
        case "spin":
          for (let i = 0; i < 8; i++) {
            await bot.look(bot.entity.yaw + Math.PI / 4, 0, true);
            await sleep(120);
          }
          break;
        case "sneak_dance":
          for (let i = 0; i < 6; i++) {
            bot.setControlState("sneak", i % 2 === 0);
            await sleep(180);
          }
          bot.setControlState("sneak", false);
          break;
      }
      return `Emote "${action}" jouée.`;
    },
    {
      name: "emote",
      description: "Faire une petite animation : jump, wave, spin, sneak_dance.",
      schema: z.object({ action: z.enum(["jump", "wave", "spin", "sneak_dance"]) }),
    },
  );

  const collectBlock = tool(
    async ({ block, count }) => {
      const def = bot.registry.blocksByName[block];
      if (!def) return `Bloc inconnu: "${block}" (utilise le nom Minecraft, ex: oak_log).`;
      let collected = 0;
      let last: { x: number; y: number; z: number } | null = null;

      for (let i = 0; i < count; i++) {
        const candidates = bot
          .findBlocks({ matching: def.id, maxDistance: 48, count: 24 })
          .filter((p) => !inHome(p))
          .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
        const pos = candidates[0];
        if (!pos) break;

        try {
          await goto(bot, new goals.GoalGetToBlock(pos.x, pos.y, pos.z), 20_000);
        } catch {
          continue;
        }
        const target = bot.blockAt(pos);
        if (!target || target.type !== def.id) continue;
        await equipBestTool(bot, target);
        if (target.harvestTools && !(bot.heldItem && target.harvestTools[bot.heldItem.type])) {
          return `Je ne peux pas récolter ${block} sans le bon outil (récolté: ${collected}).`;
        }
        await bot.dig(target);
        collected++;
        last = pos;
      }

      if (last) await goto(bot, new goals.GoalNear(last.x, last.y, last.z, 1), 8_000).catch(() => {});
      return collected
        ? `Récolté ${collected}/${count} ${block}. Inventaire: ${inventorySummary(bot)}`
        : `Aucun ${block} accessible dans un rayon de 48 blocs.`;
    },
    {
      name: "collect_block",
      description: "Aller miner/couper des blocs d'un type donné (ex: oak_log, stone, sand) et ramasser les drops.",
      schema: z.object({ block: z.string(), count: z.number().int().min(1) }),
    },
  );

  const craftItem = tool(
    async ({ item, count }) => {
      const def = bot.registry.itemsByName[item];
      if (!def) return `Item inconnu: "${item}".`;
      let table = null;
      let recipes = bot.recipesFor(def.id, null, 1, null);
      if (!recipes.length) {
        const tableId = bot.registry.blocksByName.crafting_table.id;
        table = bot.findBlock({ matching: tableId, maxDistance: 32 });
        if (table) {
          await goto(bot, new goals.GoalGetToBlock(table.position.x, table.position.y, table.position.z), 15_000);
          recipes = bot.recipesFor(def.id, null, 1, table);
        }
      }
      const recipe = recipes[0];
      if (!recipe) return `Impossible de crafter ${item} : ingrédients manquants ou pas d'établi à proximité.`;
      const times = Math.ceil(count / recipe.result.count);
      await bot.craft(recipe, times, table ?? undefined);
      return `Crafté ${times * recipe.result.count} ${item}. Inventaire: ${inventorySummary(bot)}`;
    },
    {
      name: "craft_item",
      description: "Crafter un item (utilise un établi proche si la recette est 3x3).",
      schema: z.object({ item: z.string(), count: z.number().int().min(1).max(64) }),
    },
  );

  const giveToPlayer = tool(
    async ({ player, item, count }) => {
      const target = bot.players[player]?.entity;
      if (!target) return `Je ne vois pas ${player}.`;
      const stack = bot.inventory.items().find((i) => i.name === item);
      if (!stack) return `Je n'ai pas de ${item}.`;
      await goto(bot, new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), 15_000);
      await bot.lookAt(target.position.offset(0, target.height, 0));
      await bot.toss(stack.type, null, Math.min(count, itemCount(bot, item)));
      return `Donné ${item} à ${player}.`;
    },
    {
      name: "give_to_player",
      description: "Donner des items de son inventaire à un joueur.",
      schema: z.object({ player: z.string(), item: z.string(), count: z.number().int().min(1) }),
    },
  );

  const listBlueprints = tool(
    async () =>
      Object.values(BLUEPRINTS)
        .map(
          (b) =>
            `${b.name}: ${b.description} | emprise ${b.footprint.x}x${b.footprint.z} (à droite et devant toi) | matériaux: ` +
            Object.entries(b.materials)
              .map(([k, v]) => `${k} x${v}`)
              .join(", "),
        )
        .join("\n"),
    {
      name: "list_blueprints",
      description: "Lister les constructions disponibles et leurs matériaux.",
      schema: z.object({}),
    },
  );

  const runBlueprint = tool(
    async ({ name }) => {
      const bp = BLUEPRINTS[name];
      if (!bp) return `Blueprint inconnu: "${name}". Disponibles: ${Object.keys(BLUEPRINTS).join(", ")}.`;

      const missing = missingMaterials(bp, (i) => itemCount(bot, i));
      if (Object.keys(missing).length) {
        return `Matériaux manquants: ${Object.entries(missing).map(([k, v]) => `${k} x${v}`).join(", ")}. Récolte/crafte d'abord.`;
      }

      const before = Object.keys(bp.materials).map((i) => itemCount(bot, i));
      bot.chat(`/function ${bp.fn}`);
      await sleep(1500);
      const after = Object.keys(bp.materials).map((i) => itemCount(bot, i));
      const consumed = before.some((b, i) => after[i] < b);
      if (!consumed) {
        return "Rien ne s'est passé. Le datapack est-il installé et le bot est-il op (niveau 2+) ?";
      }
      journal.append("build", `a construit ${name} vers ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.z)}`);
      return `Construction "${name}" terminée. Matériaux consommés.`;
    },
    {
      name: "run_blueprint",
      description:
        "Construire un blueprint à l'endroit où tu te trouves. Consomme les matériaux de ton inventaire. Demande l'accord du joueur.",
      schema: z.object({ name: z.string() }),
    },
  );

  const remember = tool(
    async ({ note }) => {
      journal.append("note", note);
      return "Noté dans mon journal.";
    },
    {
      name: "remember",
      description: "Écrire une note dans ton journal (préférences du joueur, endroits utiles, running gags).",
      schema: z.object({ note: z.string() }),
    },
  );

  return [
    say,
    getStatus,
    goToPlayer,
    goTo,
    wander,
    emote,
    collectBlock,
    craftItem,
    giveToPlayer,
    listBlueprints,
    runBlueprint,
    remember,
  ];
}
