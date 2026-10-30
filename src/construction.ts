import { z } from "zod";
import { WALL_BLOCKS, WOODS } from "./materials.js";

/**
 * Langage de construction : le LLM compose un plan (boîtes, blocs, portes) ; ce module le valide
 * de façon déterministe (listes fermées, bornes, coût, "est-ce habitable ?") et le traduit en commandes.
 * Aucune dépendance à Minecraft : tout est testable sans serveur.
 *
 * Repère : x vers l'est, z vers le sud, y vers le haut. y = 0 est le niveau du sol où se tient le bot,
 * y = -1 la rangée du sol posé. L'origine est décalée de 2 blocs vers l'est et le sud du bot.
 */

export const LIMITS = { steps: 40, cells: 2500, dim: 24, height: 16, xzMax: 23, yMin: -4, yMax: 15 } as const;

export const FACINGS = ["north", "south", "east", "west"] as const;
type Facing = (typeof FACINGS)[number];
const DIR: Record<Facing, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const OPPOSITE: Record<Facing, Facing> = { north: "south", south: "north", east: "west", west: "east" };

export const StepSchema = z.object({
  op: z.enum(["box", "clear", "block", "door"]).describe("box = parallélépipède, clear = vider, block = un bloc, door = porte (2 blocs)"),
  from: z.array(z.number().int()).length(3).optional().describe("[x,y,z] premier coin (box, clear)"),
  to: z.array(z.number().int()).length(3).optional().describe("[x,y,z] coin opposé (box, clear)"),
  at: z.array(z.number().int()).length(3).optional().describe("[x,y,z] (block, door : bloc du bas)"),
  block: z.string().optional().describe("Nom du bloc, ex: cobblestone, oak_planks, oak_stairs, glass_pane, oak_door"),
  mode: z.enum(["solid", "hollow", "walls"]).optional().describe("box : solid (plein), hollow (coque), walls (4 murs sans sol ni toit)"),
  facing: z.enum(FACINGS).optional().describe("door : direction vers l'EXTÉRIEUR ; stairs/wall_torch : orientation"),
  state: z.string().optional().describe('États optionnels, ex: "half=top" ou "type=bottom" (clés: facing, half, type, axis, open, hinge)'),
});
export type Step = z.infer<typeof StepSchema>;

export const PlanSchema = z.object({
  name: z.string().min(1).max(60).describe("Nom court de la construction"),
  kind: z.enum(["shelter", "decor"]).optional().describe("shelter (défaut) = bâtiment habitable vérifié ; decor = enclos, tour, pont, sans contrôle d'habitabilité"),
  clear_site: z.boolean().optional().describe("Dégager l'emprise (relief, arbres) avant de construire. Défaut : true"),
  steps: z.array(StepSchema).min(1).max(LIMITS.steps),
});
export type Plan = z.infer<typeof PlanSchema>;

// ---------------------------------------------------------------- blocs autorisés (listes fermées)

const STONE_FAMILIES = [
  "cobblestone", "mossy_cobblestone", "stone", "stone_bricks", "mossy_stone_bricks", "andesite", "diorite", "granite",
  "sandstone", "red_sandstone", "bricks", "mud_bricks", "cobbled_deepslate", "deepslate_bricks", "blackstone", "polished_blackstone_bricks",
];
/** "stone_bricks" => "stone_brick" pour les escaliers, dalles et murets. */
const stem = (n: string) => (n.endsWith("bricks") ? n.slice(0, -1) : n);

export const BUILD_BLOCKS: ReadonlySet<string> = (() => {
  const s = new Set<string>(WALL_BLOCKS);
  for (const w of WOODS) for (const part of ["slab", "stairs", "fence", "fence_gate", "door", "trapdoor"]) s.add(`${w}_${part}`);
  for (const f of STONE_FAMILIES) {
    s.add(`${stem(f)}_stairs`);
    s.add(`${stem(f)}_slab`);
    if (f !== "stone") s.add(`${stem(f)}_wall`);
  }
  for (const extra of ["glass", "glass_pane", "torch", "wall_torch", "lantern", "ladder", "hay_block", "glowstone", "dirt", "crafting_table", "chest", "furnace", "bookshelf", "white_wool"]) {
    s.add(extra);
  }
  return s;
})();

/** Blocs que l'on traverse ou qui ne ferment pas un volume. */
const PASSABLE = new Set(["air", "torch", "wall_torch", "ladder", "lantern"]);
const LIGHTS = new Set(["torch", "wall_torch", "lantern", "glowstone"]);

/** Item consommé pour poser un bloc. */
export const itemFor = (block: string) => (block === "wall_torch" ? "torch" : block);

const STATE_VALUES: Record<string, string[]> = {
  facing: ["north", "south", "east", "west", "up", "down"],
  half: ["top", "bottom"],
  type: ["top", "bottom", "double"],
  axis: ["x", "y", "z"],
  open: ["true", "false"],
  hinge: ["left", "right"],
};

type Vec = [number, number, number];
type Cell = { x: number; y: number; z: number; block: string; facing?: Facing };

function parseState(state: string | undefined, facing?: string): { ok: true; pairs: string[] } | { ok: false; error: string } {
  const pairs: string[] = [];
  if (facing) pairs.push(`facing=${facing}`);
  for (const raw of (state ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const [k, v] = raw.split("=");
    if (!k || v === undefined || !(k in STATE_VALUES) || !STATE_VALUES[k].includes(v)) {
      return { ok: false, error: `état invalide "${raw}" (clés possibles: ${Object.keys(STATE_VALUES).join(", ")})` };
    }
    if (k === "facing" && facing) continue;
    pairs.push(`${k}=${v}`);
  }
  return { ok: true, pairs };
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

export type Validation = {
  errors: string[];
  warnings: string[];
  cost: Record<string, number>;
  cells: number;
  bbox: { min: Vec; max: Vec } | null;
  /** Voxels attendus après construction (bloc par position), "air" = vidé volontairement. */
  grid: Map<string, string>;
};

type Expanded = { place: Cell[]; air: Cell[]; cost: Record<string, number>; door?: { x: number; y: number; z: number; facing: Facing } };

function expand(step: Step, i: number, errors: string[]): Expanded | null {
  const tag = `Étape ${i + 1} (${step.op})`;
  const fail = (msg: string) => (errors.push(`${tag} : ${msg}`), null);
  const vec = (v: number[] | undefined, name: string): Vec | null => {
    if (!v || v.length !== 3) return fail(`"${name}" doit être [x,y,z]`);
    const [x, y, z] = v;
    if (!inRange(x, 0, LIMITS.xzMax) || !inRange(z, 0, LIMITS.xzMax) || !inRange(y, LIMITS.yMin, LIMITS.yMax)) {
      return fail(`${name}=[${v.join(",")}] hors limites (x,z entre 0 et ${LIMITS.xzMax} ; y entre ${LIMITS.yMin} et ${LIMITS.yMax})`);
    }
    return [x, y, z];
  };

  if (step.op === "clear") {
    const a = vec(step.from, "from");
    const b = vec(step.to, "to");
    if (!a || !b) return null;
    const air: Cell[] = [];
    forBox(a, b, (x, y, z) => air.push({ x, y, z, block: "air" }));
    return { place: [], air, cost: {} };
  }

  if (!step.block) return fail('"block" manquant');
  if (!BUILD_BLOCKS.has(step.block)) {
    return fail(`bloc "${step.block}" non autorisé (utilise des planches, bûches, pierres, escaliers, dalles, clôtures, verre, torches... Ex: cobblestone, oak_planks, oak_stairs)`);
  }
  const st = parseState(step.state, step.facing);
  if (!st.ok) return fail(st.error);

  if (step.op === "block") {
    const p = vec(step.at, "at");
    if (!p) return null;
    const facing = (step.facing ?? st.pairs.find((s) => s.startsWith("facing="))?.slice(7)) as Facing | undefined;
    return { place: [{ x: p[0], y: p[1], z: p[2], block: step.block, facing }], air: [], cost: { [itemFor(step.block)]: 1 } };
  }

  if (step.op === "door") {
    if (!step.block.endsWith("_door")) return fail(`"${step.block}" n'est pas une porte (ex: oak_door)`);
    if (!step.facing) return fail('"facing" manquant : direction vers l\'EXTÉRIEUR (north, south, east, west)');
    const p = vec(step.at, "at");
    if (!p) return null;
    if (p[1] + 1 > LIMITS.yMax) return fail("la porte dépasse la hauteur maximale");
    return {
      place: [
        { x: p[0], y: p[1], z: p[2], block: step.block, facing: step.facing },
        { x: p[0], y: p[1] + 1, z: p[2], block: step.block, facing: step.facing },
      ],
      air: [],
      cost: { [step.block]: 1 },
      door: { x: p[0], y: p[1], z: p[2], facing: step.facing },
    };
  }

  // box
  const a = vec(step.from, "from");
  const b = vec(step.to, "to");
  if (!a || !b) return null;
  const mode = step.mode ?? "solid";
  const min: Vec = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const max: Vec = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const dims = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1];
  const hollow = mode === "hollow" && dims.every((d) => d >= 3);
  const place: Cell[] = [];
  const air: Cell[] = [];
  forBox(min, max, (x, y, z) => {
    const edge = x === min[0] || x === max[0] || y === min[1] || y === max[1] || z === min[2] || z === max[2];
    const ring = x === min[0] || x === max[0] || z === min[2] || z === max[2];
    if (mode === "walls" ? ring : hollow ? edge : true) place.push({ x, y, z, block: step.block!, facing: step.facing });
    else air.push({ x, y, z, block: "air" });
  });
  return { place, air, cost: { [itemFor(step.block)]: place.length } };
}

function forBox(a: Vec, b: Vec, fn: (x: number, y: number, z: number) => void) {
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) fn(x, y, z);
}

// ---------------------------------------------------------------- validation

export function validatePlan(plan: Plan): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const grid = new Map<string, string>();
  const facings = new Map<string, Facing>();
  const doors: { x: number; y: number; z: number; facing: Facing }[] = [];
  const cost: Record<string, number> = {};
  let cells = 0;
  const min: Vec = [Infinity, Infinity, Infinity];
  const max: Vec = [-Infinity, -Infinity, -Infinity];

  plan.steps.forEach((step, i) => {
    const e = expand(step, i, errors);
    if (!e) return;
    for (const c of e.air) grid.set(key(c.x, c.y, c.z), "air");
    for (const c of e.place) {
      grid.set(key(c.x, c.y, c.z), c.block);
      if (c.facing) facings.set(key(c.x, c.y, c.z), c.facing);
      cells++;
      min[0] = Math.min(min[0], c.x); min[1] = Math.min(min[1], c.y); min[2] = Math.min(min[2], c.z);
      max[0] = Math.max(max[0], c.x); max[1] = Math.max(max[1], c.y); max[2] = Math.max(max[2], c.z);
    }
    for (const [item, n] of Object.entries(e.cost)) cost[item] = (cost[item] ?? 0) + n;
    if (e.door) doors.push(e.door);
  });

  if (cells > LIMITS.cells) errors.push(`Trop de blocs posés : ${cells} (maximum ${LIMITS.cells}). Réduis la taille ou utilise le mode "hollow"/"walls".`);
  const bbox = cells ? { min, max } : null;
  if (bbox) {
    const dx = max[0] - min[0] + 1;
    const dz = max[2] - min[2] + 1;
    const dy = max[1] - min[1] + 1;
    if (dx > LIMITS.dim || dz > LIMITS.dim) errors.push(`Emprise ${dx}x${dz} trop grande (maximum ${LIMITS.dim}x${LIMITS.dim}).`);
    if (dy > LIMITS.height) errors.push(`Hauteur ${dy} trop grande (maximum ${LIMITS.height}).`);
  } else if (!errors.length) {
    errors.push("Le plan ne pose aucun bloc.");
  }

  if (!errors.length && bbox && (plan.kind ?? "shelter") === "shelter") lintShelter(grid, doors, bbox, errors, warnings);

  // Lumières murales : une torche murale doit être accrochée à un bloc plein.
  for (const [k, block] of grid) {
    if (block !== "wall_torch") continue;
    const f = facings.get(k);
    const [x, y, z] = k.split(",").map(Number);
    if (!f) errors.push(`Torche murale en [${x},${y},${z}] sans "facing" (direction qui s'éloigne du mur).`);
    else if (!solidAt(grid, x - DIR[f][0], y, z - DIR[f][1])) {
      errors.push(`Torche murale en [${x},${y},${z}] flottante : aucun mur en [${x - DIR[f][0]},${y},${z - DIR[f][1]}] (facing=${f} regarde à l'opposé du mur).`);
    }
  }

  return { errors, warnings, cost, cells, bbox, grid };
}

/** Plein = bloc posé non traversable ; hors plan : sous le sol (y < 0) c'est la terre, au-dessus c'est de l'air. */
function solidAt(grid: Map<string, string>, x: number, y: number, z: number): boolean {
  const b = grid.get(key(x, y, z));
  if (b !== undefined) return !PASSABLE.has(b);
  return y < 0;
}

function lintShelter(
  grid: Map<string, string>,
  doors: { x: number; y: number; z: number; facing: Facing }[],
  bbox: { min: Vec; max: Vec },
  errors: string[],
  warnings: string[],
) {
  const minX = bbox.min[0], maxX = bbox.max[0], minZ = bbox.min[2], maxZ = bbox.max[2];
  const top = Math.max(bbox.max[1], 0);

  // Flood-fill depuis l'extérieur (portes fermées) : ce qui n'est pas atteint est un volume fermé.
  const outside = new Set<string>();
  const stack: Vec[] = [];
  const push = (x: number, y: number, z: number) => {
    if (x < minX - 1 || x > maxX + 1 || z < minZ - 1 || z > maxZ + 1 || y < 0 || y > top + 1) return;
    const k = key(x, y, z);
    if (outside.has(k) || solidAt(grid, x, y, z)) return;
    outside.add(k);
    stack.push([x, y, z]);
  };
  for (let x = minX - 1; x <= maxX + 1; x++) for (let z = minZ - 1; z <= maxZ + 1; z++) for (let y = 0; y <= top + 1; y++) {
    if (x === minX - 1 || x === maxX + 1 || z === minZ - 1 || z === maxZ + 1 || y === top + 1) push(x, y, z);
  }
  while (stack.length) {
    const [x, y, z] = stack.pop()!;
    push(x + 1, y, z); push(x - 1, y, z); push(x, y + 1, z); push(x, y - 1, z); push(x, y, z + 1); push(x, y, z - 1);
  }

  const interior = (x: number, y: number, z: number) =>
    inRange(x, minX, maxX) && inRange(z, minZ, maxZ) && inRange(y, 0, top) && !solidAt(grid, x, y, z) && !outside.has(key(x, y, z));

  let interiorCells = 0;
  let headroom = false;
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) for (let y = 0; y <= top; y++) {
    if (!interior(x, y, z)) continue;
    interiorCells++;
    if (solidAt(grid, x, y - 1, z) && interior(x, y + 1, z)) headroom = true;
  }

  if (!interiorCells) {
    errors.push("Aucun espace intérieur fermé : les murs ou le toit ne se rejoignent pas (de l'air venant de l'extérieur atteint tout l'intérieur). Vérifie que le toit couvre toute la surface et que les murs sont continus.");
    return;
  }
  if (!headroom) {
    errors.push("Intérieur trop bas ou sans sol : il faut au moins 2 blocs de hauteur libre au-dessus d'un sol plein (murs de 3 blocs de haut minimum, toit au-dessus).");
  }

  if (!doors.length) {
    errors.push('Aucune porte : ajoute une étape {"op":"door","at":[x,y,z],"block":"oak_door","facing":"<vers l\'extérieur>"} dans un mur.');
  } else {
    const works = (d: { x: number; y: number; z: number }, f: Facing) => {
      const [dx, dz] = DIR[f];
      const o = [d.x + dx, d.z + dz];
      const inn = [d.x - dx, d.z - dz];
      return (
        outside.has(key(o[0], d.y, o[1])) && outside.has(key(o[0], d.y + 1, o[1])) &&
        interior(inn[0], d.y, inn[1]) && interior(inn[0], d.y + 1, inn[1]) && solidAt(grid, inn[0], d.y - 1, inn[1])
      );
    };
    if (!doors.some((d) => works(d, d.facing))) {
      const flipped = doors.find((d) => works(d, OPPOSITE[d.facing]));
      errors.push(
        flipped
          ? `La porte en [${flipped.x},${flipped.y},${flipped.z}] regarde vers l'intérieur : mets facing="${OPPOSITE[flipped.facing]}" (direction vers l'EXTÉRIEUR).`
          : "Aucune porte ne relie l'extérieur à l'intérieur : il faut un sol plein derrière la porte et 2 blocs de hauteur libre de chaque côté.",
      );
    }
  }

  if (![...grid.values()].some((b) => LIGHTS.has(b))) {
    warnings.push("Pas de lumière (torches, lanterne) : des monstres pourraient apparaître à l'intérieur.");
  }
}

// ---------------------------------------------------------------- résumé, commandes, vérification

export function summarizePlan(plan: Plan, v: Validation): string {
  const dims = v.bbox
    ? `${v.bbox.max[0] - v.bbox.min[0] + 1}x${v.bbox.max[2] - v.bbox.min[2] + 1}x${v.bbox.max[1] - v.bbox.min[1] + 1}`
    : "?";
  const cost = Object.entries(v.cost).map(([k, n]) => `${k} x${n}`).join(", ");
  return `« ${plan.name} » ${dims}, ${v.cells} blocs (${cost})`;
}

const stateText = (pairs: string[]) => (pairs.length ? `[${pairs.join(",")}]` : "");

/**
 * Commandes Minecraft du plan, en coordonnées absolues. `anchor` = coin (x=0, y=0, z=0) du plan dans le monde.
 * Ordre : paiement, dégagement de l'emprise, puis les étapes dans l'ordre du plan.
 */
export function planCommands(plan: Plan, v: Validation, anchor: { x: number; y: number; z: number }): string[] {
  const abs = (x: number, y: number, z: number) => `${anchor.x + x} ${anchor.y + y} ${anchor.z + z}`;
  const cmds: string[] = [];
  for (const [item, n] of Object.entries(v.cost)) cmds.push(`clear @s minecraft:${item} ${n}`);

  if (v.bbox && plan.clear_site !== false && v.bbox.max[1] >= 0) {
    cmds.push(`fill ${abs(v.bbox.min[0], 0, v.bbox.min[2])} ${abs(v.bbox.max[0], v.bbox.max[1], v.bbox.max[2])} minecraft:air`);
  }

  for (const step of plan.steps) {
    const st = parseState(step.state, step.facing);
    const pairs = st.ok ? st.pairs : [];
    if (step.op === "clear" && step.from && step.to) {
      cmds.push(`fill ${abs(step.from[0], step.from[1], step.from[2])} ${abs(step.to[0], step.to[1], step.to[2])} minecraft:air`);
    } else if (step.op === "block" && step.at && step.block) {
      cmds.push(`setblock ${abs(step.at[0], step.at[1], step.at[2])} minecraft:${step.block}${stateText(pairs)}`);
    } else if (step.op === "door" && step.at && step.block && step.facing) {
      const base = `facing=${step.facing},hinge=${pairs.find((p) => p.startsWith("hinge="))?.slice(6) ?? "left"}`;
      cmds.push(`setblock ${abs(step.at[0], step.at[1], step.at[2])} minecraft:${step.block}[half=lower,${base}]`);
      cmds.push(`setblock ${abs(step.at[0], step.at[1] + 1, step.at[2])} minecraft:${step.block}[half=upper,${base}]`);
    } else if (step.op === "box" && step.from && step.to && step.block) {
      const lo = [0, 1, 2].map((i) => Math.min(step.from![i], step.to![i]));
      const hi = [0, 1, 2].map((i) => Math.max(step.from![i], step.to![i]));
      const block = `minecraft:${step.block}${stateText(pairs)}`;
      const mode = step.mode ?? "solid";
      if (mode === "walls") {
        cmds.push(`fill ${abs(lo[0], lo[1], lo[2])} ${abs(hi[0], hi[1], lo[2])} ${block}`);
        cmds.push(`fill ${abs(lo[0], lo[1], hi[2])} ${abs(hi[0], hi[1], hi[2])} ${block}`);
        cmds.push(`fill ${abs(lo[0], lo[1], lo[2])} ${abs(lo[0], hi[1], hi[2])} ${block}`);
        cmds.push(`fill ${abs(hi[0], lo[1], lo[2])} ${abs(hi[0], hi[1], hi[2])} ${block}`);
      } else {
        const hollow = mode === "hollow" && [0, 1, 2].every((i) => hi[i] - lo[i] >= 2);
        cmds.push(`fill ${abs(lo[0], lo[1], lo[2])} ${abs(hi[0], hi[1], hi[2])} ${block}${hollow ? " hollow" : ""}`);
      }
    }
  }
  return cmds;
}

/** Compare le monde réel au plan : `blockAt` renvoie le nom du bloc en coordonnées relatives (ou null si non chargé). */
export function verifyGrid(grid: Map<string, string>, blockAt: (x: number, y: number, z: number) => string | null) {
  let checked = 0;
  let ok = 0;
  const mismatches: string[] = [];
  for (const [k, expected] of grid) {
    if (expected === "air") continue;
    const [x, y, z] = k.split(",").map(Number);
    checked++;
    const actual = blockAt(x, y, z);
    if (actual === expected) ok++;
    else if (mismatches.length < 5) mismatches.push(`[${x},${y},${z}] attendu ${expected}, trouvé ${actual ?? "(non chargé)"}`);
  }
  return { checked, ok, ratio: checked ? ok / checked : 1, mismatches };
}
