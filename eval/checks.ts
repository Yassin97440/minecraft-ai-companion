import type { Check, RunResult } from "./scenario.js";

/** Critères réutilisables. Chacun renvoie null si OK, sinon une phrase qui explique l'écart. */

const check = (name: string, run: Check["run"]): Check => ({ name, run });
export type { Check };
const names = (r: RunResult) => r.calls.map((c) => c.name);
const said = (r: RunResult) => r.world.said.join(" | ");

/** L'inventaire final contient au moins ces quantités. */
export const inventoryAtLeast = (want: Record<string, number>) =>
  check(`inventaire ≥ ${JSON.stringify(want)}`, (r) => {
    const short = Object.entries(want).filter(([k, v]) => r.world.count(k) < v).map(([k, v]) => `${k}: ${r.world.count(k)}/${v}`);
    return short.length ? `manque ${short.join(", ")} (inventaire: ${r.world.inventoryText()})` : null;
  });

export const inventoryLacks = (item: string) =>
  check(`pas de ${item} en inventaire`, (r) => (r.world.count(item) > 0 ? `${r.world.count(item)} ${item} présent(s)` : null));

export const calledTool = (name: string) => check(`appelle ${name}`, (r) => (names(r).includes(name) ? null : `jamais appelé (appels: ${names(r).join(", ") || "aucun"})`));

export const neverExecuted = (name: string) =>
  check(`${name} jamais exécuté`, (r) => (r.executed.includes(name) ? `exécuté ${r.executed.filter((n) => n === name).length} fois` : null));

/** Les tools sont appelés dans cet ordre (d'autres appels peuvent s'intercaler). */
export const calledInOrder = (order: string[]) =>
  check(`ordre ${order.join(" → ")}`, (r) => {
    let i = 0;
    for (const n of names(r)) if (n === order[i]) i++;
    return i === order.length ? null : `bloqué à "${order[i]}" (appels: ${names(r).join(", ")})`;
  });

/** Un appel à ce tool a été refusé par le garde-fou (avant tout effet de bord). */
export const refused = (name: string): Check => ({
  ...check(`${name} refusé`, (r) => (r.calls.some((c) => c.name === name && c.result.startsWith("REFUSÉ")) ? null : "aucun refus constaté")),
  scriptedOnly: true,
});

export const maxLlmCalls = (n: number) => check(`≤ ${n} appels LLM`, (r) => (r.llmCalls > n ? `${r.llmCalls} appels` : null));
export const maxExecuted = (n: number) => check(`≤ ${n} tools exécutés`, (r) => (r.executed.length > n ? `${r.executed.length} exécutés` : null));
export const maxFailedCalls = (n: number) =>
  check(`≤ ${n} appel(s) en échec`, (r) => {
    const bad = r.calls.filter((c) => /^(REFUSÉ|Erreur|Impossible|Échec|Pas arrivé|Aucun|Matériaux manquants|Tool inconnu)/.test(c.result));
    return bad.length > n ? `${bad.length} échec(s), ex: ${bad[0].name} → ${bad[0].result.slice(0, 80)}` : null;
  });
export const noFailedCall = () => maxFailedCalls(0);

export const saidMatches = (re: RegExp) => check(`dit ${re}`, (r) => (re.test(said(r)) ? null : `rien ne correspond dans: ${said(r) || "(silence)"}`));
export const saidNothingLike = (re: RegExp) => check(`ne dit pas ${re}`, (r) => (re.test(said(r)) ? `message trompeur: ${said(r)}` : null));

/** Un rappel système « Abandon » a été envoyé au modèle (anti-boucle). */
export const abandonNoticeSent = (): Check => ({
  ...check("rappel d'abandon envoyé", (r) => (r.messages.some((m) => m.getType() === "human" && String(m.content).startsWith("[Système] Abandon")) ? null : "aucun rappel")),
  scriptedOnly: true,
});

export const missionEnded = (status: "done" | "abandoned") =>
  check(`mission ${status}`, (r) => (!r.memory.activeMission() && r.memory.format().includes(status === "done" ? "terminée" : "abandonnée") ? null : `mémoire: ${r.memory.format()}`));

export const custom = (name: string, fn: (r: RunResult) => boolean | string) =>
  check(name, (r) => {
    const out = fn(r);
    return out === true ? null : out === false ? "critère non satisfait" : out;
  });
