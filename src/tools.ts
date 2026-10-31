import fs from "node:fs";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PlanSchema, planCommands, summarizePlan, validatePlan, verifyGrid, type Plan } from "./construction.js";
import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { BLUEPRINTS, footprintBox, macroArgs, missingMaterials, resolveMaterials, resolveParams } from "./blueprints.js";
import { WALL_BLOCKS, WOODS } from "./materials.js";
import { config } from "./config.js";
import { createRecipeDb, planNeedsText, type RecipeDb } from "./needs.js";
import { obtainItem, type Actions } from "./obtain.js";
import { inHome, isProtectedBlock } from "./policy.js";
import { eatBest, fight, flee, gearUp, shelter } from "./survival.js";
import { bestTool, freeSpotNear as freeSpotFor, goto, placeAt as placeBlockAt, sleep, type V3 } from "./actions.js";
import {
  digHazard,
  findPlayer,
  formatPos,
  holeDepth,
  hostiles,
  inventoryDiff,
  inventorySummary,
  inventoryTotals,
  itemCount,
  lookAround,
  snapshot,
  surfaceY,
  type Ctx,
} from "./world.js";

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

/** Noms de blocs correspondant à une requête (exacte, sinon "contient"), ex: "bed" -> tous les lits. */
function resolveBlocks(bot: Bot, query: string) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "_");
  const exact = bot.registry.blocksByName[q];
  if (exact) return [exact];
  return bot.registry.blocksArray.filter((b) => b.name.includes(q)).slice(0, 60);
}

const ARMOR_SLOTS: [string, "head" | "torso" | "legs" | "feet"][] = [
  ["_helmet", "head"],
  ["_chestplate", "torso"],
  ["_leggings", "legs"],
  ["_boots", "feet"],
];

export function createTools(ctx: Ctx) {
  const { bot, journal, memory } = ctx;
  const dist = (x: number, y: number, z: number) => {
    const p = bot.entity.position;
    return Math.round(Math.hypot(p.x - x, p.y - y, p.z - z));
  };

  const placeAt = (item: string, pos: V3) => placeBlockAt(bot, item, pos);
  const freeSpotNear = () => freeSpotFor(bot);

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

  const listBlueprints = tool(
    async () => {
      const have = (i: string) => itemCount(bot, i);
      const defaults = resolveParams({}, have);
      const lines = Object.values(BLUEPRINTS).map((b) => {
        const mats = defaults.ok ? resolveMaterials(b, defaults.params) : b.materials;
        return (
          `${b.name}: ${b.description} | emprise ${b.footprint.x}x${b.footprint.z} (à droite et devant toi) | ` +
          `paramètres: ${b.params.join(", ")} | matériaux par défaut: ` +
          Object.entries(mats)
            .map(([k, v]) => `${k} x${v}`)
            .join(", ")
        );
      });
      lines.push(
        `Bois possibles (wood): ${WOODS.join(", ")}.`,
        `Blocs de mur possibles (wall): ${WALL_BLOCKS.join(", ")}.`,
        "Sans paramètre, le bois dont tu as le plus de planches est utilisé. Adapte-toi à ce qui t'entoure (ex: acacia dans la savane).",
      );
      return lines.join("\n");
    },
    {
      name: "list_blueprints",
      description: "Lister les constructions disponibles, leurs matériaux et les bois/pierres utilisables.",
      schema: z.object({}),
    },
  );

  const runBlueprint = tool(
    async ({ name, wood, wall }) => {
      const bp = BLUEPRINTS[name];
      if (!bp) return `Blueprint inconnu: "${name}". Disponibles: ${Object.keys(BLUEPRINTS).join(", ")}.`;

      const have = (i: string) => itemCount(bot, i);
      const resolved = resolveParams({ wood, wall }, have);
      if (!resolved.ok) return resolved.error;
      const materials = resolveMaterials(bp, resolved.params);

      const missing = missingMaterials(materials, have);
      if (Object.keys(missing).length) {
        return `Matériaux manquants: ${Object.entries(missing).map(([k, v]) => `${k} x${v}`).join(", ")}. Récolte/crafte d'abord (ou choisis un autre bois/bloc avec wood/wall).`;
      }

      // L'emprise est entièrement dégagée par le datapack : on refuse s'il y a un coffre, un lit, un four...
      const box = footprintBox(bp, bot.entity.position);
      const inBox = (p: { x: number; y: number; z: number }) =>
        p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y && p.z >= box.min.z && p.z <= box.max.z;
      const protectedHere = bot
        .findBlocks({ matching: (b) => isProtectedBlock(b.name), maxDistance: Math.max(bp.footprint.x, bp.footprint.z) + 6, count: 200 })
        .filter(inBox)[0];
      if (protectedHere) {
        const name = bot.blockAt(protectedHere)?.name ?? "bloc protégé";
        return `Échec : l'emprise ${bp.footprint.x}x${bp.footprint.z} (devant et à droite de moi) contient un ${name} en ${formatPos(protectedHere)}. Déplace-toi vers un terrain dégagé.`;
      }

      const items = Object.keys(materials);
      const before = items.map(have);
      // On écoute la réponse du serveur : c'est elle qui dit pourquoi une fonction échoue (inconnue, droits, matériaux...).
      const feedback: string[] = [];
      const onServerMessage = (msg: string) => {
        if (!msg.startsWith("<")) feedback.push(msg.slice(0, 160));
      };
      bot.on("messagestr", onServerMessage);
      bot.chat(`/function ${bp.fn} ${macroArgs(resolved.params, materials)}`);
      await sleep(1500);
      bot.off("messagestr", onServerMessage);
      const after = items.map(have);
      const consumed = before.some((b, i) => after[i] < b);
      if (!consumed) {
        return (
          `Échec : rien n'a été construit. Réponse du serveur : ${feedback.length ? feedback.join(" | ") : "(aucune)"}. ` +
          "Causes possibles : datapack absent ou pas à jour (npm run sync-datapack puis /reload), bot non op (niveau 2+), ou matériaux refusés par le datapack."
        );
      }
      const used = items
        .map((it, i) => ({ it, n: before[i] - after[i] }))
        .filter((x) => x.n > 0)
        .map((x) => `${x.it} x${x.n}`)
        .join(", ");
      journal.append("build", `a construit ${name} (${used}) vers ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.z)}`);
      return `Construction "${name}" terminée. Matériaux consommés: ${used}.`;
    },
    {
      name: "run_blueprint",
      description:
        "Construire un blueprint à l'endroit où tu te trouves. Consomme les matériaux de ton inventaire. Demande l'accord du joueur. " +
        "Optionnel: wood (acacia, spruce, birch...) et wall (ex: cobblestone, stone_bricks, acacia_planks) pour choisir le matériau ; " +
        "par défaut, le bois dont tu as le plus de planches.",
      schema: z.object({
        name: z.string(),
        wood: z.string().optional().describe("Famille de bois : porte, clôtures, sol de la ferme. Ex: acacia"),
        wall: z.string().optional().describe("Bloc des murs de la cabane. Ex: acacia_planks, cobblestone, stone_bricks"),
      }),
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

  /**
   * Exécute des commandes Minecraft (le bot est op). Serveur local connu : un seul fichier de fonction généré puis
   * `/reload` + `/function` (quelques secondes). Sinon : une commande de chat par seconde (le serveur expulse pour spam au-delà).
   */
  async function runCommands(cmds: string[]): Promise<string[]> {
    const feedback: string[] = [];
    const onMessage = (msg: string) => {
      if (!msg.startsWith("<")) feedback.push(msg.slice(0, 160));
    };
    bot.on("messagestr", onMessage);
    try {
      const world = config.mc.worldDir;
      if (world) {
        const file = path.join(world, "datapacks", "companion", "data", "companion", "function", "generated", "plan.mcfunction");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${cmds.join("\n")}\n`);
        bot.chat("/reload");
        for (let waited = 0; waited < 10_000 && !feedback.some((m) => /reload/i.test(m)); waited += 200) await sleep(200);
        bot.chat("/function companion:generated/plan");
        await sleep(Math.min(10_000, 1500 + cmds.length * 40));
      } else {
        for (const cmd of cmds) {
          bot.chat(`/${cmd}`);
          await sleep(1100);
        }
      }
    } finally {
      bot.off("messagestr", onMessage);
    }
    return feedback;
  }

  const buildStructure = tool(
    async (args) => {
      const plan = args as Plan;
      const v = validatePlan(plan);
      if (v.errors.length) {
        return `Échec : plan invalide, rien n'a été construit. Corrige ces points puis rappelle build_structure :\n- ${v.errors.slice(0, 8).join("\n- ")}`;
      }

      const have = (i: string) => itemCount(bot, i);
      const missing = missingMaterials(v.cost, have);
      if (Object.keys(missing).length) {
        return `Matériaux manquants: ${Object.entries(missing).map(([k, n]) => `${k} x${n}`).join(", ")}. Récolte/crafte d'abord, ou réduis/simplifie le plan.`;
      }

      // Repère du plan : décalé de 2 blocs vers l'est et le sud du bot, y = niveau du sol.
      const p = bot.entity.position;
      const anchor = { x: Math.floor(p.x) + 2, y: Math.floor(p.y), z: Math.floor(p.z) + 2 };
      const lo = { x: anchor.x + v.bbox!.min[0], y: anchor.y + Math.min(v.bbox!.min[1], 0), z: anchor.z + v.bbox!.min[2] };
      const hi = { x: anchor.x + v.bbox!.max[0], y: anchor.y + v.bbox!.max[1], z: anchor.z + v.bbox!.max[2] };
      const inBox = (q: { x: number; y: number; z: number }) =>
        q.x >= lo.x && q.x <= hi.x && q.y >= lo.y && q.y <= hi.y && q.z >= lo.z && q.z <= hi.z;
      const blocking = bot
        .findBlocks({ matching: (b) => isProtectedBlock(b.name), maxDistance: 40, count: 300 })
        .find(inBox);
      if (blocking) {
        return `Échec : l'emprise contient un ${bot.blockAt(blocking)?.name ?? "bloc protégé"} en ${formatPos(blocking)}. Déplace-toi vers un terrain dégagé.`;
      }
      if (inHome(lo) || inHome(hi)) return "Échec : l'emprise touche la zone protégée (HOME).";

      const before = inventoryTotals(bot);
      const feedback = await runCommands(planCommands(plan, v, anchor));
      await sleep(1200);

      const base = p.floored();
      const check = verifyGrid(v.grid, (x, y, z) => bot.blockAt(base.offset(anchor.x + x - base.x, anchor.y + y - base.y, anchor.z + z - base.z))?.name ?? null);
      const diff = inventoryDiff(before, inventoryTotals(bot));
      const paid = Object.entries(v.cost).every(([item, n]) => (before.get(item) ?? 0) - (inventoryTotals(bot).get(item) ?? 0) >= n);

      if (check.ratio < 0.9) {
        return (
          `Échec partiel : ${check.ok}/${check.checked} blocs conformes (${Math.round(check.ratio * 100)} %). ${check.mismatches.join(" ; ")}. ` +
          `Réponse du serveur : ${feedback.slice(-4).join(" | ") || "(aucune)"}. Matériaux : ${diff}.`
        );
      }
      memory.set(`construction ${plan.name}`, "place", summarizePlan(plan, v), anchor);
      journal.append("build", `a construit "${plan.name}" en ${formatPos(anchor)}`);
      return (
        `Construction "${plan.name}" terminée : ${check.ok}/${check.checked} blocs conformes. Matériaux consommés: ${diff}.` +
        (paid ? "" : " Attention : les matériaux n'ont pas été tous débités.") +
        (v.warnings.length ? ` Remarque : ${v.warnings.join(" ")}` : "")
      );
    },
    {
      name: "build_structure",
      description:
        "Construire LIBREMENT : tu composes un plan (liste d'étapes), le système le vérifie, le chiffre, demande l'accord du joueur puis le construit. " +
        "Repère : x vers l'EST, z vers le SUD, y vers le haut ; y=0 = niveau du sol où tu te tiens, y=-1 = sol posé. L'origine [0,0,0] est 2 blocs à l'est et au sud de toi. Coordonnées entières, bornes incluses, x et z entre 0 et 23. " +
        'Étapes : {"op":"box","from":[x,y,z],"to":[x,y,z],"block":"cobblestone","mode":"solid|hollow|walls"} (walls = 4 murs sans sol ni toit) ; ' +
        '{"op":"block","at":[x,y,z],"block":"glass_pane"} ; {"op":"door","at":[x,y,z],"block":"oak_door","facing":"north"} (facing = direction vers l\'EXTÉRIEUR, pose les 2 blocs) ; ' +
        '{"op":"clear","from":[..],"to":[..]}. Escaliers/dalles : block "oak_stairs" + facing (north/south/east/west) + state "half=top" ou "type=bottom". ' +
        'Un bâtiment (kind "shelter", défaut) doit avoir : sol plein, murs d\'au moins 3 de haut, toit fermé, intérieur de 2+ blocs de haut, une porte. kind "decor" pour enclos, tours, ponts. ' +
        "Si le plan est invalide, la réponse liste les erreurs : corrige et rappelle. Maximum 40 étapes, 2500 blocs, 24x24x16.",
      schema: PlanSchema,
    },
  );

  const remember = tool(
    async ({ key, kind, text, x, y, z: zc }) => {
      const pos = x !== undefined && y !== undefined && zc !== undefined ? { x, y, z: zc } : undefined;
      memory.set(key, kind, text, pos);
      return `Mémorisé "${key}" (${kind}). Je le retrouverai dans ma mémoire durable, même après un redémarrage.`;
    },
    {
      name: "remember",
      description:
        "Enregistrer dans ta mémoire durable (relue à chaque décision) une info utile PLUS TARD : un lieu (mine, base, ferme, coffre), " +
        "une préférence ou règle du joueur, un fait important. Même clé = remplace l'ancienne valeur. " +
        "Pas pour l'état instantané (position, inventaire) ni pour ce qui est déjà dans la mémoire. Les lits, coffres et la mine sont notés automatiquement.",
      schema: z.object({
        key: z.string().describe("Identifiant court et stable, ex: base, mine_fer, pref_humour"),
        kind: z.enum(["place", "preference", "fact"]),
        text: z.string().describe("L'info, en une phrase"),
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
      }),
    },
  );

  const forget = tool(
    async ({ key }) => (memory.forget(key) ? `Oublié "${key}".` : `Rien à oublier sous la clé "${key}".`),
    {
      name: "forget",
      description: "Supprimer une entrée de ta mémoire durable devenue fausse ou inutile (par sa clé).",
      schema: z.object({ key: z.string() }),
    },
  );

  const startMission = tool(
    async ({ goal, objectives }) => {
      memory.startMission(goal, objectives);
      return `Mission enregistrée : ${goal}. Objectifs : ${objectives.join(", ")}. Enchaîne maintenant avec le premier, sans t'arrêter à chaque étape.`;
    },
    {
      name: "start_mission",
      description:
        "À appeler dès que le joueur donne une consigne en PLUSIEURS étapes ou longue (ex: 'trouve du fer, du diamant et de la redstone'). " +
        "Tu continueras automatiquement jusqu'à la fin. Pas pour une action simple et immédiate.",
      schema: z.object({
        goal: z.string().describe("La consigne du joueur, résumée"),
        objectives: z.array(z.string()).min(1).max(8).describe("Les objectifs concrets, ex: ['10 fer', '3 diamants']"),
      }),
    },
  );

  const missionProgress = tool(
    async ({ objective }) => {
      const m = memory.markObjective(objective);
      if (!m) return `Aucun objectif ne correspond à "${objective}" (ou pas de mission active).`;
      const left = m.objectives.filter((o) => !o.done).map((o) => o.text);
      return left.length
        ? `Objectif coché. Il reste : ${left.join(", ")}. Continue avec le suivant.`
        : "Tous les objectifs sont faits : appelle end_mission(done) avec un résumé.";
    },
    {
      name: "mission_progress",
      description: "Cocher un objectif de la mission une fois réellement atteint (vérifié par l'inventaire), puis enchaîner sur le suivant.",
      schema: z.object({ objective: z.string() }),
    },
  );

  const endMission = tool(
    async ({ status, summary }) =>
      memory.endMission(status, summary)
        ? `Mission ${status === "done" ? "terminée" : "abandonnée"}. Annonce le résultat au joueur en une phrase.`
        : "Pas de mission active.",
    {
      name: "end_mission",
      description: "Terminer la mission : done si tout est fait, abandoned si c'est impossible ou si le joueur change de plan.",
      schema: z.object({ status: z.enum(["done", "abandoned"]), summary: z.string() }),
    },
  );

  return [
    say,
    getStatus,
    lookAroundTool,
    findBlock,
    planNeedsTool,
    obtainItemTool,
    goToPlayer,
    goTo,
    wander,
    emote,
    equipItem,
    placeBlockTool,
    pickupItems,
    fightTool,
    fleeTool,
    takeShelter,
    gearUpTool,
    eat,
    sleepInBed,
    digOut,
    collectBlock,
    mineTunnel,
    chestContents,
    storeInChest,
    takeFromChest,
    craftItem,
    giveToPlayer,
    listBlueprints,
    runBlueprint,
    buildStructure,
    remember,
    forget,
    startMission,
    missionProgress,
    endMission,
  ];
}
