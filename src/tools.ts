import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { BLUEPRINTS, missingMaterials } from "./blueprints.js";
import { config } from "./config.js";
import { inHome, isProtectedBlock } from "./policy.js";
import {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function goto(bot: Bot, goal: any, timeoutMs = 30_000) {
  if (bot.isSleeping) await bot.wake().catch(() => {});
  const timer = setTimeout(() => bot.pathfinder.stop(), timeoutMs);
  try {
    await bot.pathfinder.goto(goal);
  } finally {
    clearTimeout(timer);
  }
}

const TIERS = ["netherite", "diamond", "iron", "stone", "golden", "wooden"];

function bestTool(bot: Bot, kind: string) {
  const candidates = bot.inventory.items().filter((i) => i.name.endsWith(`_${kind}`));
  candidates.sort((a, b) => TIERS.findIndex((t) => a.name.startsWith(t)) - TIERS.findIndex((t) => b.name.startsWith(t)));
  return candidates[0];
}

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
const BAD_FOOD = new Set(["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chorus_fruit", "suspicious_stew"]);

export function createTools(ctx: Ctx) {
  const { bot, journal } = ctx;
  const dist = (x: number, y: number, z: number) => {
    const p = bot.entity.position;
    return Math.round(Math.hypot(p.x - x, p.y - y, p.z - z));
  };

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

  const eat = tool(
    async () => {
      if (bot.food >= 20) return "Je n'ai pas faim (20/20).";
      const foods = bot.inventory
        .items()
        .filter((i) => bot.registry.foods[i.type] && !BAD_FOOD.has(i.name))
        .sort((a, b) => bot.registry.foods[b.type].foodPoints - bot.registry.foods[a.type].foodPoints);
      if (!foods.length) return "Je n'ai aucune nourriture mangeable. Il faut chasser (look_around montre les animaux) ou récolter.";
      const before = bot.food;
      await bot.equip(foods[0], "hand");
      await bot.consume();
      return bot.food > before ? `J'ai mangé ${foods[0].name} : faim ${Math.round(before)} -> ${Math.round(bot.food)}.` : `Échec : ma faim n'a pas changé (${Math.round(bot.food)}/20).`;
    },
    {
      name: "eat",
      description: "Manger la meilleure nourriture de l'inventaire.",
      schema: z.object({}),
    },
  );

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
          journal.append("place", `lit utilisé en ${formatPos(pos)}`);
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

      for (let i = 0; i < count; i++) {
        const candidates = bot
          .findBlocks({ matching: def.id, maxDistance: 48, count: 24 })
          .filter((p) => !inHome(p))
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
      let stop = "longueur atteinte";
      const at = (x: number, y: number, z: number) => bot.blockAt(start.offset(x, y, z));
      const liquid = (n?: string) => n === "lava" || n === "water";

      try {
        for (let i = 0; i < length; i++) {
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

          // Minerais voisins (sauf s'ils touchent de la lave).
          const around: [number, number, number][] = [
            [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [0, 2, 0], [0, -1, 0],
          ];
          for (const [ax, ay, az] of around) {
            const ore = at(ox + ax, oy + ay, oz + az);
            if (!ore || !(ore.name.endsWith("_ore") || ore.name === "ancient_debris")) continue;
            const wet = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([bx, by, bz]) =>
              liquid(at(ox + ax + bx, oy + ay + by, oz + az + bz)?.name),
            );
            if (wet) continue;
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
      return `${stairs ? "Escalier descendant" : "Tunnel"} vers ${NAMES_FR[dirKey]} : ${steps}/${length} pas, ${dug} blocs cassés (arrêt : ${stop}). Inventaire réel: ${diff}. Position: ${where} (départ ${formatPos(start)}).`;
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
        if (table) {
          await goto(bot, new goals.GoalGetToBlock(table.position.x, table.position.y, table.position.z), 15_000);
          recipes = bot.recipesFor(def.id, null, 1, table);
        }
      }
      const recipe = recipes[0];
      if (!recipe) return `Impossible de crafter ${item} : ingrédients manquants ou pas d'établi à proximité.`;
      const times = Math.ceil(count / recipe.result.count);
      await bot.craft(recipe, times, table ?? undefined);
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
    lookAroundTool,
    findBlock,
    goToPlayer,
    goTo,
    wander,
    emote,
    equipItem,
    eat,
    sleepInBed,
    digOut,
    collectBlock,
    mineTunnel,
    craftItem,
    giveToPlayer,
    listBlueprints,
    runBlueprint,
    remember,
  ];
}
