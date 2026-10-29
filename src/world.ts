import type { Bot } from "mineflayer";
import type { Journal } from "./memory.js";

export type Ctx = {
  bot: Bot;
  journal: Journal;
  /** Remis à false avant chaque run ; passe à true quand le tool `say` a parlé. */
  run: { saidThisRun: boolean };
};

export function itemCount(bot: Bot, name: string): number {
  return bot.inventory.items().filter((i) => i.name === name).reduce((n, i) => n + i.count, 0);
}

export function inventorySummary(bot: Bot): string {
  const totals = new Map<string, number>();
  for (const item of bot.inventory.items()) totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
  if (!totals.size) return "(vide)";
  return [...totals.entries()].map(([n, c]) => `${n} x${c}`).join(", ");
}

const fmt = (v: { x: number; y: number; z: number }) => `${Math.round(v.x)}, ${Math.round(v.y)}, ${Math.round(v.z)}`;

/** Résumé compact de l'état du monde, injecté dans le prompt à chaque décision. */
export function snapshot(bot: Bot): string {
  const players = Object.values(bot.players)
    .filter((p) => p.username !== bot.username)
    .map((p) => {
      const d = p.entity ? Math.round(p.entity.position.distanceTo(bot.entity.position)) : null;
      return d === null ? `${p.username} (hors de vue)` : `${p.username} à ${d} blocs`;
    });

  const mobs = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.type !== "player" && e.position.distanceTo(bot.entity.position) < 16)
    .map((e) => e.name ?? e.type ?? "?");
  const mobCounts = new Map<string, number>();
  for (const m of mobs) mobCounts.set(m, (mobCounts.get(m) ?? 0) + 1);

  const timeOfDay = bot.time.timeOfDay;
  const phase = timeOfDay < 12000 ? "jour" : "nuit";

  return [
    `Position: ${fmt(bot.entity.position)}`,
    `Vie: ${Math.round(bot.health)}/20, faim: ${Math.round(bot.food)}/20`,
    `Moment: ${phase} (${timeOfDay})`,
    `Joueurs: ${players.length ? players.join("; ") : "aucun"}`,
    `Créatures proches: ${mobCounts.size ? [...mobCounts].map(([n, c]) => `${n} x${c}`).join(", ") : "aucune"}`,
    `Inventaire: ${inventorySummary(bot)}`,
  ].join("\n");
}
