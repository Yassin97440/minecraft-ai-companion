import os from "node:os";
import path from "node:path";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { buildGraph, type AgentModel, type Whim } from "../src/graph.js";
import { Journal, Memory } from "../src/memory.js";
import { IDLE_TOOLS } from "../src/policy.js";
import { createFakeTools } from "./fake-tools.js";
import { FakeWorld, type WorldSetup } from "./fake-world.js";

/**
 * Scénario rejouable = un monde de départ + des messages du joueur + des critères sur le RÉSULTAT.
 * Les critères portent sur le monde final et les appels de tools (pas sur le texte exact) : ils valent donc
 * aussi bien pour un modèle scripté (le code du graphe fait son travail) que pour un vrai modèle (`--live` :
 * le modèle et le prompt se comportent-ils bien ?).
 */

/** Un tour du modèle scripté : des appels de tools, ou un texte seul. `repeat` : le répète tant que le graphe l'appelle. */
export type Turn = { calls?: [name: string, args: Record<string, unknown>][]; text?: string; repeat?: boolean };

export type Input = { text: string; from?: string } | { idle: true; whim: Whim };

export type ToolCall = { name: string; args: Record<string, unknown>; result: string };

export type RunResult = {
  world: FakeWorld;
  memory: Memory;
  /** Tous les appels demandés par le modèle, avec le résultat renvoyé (y compris les REFUSÉ). */
  calls: ToolCall[];
  /** Noms des tools réellement exécutés (un appel refusé par le garde-fou n'y figure pas). */
  executed: string[];
  llmCalls: number;
  messages: BaseMessage[];
};

/** `scriptedOnly` : suppose que le modèle TENTE l'action piégée (refus, boucle) ; un vrai modèle prudent qui l'évite n'a rien à prouver. */
export type Check = { name: string; run: (r: RunResult) => string | null; scriptedOnly?: boolean };

export type Scenario = {
  id: string;
  description: string;
  world: WorldSetup;
  /** Prépare la mémoire durable (ex: lieu de la mort). */
  memory?: (m: Memory) => void;
  inputs: Input[];
  /** Réponses du modèle en mode scripté. */
  script: Turn[];
  /** Simule le joueur qui reprend la main après N tools exécutés. */
  interruptAfterToolCalls?: number;
  maxSteps?: number;
  checks: Check[];
};

export type Verdict = { id: string; passed: boolean; failures: string[]; result: RunResult };

const tmp = (n: string) => path.join(os.tmpdir(), `eval-${n}-${Math.random().toString(36).slice(2)}.json`);

function scriptedModel(script: Turn[], counter: { n: number }): AgentModel {
  const queue = [...script];
  let id = 0;
  return {
    async invoke() {
      counter.n++;
      const turn = queue.length > 1 || !queue[0]?.repeat ? queue.shift() : queue[0];
      if (!turn) return new AIMessage("(fin du script)");
      return new AIMessage({
        content: turn.text ?? "",
        tool_calls: (turn.calls ?? []).map(([name, args]) => ({ id: `call_${++id}`, name, args, type: "tool_call" as const })),
      });
    },
  };
}

export async function runScenario(s: Scenario, opts: { live?: boolean } = {}): Promise<Verdict> {
  const world = new FakeWorld(s.world);
  const memory = new Memory(tmp("memory"));
  const journal = new Journal(tmp("journal"));
  s.memory?.(memory);
  const ctx = { journal, memory, run: { saidThisRun: false, interrupted: false } };

  const executed: string[] = [];
  const base = createFakeTools(world, ctx);
  // Enveloppe : trace ce qui s'exécute, et simule la reprise de main du joueur.
  const tools = base.map((t) => {
    const w: any = Object.create(t);
    w.invoke = async (args: any, cfg?: any) => {
      executed.push(t.name);
      const out = await t.invoke(args, cfg);
      if (s.interruptAfterToolCalls !== undefined && executed.length >= s.interruptAfterToolCalls) ctx.run.interrupted = true;
      return out;
    };
    return w as typeof t;
  });
  const idleTools = tools.filter((t) => IDLE_TOOLS.has(t.name));

  const counter = { n: 0 };
  let chatModel: AgentModel;
  let idleModel: AgentModel;
  if (opts.live) {
    const { createAgentModel } = await import("../src/llm.js");
    const count = (m: AgentModel): AgentModel => ({ invoke: async (msgs) => (counter.n++, m.invoke(msgs)) });
    chatModel = count(createAgentModel(tools));
    idleModel = count(createAgentModel(idleTools));
  } else {
    chatModel = idleModel = scriptedModel(s.script, counter);
  }

  const idleInput = s.inputs.find((i): i is { idle: true; whim: Whim } => "idle" in i);
  const graph = buildGraph({
    tools,
    chatModel,
    idleModel,
    whimModel: { invoke: async () => idleInput?.whim ?? { idea: "rien", risk: "low" } },
    world: () => world.snapshot(),
    journal,
    memory,
    maxSteps: s.maxSteps ?? 12,
    missionSteps: 60,
    shouldStop: () => ctx.run.interrupted,
    historyMessages: 40,
    policy: { autoApproveBuilds: false, maxCollect: 32, maxTunnel: 24 },
  });

  const thread = { configurable: { thread_id: s.id }, recursionLimit: 60 * 4 + 20 };
  for (const input of s.inputs) {
    ctx.run.interrupted = false;
    ctx.run.saidThisRun = false;
    if ("idle" in input) await graph.invoke({ messages: [], mode: "idle", steps: 0, whim: null } as any, thread);
    else await graph.invoke({ messages: [new HumanMessage(`${input.from ?? "joueur"}: ${input.text}`)], mode: "chat", steps: 0 } as any, thread);
  }

  const messages = (await graph.getState(thread)).values.messages as BaseMessage[];
  const results = new Map(messages.filter((m) => m.getType() === "tool").map((m) => [(m as ToolMessage).tool_call_id, String(m.content)]));
  const calls: ToolCall[] = messages
    .filter((m) => m.getType() === "ai")
    .flatMap((m) => ((m as AIMessage).tool_calls ?? []).map((c) => ({ name: c.name, args: c.args, result: results.get(c.id!) ?? "(pas de résultat)" })));

  const result: RunResult = { world, memory, calls, executed, llmCalls: counter.n, messages };
  const failures = s.checks.filter((c) => !(opts.live && c.scriptedOnly)).map((c) => ({ c, err: c.run(result) })).filter((x) => x.err).map((x) => `${x.c.name} : ${x.err}`);
  return { id: s.id, passed: failures.length === 0, failures, result };
}
