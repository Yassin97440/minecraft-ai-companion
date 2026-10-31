import { runScenario } from "./scenario.js";
import { scenarios } from "./scenarios.js";

/**
 * npm run eval                       : tous les scénarios, modèle scripté (vérifie le code du graphe)
 * npm run eval -- bois-nominal       : un seul scénario
 * npm run eval -- --live             : vrai modèle (.env) sur le faux monde (vérifie modèle + prompt ; coûte des requêtes)
 */
const args = process.argv.slice(2);
const live = args.includes("--live");
const ids = args.filter((a) => !a.startsWith("--"));
const selected = ids.length ? scenarios.filter((s) => ids.includes(s.id)) : scenarios;
if (!selected.length) {
  console.error(`Aucun scénario parmi: ${scenarios.map((s) => s.id).join(", ")}`);
  process.exit(2);
}

if (live) {
  const { assertLlmConfigured } = await import("../src/llm.js");
  assertLlmConfigured();
}

console.log(`Évaluation ${live ? "LIVE (vrai modèle)" : "scriptée"} : ${selected.length} scénario(s)\n`);
let failed = 0;
for (const s of selected) {
  try {
    const v = await runScenario(s, { live });
    const r = v.result;
    console.log(`${v.passed ? "✔" : "✖"} ${s.id.padEnd(20)} LLM ${String(r.llmCalls).padStart(2)} · tools ${String(r.executed.length).padStart(2)} · ${s.description}`);
    for (const f of v.failures) console.log(`    ↳ ${f}`);
    if (!v.passed) {
      failed++;
      if (live) console.log(`    appels: ${r.calls.map((c) => `${c.name}→${c.result.slice(0, 50)}`).join(" | ")}`);
    }
  } catch (err) {
    failed++;
    console.log(`✖ ${s.id.padEnd(20)} erreur: ${(err as Error).message}`);
  }
}
console.log(`\n${selected.length - failed}/${selected.length} réussis`);
process.exit(failed ? 1 : 0);
