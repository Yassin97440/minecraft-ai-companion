import { planNeeds, describeStep, type RecipeDb, type Step } from "./needs.js";

/**
 * Exécuteur borné de plans (spec 001, tranche 2) : déroule un `NeedsPlan` étape par étape.
 * Le LLM dit QUOI (« une pioche en pierre ») ; ce module fait le COMMENT, sans repasser par le modèle.
 * Il ne touche ni Mineflayer ni le réseau : tout passe par l'interface `Actions`, injectée (vraie en jeu, fausse en test).
 *
 * Principe I : une étape n'est « faite » que si l'inventaire mesuré a changé comme prévu. Une action qui annonce
 * un succès sans effet est comptée comme un échec.
 */

export type Inventory = Map<string, number>;

export interface Actions {
  inventory(): Inventory;
  /** Blocs sources vus autour du bot (pour choisir le bois/la pierre disponibles). Absent = préférences par défaut. */
  nearbyBlocks?(): ReadonlySet<string>;
  /** Casse/ramasse jusqu'à `count` de l'objet (essaie les blocs sources dans l'ordre). Renvoie une note lisible. */
  gather(step: Extract<Step, { type: "gather" }>, count: number): Promise<string>;
  craft(item: string, count: number): Promise<string>;
  /** Cuit jusqu'à `count` unités dans un four déjà posé. */
  smelt(step: Extract<Step, { type: "smelt" }>, count: number): Promise<string>;
  placeStation(station: "crafting_table" | "furnace"): Promise<string>;
  /** Le joueur a repris la main. */
  interrupted(): boolean;
  now(): number;
}

export type Budget = { maxSteps: number; maxFailStreak: number; maxMs: number };
export const DEFAULT_BUDGET: Budget = { maxSteps: 40, maxFailStreak: 3, maxMs: 480_000 };

export type ObtainReport = {
  status: "done" | "failed" | "interrupted" | "budget";
  /** Différence d'inventaire mesurée entre le début et la fin. */
  obtained: Record<string, number>;
  /** Appels d'actions effectués (réessais compris). */
  actionsRun: number;
  failedStep?: Step;
  message: string;
};

const count = (inv: Inventory, k: string) => inv.get(k) ?? 0;

function diff(before: Inventory, after: Inventory): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const d = count(after, k) - count(before, k);
    if (d) out[k] = d;
  }
  return out;
}
const fmtDiff = (d: Record<string, number>) =>
  Object.entries(d).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`).join(", ") || "aucun changement d'inventaire";

/** Ce que l'inventaire doit montrer pour que l'étape compte comme réussie (cumulé depuis le début de l'étape). */
function progressOf(step: Step, start: Inventory, now: Inventory): number {
  switch (step.type) {
    case "gather":
      return count(now, step.item) - count(start, step.item);
    case "craft":
      return count(now, step.item) - count(start, step.item);
    case "smelt":
      return count(now, step.output) - count(start, step.output);
    case "place_station":
      return count(start, step.station) - count(now, step.station); // l'établi/le four quitte l'inventaire quand il est posé
  }
}
const targetOf = (step: Step): number => (step.type === "place_station" ? 1 : step.count);

async function runOnce(step: Step, remaining: number, a: Actions): Promise<string> {
  switch (step.type) {
    case "gather":
      return a.gather(step, remaining);
    case "craft":
      return a.craft(step.item, remaining);
    case "smelt":
      return a.smelt(step, remaining);
    case "place_station":
      return a.placeStation(step.station);
  }
}

export async function obtainItem(item: string, wanted: number, a: Actions, db: RecipeDb, budget: Budget = DEFAULT_BUDGET): Promise<ObtainReport> {
  const startInv = new Map(a.inventory());
  const startedAt = a.now();
  let actions = 0;
  const report = (status: ObtainReport["status"], message: string, failedStep?: Step): ObtainReport => {
    const obtained = diff(startInv, a.inventory());
    return { status, obtained, actionsRun: actions, failedStep, message: message.replace("{gain}", fmtDiff(obtained)) };
  };

  const plan = planNeeds(item, wanted, startInv, db, { nearby: a.nearbyBlocks?.() });
  if (!plan.ok) return report("failed", `Impossible : ${plan.detail}`);
  if (!plan.steps.length) return report("done", `Rien à faire : tu as déjà ${wanted} ${plan.goal.item}.`);

  const total = plan.steps.length;
  for (const [i, step] of plan.steps.entries()) {
    const label = `étape ${i + 1}/${total} (${describeStep(step)})`;
    const stepStart = new Map(a.inventory());
    const target = targetOf(step);
    let streak = 0;

    while (progressOf(step, stepStart, a.inventory()) < target) {
      if (a.interrupted()) return report("interrupted", `Interrompu par le joueur à l'${label}. Obtenu jusque-là : {gain}.`, step);
      if (actions >= budget.maxSteps) return report("budget", `Échec : budget épuisé (${budget.maxSteps} actions) à l'${label}. Obtenu jusque-là : {gain}.`, step);
      if (a.now() - startedAt > budget.maxMs) return report("budget", `Échec : budget de temps épuisé (${Math.round(budget.maxMs / 60_000)} min) à l'${label}. Obtenu jusque-là : {gain}.`, step);

      const before = progressOf(step, stepStart, a.inventory());
      actions++;
      let note: string;
      try {
        note = await runOnce(step, target - before, a);
      } catch (err) {
        note = `erreur : ${(err as Error).message}`;
      }
      // Seul l'inventaire fait foi, pas la note de l'action.
      const gained = progressOf(step, stepStart, a.inventory()) - before;
      streak = gained > 0 ? 0 : streak + 1;
      if (streak >= budget.maxFailStreak) {
        return report("failed", `Échec à l'${label} : ${note.slice(0, 200)}. Obtenu jusque-là : {gain}.`, step);
      }
    }
  }

  if (count(a.inventory(), plan.goal.item) < wanted) {
    return report("failed", `Échec : le plan est terminé mais il me manque encore ${plan.goal.item} (${count(a.inventory(), plan.goal.item)}/${wanted}). Obtenu : {gain}.`);
  }
  return report("done", `Obtenu ${wanted} ${plan.goal.item}. Inventaire réel: {gain} (${actions} actions).`);
}
