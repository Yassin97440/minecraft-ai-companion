import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { config } from "./config.js";
import { buildGraph, WhimSchema } from "./graph.js";
import { assertLlmConfigured, createAgentModel, createWhimModel } from "./llm.js";
import { Journal } from "./memory.js";
import { IDLE_TOOLS } from "./policy.js";
import { createTools } from "./tools.js";
import { snapshot, type Ctx } from "./world.js";

const { pathfinder, Movements } = pathfinderPkg;

/** Texte brut d'un message (string ou blocs), sans les <think> des modèles à raisonnement. */
function textOf(content: unknown): string {
  const raw = Array.isArray(content)
    ? content.map((b: any) => (typeof b === "string" ? b : b?.type === "text" ? b.text : "")).join("")
    : typeof content === "string"
      ? content
      : "";
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

assertLlmConfigured();
console.log(`[llm] ${config.llm.provider} / ${config.llm.model} (lubies: ${config.llm.idleModel})`);

const bot = mineflayer.createBot({
  host: config.mc.host,
  port: config.mc.port,
  username: config.mc.username,
  version: config.mc.version,
  auth: "offline",
});
bot.loadPlugin(pathfinder);

const journal = new Journal();
const ctx: Ctx = { bot, journal, run: { saidThisRun: false } };

bot.once("spawn", () => {
  bot.pathfinder.setMovements(new Movements(bot));
  console.log(`[bot] ${bot.username} connecté sur ${config.mc.host}:${config.mc.port}`);

  const tools = createTools(ctx);
  const graph = buildGraph({
    tools,
    chatModel: createAgentModel(tools),
    idleModel: createAgentModel(tools.filter((t) => IDLE_TOOLS.has(t.name))),
    whimModel: createWhimModel(WhimSchema),
    world: () => snapshot(bot),
    journal,
    maxSteps: config.limits.maxStepsPerRun,
    historyMessages: config.limits.historyMessages,
  });

  const thread = { configurable: { thread_id: "companion" }, recursionLimit: 60 };
  let running = false;
  let awaitingApproval = false;
  let lastActivity = Date.now();
  let lastWhim = 0;
  const queue: string[] = [];

  async function run(input: unknown) {
    running = true;
    ctx.run.saidThisRun = false;
    try {
      const result = await graph.invoke(input as any, thread);

      // Pause humaine ? (interrupt déclenché dans le nœud guard)
      const snap = await graph.getState(thread);
      const pending = snap.tasks.flatMap((t) => t.interrupts ?? []);
      if (pending.length) {
        awaitingApproval = true;
        bot.chat(String((pending[0].value as any).question));
        return;
      }
      awaitingApproval = false;

      // Si le modèle a répondu en texte sans appeler `say`, on relaie quand même.
      const last = result.messages.at(-1);
      const text = last && last.getType() === "ai" ? textOf(last.content) : "";
      if (!ctx.run.saidThisRun && text) bot.chat(text.slice(0, 240));
    } catch (err) {
      console.error("[agent] erreur:", err);
      journal.append("error", String((err as Error).message ?? err));
      bot.chat("Aïe, court-circuit dans mon cerveau... (regarde la console)");
    } finally {
      running = false;
      lastActivity = Date.now();
      const next = queue.shift();
      if (next) void onInstruction(next.split("\u0000")[0], next.split("\u0000")[1]);
    }
  }

  async function onInstruction(username: string, text: string) {
    if (running) {
      queue.push(`${username}\u0000${text}`);
      return;
    }
    await run({ messages: [new HumanMessage(`${username}: ${text}`)], mode: "chat", steps: 0 });
  }

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    if (config.owner && username.toLowerCase() !== config.owner.toLowerCase()) return;
    journal.append("chat", `${username}: ${message}`);

    if (awaitingApproval) {
      const yes = /^(oui|ouais|yes|yep|ok|go|vas-y|d'accord|dac)\b/i.test(message.trim());
      awaitingApproval = false;
      void run(new Command({ resume: { approved: yes } }));
      if (!yes) queue.push(`${username}\u0000${message}`);
      return;
    }
    void onInstruction(username, message);
  });

  // Lubies : quand rien ne se passe depuis un moment.
  if (config.idle.enabled) {
    setInterval(() => {
      const now = Date.now();
      if (running || awaitingApproval) return;
      if (now - lastActivity < config.idle.afterSeconds * 1000) return;
      if (now - lastWhim < config.idle.cooldownSeconds * 1000) return;
      lastWhim = now;
      void run({ messages: [], mode: "idle", steps: 0, whim: null });
    }, 5000);
  }

  bot.chat("Salut ! Dis-moi ce que je peux faire (ou laisse-moi improviser 😏).");
});

bot.on("death", () => journal.append("event", "je suis mort"));
bot.on("kicked", (reason) => console.error("[bot] kické:", reason));
bot.on("error", (err) => console.error("[bot] erreur:", err));
bot.on("end", () => {
  console.log("[bot] déconnecté");
  process.exit(0);
});
