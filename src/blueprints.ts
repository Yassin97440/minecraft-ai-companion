import { WALL_BLOCKS, WOODS, bestWood, isWallBlock, isWood, woodParts, type Wood } from "./materials.js";

/**
 * Registre des constructions. Les coûts ici DOIVENT correspondre aux `clear`
 * des fonctions du datapack (datapack/companion/data/companion/function/build/).
 * Le TS vérifie l'inventaire, le datapack le revérifie (défense en profondeur).
 *
 * Les matériaux sont des gabarits : `{wall}`, `{planks}`, `{fence}`, `{gate}`, `{door}`
 * sont remplacés par les blocs réels (voir `resolveParams`) puis transmis au datapack
 * comme arguments de macro (`$(wall)`, ...).
 */
export type BlueprintParam = "wood" | "wall";

export type Blueprint = {
  name: string;
  description: string;
  /** Identifiant de la fonction datapack à lancer. */
  fn: string;
  /** Matériaux consommés (nom d'item sans "minecraft:", ou gabarit `{...}`). */
  materials: Record<string, number>;
  /** Paramètres que le modèle peut choisir. */
  params: BlueprintParam[];
  /** Emprise approximative, pour que l'agent choisisse un endroit dégagé. */
  footprint: { x: number; z: number };
};

export const BLUEPRINTS: Record<string, Blueprint> = {
  chicken_farm: {
    name: "chicken_farm",
    description:
      "Enclos 5x5 clôturé avec sol en planches, 2 bottes de foin, un portillon, et 3 poules (nées des œufs). Se construit dans le bois choisi.",
    fn: "companion:build/chicken_farm",
    materials: { "{planks}": 25, "{fence}": 15, "{gate}": 1, hay_block: 2, egg: 3 },
    params: ["wood"],
    footprint: { x: 5, z: 5 },
  },
  cabin: {
    name: "cabin",
    description:
      "Petite cabane 5x5x3 (murs, sol et toit dans le même bloc) avec une porte en bois et une torche. Murs en planches/bûches de n'importe quel bois ou en pierre.",
    fn: "companion:build/cabin",
    materials: { "{wall}": 66, "{door}": 1, torch: 1 },
    params: ["wall", "wood"],
    footprint: { x: 5, z: 5 },
  },
};

export type ResolvedParams = {
  wood: Wood;
  wall: string;
  planks: string;
  fence: string;
  gate: string;
  door: string;
};

/**
 * Choisit et valide les matériaux. `wood` et `wall` sont facultatifs :
 * - `wall` seul en planches (acacia_planks) => le bois en est déduit (porte assortie) ;
 * - rien => le bois dont on a le plus de planches.
 */
export function resolveParams(
  input: { wood?: string; wall?: string },
  have: (item: string) => number,
): { ok: true; params: ResolvedParams } | { ok: false; error: string } {
  const { wall: wallIn, wood: woodIn } = input;
  if (woodIn !== undefined && !isWood(woodIn)) {
    return { ok: false, error: `Matériau inconnu: bois "${woodIn}". Bois possibles: ${WOODS.join(", ")}.` };
  }
  if (wallIn !== undefined && !isWallBlock(wallIn)) {
    return { ok: false, error: `Matériau inconnu: mur "${wallIn}". Blocs possibles: ${WALL_BLOCKS.join(", ")}.` };
  }

  let wood: Wood;
  if (woodIn !== undefined) wood = woodIn;
  else if (wallIn?.endsWith("_planks") && isWood(wallIn.slice(0, -"_planks".length))) wood = wallIn.slice(0, -"_planks".length) as Wood;
  else wood = bestWood(have);

  const parts = woodParts(wood);
  return { ok: true, params: { wood, wall: wallIn ?? parts.planks, ...parts } };
}

/** Remplace les gabarits `{...}` des matériaux par les blocs choisis. */
export function resolveMaterials(blueprint: Blueprint, params: ResolvedParams): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(blueprint.materials)) {
    const item = key.replace(/^\{(\w+)\}$/, (_, k: keyof ResolvedParams) => params[k]);
    out[item] = (out[item] ?? 0) + n;
  }
  return out;
}

/** Arguments de macro pour `/function ... {k:"v",...}`. Valeurs déjà validées (listes fermées). */
export function macroArgs(params: ResolvedParams): string {
  const { wall, planks, fence, gate, door } = params;
  return `{wall:"${wall}",planks:"${planks}",fence:"${fence}",gate:"${gate}",door:"${door}"}`;
}

export function missingMaterials(
  materials: Record<string, number>,
  have: (item: string) => number,
): Record<string, number> {
  const missing: Record<string, number> = {};
  for (const [item, need] of Object.entries(materials)) {
    const lack = need - have(item);
    if (lack > 0) missing[item] = lack;
  }
  return missing;
}
