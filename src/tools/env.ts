import { freeSpotNear as freeSpotFor, placeAt as placeBlockAt, type V3 } from "../actions.js";
import type { Ctx } from "../world.js";

/** Ce que tous les groupes de tools partagent : le bot, la mémoire, le journal et quelques aides de position. */
export function makeEnv(ctx: Ctx) {
  const { bot, journal, memory } = ctx;
  const dist = (x: number, y: number, z: number) => {
    const p = bot.entity.position;
    return Math.round(Math.hypot(p.x - x, p.y - y, p.z - z));
  };
  const placeAt = (item: string, pos: V3) => placeBlockAt(bot, item, pos);
  const freeSpotNear = () => freeSpotFor(bot);
  return { ctx, bot, journal, memory, dist, placeAt, freeSpotNear };
}

export type ToolEnv = ReturnType<typeof makeEnv>;
