/**
 * Faux monde Minecraft : un état en mémoire, déterministe, sans serveur ni Mineflayer.
 * Il ne simule pas la physique : il simule les CONSÉQUENCES des actions (inventaire, position, ressources),
 * assez pour que les tools vérifient leurs effets comme les vrais et que les scénarios aient quelque chose à mesurer.
 */

export type P = { x: number; y: number; z: number };

export type WorldSetup = {
  pos?: P;
  health?: number;
  food?: number;
  /** Heure Minecraft (0-24000) : 13000-23000 = nuit. */
  time?: number;
  inventory?: Record<string, number>;
  /** Blocs récoltables ; chacun donne un objet selon `DROPS`. */
  blocks?: { name: string; pos: P }[];
  /** Objets au sol (ex: affaires tombées à la mort). */
  drops?: { name: string; count: number; pos: P }[];
  hostiles?: { name: string; pos: P }[];
  bed?: P;
};

/** Objet obtenu en cassant un bloc, et outil minimal requis. */
export const DROPS: Record<string, { item: string; needs?: string[] }> = {
  oak_log: { item: "oak_log" },
  stone: { item: "cobblestone", needs: ["wooden_pickaxe", "stone_pickaxe", "iron_pickaxe"] },
  coal_ore: { item: "coal", needs: ["wooden_pickaxe", "stone_pickaxe", "iron_pickaxe"] },
  iron_ore: { item: "raw_iron", needs: ["stone_pickaxe", "iron_pickaxe"] },
  chest: { item: "chest" },
};

export const FOODS: Record<string, number> = { bread: 5, cooked_beef: 8, apple: 4 };

type Recipe = { out: string; yields: number; needs: Record<string, number>; table?: boolean };
export const RECIPES: Record<string, Recipe> = {
  oak_planks: { out: "oak_planks", yields: 4, needs: { oak_log: 1 } },
  stick: { out: "stick", yields: 4, needs: { oak_planks: 2 } },
  crafting_table: { out: "crafting_table", yields: 1, needs: { oak_planks: 4 } },
  wooden_pickaxe: { out: "wooden_pickaxe", yields: 1, needs: { oak_planks: 3, stick: 2 }, table: true },
  stone_pickaxe: { out: "stone_pickaxe", yields: 1, needs: { cobblestone: 3, stick: 2 }, table: true },
  torch: { out: "torch", yields: 4, needs: { coal: 1, stick: 1 } },
};

export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const fmt = (p: P) => `${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}`;

export class FakeWorld {
  pos: P;
  health: number;
  food: number;
  time: number;
  inventory = new Map<string, number>();
  blocks: { name: string; pos: P }[];
  drops: { name: string; count: number; pos: P }[];
  hostiles: { name: string; pos: P }[];
  bed?: P;
  tablePlaced = false;
  /** Tout ce que le compagnon a dit dans le chat. */
  said: string[] = [];

  constructor(setup: WorldSetup = {}) {
    this.pos = { ...(setup.pos ?? { x: 0, y: 64, z: 0 }) };
    this.health = setup.health ?? 20;
    this.food = setup.food ?? 20;
    this.time = setup.time ?? 1000;
    for (const [k, v] of Object.entries(setup.inventory ?? {})) this.inventory.set(k, v);
    this.blocks = (setup.blocks ?? []).map((b) => ({ ...b, pos: { ...b.pos } }));
    this.drops = (setup.drops ?? []).map((d) => ({ ...d, pos: { ...d.pos } }));
    this.hostiles = (setup.hostiles ?? []).map((h) => ({ ...h, pos: { ...h.pos } }));
    this.bed = setup.bed && { ...setup.bed };
  }

  count = (item: string) => this.inventory.get(item) ?? 0;
  add(item: string, n: number) {
    const next = this.count(item) + n;
    if (next <= 0) this.inventory.delete(item);
    else this.inventory.set(item, next);
  }
  isNight = () => this.time >= 13000 && this.time < 23000;
  hasAny = (items: string[]) => items.some((i) => this.count(i) > 0);

  nearest(name: string, maxDistance: number) {
    return this.blocks
      .filter((b) => b.name === name && dist(b.pos, this.pos) <= maxDistance)
      .sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
  }

  inventoryText() {
    return [...this.inventory].map(([n, c]) => `${n} x${c}`).join(", ") || "vide";
  }

  /** Équivalent de `snapshot()` : la perception injectée à chaque décision. */
  snapshot() {
    const nearHostiles = this.hostiles.filter((h) => dist(h.pos, this.pos) <= 16).map((h) => `${h.name} à ${Math.round(dist(h.pos, this.pos))}`);
    return [
      `Position: ${fmt(this.pos)} | vie ${this.health}/20 | faim ${this.food}/20 | ${this.isNight() ? "nuit" : "jour"}`,
      `Menaces: ${nearHostiles.join(", ") || "aucune"}`,
      `Inventaire: ${this.inventoryText()}`,
    ].join("\n");
  }
}
