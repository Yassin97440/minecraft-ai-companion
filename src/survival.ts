import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { bestTool, goto, placeAt, sleep, type V3 } from "./actions.js";
import { threats } from "./world.js";

const { goals } = pathfinderPkg;

/**
 * Instinct de survie : une couche de RÉFLEXES déterministes, hors LLM.
 * Un LLM met plusieurs secondes à décider ; la lave, un creeper ou du gravier sur la tête n'attendent pas.
 * `decideReflex` est une fonction pure (testable sans serveur) ; le reste exécute l'action choisie avec Mineflayer.
 */

export type DangerState = {
  health: number;
  food: number;
  inLava: boolean;
  onFire: boolean;
  /** Un bloc plein occupe la case de la tête (gravier tombé dessus, éboulement). */
  headBlocked: boolean;
  /** Monstres hostiles proches, du plus proche au plus lointain. */
  hostiles: { name: string; dist: number }[];
  hasWeapon: boolean;
  hasFood: boolean;
  /** Blocs pleins disponibles pour s'abriter. */
  shelterBlocks: number;
};

export type ReflexAction = "escape_fire" | "clear_head" | "eat" | "flee" | "fight" | "shelter" | "none";
export type Reflex = { action: ReflexAction; reason: string };

export const SHELTER_BLOCKS_NEEDED = 13;
const MELEE_RANGE = 7;

export function decideReflex(s: DangerState): Reflex {
  if (s.inLava || s.onFire) return { action: "escape_fire", reason: s.inLava ? "dans la lave" : "en feu" };
  if (s.headBlocked) return { action: "clear_head", reason: "un bloc m'écrase la tête" };

  const near = s.hostiles[0];
  if (near && near.dist <= MELEE_RANGE) {
    if (near.name === "creeper") return { action: "flee", reason: "creeper à proximité" };
    const closeCount = s.hostiles.filter((h) => h.dist <= 10).length;
    if (s.health <= 6) {
      return s.shelterBlocks >= SHELTER_BLOCKS_NEEDED && near.dist > 3
        ? { action: "shelter", reason: `vie basse (${Math.round(s.health)}) face à ${near.name}` }
        : { action: "flee", reason: `vie basse (${Math.round(s.health)}) face à ${near.name}` };
    }
    if (s.hasWeapon && s.health >= 8 && closeCount <= 3) return { action: "fight", reason: `${near.name} à ${near.dist} blocs` };
    if (s.shelterBlocks >= SHELTER_BLOCKS_NEEDED && near.dist > 3) return { action: "shelter", reason: `${closeCount} monstre(s) et pas d'arme` };
    return { action: "flee", reason: `${near.name} à ${near.dist} blocs, pas de quoi me battre` };
  }

  const safe = !near || near.dist > 10;
  if (safe && s.hasFood && (s.food <= 10 || (s.health < 14 && s.food < 18))) {
    return { action: "eat", reason: `faim ${Math.round(s.food)}/20, vie ${Math.round(s.health)}/20` };
  }
  return { action: "none", reason: "" };
}

// ---------------------------------------------------------------- lecture de l'état du bot

const BAD_FOOD = new Set(["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chorus_fruit", "suspicious_stew"]);
const SHELTER_STONE = new Set(["cobblestone", "dirt", "stone", "netherrack", "cobbled_deepslate", "andesite", "diorite", "granite"]);

const edibleFoods = (bot: Bot) =>
  bot.inventory
    .items()
    .filter((i) => bot.registry.foods[i.type] && !BAD_FOOD.has(i.name))
    .sort((a, b) => bot.registry.foods[b.type].foodPoints - bot.registry.foods[a.type].foodPoints);

/** Le plus gros tas de blocs pleins utilisables pour se barricader. */
function shelterStack(bot: Bot) {
  const stacks = bot.inventory.items().filter((i) => SHELTER_STONE.has(i.name) || i.name.endsWith("_planks"));
  const totals = new Map<string, number>();
  for (const s of stacks) totals.set(s.name, (totals.get(s.name) ?? 0) + s.count);
  const best = [...totals].sort((a, b) => b[1] - a[1])[0];
  return best ? { name: best[0], count: best[1] } : null;
}

export function dangerState(bot: Bot): DangerState {
  const feetPos = bot.entity.position.floored();
  const feet = bot.blockAt(feetPos);
  const head = bot.blockAt(feetPos.offset(0, 1, 0));
  const flags = bot.entity.metadata?.[0];
  const burning = (typeof flags === "number" && (flags & 1) === 1) || feet?.name === "fire" || feet?.name === "soul_fire";
  return {
    health: bot.health,
    food: bot.food,
    inLava: feet?.name === "lava" || head?.name === "lava",
    onFire: burning,
    headBlocked: !!head && head.boundingBox === "block" && !bot.isSleeping,
    hostiles: threats(bot, 16).map((e) => ({ name: e.name ?? "?", dist: Math.round(e.position.distanceTo(bot.entity.position)) })),
    hasWeapon: !!(bestTool(bot, "sword") || bestTool(bot, "axe")),
    hasFood: edibleFoods(bot).length > 0,
    shelterBlocks: shelterStack(bot)?.count ?? 0,
  };
}

// ---------------------------------------------------------------- actions de survie

/** Un seul combat/réflexe à la fois : le superviseur et le tool `fight` partagent ce verrou. */
let combatBusy = false;
export const isCombatBusy = () => combatBusy;

const ARMOR_RANK = ["netherite", "diamond", "iron", "chainmail", "golden", "leather", "turtle"];
const ARMOR_SLOTS: [string, "head" | "torso" | "legs" | "feet"][] = [
  ["_helmet", "head"],
  ["_chestplate", "torso"],
  ["_leggings", "legs"],
  ["_boots", "feet"],
];
const rank = (name: string) => {
  const i = ARMOR_RANK.findIndex((r) => name.startsWith(r));
  return i < 0 ? 99 : i;
};

/** Équipe la meilleure armure, un bouclier et la meilleure arme. Renvoie ce qui a été équipé. */
export async function gearUp(bot: Bot): Promise<string> {
  const worn: string[] = [];
  for (const [suffix, slot] of ARMOR_SLOTS) {
    const best = bot.inventory.items().filter((i) => i.name.endsWith(suffix)).sort((a, b) => rank(a.name) - rank(b.name))[0];
    if (!best || bot.inventory.slots[bot.getEquipmentDestSlot(slot)]?.name === best.name) continue;
    try {
      await bot.equip(best, slot);
      worn.push(best.name);
    } catch {
      /* slot occupé par mieux ou erreur réseau : on continue */
    }
  }
  const shield = bot.inventory.items().find((i) => i.name === "shield");
  if (shield && bot.inventory.slots[bot.getEquipmentDestSlot("off-hand")]?.name !== "shield") {
    await bot.equip(shield, "off-hand").then(() => worn.push("shield")).catch(() => {});
  }
  const weapon = bestTool(bot, "sword") ?? bestTool(bot, "axe");
  if (weapon && bot.heldItem?.name !== weapon.name) {
    await bot.equip(weapon, "hand").then(() => worn.push(weapon.name)).catch(() => {});
  }
  return worn.length ? `équipé : ${worn.join(", ")}` : "rien de mieux à équiper";
}

/** Mange la meilleure nourriture ; renvoie le résultat vérifié (faim avant/après). */
export async function eatBest(bot: Bot): Promise<string> {
  if (bot.food >= 20) return "Je n'ai pas faim (20/20).";
  const foods = edibleFoods(bot);
  if (!foods.length) return "Je n'ai aucune nourriture mangeable. Il faut chasser (look_around montre les animaux) ou récolter.";
  const before = bot.food;
  await bot.equip(foods[0], "hand");
  await bot.consume();
  return bot.food > before
    ? `J'ai mangé ${foods[0].name} : faim ${Math.round(before)} -> ${Math.round(bot.food)}.`
    : `Échec : ma faim n'a pas changé (${Math.round(bot.food)}/20).`;
}

/** Quitte la lave/le feu : va vers l'eau si on brûle, sinon vers la case sûre la plus proche. */
export async function escapeFire(bot: Bot): Promise<string> {
  const me = bot.entity.position.floored();
  const name = (p: V3) => bot.blockAt(p)?.name;
  const nextToLava = (p: V3) =>
    [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].some(([x, y, z]) => name(p.offset(x, y, z)) === "lava");

  let best: { p: V3; score: number } | null = null;
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      for (let dy = -2; dy <= 2; dy++) {
        const p = me.offset(dx, dy, dz);
        const feet = name(p);
        const floor = bot.blockAt(p.offset(0, -1, 0));
        const safeAir = feet === "air" && name(p.offset(0, 1, 0)) === "air" && floor?.boundingBox === "block" && floor.name !== "lava";
        const water = feet === "water" && name(p.offset(0, 1, 0)) !== "lava";
        if ((!safeAir && !water) || nextToLava(p)) continue;
        const score = Math.hypot(dx, dy, dz) - (water ? 3 : 0);
        if (!best || score < best.score) best = { p, score };
      }
    }
  }
  if (!best) return "Échec : aucune case sûre trouvée autour de moi.";

  bot.setControlState("jump", true);
  try {
    await goto(bot, new goals.GoalBlock(best.p.x, best.p.y, best.p.z), 6000);
  } catch {
    // Pathfinder en difficulté dans la lave : on avance à la main vers la case.
    await bot.lookAt(best.p.offset(0.5, 0.5, 0.5), true);
    bot.setControlState("forward", true);
    await sleep(1500);
    bot.setControlState("forward", false);
  } finally {
    bot.setControlState("jump", false);
  }
  const now = bot.entity.position.floored();
  const stillBad = bot.blockAt(now)?.name === "lava";
  return stillBad ? "Échec : toujours dans la lave." : `Sorti du danger en ${now.x}, ${now.y}, ${now.z} (vie ${Math.round(bot.health)}/20).`;
}

/** Retire le bloc qui écrase la tête (gravier, sable) ; équipe une pelle si possible. */
export async function clearHead(bot: Bot): Promise<string> {
  let cleared = 0;
  for (let i = 0; i < 4; i++) {
    const head = bot.blockAt(bot.entity.position.floored().offset(0, 1, 0));
    if (!head || head.boundingBox !== "block") break;
    const shovel = bestTool(bot, "shovel");
    if (shovel && ["gravel", "sand", "red_sand", "dirt"].includes(head.name)) await bot.equip(shovel, "hand").catch(() => {});
    try {
      await bot.dig(head);
      cleared++;
    } catch {
      break;
    }
    await sleep(250);
  }
  return cleared ? `Dégagé ${cleared} bloc(s) au-dessus de ma tête.` : "Échec : impossible de dégager le bloc sur ma tête.";
}

/** Fuit les monstres les plus proches (jusqu'à ~16 blocs), puis s'arrête. */
export async function flee(bot: Bot, maxMs = 6000): Promise<string> {
  const target = threats(bot, 20)[0];
  if (!target) return "Rien à fuir.";
  const name = target.name ?? "monstre";
  try {
    await goto(bot, new goals.GoalInvert(new goals.GoalFollow(target, 16)), maxMs);
  } catch {
    /* interrompu au bout du délai : normal */
  }
  const left = threats(bot, 20)[0];
  return left && left.position.distanceTo(bot.entity.position) < 6
    ? `Échec : ${name} me suit encore (à ${Math.round(left.position.distanceTo(bot.entity.position))} blocs). Vie ${Math.round(bot.health)}/20.`
    : `Je me suis éloigné de ${name} (vie ${Math.round(bot.health)}/20).`;
}

/** Combat au corps à corps contre les monstres proches ; se retire si la vie devient trop basse. */
export async function fight(bot: Bot, maxMs = 25_000): Promise<string> {
  if (combatBusy) return "Échec : un combat est déjà en cours.";
  combatBusy = true;
  const gear = await gearUp(bot).catch(() => "");
  const startHealth = bot.health;
  const killed = new Set<number>();
  const started = Date.now();
  let lastSwing = 0;
  let outcome = "plus de monstre";
  try {
    while (Date.now() - started < maxMs) {
      const target = threats(bot, 10)[0];
      if (!target) break;
      if (bot.health <= 6) {
        outcome = `retrait, vie trop basse (${Math.round(bot.health)})`;
        break;
      }
      const id = target.id;
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 1.5), true);
      const d = target.position.distanceTo(bot.entity.position);
      const weapon = bot.heldItem?.name ?? "";
      const cooldown = weapon.endsWith("_axe") ? 1000 : weapon.endsWith("_sword") ? 650 : 500;
      if (d <= 3.1 && Date.now() - lastSwing >= cooldown) {
        await bot.lookAt(target.position.offset(0, target.height * 0.8, 0), true);
        bot.attack(target);
        lastSwing = Date.now();
      }
      await sleep(120);
      if (!bot.entities[id]) killed.add(id);
    }
    if (Date.now() - started >= maxMs) outcome = "temps écoulé";
  } finally {
    bot.pathfinder.setGoal(null);
    combatBusy = false;
  }
  return `Combat (${gear}) : ${killed.size} monstre(s) éliminé(s), ${outcome}. Vie ${Math.round(startHealth)} -> ${Math.round(bot.health)}/20.`;
}

/** Se barricade : 13 blocs autour de soi (4 côtés sur 2 de haut, puis un toit). Pour sortir : casser un bloc de l'abri. */
export async function shelter(bot: Bot): Promise<string> {
  const stack = shelterStack(bot);
  if (!stack || stack.count < SHELTER_BLOCKS_NEEDED) {
    return `Échec : il me faut ${SHELTER_BLOCKS_NEEDED} blocs pleins (cobblestone, dirt, planches...) pour m'abriter, j'en ai ${stack?.count ?? 0}.`;
  }
  const me = bot.entity.position.floored();
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Ordre important : chaque bloc s'appuie sur le précédent (côtés bas, côtés hauts, anneau du toit, puis le centre).
  const cells = [
    ...dirs.map(([x, z]) => me.offset(x, 0, z)),
    ...dirs.map(([x, z]) => me.offset(x, 1, z)),
    ...dirs.map(([x, z]) => me.offset(x, 2, z)),
    me.offset(0, 2, 0),
  ];
  for (const cell of cells) {
    if (bot.blockAt(cell)?.boundingBox === "block") continue;
    await placeAt(bot, stack.name, cell);
  }
  const sealed = cells.filter((c) => bot.blockAt(c)?.boundingBox === "block").length;
  return sealed === cells.length
    ? `À l'abri : ${stack.name} posé tout autour de moi en ${me.x}, ${me.y}, ${me.z}. Pour sortir, casse un bloc de l'abri (collect_block).`
    : `Échec partiel : abri incomplet (${sealed}/${cells.length} blocs posés).`;
}

// ---------------------------------------------------------------- superviseur

const COOLDOWN_MS: Record<ReflexAction, number> = { escape_fire: 1500, clear_head: 1500, eat: 8000, flee: 4000, fight: 3000, shelter: 20_000, none: 0 };

export type SurvivalHooks = {
  /** Appelé AVANT un réflexe : l'agent doit lâcher ce qu'il fait (tools interrompus). */
  onDanger(reflex: Reflex): void;
  /** Appelé APRÈS un réflexe, avec son résultat vérifié. */
  onReflex(reflex: Reflex, result: string): void;
  /** Ne rien faire quand c'est faux (ex: pendant un sommeil, une construction). */
  enabled?: () => boolean;
};

async function perform(bot: Bot, reflex: Reflex): Promise<string> {
  switch (reflex.action) {
    case "escape_fire":
      return escapeFire(bot);
    case "clear_head":
      return clearHead(bot);
    case "eat":
      return eatBest(bot);
    case "flee":
      return flee(bot);
    case "fight":
      return fight(bot);
    case "shelter":
      return shelter(bot);
    default:
      return "";
  }
}

/** Surveille le bot toutes les 500 ms et déclenche le réflexe adapté. Renvoie la fonction d'arrêt. */
export function startSurvival(bot: Bot, hooks: SurvivalHooks): () => void {
  let reacting = false;
  const last: Partial<Record<ReflexAction, number>> = {};
  const timer = setInterval(async () => {
    if (reacting || combatBusy || !bot.entity || bot.isSleeping || hooks.enabled?.() === false) return;
    const reflex = decideReflex(dangerState(bot));
    if (reflex.action === "none") return;
    const now = Date.now();
    if (now - (last[reflex.action] ?? 0) < COOLDOWN_MS[reflex.action]) return;
    last[reflex.action] = now;

    reacting = true;
    hooks.onDanger(reflex);
    bot.pathfinder.stop();
    try {
      hooks.onReflex(reflex, await perform(bot, reflex));
    } catch (err) {
      hooks.onReflex(reflex, `Erreur: ${(err as Error).message}`);
    } finally {
      reacting = false;
    }
  }, 500);
  return () => clearInterval(timer);
}
