/** Récolte et minage : collect_block et mine_tunnel (avec leurs refus de blocs dangereux). */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { config } from "../config.js";
import { inHome, isProtectedBlock } from "../policy.js";
import { bestTool, goto, sleep } from "../actions.js";
import { digHazard, formatPos, hostiles, inventoryDiff, inventoryTotals, itemCount } from "../world.js";
import type { ToolEnv } from "./env.js";

const { goals } = pathfinderPkg;

async function equipBestTool(bot: Bot, block: { material?: string | null }) {
  const mat = block.material ?? "";
  const kind = mat.includes("pickaxe") ? "pickaxe" : mat.includes("shovel") ? "shovel" : mat.includes("hoe") ? "hoe" : mat.includes("axe") ? "axe" : null;
  if (!kind) return;
  const tool = bestTool(bot, kind);
  if (tool) await bot.equip(tool, "hand");
}

const DIRECTIONS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;

const NAMES_FR: Record<string, string> = { north: "nord", south: "sud", east: "est", west: "ouest" };
export function miningTools(env: ToolEnv) {
  const { ctx, bot, journal, memory, dist, placeAt } = env;

  const collectBlock = tool(
    async ({ block, count }) => {
      const def = bot.registry.blocksByName[block];
      if (!def) return `Bloc inconnu: "${block}" (utilise le nom Minecraft, ex: oak_log, stone, coal_ore).`;
      const before = inventoryTotals(bot);
      let dug = 0;
      let last: { x: number; y: number; z: number } | null = null;
      let why = "";
      const unsafe = new Set<string>();

      for (let i = 0; i < count; i++) {
        if (ctx.run.interrupted) {
          why = "interrompu par le joueur";
          break;
        }
        const candidates = bot
          .findBlocks({ matching: def.id, maxDistance: 48, count: 24 })
          .filter((p) => !inHome(p) && !unsafe.has(`${p.x},${p.y},${p.z}`))
          .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
        const pos = candidates[0];
        if (!pos) {
          why = `plus de ${block} accessible dans 48 blocs`;
          break;
        }

        try {
          await goto(bot, new goals.GoalGetToBlock(pos.x, pos.y, pos.z), 20_000);
        } catch {
          why = "chemin bloqué";
          continue;
        }
        const target = bot.blockAt(pos);
        if (!target || target.type !== def.id) continue;
        const hazard = digHazard(bot, target.position);
        if (hazard) {
          unsafe.add(`${pos.x},${pos.y},${pos.z}`);
          why = `bloc dangereux ignoré : ${hazard}`;
          i--;
          continue;
        }
        await equipBestTool(bot, target);
        if (target.harvestTools && !(bot.heldItem && target.harvestTools[bot.heldItem.type])) {
          why = "il me faut un meilleur outil";
          break;
        }
        await bot.dig(target);
        dug++;
        last = pos;
      }

      if (last) await goto(bot, new goals.GoalNear(last.x, last.y, last.z, 1), 8_000).catch(() => {});
      await sleep(700); // laisse le temps de ramasser les drops
      const diff = inventoryDiff(before, inventoryTotals(bot));
      return `${dug}/${count} ${block} cassés${why ? ` (arrêt : ${why})` : ""}. Inventaire réel: ${diff}.`;
    },
    {
      name: "collect_block",
      description: "Aller miner/couper des blocs d'un type donné (ex: oak_log, stone, sand, coal_ore) et ramasser les drops.",
      schema: z.object({ block: z.string(), count: z.number().int().min(1) }),
    },
  );

  const mineTunnel = tool(
    async ({ length, direction, mode }) => {
      const pick = bestTool(bot, "pickaxe");
      if (!pick) return "Je n'ai pas de pioche. Crafte-en une (craft_item) ou demande-en une au joueur.";
      await bot.equip(pick, "hand");

      const dirKey = direction && direction !== "facing" ? direction : (() => {
        const fx = -Math.sin(bot.entity.yaw);
        const fz = -Math.cos(bot.entity.yaw);
        return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? "east" : "west") : fz > 0 ? "south" : "north";
      })();
      const [dx, dz] = DIRECTIONS[dirKey as keyof typeof DIRECTIONS];
      const stairs = mode === "stairs_down";

      const start = bot.entity.position.floored();
      const before = inventoryTotals(bot);
      let ox = 0;
      let oy = 0;
      let oz = 0;
      let dug = 0;
      let steps = 0;
      let torches = 0;
      let stop = "longueur atteinte";
      const at = (x: number, y: number, z: number) => bot.blockAt(start.offset(x, y, z));
      const liquid = (n?: string) => n === "lava" || n === "water";

      try {
        for (let i = 0; i < length; i++) {
          if (ctx.run.interrupted) {
            stop = "interrompu par le joueur";
            break;
          }
          if (bot.health < 8) {
            stop = "vie trop basse";
            break;
          }
          const threat = hostiles(bot, 8)[0];
          if (threat) {
            stop = `${threat.name} à ${threat.dist} blocs`;
            break;
          }

          const nx = ox + dx;
          const nz = oz + dz;
          const ny = stairs ? oy - 1 : oy;
          const cells: [number, number, number][] = stairs
            ? [[nx, oy + 1, nz], [nx, oy, nz], [nx, oy - 1, nz]]
            : [[nx, oy, nz], [nx, oy + 1, nz]];

          let blocked = "";
          for (const [x, y, z] of cells) {
            const b = at(x, y, z);
            if (!b) blocked = "zone non chargée";
            else if (liquid(b.name)) blocked = `${b.name} devant`;
            else if (isProtectedBlock(b.name)) blocked = `${b.name} protégé`;
            else if (inHome(start.offset(x, y, z))) blocked = "zone protégée";
            else if (b.boundingBox === "block" && digHazard(bot, start.offset(x, y, z))) blocked = `danger : ${digHazard(bot, start.offset(x, y, z))}`;
            if (blocked) break;
          }
          const floor = at(nx, ny - 1, nz);
          const ahead = at(nx + dx, ny, nz + dz);
          if (!blocked && (!floor || floor.boundingBox !== "block" || liquid(floor.name))) blocked = "vide ou liquide sous mes pieds";
          if (!blocked && liquid(ahead?.name)) blocked = `${ahead!.name} juste derrière`;
          if (blocked) {
            stop = blocked;
            break;
          }

          for (const [x, y, z] of cells) {
            const b = at(x, y, z);
            if (b && b.boundingBox === "block") {
              await bot.dig(b);
              dug++;
            }
          }
          await goto(bot, new goals.GoalBlock(start.x + nx, start.y + ny, start.z + nz), 8_000);
          ox = nx;
          oy = ny;
          oz = nz;
          steps++;

          // Une torche tous les 6 pas (si on en a) : on voit les dangers, les monstres n'apparaissent pas dans le tunnel.
          if (steps % 6 === 0 && itemCount(bot, "torch") > 0 && !(await placeAt("torch", start.offset(ox, oy + 1, oz)))) torches++;

          // Minerais voisins (sauf s'ils touchent de la lave).
          const around: [number, number, number][] = [
            [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [0, 2, 0], [0, -1, 0],
          ];
          for (const [ax, ay, az] of around) {
            const ore = at(ox + ax, oy + ay, oz + az);
            if (!ore || !(ore.name.endsWith("_ore") || ore.name === "ancient_debris")) continue;
            if (digHazard(bot, ore.position)) continue;
            await bot.dig(ore).catch(() => {});
            dug++;
          }
        }
      } catch (err) {
        stop = `interrompu (${(err as Error).message})`;
      }

      await sleep(700);
      const diff = inventoryDiff(before, inventoryTotals(bot));
      const where = formatPos(bot.entity.position);
      journal.append("mine", `${stairs ? "escalier" : "tunnel"} vers ${NAMES_FR[dirKey]} depuis ${formatPos(start)} (${steps} pas)`);
      if (steps > 0 && !memory.entries().some((e) => e.key === "mine")) memory.set("mine", "place", `entrée de ma mine (${stairs ? "escalier" : "tunnel"} vers ${NAMES_FR[dirKey]})`, start);
      return `${stairs ? "Escalier descendant" : "Tunnel"} vers ${NAMES_FR[dirKey]} : ${steps}/${length} pas, ${dug} blocs cassés${torches ? `, ${torches} torche(s) posée(s)` : itemCount(bot, "torch") ? "" : " (pas de torches : crafte-en avec du charbon et des bâtons)"} (arrêt : ${stop}). Inventaire réel: ${diff}. Position: ${where} (départ ${formatPos(start)}).`;
    },
    {
      name: "mine_tunnel",
      description:
        "Miner avec la pioche : creuse un tunnel (ou un escalier descendant) droit, ramasse les minerais voisins et s'arrête devant lave, eau, vide, monstre ou vie basse. Pour 'mine ici', 'creuse', 'va chercher du charbon sous terre'.",
      schema: z.object({
        length: z.number().int().min(1).max(config.limits.maxTunnel),
        direction: z.enum(["facing", "north", "south", "east", "west"]).optional(),
        mode: z.enum(["tunnel", "stairs_down"]).optional(),
      }),
    },
  );

  return { collectBlock, mineTunnel };
}
