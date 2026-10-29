import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import { buildGraph, failureStreak, isFailure, type AgentModel, type Whim } from "../src/graph.js";
import { Journal, Memory } from "../src/memory.js";

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

function setup(
  opts: {
    chat?: AgentModel;
    idle?: AgentModel;
    whim?: Whim;
    maxSteps?: number;
    result?: string;
    memory?: Memory;
    missionSteps?: number;
    shouldStop?: () => boolean;
  } = {},
) {
  const log: string[] = [];
  const mk = (name: string) =>
    tool(async (args: any) => (log.push(`${name}:${JSON.stringify(args)}`), opts.result ?? "ok"), {
      name,
      description: name,
      schema: z.object({}).passthrough(),
    });
  const tools = ["say", "run_blueprint", "emote", "mine_tunnel"].map(mk);
  const graph = buildGraph({
    tools,
    chatModel: opts.chat ?? scripted(new AIMessage("rien")),
    idleModel: opts.idle ?? scripted(new AIMessage("rien")),
    whimModel: { invoke: async () => opts.whim ?? { idea: "danser", risk: "low" } },
    world: () => "monde de test",
    journal: new Journal(path.join(os.tmpdir(), `journal-${Math.random()}.json`)),
    maxSteps: opts.maxSteps ?? 12,
    memory: opts.memory,
    missionSteps: opts.missionSteps,
    shouldStop: opts.shouldStop,
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

test("demande d'action sans tool : le modèle est relancé une fois pour agir", async () => {
  let calls = 0;
  const inner = scripted(new AIMessage("Ok, j'y vais !"), call("mine_tunnel", { length: 5 }), new AIMessage("fini"));
  const { graph, log, cfg } = setup({
    chat: { invoke: async (m: BaseMessage[]) => (calls++, inner.invoke(m)) },
  });
  await graph.invoke(chatInput("mine avec ta pioche"), cfg);
  assert.deepEqual(log, ['mine_tunnel:{"length":5}']);
  assert.equal(calls, 3);
});

test("pas de relance quand le joueur ne demande aucune action, ni quand le modèle abandonne après un rappel", async () => {
  let calls = 0;
  const talker: AgentModel = { invoke: async () => (calls++, new AIMessage("blabla")) };
  const a = setup({ chat: talker });
  await a.graph.invoke(chatInput("salut"), a.cfg);
  assert.equal(calls, 1);

  calls = 0;
  const b = setup({ chat: talker });
  await b.graph.invoke(chatInput("va miner du charbon"), b.cfg);
  assert.equal(calls, 2, "une seule relance, pas de boucle");
  assert.deepEqual(b.log, []);
});

test("anti-boucle : 3 échecs d'affilée => rappel d'abandon, 6 => le tour s'arrête", async () => {
  const { graph, cfg } = setup({
    chat: scripted(call("mine_tunnel", { length: 3 })), // insiste indéfiniment
    result: "Échec : rien ne marche",
    maxSteps: 12,
  });
  const res = await graph.invoke(chatInput("laisse tomber le coffre"), cfg);
  assert.equal(res.steps, 6, "arrêt après 6 échecs, avant le plafond de 12");
  const notices = res.messages.filter((m: BaseMessage) => m.getType() === "human" && String(m.content).includes("Abandon"));
  assert.equal(notices.length, 1);
  assert.ok(res.messages.at(-1) instanceof ToolMessage, "pas de tool_call orphelin");
});

test("anti-boucle : un succès remet le compteur à zéro", () => {
  const ok = new ToolMessage({ tool_call_id: "1", content: "Arrivé près de moi" });
  const ko = (id: string) => new ToolMessage({ tool_call_id: id, content: "Échec : bloqué" });
  const msgs = [new HumanMessage("va chercher"), ko("a"), ko("b"), ok, ko("c")];
  assert.deepEqual(failureStreak(msgs), { streak: 1, noticed: false });
  assert.equal(isFailure(new ToolMessage({ tool_call_id: "x", content: "Aucun lit dans un rayon de 48 blocs" })), true);
});

const tmpMemory = () => new Memory(path.join(os.tmpdir(), `memory-${Math.random()}.json`));
const withMission = () => {
  const memory = tmpMemory();
  memory.startMission("fer et diamant", ["fer", "diamant"]);
  return memory;
};
const counting = (inner: AgentModel) => {
  const stats = { calls: 0 };
  return { stats, model: { invoke: async (m: BaseMessage[]) => (stats.calls++, inner.invoke(m)) } as AgentModel };
};

test("mission : un jalon annoncé en texte ne coupe pas la boucle, mais elle ne tourne pas à vide", async () => {
  const { stats, model } = counting(scripted(new AIMessage("jalon"), call("mine_tunnel", { length: 3 }), new AIMessage("jalon 2")));
  const { graph, log, cfg } = setup({ chat: model, memory: withMission(), missionSteps: 30 });
  await graph.invoke(chatInput("salut"), cfg);
  assert.deepEqual(log, ['mine_tunnel:{"length":3}']);
  assert.equal(stats.calls, 5, "2 relances d'affilée sans tool, puis arrêt");
});

test("mission : le joueur qui reprend la main (shouldStop) arrête le tour", async () => {
  const { stats, model } = counting(scripted(new AIMessage("jalon")));
  const { graph, cfg } = setup({ chat: model, memory: withMission(), shouldStop: () => true });
  await graph.invoke(chatInput("salut"), cfg);
  assert.equal(stats.calls, 1);
});

test("mission : plafond d'étapes élargi mais borné", async () => {
  const { graph, cfg } = setup({ chat: scripted(call("emote", { action: "jump" })), memory: withMission(), maxSteps: 3, missionSteps: 7 });
  const res = await graph.invoke(chatInput("salut"), cfg);
  assert.equal(res.steps, 7);
});

test("sans mission, le plafond reste maxSteps et aucune relance n'a lieu", async () => {
  const { stats, model } = counting(scripted(new AIMessage("rien")));
  const { graph, cfg } = setup({ chat: model, memory: tmpMemory() });
  await graph.invoke(chatInput("salut"), cfg);
  assert.equal(stats.calls, 1);
});

test("Memory : upsert par clé, mission, persistance", () => {
  const file = path.join(os.tmpdir(), `memory-${Math.random()}.json`);
  const m = new Memory(file);
  m.set("Lit", "place", "lit de la base", { x: 1.2, y: 64, z: -3.7 });
  m.set("lit", "place", "lit déplacé", { x: 10, y: 65, z: 20 });
  assert.equal(m.entries().length, 1);
  assert.match(m.format(), /lit déplacé \(10, 65, 20\)/);

  m.startMission("minerais", ["10 fer", "3 diamants"]);
  assert.ok(m.markObjective("fer"));
  assert.equal(m.markObjective("emeraude"), null);
  assert.match(new Memory(file).format(), /MISSION EN COURS.*\[x\] 10 fer.*\[ \] 3 diamants/);

  assert.equal(m.endMission("done", "tout trouvé"), true);
  assert.equal(m.activeMission(), null);
  assert.match(m.format(), /dernière mission, terminée.*tout trouvé/);
  assert.equal(m.forget("lit"), true);
  assert.equal(m.forget("lit"), false);
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
