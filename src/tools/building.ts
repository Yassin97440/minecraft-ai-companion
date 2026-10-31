/** Construction : blueprints (datapack) et build_structure (plans validés). */
import fs from "node:fs";
import path from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { PlanSchema, planCommands, summarizePlan, validatePlan, verifyGrid, type Plan } from "../construction.js";
import { BLUEPRINTS, footprintBox, macroArgs, missingMaterials, resolveMaterials, resolveParams } from "../blueprints.js";
import { WALL_BLOCKS, WOODS } from "../materials.js";
import { config } from "../config.js";
import { inHome, isProtectedBlock } from "../policy.js";
import { shelter } from "../survival.js";
import { sleep } from "../actions.js";
import { formatPos, inventoryDiff, inventoryTotals, itemCount } from "../world.js";
import type { ToolEnv } from "./env.js";



export function buildingTools(env: ToolEnv) {
  const { bot, journal, memory } = env;

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

  return { listBlueprints, runBlueprint, buildStructure };
}
