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
  /** Emprise (x, z) : la structure s'étend vers +x et +z depuis le point décalé de BLUEPRINT_OFFSET. */
  footprint: { x: number; z: number };
  /** Blocs occupés au-dessus du sol (toit compris) et sous le sol (fondation/sol posé en y-1). */
  height: number;
  below: number;
};

/** Décalage devant/à droite du bot, pour ne pas l'emmurer (doit correspondre à `positioned ~2 ~ ~2` du datapack). */
export const BLUEPRINT_OFFSET = 2;

/** Parallélépipède (coordonnées de blocs, bornes incluses) occupé par un blueprint lancé depuis `pos`. */
export function footprintBox(bp: Blueprint, pos: { x: number; y: number; z: number }) {
  const x0 = Math.floor(pos.x + BLUEPRINT_OFFSET);
  const y0 = Math.floor(pos.y);
  const z0 = Math.floor(pos.z + BLUEPRINT_OFFSET);
  return {
    min: { x: x0, y: y0 - bp.below, z: z0 },
    max: { x: x0 + bp.footprint.x - 1, y: y0 + bp.height - 1, z: z0 + bp.footprint.z - 1 },
  };
}

export const BLUEPRINTS: Record<string, Blueprint> = {
  chicken_farm: {
    name: "chicken_farm",
    description:
      "Enclos 5x5 clôturé avec sol en planches, 2 bottes de foin, un portillon, et 3 poules (nées des œufs). Se construit dans le bois choisi.",
    fn: "companion:build/chicken_farm",
    materials: { "{planks}": 25, "{fence}": 15, "{gate}": 1, hay_block: 2, egg: 3 },
    params: ["wood"],
    footprint: { x: 5, z: 5 },
    height: 3,
    below: 1,
  },
  cabin: {
    name: "cabin",
    description:
      "Cabane 10x15, intérieur de 3 blocs de haut où l'on peut marcher. Sol en planches du bois choisi (wood), murs et toit en planches/bûches de n'importe quel bois ou en pierre (wall), une porte, " +
      "et 4 torches murales si tu en as au moins 4 (facultatif). Coûteuse : 288 blocs de mur, 150 planches de sol.",
    fn: "companion:build/cabin",
    materials: { "{wall}": 288, "{planks}": 150, "{door}": 1 },
    params: ["wall", "wood"],
    footprint: { x: 10, z: 15 },
    height: 4,
    below: 1,
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

/**
 * Arguments de macro pour `/function ... {k:"v",...}`. Valeurs déjà validées (listes fermées).
 * `needs` (coûts par item, après fusion) donne les seuils de vérification `wallN`, `planksN`... :
 * si deux gabarits sont le même item (mur en planches = sol en planches), le seuil est la somme.
 */
export function macroArgs(params: ResolvedParams, needs: Record<string, number> = {}): string {
  const { wall, planks, fence, gate, door } = params;
  const n = (item: string) => needs[item] ?? 0;
  return (
    `{wall:"${wall}",planks:"${planks}",fence:"${fence}",gate:"${gate}",door:"${door}",` +
    `wallN:${n(wall)},planksN:${n(planks)},fenceN:${n(fence)},gateN:${n(gate)},doorN:${n(door)}}`
  );
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
