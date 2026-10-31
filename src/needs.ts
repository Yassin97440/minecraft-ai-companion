import minecraftData from "minecraft-data";
import { DEFAULT_FUEL, FUELS, MATERIAL_PREFERENCE, MAX_BULK, MAX_ITEMS, RAW_SOURCES, SMELTING, TIERS, isOutOfScope, type Tier } from "./sources.js";

/**
 * Planificateur de besoins (spec 001) : PUR, sans Mineflayer ni LLM.
 * « Je veux X » -> liste ordonnée d'étapes (outil -> récolte -> fonte -> fabrication) contre l'inventaire réel.
 * Le modèle choisit le QUOI ; ce module calcule le COMMENT, de façon reproductible.
 */

export type Station = "hand" | "table";
export type Recipe = { ingredients: Record<string, number>; yields: number; station: Station };
export type ToolNeed = { kind: string; tier: Tier };

/** Accès en lecture au registre : implémenté par minecraft-data, remplaçable en test. */
export interface RecipeDb {
  isItem(name: string): boolean;
  recipesFor(item: string): Recipe[];
  /** Outil minimal pour casser ce bloc et obtenir son butin (null = à la main). */
  toolFor(block: string): ToolNeed | null;
}

export type Step =
  | { type: "gather"; item: string; count: number; blocks: string[]; tool: ToolNeed | null }
  | { type: "craft"; item: string; count: number; station: Station }
  | { type: "smelt"; input: string; output: string; count: number; fuel: string }
  | { type: "place_station"; station: "crafting_table" | "furnace" };

export type NeedsPlan = { ok: true; goal: { item: string; count: number }; have: Record<string, number>; missing: Record<string, number>; steps: Step[] };
export type Refusal = { ok: false; reason: "unknown_item" | "out_of_scope" | "not_craftable" | "quantity_cap" | "too_complex"; detail: string };

const MAX_DEPTH = 12;
const MAX_NODES = 20_000; // borne dure : un arbre de recettes pathologique ne bloque jamais le bot

// ---------------------------------------------------------------- registre réel

export function createRecipeDb(version: string): RecipeDb {
  const d = minecraftData(version);
  const name = (id: number) => d.items[id]?.name;
  return {
    isItem: (n) => !!d.itemsByName[n],
    recipesFor(item) {
      const id = d.itemsByName[item]?.id;
      const raw = (id !== undefined ? d.recipes[id] : undefined) ?? [];
      return raw.map((r: any) => {
        const ids: number[] = (r.ingredients ?? r.inShape?.flat() ?? []).filter((x: number | null) => x !== null && x !== undefined && x >= 0);
        const ingredients: Record<string, number> = {};
        for (const i of ids) {
          const n = name(i);
          if (n) ingredients[n] = (ingredients[n] ?? 0) + 1;
        }
        const wide = r.inShape && (r.inShape.length > 2 || (r.inShape[0]?.length ?? 0) > 2);
        return { ingredients, yields: r.result?.count ?? 1, station: wide || ids.length > 4 ? "table" : "hand" } as Recipe;
      });
    },
    toolFor(block) {
      const b = d.blocksByName[block];
      if (!b?.harvestTools) return null;
      const tools = Object.keys(b.harvestTools).map((id) => name(Number(id))).filter((n): n is string => !!n);
      const tiers = tools
        .map((t) => ({ t, tier: TIERS.find((x) => t.startsWith(`${x}_`)) }))
        .filter((x): x is { t: string; tier: Tier } => !!x.tier)
        .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
      const lowest = tiers[0];
      return lowest ? { kind: lowest.t.slice(lowest.tier.length + 1), tier: lowest.tier } : null;
    },
  };
}

// ---------------------------------------------------------------- planification

/** État d'une hypothèse de plan : cloné à chaque alternative explorée. */
type State = { stock: Map<string, number>; steps: Step[]; tableReady: boolean; furnaceReady: boolean; touched: Set<string> };
type Fail = { fail: string };
const cloneState = (s: State): State => ({ stock: new Map(s.stock), steps: [...s.steps], tableReady: s.tableReady, furnaceReady: s.furnaceReady, touched: new Set(s.touched) });
const isFail = (x: State | Fail): x is Fail => "fail" in x;
const has = (s: State, item: string) => s.stock.get(item) ?? 0;
const add = (s: State, item: string, n: number) => s.stock.set(item, has(s, item) + n);

/** Rang du matériau d'une recette dans MATERIAL_PREFERENCE (99 = non classé). */
function materialRank(r: Recipe): number {
  const ranks = Object.keys(r.ingredients).map((ing) => {
    const i = MATERIAL_PREFERENCE.findIndex((m) => ing === m || ing.startsWith(`${m}_`));
    return i < 0 ? 99 : i;
  });
  return Math.min(99, ...ranks);
}

class Planner {
  nodes = 0;
  constructor(private db: RecipeDb) {}

  /** Garantit `count` exemplaires de `item` dans le stock de l'état (et les en retire pour l'usage demandé). */
  need(item: string, count: number, st: State, path: string[]): State | Fail {
    if (++this.nodes > MAX_NODES) return { fail: "too_complex" };
    if (path.length > MAX_DEPTH) return { fail: `${item} : arbre de fabrication trop profond` };
    st.touched.add(item);
    const take = Math.min(has(st, item), count);
    add(st, item, -take);
    const remaining = count - take;
    if (remaining === 0) return st;
    if (path.includes(item)) return { fail: `${item} : dépendance circulaire` };

    const options: (State | Fail)[] = [];
    if (RAW_SOURCES[item]) options.push(this.gather(item, remaining, cloneState(st), [...path, item]));
    if (SMELTING[item]) options.push(this.smelt(item, remaining, cloneState(st), [...path, item]));
    // Registre trié par préférence de matériau (tri stable) : à coût égal, le chêne et la cobblestone passent avant le reste.
    const recipes = [...this.db.recipesFor(item)].sort((a, b) => materialRank(a) - materialRank(b));
    for (const r of recipes) options.push(this.craft(item, remaining, r, cloneState(st), [...path, item]));

    // Meilleure alternative : le moins d'étapes ; à égalité, la première du registre (déterministe).
    const ok = options.filter((o): o is State => !isFail(o));
    if (!ok.length) {
      const reasons = options.filter(isFail).map((o) => o.fail);
      return { fail: reasons.find((r) => r === "too_complex") ?? reasons[0] ?? `${item} : aucune source ni recette connue` };
    }
    return ok.reduce((best, o) => (o.steps.length < best.steps.length ? o : best));
  }

  private gather(item: string, count: number, st: State, path: string[]): State | Fail {
    const blocks = RAW_SOURCES[item];
    const tool = this.db.toolFor(blocks[0]);
    const withTool = tool ? this.ensureTool(tool, st, path) : st;
    if (isFail(withTool)) return withTool;
    withTool.steps.push({ type: "gather", item, count, blocks, tool });
    return withTool;
  }

  /** Un outil de ce genre et de ce niveau (ou mieux) est requis : possédé, sinon à fabriquer. Non consommé. */
  private ensureTool(tool: ToolNeed, st: State, path: string[]): State | Fail {
    for (const tier of TIERS.slice(TIERS.indexOf(tool.tier))) {
      if (has(st, `${tier}_${tool.kind}`) > 0) {
        st.touched.add(`${tier}_${tool.kind}`);
        return st;
      }
    }
    const made = this.need(`${tool.tier}_${tool.kind}`, 1, st, path);
    if (isFail(made)) return made;
    add(made, `${tool.tier}_${tool.kind}`, 1); // l'outil reste possédé après fabrication (il n'est pas un consommable)
    return made;
  }

  private craft(item: string, count: number, r: Recipe, st: State, path: string[]): State | Fail {
    const times = Math.ceil(count / r.yields);
    let cur: State | Fail = st;
    for (const [ing, n] of Object.entries(r.ingredients)) {
      cur = this.need(ing, n * times, cur, path);
      if (isFail(cur)) return cur;
    }
    if (r.station === "table") {
      cur = this.ensureStation("crafting_table", cur, path);
      if (isFail(cur)) return cur;
    }
    cur.steps.push({ type: "craft", item, count: times * r.yields, station: r.station });
    add(cur, item, times * r.yields - count); // le surplus de la fabrication reste disponible (ex: 4 bâtons pour 2 utilisés)
    return cur;
  }

  private smelt(item: string, count: number, st: State, path: string[]): State | Fail {
    const input = SMELTING[item];
    let cur: State | Fail = this.need(input, count, st, path);
    if (isFail(cur)) return cur;
    cur = this.ensureStation("furnace", cur, path);
    if (isFail(cur)) return cur;
    const owned = FUELS.find((f) => has(cur as State, f.item) > 0);
    const fuel = owned ?? FUELS.find((f) => f.item === DEFAULT_FUEL)!;
    cur = this.need(fuel.item, Math.ceil(count / fuel.smelts), cur, path);
    if (isFail(cur)) return cur;
    cur.steps.push({ type: "smelt", input, output: item, count, fuel: fuel.item });
    return cur;
  }

  private ensureStation(station: "crafting_table" | "furnace", st: State, path: string[]): State | Fail {
    const ready = station === "crafting_table" ? st.tableReady : st.furnaceReady;
    if (ready) return st;
    const made = this.need(station, 1, st, path); // possédé (alors on le pose), sinon fabriqué
    if (isFail(made)) return made;
    made.steps.push({ type: "place_station", station });
    if (station === "crafting_table") made.tableReady = true;
    else made.furnaceReady = true;
    return made;
  }
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");

export function planNeeds(rawItem: string, count: number, inventory: Map<string, number>, db: RecipeDb): NeedsPlan | Refusal {
  const item = normalize(rawItem);
  if (!db.isItem(item)) return { ok: false, reason: "unknown_item", detail: `"${rawItem}" est inconnu.` };
  if (isOutOfScope(item)) return { ok: false, reason: "out_of_scope", detail: `${item} est hors périmètre (Nether/End).` };
  const cap = RAW_SOURCES[item] || /_(log|planks)$/.test(item) ? MAX_BULK : MAX_ITEMS;
  if (!Number.isInteger(count) || count < 1 || count > cap) return { ok: false, reason: "quantity_cap", detail: `quantité trop grande (max ${cap}).` };

  const start: State = { stock: new Map(inventory), steps: [], tableReady: false, furnaceReady: false, touched: new Set() };
  const planner = new Planner(db);
  const result = planner.need(item, count, start, []);
  if (isFail(result)) {
    if (result.fail === "too_complex") return { ok: false, reason: "too_complex", detail: `${item} : l'arbre de fabrication est trop complexe.` };
    return { ok: false, reason: "not_craftable", detail: `${item} n'est pas faisable avec les sources connues (${result.fail}).` };
  }

  const steps = mergeGathers(result.steps);
  const missing: Record<string, number> = {};
  for (const s of steps) {
    if (s.type === "gather") missing[s.item] = (missing[s.item] ?? 0) + s.count;
    if (s.type === "place_station") missing[s.station] = (missing[s.station] ?? 0) + 1;
  }
  const have: Record<string, number> = {};
  for (const t of result.touched) if ((inventory.get(t) ?? 0) > 0) have[t] = inventory.get(t)!;
  return { ok: true, goal: { item, count }, have, missing, steps };
}

/** Regroupe les récoltes d'une même ressource à la première occurrence (déplacer une récolte plus tôt est toujours sûr). */
function mergeGathers(steps: Step[]): Step[] {
  const first = new Map<string, Extract<Step, { type: "gather" }>>();
  const out: Step[] = [];
  for (const s of steps) {
    if (s.type !== "gather") {
      out.push(s);
      continue;
    }
    const seen = first.get(s.item);
    if (seen) seen.count += s.count;
    else {
      const copy = { ...s };
      first.set(s.item, copy);
      out.push(copy);
    }
  }
  return out;
}

// ---------------------------------------------------------------- texte pour le modèle

const list = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} x${v}`).join(", ") || "rien";

export function describeStep(s: Step): string {
  switch (s.type) {
    case "gather":
      return `gather ${s.item} x${s.count}${s.tool ? ` (${s.tool.tier}_${s.tool.kind} requis)` : " (main)"}`;
    case "craft":
      return `craft ${s.item} x${s.count} (${s.station === "table" ? "établi" : "main"})`;
    case "smelt":
      return `smelt ${s.input} -> ${s.output} x${s.count} (combustible ${s.fuel})`;
    case "place_station":
      return `place_station ${s.station}`;
  }
}

/** Rendu du tool `plan_needs` ; un refus commence par « Impossible » (convention d'échec, principe I). */
export function formatPlan(p: NeedsPlan | Refusal): string {
  if (!p.ok) return `Impossible : ${p.detail}`;
  const head = `Objectif : ${p.goal.count} ${p.goal.item}.\nPossédé : ${list(p.have)}.\nManque : ${list(p.missing)}.`;
  if (!p.steps.length) return `${head}\nRien à faire : tu as déjà ${p.goal.count} ${p.goal.item}.`;
  return `${head}\nPlan : ${p.steps.map((s, i) => `${i + 1}) ${describeStep(s)}`).join(" ")}`;
}

/** Point d'entrée commun au vrai tool et au faux monde. */
export function planNeedsText(item: string, count: number, inventory: Map<string, number>, db: RecipeDb): string {
  return formatPlan(planNeeds(item, count, inventory, db));
}
