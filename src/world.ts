import type { Bot } from "mineflayer";
import type { Journal, Memory } from "./memory.js";

export type Ctx = {
  bot: Bot;
  journal: Journal;
  memory: Memory;
  run: {
    /** Remis à false avant chaque run ; passe à true quand le tool `say` a parlé. */
    saidThisRun: boolean;
    /** Le joueur a parlé pendant une mission : les tools longs s'arrêtent dès que possible. */
    interrupted: boolean;
  };
};

export function itemCount(bot: Bot, name: string): number {
  return bot.inventory.items().filter((i) => i.name === name).reduce((n, i) => n + i.count, 0);
}

/** Totaux de l'inventaire par nom d'item. */
export function inventoryTotals(bot: Bot): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of bot.inventory.items()) totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
  return totals;
}

export function inventorySummary(bot: Bot): string {
  const totals = inventoryTotals(bot);
  if (!totals.size) return "(vide)";
  return [...totals.entries()].map(([n, c]) => `${n} x${c}`).join(", ");
}

/** Différence d'inventaire lisible ("+12 cobblestone, -1 bread"), pour vérifier ce qu'une action a vraiment produit. */
export function inventoryDiff(before: Map<string, number>, after: Map<string, number>): string {
  const parts: string[] = [];
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(name) ?? 0) - (before.get(name) ?? 0);
    if (delta) parts.push(`${delta > 0 ? "+" : ""}${delta} ${name}`);
  }
  return parts.length ? parts.join(", ") : "aucun changement d'inventaire";
}

/** Joueur par pseudo, sans tenir compte de la casse. */
export function findPlayer(bot: Bot, name: string) {
  const key = Object.keys(bot.players).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? bot.players[key] : undefined;
}

const fmt = (v: { x: number; y: number; z: number }) => `${Math.round(v.x)}, ${Math.round(v.y)}, ${Math.round(v.z)}`;
export { fmt as formatPos };

const isSolid = (b: { boundingBox?: string } | null | undefined) => !!b && b.boundingBox === "block";

/** Hauteur de la surface autour du bot (médiane de 24 colonnes à 3 blocs), pour détecter trou ou mine. */
function surroundingTop(bot: Bot): number {
  const p = bot.entity.position.floored();
  const tops: number[] = [];
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 3) continue;
      let top = p.y - 3;
      for (let y = p.y + 20; y >= p.y - 3; y--) {
        if (isSolid(bot.blockAt(p.offset(dx, y - p.y, dz)))) {
          top = y + 1;
          break;
        }
      }
      tops.push(top);
    }
  }
  tops.sort((a, b) => a - b);
  return tops[Math.floor(tops.length / 2)];
}

/** Nombre de blocs entre les pieds du bot et la surface environnante (0 = à l'air libre). */
export function holeDepth(bot: Bot): number {
  return Math.max(0, surroundingTop(bot) - Math.floor(bot.entity.position.y));
}

export function surfaceY(bot: Bot): number {
  return surroundingTop(bot);
}

export function hostiles(bot: Bot, range = 16) {
  return Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.type === "hostile" && e.position.distanceTo(bot.entity.position) < range)
    .map((e) => ({ name: e.name ?? "?", dist: Math.round(e.position.distanceTo(bot.entity.position)) }))
    .sort((a, b) => a.dist - b.dist);
}

/** Résumé compact de l'état du monde, injecté dans le prompt à chaque décision. */
export function snapshot(bot: Bot): string {
  const players = Object.values(bot.players)
    .filter((p) => p.username !== bot.username)
    .map((p) => {
      const d = p.entity ? Math.round(p.entity.position.distanceTo(bot.entity.position)) : null;
      return d === null ? `${p.username} (hors de vue)` : `${p.username} à ${d} blocs`;
    });

  const mobs = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.type !== "player" && e.name !== "item" && e.position.distanceTo(bot.entity.position) < 16)
    .map((e) => e.name ?? e.type ?? "?");
  const mobCounts = new Map<string, number>();
  for (const m of mobs) mobCounts.set(m, (mobCounts.get(m) ?? 0) + 1);

  const timeOfDay = bot.time.timeOfDay;
  const phase = timeOfDay < 12000 ? "jour" : "nuit";
  const depth = holeDepth(bot);
  const threats = hostiles(bot);

  return [
    `Position: ${fmt(bot.entity.position)}`,
    `Vie: ${Math.round(bot.health)}/20, faim: ${Math.round(bot.food)}/20${bot.isSleeping ? " (je dors)" : ""}`,
    `Moment: ${phase} (${timeOfDay})`,
    `Main: ${bot.heldItem?.name ?? "vide"}`,
    `Relief: ${depth >= 3 ? `je suis ${depth} blocs sous le terrain autour (trou ou mine)` : "à peu près à la surface"}`,
    `Menaces: ${threats.length ? threats.map((t) => `${t.name} à ${t.dist} blocs`).join(", ") : "aucune"}`,
    `Joueurs: ${players.length ? players.join("; ") : "aucun"}`,
    `Créatures proches: ${mobCounts.size ? [...mobCounts].map(([n, c]) => `${n} x${c}`).join(", ") : "aucune"}`,
    `Inventaire: ${inventorySummary(bot)}`,
  ].join("\n");
}

const CATEGORIES: [string, (name: string) => boolean][] = [
  ["lit", (n) => n.endsWith("_bed")],
  ["coffre", (n) => ["chest", "trapped_chest", "barrel", "ender_chest"].includes(n)],
  ["poste de travail", (n) => ["crafting_table", "furnace", "blast_furnace", "smoker"].includes(n)],
  ["lave", (n) => n === "lava"],
  ["eau", (n) => n === "water"],
  ["minerai", (n) => n.endsWith("_ore") || n === "ancient_debris"],
  ["arbre (bûche)", (n) => n.endsWith("_log")],
  ["culture", (n) => ["wheat", "carrots", "potatoes", "beetroots", "melon", "pumpkin", "sweet_berry_bush"].includes(n)],
];

/** Description textuelle de l'environnement proche : ce que le bot "voit" quand il appelle look_around. */
export function lookAround(bot: Bot, radius = 16): string {
  const here = bot.entity.position;
  const idToCat = new Map<number, string>();
  for (const b of bot.registry.blocksArray) {
    const cat = CATEGORIES.find(([, test]) => test(b.name));
    if (cat) idToCat.set(b.id, cat[0]);
  }
  const found = bot.findBlocks({ matching: [...idToCat.keys()], maxDistance: radius, count: 400 });
  const groups = new Map<string, { count: number; nearest: { p: (typeof found)[number]; d: number; name: string } }>();
  for (const p of found) {
    const block = bot.blockAt(p);
    if (!block) continue;
    const cat = idToCat.get(block.type)!;
    const d = p.distanceTo(here);
    const g = groups.get(cat);
    if (!g) groups.set(cat, { count: 1, nearest: { p, d, name: block.name } });
    else {
      g.count++;
      if (d < g.nearest.d) g.nearest = { p, d, name: block.name };
    }
  }

  const lines = [`Position: ${fmt(here)} (rayon ${radius})`];
  const depth = holeDepth(bot);
  lines.push(`Relief: ${depth >= 3 ? `${depth} blocs sous le terrain autour (trou ou mine)` : "à la surface"}, main: ${bot.heldItem?.name ?? "vide"}`);
  if (!groups.size) lines.push("Blocs repérés: rien de notable");
  for (const [cat, g] of groups) {
    lines.push(`- ${cat}: ${g.count} (le plus proche: ${g.nearest.name} à ${Math.round(g.nearest.d)} blocs, en ${fmt(g.nearest.p)})`);
  }

  const near = Object.values(bot.entities).filter((e) => e !== bot.entity && e.position.distanceTo(here) < radius);
  const byName = (list: typeof near) => {
    const counts = new Map<string, { n: number; d: number }>();
    for (const e of list) {
      const name = e.username ?? e.name ?? "?";
      const d = Math.round(e.position.distanceTo(here));
      const c = counts.get(name);
      if (!c) counts.set(name, { n: 1, d });
      else {
        c.n++;
        c.d = Math.min(c.d, d);
      }
    }
    return [...counts].map(([n, c]) => `${n} x${c.n} (à ${c.d} blocs)`).join(", ");
  };
  const hostile = near.filter((e) => e.type === "hostile");
  const animals = near.filter((e) => ["animal", "passive"].includes(String(e.type)));
  const drops = near.filter((e) => e.name === "item");
  const people = near.filter((e) => e.type === "player");
  lines.push(`Menaces: ${hostile.length ? byName(hostile) : "aucune"}`);
  lines.push(`Animaux (nourriture): ${animals.length ? byName(animals) : "aucun"}`);
  lines.push(`Joueurs: ${people.length ? byName(people) : "aucun"}`);
  lines.push(`Objets au sol: ${drops.length}`);
  return lines.join("\n");
}
