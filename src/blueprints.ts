/**
 * Registre des constructions. Les coûts ici DOIVENT correspondre aux `clear`
 * des fonctions du datapack (datapack/companion/data/companion/function/build/).
 * Le TS vérifie l'inventaire, le datapack le revérifie (défense en profondeur).
 */
export type Blueprint = {
  name: string;
  description: string;
  /** Identifiant de la fonction datapack à lancer. */
  fn: string;
  /** Matériaux consommés (nom d'item sans "minecraft:"). */
  materials: Record<string, number>;
  /** Emprise approximative, pour que l'agent choisisse un endroit dégagé. */
  footprint: { x: number; z: number };
};

export const BLUEPRINTS: Record<string, Blueprint> = {
  chicken_farm: {
    name: "chicken_farm",
    description:
      "Enclos 5x5 clôturé avec sol en planches, 2 bottes de foin, un portillon, et 3 poules (nées des œufs).",
    fn: "companion:build/chicken_farm",
    materials: { oak_planks: 25, oak_fence: 15, oak_fence_gate: 1, hay_block: 2, egg: 3 },
    footprint: { x: 5, z: 5 },
  },
  cabin: {
    name: "cabin",
    description: "Petite cabane 5x5x3 en planches avec une porte et une torche.",
    fn: "companion:build/cabin",
    materials: { oak_planks: 66, oak_door: 1, torch: 1 },
    footprint: { x: 5, z: 5 },
  },
};

export function missingMaterials(
  blueprint: Blueprint,
  have: (item: string) => number,
): Record<string, number> {
  const missing: Record<string, number> = {};
  for (const [item, need] of Object.entries(blueprint.materials)) {
    const lack = need - have(item);
    if (lack > 0) missing[item] = lack;
  }
  return missing;
}
