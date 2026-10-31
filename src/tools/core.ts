/** Perception et déplacement : parler, regarder, chercher, marcher, se balader, emotes. */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { goto, sleep } from "../actions.js";
import { findPlayer, formatPos, lookAround, snapshot } from "../world.js";
import type { ToolEnv } from "./env.js";

const { goals } = pathfinderPkg;

/** Noms de blocs correspondant à une requête (exacte, sinon "contient"), ex: "bed" -> tous les lits. */
function resolveBlocks(bot: Bot, query: string) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "_");
  const exact = bot.registry.blocksByName[q];
  if (exact) return [exact];
  return bot.registry.blocksArray.filter((b) => b.name.includes(q)).slice(0, 60);
}
export function coreTools(env: ToolEnv) {
  const { ctx, bot, dist } = env;

  const say = tool(
    async ({ message }) => {
      bot.chat(message.slice(0, 240));
      ctx.run.saidThisRun = true;
      return "Message envoyé dans le chat.";
    },
    {
      name: "say",
      description: "Parler dans le chat Minecraft. C'est ta SEULE façon de t'adresser au joueur. Messages courts. Ne remplace jamais une action.",
      schema: z.object({ message: z.string().describe("Texte du chat, 200 caractères max") }),
    },
  );

  const getStatus = tool(
    async () => {
      await sleep(600); // un objet qui vient d'être ramassé met un instant à apparaître dans l'inventaire
      return snapshot(bot);
    },
    {
      name: "get_status",
      description: "État actuel : position, vie, faim, heure, main, relief, menaces, joueurs, inventaire.",
      schema: z.object({}),
    },
  );

  const lookAroundTool = tool(async ({ radius }) => lookAround(bot, Math.min(radius ?? 16, 32)), {
    name: "look_around",
    description:
      "Regarder autour de toi : lits, coffres, établis, minerais, arbres, lave/eau, menaces, animaux, joueurs, relief (trou ?). À appeler avant d'agir si tu n'es pas sûr de l'environnement.",
    schema: z.object({ radius: z.number().int().min(4).max(32).optional() }),
  });

  const findBlock = tool(
    async ({ block, maxDistance }) => {
      const defs = resolveBlocks(bot, block);
      if (!defs.length) return `Aucun bloc ne correspond à "${block}".`;
      const here = bot.entity.position;
      const found = bot
        .findBlocks({ matching: defs.map((d) => d.id), maxDistance: Math.min(maxDistance ?? 48, 64), count: 6 })
        .sort((a, b) => a.distanceTo(here) - b.distanceTo(here));
      if (!found.length) return `Aucun "${block}" dans un rayon de ${Math.min(maxDistance ?? 48, 64)} blocs (zone chargée seulement).`;
      return found
        .map((p) => `${bot.blockAt(p)?.name ?? block} en ${formatPos(p)} (à ${Math.round(p.distanceTo(here))} blocs)`)
        .join("\n");
    },
    {
      name: "find_block",
      description: "Chercher les blocs les plus proches d'un type (nom exact ou partiel : coal_ore, bed, log, chest...). Renvoie leurs coordonnées ; utilise ensuite go_to.",
      schema: z.object({ block: z.string(), maxDistance: z.number().int().min(4).max(64).optional() }),
    },
  );

  const goToPlayer = tool(
    async ({ player }) => {
      const target = findPlayer(bot, player)?.entity;
      if (!target) return `Je ne vois pas ${player} (trop loin ou hors ligne). Demande-lui ses coordonnées.`;
      try {
        await goto(bot, new goals.GoalFollow(target, 2));
      } catch (err) {
        return `Je n'ai pas pu l'atteindre (${(err as Error).message}). Distance actuelle: ${Math.round(bot.entity.position.distanceTo(target.position))} blocs.`;
      }
      const d = Math.round(bot.entity.position.distanceTo(target.position));
      return d <= 4 ? `Arrivé près de ${player} (${d} blocs).` : `Pas arrivé : encore à ${d} blocs de ${player}.`;
    },
    {
      name: "go_to_player",
      description: "Se rendre près d'un joueur visible.",
      schema: z.object({ player: z.string() }),
    },
  );

  const goTo = tool(
    async ({ x, y, z }) => {
      try {
        await goto(bot, new goals.GoalNear(x, y, z, 1));
      } catch (err) {
        return `Chemin impossible ou interrompu (${(err as Error).message}). Je suis en ${formatPos(bot.entity.position)}, à ${dist(x, y, z)} blocs de la cible.`;
      }
      const d = dist(x, y, z);
      return d <= 3 ? `Arrivé en ${formatPos(bot.entity.position)}.` : `Pas arrivé : je suis en ${formatPos(bot.entity.position)}, à ${d} blocs de la cible.`;
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

  return { say, getStatus, lookAroundTool, findBlock, goToPlayer, goTo, wander, emote };
}
