import fs from "node:fs";
import path from "node:path";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { FAILURE } from "./graph.js";

/**
 * Observabilité maison : chaque appel au LLM et chaque tool est écrit en JSONL (une ligne = un événement).
 * On y lit EXACTEMENT ce que le modèle a reçu (prompt système + snapshot + historique + schémas des tools)
 * et ce qu'il a répondu, avec la latence et les tokens. Voir `npm run trace-report` pour l'agrégat.
 */

export type TraceMsg = { role: string; content: string; tool_calls?: { name: string; args: unknown }[] };

export type LlmRecord = {
  type: "llm";
  ts: string;
  run: number;
  /** Numéro de l'appel LLM dans le run (1, 2, 3...). */
  call: number;
  /** chat | idle | whim */
  label: string;
  ms: number;
  /** Tokens d'entrée/sortie : réels si le fournisseur les renvoie (`usage: true`), sinon estimés (≈ caractères / 4). */
  inTokens: number;
  outTokens: number;
  usage: boolean;
  /** Taille du prompt en caractères, dont les schémas des tools (qui ne figurent pas dans `messages`). */
  inChars: number;
  schemaChars: number;
  toolCount: number;
  messageCount: number;
  /** Outils demandés par le modèle en réponse. */
  toolCalls: string[];
  error?: string;
  /** Présents seulement en mode complet (TRACE_FULL). */
  messages?: TraceMsg[];
  out?: TraceMsg | unknown;
};

export type ToolRecord = {
  type: "tool";
  ts: string;
  run: number;
  name: string;
  args: unknown;
  ms: number;
  failed: boolean;
  result: string;
};

export type RunRecord = {
  type: "run";
  ts: string;
  run: number;
  trigger: string;
  detail: string;
  ms: number;
  llmCalls: number;
  inTokens: number;
  outTokens: number;
  toolCalls: number;
  failures: number;
};

export type TraceRecord = LlmRecord | ToolRecord | RunRecord;

export type TracerOptions = {
  dir: string;
  enabled?: boolean;
  /** Écrit les messages complets envoyés/reçus (gros fichiers, mais c'est tout l'intérêt). */
  full?: boolean;
  /** Sortie console d'une ligne par événement. */
  log?: (line: string) => void;
};

const estimateTokens = (chars: number) => Math.ceil(chars / 4);
const textOf = (c: unknown) => (typeof c === "string" ? c : JSON.stringify(c));
const isMessage = (x: unknown): x is BaseMessage => typeof (x as BaseMessage)?.getType === "function";
const MAX_RESULT = 2000;

function serialize(m: BaseMessage): TraceMsg {
  const calls = (m as AIMessage).tool_calls ?? [];
  return {
    role: m.getType(),
    content: textOf(m.content),
    ...(calls.length ? { tool_calls: calls.map((c) => ({ name: c.name, args: c.args })) } : {}),
  };
}

function schemaSize(tools: StructuredToolInterface[]): number {
  try {
    return tools.reduce((n, t) => n + JSON.stringify(convertToOpenAITool(t)).length, 0);
  } catch {
    return 0;
  }
}

type RunState = { id: number; trigger: string; detail: string; t0: number; llmCalls: number; inTokens: number; outTokens: number; toolCalls: number; failures: number };

export class Tracer {
  private file: string | null = null;
  private runCounter = 0;
  private current: RunState | null = null;
  private readonly enabled: boolean;
  private readonly full: boolean;
  private readonly log: (line: string) => void;

  constructor(private opts: TracerOptions) {
    this.enabled = opts.enabled ?? true;
    this.full = opts.full ?? true;
    this.log = opts.log ?? ((l) => console.log(l));
  }

  /** Fichier JSONL de cette session (créé à la première écriture). */
  get filePath(): string | null {
    return this.file;
  }

  private write(record: TraceRecord) {
    if (!this.enabled) return;
    try {
      if (!this.file) {
        fs.mkdirSync(this.opts.dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        this.file = path.join(this.opts.dir, `trace-${stamp}.jsonl`);
      }
      fs.appendFileSync(this.file, JSON.stringify(record) + "\n");
    } catch (err) {
      console.warn("[trace] écriture impossible:", (err as Error).message);
    }
  }

  /** Un run = un passage dans le graphe (message du joueur, lubie, reprise après accord). */
  startRun(trigger: string, detail = "") {
    this.current = { id: ++this.runCounter, trigger, detail: detail.slice(0, 120), t0: performance.now(), llmCalls: 0, inTokens: 0, outTokens: 0, toolCalls: 0, failures: 0 };
  }

  endRun() {
    const r = this.current;
    if (!r) return;
    this.current = null;
    const ms = Math.round(performance.now() - r.t0);
    this.write({ type: "run", ts: new Date().toISOString(), run: r.id, trigger: r.trigger, detail: r.detail, ms, llmCalls: r.llmCalls, inTokens: r.inTokens, outTokens: r.outTokens, toolCalls: r.toolCalls, failures: r.failures });
    if (this.enabled) {
      this.log(
        `[trace] run ${r.id} (${r.trigger}) fini en ${(ms / 1000).toFixed(1)}s : ${r.llmCalls} appels LLM, ${r.inTokens} tok in / ${r.outTokens} tok out, ${r.toolCalls} tools (${r.failures} échecs)`,
      );
    }
  }

  /** Enveloppe un modèle (agent ou lubie) : même interface `invoke`, mais chaque appel est mesuré et journalisé. */
  wrapModel<R>(model: { invoke(messages: BaseMessage[]): Promise<R> }, label: string, tools: StructuredToolInterface[] = []): { invoke(messages: BaseMessage[]): Promise<R> } {
    if (!this.enabled) return model;
    const schemaChars = schemaSize(tools);
    return {
      invoke: async (messages) => {
        const run = this.current;
        const call = run ? ++run.llmCalls : 0;
        const inChars = messages.reduce((n, m) => n + textOf(m.content).length + ((m as AIMessage).tool_calls?.length ? JSON.stringify((m as AIMessage).tool_calls).length : 0), 0) + schemaChars;
        const t0 = performance.now();
        const base = { type: "llm" as const, ts: new Date().toISOString(), run: run?.id ?? 0, call, label, schemaChars, toolCount: tools.length, messageCount: messages.length, inChars };
        const sent = this.full ? { messages: messages.map(serialize) } : {};
        try {
          const reply = await model.invoke(messages);
          const ms = Math.round(performance.now() - t0);
          const outMsg = isMessage(reply) ? serialize(reply) : undefined;
          const outChars = outMsg ? outMsg.content.length + JSON.stringify(outMsg.tool_calls ?? []).length : JSON.stringify(reply).length;
          const u = isMessage(reply) ? (reply as AIMessage).usage_metadata : undefined;
          const inTokens = u?.input_tokens ?? estimateTokens(inChars);
          const outTokens = u?.output_tokens ?? estimateTokens(outChars);
          const toolCalls = outMsg?.tool_calls?.map((c) => c.name) ?? [];
          if (run) {
            run.inTokens += inTokens;
            run.outTokens += outTokens;
          }
          this.write({ ...base, ms, inTokens, outTokens, usage: !!u, toolCalls, ...sent, out: outMsg ?? reply });
          this.log(
            `[trace] llm ${base.run}.${call} ${label} ${(ms / 1000).toFixed(1)}s | ${u ? "" : "≈"}${inTokens} tok in (${Math.round(schemaChars / 1000)}k car. de schémas) / ${u ? "" : "≈"}${outTokens} out | ${toolCalls.length ? "→ " + toolCalls.join(", ") : outMsg ? "→ texte" : "→ sortie structurée"}`,
          );
          return reply;
        } catch (err) {
          const ms = Math.round(performance.now() - t0);
          const error = (err as Error).message ?? String(err);
          this.write({ ...base, ms, inTokens: estimateTokens(inChars), outTokens: 0, usage: false, toolCalls: [], error, ...sent });
          this.log(`[trace] llm ${base.run}.${call} ${label} ${(ms / 1000).toFixed(1)}s | ERREUR ${error.slice(0, 120)}`);
          throw err;
        }
      },
    };
  }

  /** Mesure chaque exécution de tool (durée, arguments, résultat, échec ou non). Modifie les tools en place. */
  wrapTools(tools: StructuredToolInterface[]): StructuredToolInterface[] {
    if (!this.enabled) return tools;
    for (const t of tools) {
      const original = t.invoke.bind(t);
      (t as any).invoke = async (input: unknown, config?: unknown) => {
        const run = this.current;
        const t0 = performance.now();
        let result: string;
        let failed = false;
        try {
          const out = await original(input as any, config as any);
          result = textOf(out);
          failed = FAILURE.test(result);
          return out;
        } catch (err) {
          result = `Erreur: ${(err as Error).message}`;
          failed = true;
          throw err;
        } finally {
          const ms = Math.round(performance.now() - t0);
          if (run) {
            run.toolCalls++;
            if (failed) run.failures++;
          }
          this.write({ type: "tool", ts: new Date().toISOString(), run: run?.id ?? 0, name: t.name, args: input, ms, failed, result: result!.slice(0, MAX_RESULT) });
          this.log(`[trace] tool ${run?.id ?? 0} ${t.name} ${(ms / 1000).toFixed(1)}s ${failed ? "ÉCHEC" : "ok"} | ${result!.replace(/\s+/g, " ").slice(0, 100)}`);
        }
      };
    }
    return tools;
  }
}

// ---------------------------------------------------------------- agrégat (npm run trace-report)

export function readTrace(file: string): TraceRecord[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as TraceRecord];
      } catch {
        return [];
      }
    });
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Rapport texte : coût et latence par rôle de modèle, durée et taux d'échec par tool, runs les plus lourds. */
export function summarize(records: TraceRecord[]): string {
  const llm = records.filter((r): r is LlmRecord => r.type === "llm");
  const tools = records.filter((r): r is ToolRecord => r.type === "tool");
  const runs = records.filter((r): r is RunRecord => r.type === "run");
  const out: string[] = [];

  out.push(`== LLM (${llm.length} appels, ${llm.filter((r) => r.error).length} erreurs) ==`);
  for (const label of [...new Set(llm.map((r) => r.label))]) {
    const rs = llm.filter((r) => r.label === label);
    const real = rs.filter((r) => r.usage).length;
    out.push(
      `${label.padEnd(5)} ${String(rs.length).padStart(4)} appels | latence moy ${avg(rs.map((r) => r.ms))} ms, p95 ${pct(rs.map((r) => r.ms), 0.95)} ms | ` +
        `tokens in moy ${avg(rs.map((r) => r.inTokens))} (dont schémas ≈${estimateTokens(avg(rs.map((r) => r.schemaChars)))}), out moy ${avg(rs.map((r) => r.outTokens))} | ` +
        `total ${rs.reduce((n, r) => n + r.inTokens, 0)} in / ${rs.reduce((n, r) => n + r.outTokens, 0)} out | usage réel ${real}/${rs.length}`,
    );
  }

  out.push("", `== Tools (${tools.length} exécutions) ==`);
  for (const name of [...new Set(tools.map((r) => r.name))].sort()) {
    const rs = tools.filter((r) => r.name === name);
    const failed = rs.filter((r) => r.failed).length;
    out.push(`${name.padEnd(18)} ${String(rs.length).padStart(4)}x | moy ${avg(rs.map((r) => r.ms))} ms | échecs ${failed} (${Math.round((100 * failed) / rs.length)} %)`);
  }

  out.push("", `== Runs (${runs.length}) ==`);
  if (runs.length) {
    out.push(`moy ${avg(runs.map((r) => r.llmCalls))} appels LLM, ${avg(runs.map((r) => r.inTokens + r.outTokens))} tokens, ${avg(runs.map((r) => r.ms))} ms par run`);
    out.push("les plus coûteux :");
    for (const r of [...runs].sort((a, b) => b.inTokens + b.outTokens - (a.inTokens + a.outTokens)).slice(0, 5)) {
      out.push(`  run ${r.run} (${r.trigger}) « ${r.detail} » : ${r.llmCalls} appels, ${r.inTokens + r.outTokens} tok, ${(r.ms / 1000).toFixed(1)}s, ${r.failures} échecs`);
    }
  }
  return out.join("\n");
}
