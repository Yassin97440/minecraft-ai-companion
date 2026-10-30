import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";

/** Actions de bas niveau partagées par les tools (tools.ts) et les réflexes de survie (survival.ts). */

const { goals } = pathfinderPkg;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function goto(bot: Bot, goal: any, timeoutMs = 30_000) {
  if (bot.isSleeping) await bot.wake().catch(() => {});
  const timer = setTimeout(() => bot.pathfinder.stop(), timeoutMs);
  try {
    await bot.pathfinder.goto(goal);
  } finally {
    clearTimeout(timer);
  }
}

export const TIERS = ["netherite", "diamond", "iron", "stone", "golden", "wooden"];

/** Meilleur outil d'un type (pickaxe, axe, shovel, sword...) de l'inventaire. */
export function bestTool(bot: Bot, kind: string) {
  const candidates = bot.inventory.items().filter((i) => i.name.endsWith(`_${kind}`));
  candidates.sort((a, b) => TIERS.findIndex((t) => a.name.startsWith(t)) - TIERS.findIndex((t) => b.name.startsWith(t)));
  return candidates[0];
}

export type V3 = ReturnType<Bot["entity"]["position"]["floored"]>;

// Côtés d'abord, dessous ensuite, dessus en dernier : une torche ne tient pas au plafond.
const NEIGHBORS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]];

const distTo = (bot: Bot, p: V3) => {
  const me = bot.entity.position;
  return Math.hypot(me.x - p.x, me.y - p.y, me.z - p.z);
};

/** Pose `item` sur la case vide `pos`, en s'appuyant sur un bloc plein voisin. Renvoie null si posé, sinon la raison de l'échec. */
export async function placeAt(bot: Bot, item: string, pos: V3): Promise<string | null> {
  const target = bot.blockAt(pos);
  if (!target) return "zone non chargée";
  if (!["air", "cave_air", "water", "lava"].includes(target.name) && !target.name.endsWith("_air")) {
    return `la case est occupée par ${target.name}`;
  }
  const stack = bot.inventory.items().find((i) => i.name === item);
  if (!stack) return `je n'ai pas de ${item}`;
  const me = bot.entity.position.floored();
  if (pos.equals(me) || (pos.equals(me.offset(0, 1, 0)) && !item.includes("torch"))) return "je suis sur cette case";

  const ref = NEIGHBORS.map(([dx, dy, dz]) => bot.blockAt(pos.offset(dx, dy, dz))).find((b) => b && b.boundingBox === "block");
  if (!ref) return "aucun bloc plein contre lequel poser";

  if (distTo(bot, pos) > 4) {
    await goto(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 3), 15_000).catch(() => {});
    if (distTo(bot, pos) > 5) return "trop loin et inaccessible";
  }
  try {
    await bot.equip(stack, "hand");
    await bot.lookAt(pos.offset(0.5, 0.5, 0.5));
    await bot.placeBlock(ref, pos.minus(ref.position));
  } catch (err) {
    return (err as Error).message;
  }
  await sleep(200);
  const now = bot.blockAt(pos)?.name ?? "";
  return now === "air" || now === "water" || now === "lava" ? "le bloc n'a pas été posé" : null;
}

/** Une case libre (pieds et tête vides, sol plein) à 1-3 blocs du bot, de préférence devant lui. */
export function freeSpotNear(bot: Bot): V3 | null {
  const me = bot.entity.position.floored();
  const fx = Math.round(-Math.sin(bot.entity.yaw));
  const fz = Math.round(-Math.cos(bot.entity.yaw));
  const ring: [number, number][] = [[fx * 2, fz * 2], [fx, fz], [fx * 3, fz * 3], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]];
  for (const [dx, dz] of ring) {
    for (const dy of [0, 1, -1]) {
      const p = me.offset(dx, dy, dz);
      const feet = bot.blockAt(p);
      const head = bot.blockAt(p.offset(0, 1, 0));
      const floor = bot.blockAt(p.offset(0, -1, 0));
      if (feet?.name === "air" && head?.name === "air" && floor?.boundingBox === "block") return p;
    }
  }
  return null;
}
