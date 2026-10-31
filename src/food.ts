import minecraftData from "minecraft-data";

/**
 * Alimentation (spec 002, tranche 1) : PUR, sans Mineflayer ni LLM.
 * Classe chaque aliment du jeu, choisit quoi manger par une règle prévisible, calcule le stock de nourriture,
 * et exécute un repas VÉRIFIÉ (faim avant/après, avec attente de la mise à jour du serveur) via des actions injectées.
 */

export type FoodCategory = "safe" | "fallback" | "harmful" | "precious";
export type FoodInfo = { name: string; points: number; saturation: number };
/** Tous les aliments du registre, par nom. */
export type FoodDb = Record<string, FoodInfo>;

export function createFoodDb(version: string): FoodDb {
  const d = minecraftData(version);
  return Object.fromEntries(d.foodsArray.map((f: any) => [f.name, { name: f.name, points: f.foodPoints, saturation: f.saturation }]));
}

/** Depuis le registre d'un bot Mineflayer (même source de vérité que minecraft-data). */
export function foodDbFromRegistry(reg: { foodsArray: { name: string; foodPoints: number; saturation: number }[] }): FoodDb {
  return Object.fromEntries(reg.foodsArray.map((f) => [f.name, { name: f.name, points: f.foodPoints, saturation: f.saturation }]));
}

// ---------------------------------------------------------------- classification (listes fermées)

/** Nuisibles : poison, effets négatifs ou mauvais présage. Jamais mangés. */
export const HARMFUL = new Set(["spider_eye", "poisonous_potato", "pufferfish", "chorus_fruit", "suspicious_stew", "ominous_bottle"]);
/** De secours : crus ou peu appétissants, mangés seulement quand on a vraiment faim et rien d'autre. */
export const FALLBACK = new Set(["rotten_flesh", "beef", "porkchop", "chicken", "mutton", "rabbit", "cod", "salmon", "tropical_fish"]);
/** Précieux : gardés pour les urgences de santé. */
export const PRECIOUS = new Set(["golden_apple", "enchanted_golden_apple", "golden_carrot"]);

export function classify(name: string): FoodCategory {
  if (HARMFUL.has(name)) return "harmful";
  if (PRECIOUS.has(name)) return "precious";
  if (FALLBACK.has(name)) return "fallback";
  return "safe";
}
export const isCooked = (name: string) => name.startsWith("cooked_") || name === "baked_potato" || name === "bread";

// ---------------------------------------------------------------- seuils (valeurs de départ, à calibrer avec les traces)

export const THRESHOLDS = {
  /** Stock de nourriture visé (points de faim restaurables, ≈ 5 steaks). */
  safeStock: 40,
  /** Repas automatique du réflexe de faim. */
  eatBelow: 10,
  /** Approvisionnement quand le stock est sous `safeStock` et la faim sous ce seuil. */
  resupplyBelowFood: 14,
  /** Sous ce niveau, les aliments de secours sont acceptés. */
  criticalFood: 6,
  /** Sous cette vie, un aliment précieux (pomme dorée...) est autorisé. */
  urgentHealth: 8,
  maxFood: 20,
};

export type Urgency = { food: number; health: number };
export type Inventory = Map<string, number>;

// ---------------------------------------------------------------- stock

export type Stock = {
  /** Points de faim restaurables : sûrs + de secours (nuisibles et précieux exclus). */
  total: number;
  byCategory: Record<FoodCategory, number>;
  items: Record<string, number>;
};

export function foodStock(inventory: Inventory, db: FoodDb): Stock {
  const byCategory: Record<FoodCategory, number> = { safe: 0, fallback: 0, harmful: 0, precious: 0 };
  const items: Record<string, number> = {};
  for (const [name, n] of inventory) {
    const f = db[name];
    if (!f || n <= 0) continue;
    items[name] = n;
    byCategory[classify(name)] += f.points * n;
  }
  return { total: byCategory.safe + byCategory.fallback, byCategory, items };
}

export function needsResupply(stock: Stock, urgency: Urgency, plannedTrip = false): boolean {
  if (stock.total >= THRESHOLDS.safeStock) return false;
  return plannedTrip || urgency.food <= THRESHOLDS.resupplyBelowFood;
}

// ---------------------------------------------------------------- choix du repas

export type MealChoice =
  | { item: string }
  | { refusal: "full" | "none" | "only_harmful" | "only_precious_not_urgent"; detail: string };

/**
 * Règle (déterministe) : sûr cuit > sûr > de secours (faim ≤ 6 seulement) ; précieux seulement si la vie est basse ;
 * nuisible jamais. Dans le palier retenu : le plus petit aliment qui comble le déficit (pas de gaspillage),
 * à défaut le plus nourrissant ; départage par saturation puis par nom.
 */
export function chooseMeal(inventory: Inventory, urgency: Urgency, db: FoodDb): MealChoice {
  const have = [...inventory].filter(([n, c]) => c > 0 && db[n]).map(([n]) => db[n]);
  const urgentHealth = urgency.health <= THRESHOLDS.urgentHealth;
  if (!have.length) return { refusal: "none", detail: "Aucun aliment mangeable dans mon inventaire." };
  if (urgency.food >= THRESHOLDS.maxFood && !(urgentHealth && have.some((f) => classify(f.name) === "precious"))) {
    return { refusal: "full", detail: `Je n'ai pas faim (${Math.round(urgency.food)}/${THRESHOLDS.maxFood}).` };
  }

  const tiers: FoodInfo[][] = [
    have.filter((f) => classify(f.name) === "safe" && isCooked(f.name)),
    have.filter((f) => classify(f.name) === "safe" && !isCooked(f.name)),
    urgency.food <= THRESHOLDS.criticalFood ? have.filter((f) => classify(f.name) === "fallback") : [],
    urgentHealth ? have.filter((f) => classify(f.name) === "precious") : [],
  ];
  const tier = tiers.find((t) => t.length);
  if (!tier) {
    if (have.every((f) => classify(f.name) === "harmful")) return { refusal: "only_harmful", detail: "Impossible : tout ce que j'ai est nuisible (poison, effets négatifs)." };
    return { refusal: "only_precious_not_urgent", detail: "Impossible : il ne me reste que des aliments précieux ou de secours, gardés pour les urgences (faim critique ou vie basse)." };
  }
  const deficit = THRESHOLDS.maxFood - urgency.food;
  const fits = tier.filter((f) => f.points >= deficit);
  const pool = fits.length ? fits : tier;
  const sorted = [...pool].sort((a, b) =>
    fits.length
      ? a.points - b.points || b.saturation - a.saturation || a.name.localeCompare(b.name)
      : b.points - a.points || b.saturation - a.saturation || a.name.localeCompare(b.name),
  );
  return { item: sorted[0].name };
}

// ---------------------------------------------------------------- repas vérifié

export interface MealActions {
  inventory(): Inventory;
  food(): number;
  health(): number;
  /** Équipe l'aliment et le consomme. Peut lever une exception (serveur lent, aliment retiré...). */
  consume(item: string): Promise<void>;
  /** Attend que la faim change (≤ 1,5 s en jeu) ; renvoie vrai si elle a changé. */
  waitFoodChange(before: number): Promise<boolean>;
}

export const MAX_MEAL_ATTEMPTS = 2;

/**
 * Mange (l'aliment demandé, sinon le meilleur) et PROUVE le résultat par la faim mesurée après l'attente de la mise à jour.
 * Les refus donnent la vraie raison (jamais « mon outil ne permet pas »). Au plus 2 essais, avec un autre aliment au second.
 */
export async function eatMeal(a: MealActions, db: FoodDb, requested?: string): Promise<string> {
  const urgency = (): Urgency => ({ food: a.food(), health: a.health() });
  const tried = new Set<string>();

  if (requested) {
    const name = requested.trim().toLowerCase().replace(/\s+/g, "_");
    if (!db[name]) return `Impossible : "${requested}" n'est pas un aliment.`;
    if ((a.inventory().get(name) ?? 0) < 1) return `Je n'ai pas de ${name}.`;
    const cat = classify(name);
    if (cat === "harmful") return `Impossible : ${name} est nuisible (poison ou effets négatifs).`;
    if (cat === "precious" && urgency().health > THRESHOLDS.urgentHealth) return `Impossible : ${name} est un aliment précieux réservé aux urgences (vie ≤ ${THRESHOLDS.urgentHealth}).`;
    if (urgency().food >= THRESHOLDS.maxFood && !(cat === "precious")) return `Je n'ai pas faim (${Math.round(urgency().food)}/${THRESHOLDS.maxFood}).`;
  }

  let last = "";
  for (let attempt = 0; attempt < MAX_MEAL_ATTEMPTS; attempt++) {
    let item: string;
    if (requested && attempt === 0) item = requested.trim().toLowerCase().replace(/\s+/g, "_");
    else {
      const inv = new Map([...a.inventory()].filter(([n]) => !tried.has(n)));
      const choice = chooseMeal(inv, urgency(), db);
      if (!("item" in choice)) return attempt === 0 ? choice.detail : `Échec : ma faim n'a pas changé après ${attempt} essai(s) (${last}) et je n'ai plus d'autre aliment.`;
      item = choice.item;
    }
    tried.add(item);
    const before = a.food();
    try {
      await a.consume(item);
    } catch (err) {
      last = `${item} : ${(err as Error).message}`;
      continue;
    }
    await a.waitFoodChange(before);
    const after = a.food();
    if (after > before) return `J'ai mangé ${item} : faim ${Math.round(before)} -> ${Math.round(after)}.`;
    last = `${item} : faim inchangée à ${Math.round(after)}`;
  }
  return `Échec : ma faim n'a pas changé après ${MAX_MEAL_ATTEMPTS} essais (${last}).`;
}

// ---------------------------------------------------------------- texte pour le modèle

const list = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} x${v}`).join(", ");

export function formatFoodStatus(food: number, inventory: Inventory, db: FoodDb): string {
  const stock = foodStock(inventory, db);
  const pick = (cat: FoodCategory) => Object.fromEntries(Object.entries(stock.items).filter(([n]) => classify(n) === cat));
  const usable = { ...pick("safe"), ...pick("fallback") };
  const precious = pick("precious");
  const harmful = pick("harmful");
  return [
    `Faim ${Math.round(food)}/${THRESHOLDS.maxFood}.`,
    `Stock: ${stock.total}/${THRESHOLDS.safeStock} pts (${list(usable) || "aucun aliment"}).`,
    Object.keys(precious).length ? `Réserve d'urgence: ${list(precious)}.` : "",
    Object.keys(harmful).length ? `Nuisible: ${list(harmful)} (ignoré).` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
