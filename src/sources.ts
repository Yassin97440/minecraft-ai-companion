import { WOODS } from "./materials.js";

/**
 * Tables FERMÉES du planificateur (spec 001) : tout ce qui n'est pas ici est refusé, jamais deviné par le modèle.
 * Les recettes de fabrication, elles, viennent de `minecraft-data` ; les tables ci-dessous couvrent ce que le registre
 * ne dit pas : d'où vient une ressource brute, la fonte, le combustible, ce qui est hors périmètre.
 */

/** Ressource brute -> blocs à casser pour l'obtenir. L'outil minimal est lu dans le registre, pas ici. */
export const RAW_SOURCES: Record<string, string[]> = {
  ...Object.fromEntries(
    WOODS.filter((w) => w !== "bamboo" && w !== "crimson" && w !== "warped").map((w) => [`${w}_log`, [`${w}_log`]]),
  ),
  cobblestone: ["stone", "cobblestone"],
  cobbled_deepslate: ["deepslate"],
  coal: ["coal_ore", "deepslate_coal_ore"],
  raw_iron: ["iron_ore", "deepslate_iron_ore"],
  raw_copper: ["copper_ore", "deepslate_copper_ore"],
  raw_gold: ["gold_ore", "deepslate_gold_ore"],
  diamond: ["diamond_ore", "deepslate_diamond_ore"],
  redstone: ["redstone_ore", "deepslate_redstone_ore"],
  lapis_lazuli: ["lapis_ore", "deepslate_lapis_ore"],
  sand: ["sand"],
  gravel: ["gravel"],
  dirt: ["dirt"],
  clay_ball: ["clay"],
};

/** Fonte : produit cuit -> ingrédient cru (un pour un). */
export const SMELTING: Record<string, string> = {
  iron_ingot: "raw_iron",
  copper_ingot: "raw_copper",
  gold_ingot: "raw_gold",
  glass: "sand",
  stone: "cobblestone",
  brick: "clay_ball",
};

/** Combustibles par ordre de préférence : nombre d'objets cuits par unité. */
export const FUELS: { item: string; smelts: number }[] = [
  { item: "coal", smelts: 8 },
  { item: "charcoal", smelts: 8 },
  ...WOODS.filter((w) => w === "oak" || w === "spruce" || w === "birch").map((w) => ({ item: `${w}_planks`, smelts: 1.5 })),
  ...WOODS.filter((w) => w === "oak" || w === "spruce" || w === "birch").map((w) => ({ item: `${w}_log`, smelts: 1.5 })),
];
/** Ce qu'on récolte quand aucun combustible n'est possédé. */
export const DEFAULT_FUEL = "coal";

/** Exige le Nether ou l'End (ou un boss) : refusé tant que la capacité 004 n'a pas ces paliers. */
const OUT_OF_SCOPE_PREFIX = ["nether_", "netherite_", "ender_", "end_", "dragon_", "shulker_", "blaze_", "ghast_", "wither_"];
const OUT_OF_SCOPE_EXACT = new Set(["quartz", "ancient_debris", "elytra", "nautilus_shell", "heart_of_the_sea", "totem_of_undying", "beacon", "trident"]);
export function isOutOfScope(item: string): boolean {
  return OUT_OF_SCOPE_EXACT.has(item) || OUT_OF_SCOPE_PREFIX.some((p) => item.startsWith(p));
}

/**
 * Préférence de matériau quand plusieurs recettes coûtent autant (le registre les liste dans un ordre arbitraire :
 * pale_oak, cherry... en premier). Les premiers sont les plus courants dans le monde.
 */
export const MATERIAL_PREFERENCE = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "cobblestone", "cobbled_deepslate", "blackstone"];

export const TIERS = ["wooden", "stone", "iron", "diamond", "netherite"] as const;
export type Tier = (typeof TIERS)[number];

/** Plafonds de quantité par demande. */
export const MAX_BULK = 256; // blocs et ressources brutes
export const MAX_ITEMS = 64; // le reste
