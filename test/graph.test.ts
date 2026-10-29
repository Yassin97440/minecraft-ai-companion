import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import { buildGraph, type AgentModel, type Whim } from "../src/graph.js";
import { Journal } from "../src/memory.js";

const call = (name: string, args: Record<string, unknown>, id = `c_${name}`) =>
  new AIMessage({ content: "", tool_calls: [{ id, name, args, type: "tool_call" }] });

/** Modèle scripté : renvoie les réponses dans l'ordre (la dernière est répétée). */
const scripted = (...replies: AIMessage[]): AgentModel => ({
  async invoke(_: BaseMessage[]) {
    const r = replies.length > 1 ? replies.shift()! : replies[0];
    // Copie : le reducer de messages fusionne les messages de même id.
    return new AIMessage({ content: r.content, tool_calls: r.tool_calls });
  },
});

function setup(opts: { chat?: AgentModel; idle?: AgentModel; whim?: Whim; maxSteps?: number } = {}) {
  const log: string[] = [];
  const mk = (name: string) =>
    tool(async (args: any) => (log.push(`${name}:${JSON.stringify(args)}`), "ok"), {
      name,
      description: name,
      schema: z.object({}).passthrough(),
    });
  const tools = ["say", "run_blueprint", "emote"].map(mk);
  const graph = buildGraph({
    tools,
    chatModel: opts.chat ?? scripted(new AIMessage("rien")),
    idleModel: opts.idle ?? scripted(new AIMessage("rien")),
    whimModel: { invoke: async () => opts.whim ?? { idea: "danser", risk: "low" } },
    world: () => "monde de test",
    journal: new Journal(path.join(os.tmpdir(), `journal-${Math.random()}.json`)),
    maxSteps: opts.maxSteps ?? 12,
    historyMessages: 40,
    policy: { autoApproveBuilds: false, maxCollect: 32 },
  });
  let n = 0;
  const cfg = () => ({ configurable: { thread_id: `t${n}` } });
  n++;
  return { graph, log, cfg: cfg() };
}

const chatInput = (text = "salut") => ({ messages: [new HumanMessage(text)], mode: "chat" as const, steps: 0 });

test("chat : le tool est exécuté puis l'agent conclut", async () => {
  const { graph, log, cfg } = setup({
    chat: scripted(call("say", { message: "yo" }), new AIMessage("fini")),
  });
  const res = await graph.invoke(chatInput(), cfg);
  assert.deepEqual(log, ['say:{"message":"yo"}']);
  assert.equal(res.messages.at(-1)?.content, "fini");
});

test("run_blueprint : pause humaine, puis exécution si oui", async () => {
  const { graph, log, cfg } = setup({
    chat: scripted(call("run_blueprint", { name: "cabin" }), new AIMessage("construit")),
  });
  await graph.invoke(chatInput("construis une cabane"), cfg);
  const snap = await graph.getState(cfg);
  const interrupts = snap.tasks.flatMap((t) => t.interrupts ?? []);
  assert.equal(interrupts.length, 1);
  assert.deepEqual(log, [], "rien ne doit s'exécuter avant l'accord");

  await graph.invoke(new Command({ resume: { approved: true } }), cfg);
  assert.deepEqual(log, ['run_blueprint:{"name":"cabin"}']);
});

test("run_blueprint : refus du joueur => tool jamais exécuté", async () => {
  const { graph, log, cfg } = setup({
    chat: scripted(call("run_blueprint", { name: "cabin" }), new AIMessage("ok, tant pis")),
  });
  await graph.invoke(chatInput(), cfg);
  const res = await graph.invoke(new Command({ resume: { approved: false } }), cfg);
  assert.deepEqual(log, []);
  const refused = res.messages.find((m: BaseMessage) => m instanceof ToolMessage) as ToolMessage;
  assert.match(String(refused.content), /REFUSÉ/);
});

test("idle : une lubie sûre est exécutée avec les tools autorisés", async () => {
  const { graph, log, cfg } = setup({
    whim: { idea: "danser", risk: "low" },
    idle: scripted(call("emote", { action: "spin" }), new AIMessage("fin")),
  });
  await graph.invoke({ messages: [], mode: "idle" as const, steps: 0, whim: null }, cfg);
  assert.deepEqual(log, ['emote:{"action":"spin"}']);
});

test("idle : même si le modèle essaie, run_blueprint est refusé par le garde-fou", async () => {
  const { graph, log, cfg } = setup({
    idle: scripted(call("run_blueprint", { name: "cabin" }), new AIMessage("fin")),
  });
  await graph.invoke({ messages: [], mode: "idle" as const, steps: 0, whim: null }, cfg);
  assert.deepEqual(log, []);
});

test("idle : une lubie à risque élevé est écartée avant toute action", async () => {
  const { graph, log, cfg } = setup({
    whim: { idea: "faire exploser la maison", risk: "high" },
    idle: scripted(call("emote", { action: "spin" })),
  });
  await graph.invoke({ messages: [], mode: "idle" as const, steps: 0, whim: null }, cfg);
  assert.deepEqual(log, []);
});

test("idle : une sortie structurée invalide (petit modèle) saute la lubie sans planter", async () => {
  const { graph, log, cfg } = setup({ idle: scripted(call("emote", { action: "spin" })) });
  const broken = buildGraph({
    tools: [],
    chatModel: scripted(new AIMessage("x")),
    idleModel: scripted(new AIMessage("x")),
    whimModel: { invoke: async () => { throw new Error("JSON invalide"); } },
    world: () => "",
    journal: new Journal(path.join(os.tmpdir(), `journal-${Math.random()}.json`)),
    maxSteps: 3,
    historyMessages: 40,
  });
  await broken.invoke({ messages: [], mode: "idle" as const, steps: 0, whim: null }, cfg);
  assert.deepEqual(log, []);
});

test("plafond d'étapes : on s'arrête sans tool_call orphelin", async () => {
  const { graph, cfg } = setup({
    chat: scripted(call("emote", { action: "jump" })), // boucle infinie si rien ne l'arrête
    maxSteps: 3,
  });
  const res = await graph.invoke(chatInput(), cfg);
  assert.equal(res.steps, 3);
  assert.ok(res.messages.at(-1) instanceof ToolMessage, "le dernier message doit être un ToolMessage");
});
