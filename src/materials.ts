/**
 * Matériaux de construction autorisés. Tout ce qui arrive du modèle est validé ici avant
 * d'être injecté dans la commande `/function ... {macro args}` : liste fermée = pas d'injection.
 */

/** Familles de bois qui ont planches, bûche, clôture, portillon et porte. */
export const WOODS = [
  "oak",
  "spruce",
  "birch",
  "jungle",
  "acacia",
  "dark_oak",
  "mangrove",
  "cherry",
  "bamboo",
  "crimson",
  "warped",
] as const;
export type Wood = (typeof WOODS)[number];

const STONES = [
  "cobblestone",
  "mossy_cobblestone",
  "stone",
  "smooth_stone",
  "stone_bricks",
  "mossy_stone_bricks",
  "cobbled_deepslate",
  "deepslate_bricks",
  "deepslate_tiles",
  "andesite",
  "polished_andesite",
  "diorite",
  "polished_diorite",
  "granite",
  "polished_granite",
  "blackstone",
  "polished_blackstone_bricks",
  "bricks",
  "mud_bricks",
  "sandstone",
  "smooth_sandstone",
  "red_sandstone",
  "smooth_red_sandstone",
  "terracotta",
];

/** Blocs pleins acceptés pour les murs : planches et bûches de tous les bois + pierres. */
export const WALL_BLOCKS: readonly string[] = [
  ...WOODS.map((w) => `${w}_planks`),
  ...WOODS.filter((w) => w !== "bamboo").map((w) => (w === "crimson" || w === "warped" ? `${w}_stem` : `${w}_log`)),
  ...STONES,
];

export function isWood(name: string): name is Wood {
  return (WOODS as readonly string[]).includes(name);
}

export function isWallBlock(name: string): boolean {
  return WALL_BLOCKS.includes(name);
}

/** Pièces dérivées d'un bois, nommées comme les clés de macro du datapack. */
export function woodParts(wood: Wood) {
  return {
    planks: `${wood}_planks`,
    fence: `${wood}_fence`,
    gate: `${wood}_fence_gate`,
    door: `${wood}_door`,
  };
}

/** Le bois dont on possède le plus de planches (chêne si on n'a rien). */
export function bestWood(have: (item: string) => number): Wood {
  let best: Wood = "oak";
  let bestCount = 0;
  for (const w of WOODS) {
    const n = have(`${w}_planks`);
    if (n > bestCount) {
      best = w;
      bestCount = n;
    }
  }
  return best;
}
