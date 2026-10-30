import mineflayer from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { config } from "./config.js";
import { buildGraph, WhimSchema } from "./graph.js";
import { parseApproval } from "./approval.js";
import { assertLlmConfigured, createAgentModel, createWhimModel } from "./llm.js";
import { Journal, Memory } from "./memory.js";
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
const memory = new Memory();
const ctx: Ctx = { bot, journal, memory, run: { saidThisRun: false, interrupted: false } };

/** Mots qui coupent une action en cours, même sans mission. */
const STOP_WORDS = /^(stop|arr[êe]te|attends|pause|annule|laisse tomber|reviens|viens)\b/i;

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
    memory,
    maxSteps: config.limits.maxStepsPerRun,
    missionSteps: config.limits.missionSteps,
    shouldStop: () => ctx.run.interrupted,
    historyMessages: config.limits.historyMessages,
  });

  // 3 super-étapes par étape LLM (plan, guard, act) : large marge pour les missions.
  const thread = { configurable: { thread_id: "companion" }, recursionLimit: config.limits.missionSteps * 4 + 20 };
  let running = false;
  let awaitingApproval = false;
  let unclearAnswers = 0;
  let approvalTimer: ReturnType<typeof setTimeout> | undefined;
  const APPROVAL_TIMEOUT_MS = 120_000;
  const clearApprovalTimer = () => {
    if (approvalTimer) clearTimeout(approvalTimer);
    approvalTimer = undefined;
  };
  let lastActivity = Date.now();
  let lastWhim = 0;
  const queue: string[] = [];

  async function run(input: unknown) {
    running = true;
    ctx.run.saidThisRun = false;
    ctx.run.interrupted = false;
    try {
      const result = await graph.invoke(input as any, thread);

      // Pause humaine ? (interrupt déclenché dans le nœud guard)
      const snap = await graph.getState(thread);
      const pending = snap.tasks.flatMap((t) => t.interrupts ?? []);
      if (pending.length) {
        awaitingApproval = true;
        unclearAnswers = 0;
        bot.chat(String((pending[0].value as any).question));
        // Sans réponse du joueur, on annule au lieu de rester bloqué indéfiniment.
        clearApprovalTimer();
        approvalTimer = setTimeout(() => {
          if (!awaitingApproval) return;
          awaitingApproval = false;
          bot.chat("Pas de réponse, j'annule la construction.");
          void run(new Command({ resume: { approved: false } }));
        }, APPROVAL_TIMEOUT_MS);
        return;
      }
      awaitingApproval = false;
      clearApprovalTimer();

      // Si le modèle a répondu en texte sans appeler `say`, on relaie quand même.
      const last = result.messages.at(-1);
      const text = last && last.getType() === "ai" ? textOf(last.content) : "";
      if (!ctx.run.saidThisRun && text) bot.chat(text.slice(0, 240));

      // Plafond d'étapes atteint en pleine mission : on le dit au lieu de s'arrêter en silence.
      if (memory.activeMission() && !ctx.run.interrupted && result.steps >= config.limits.missionSteps) {
        bot.chat("Petite pause dans ma mission (beaucoup d'étapes d'affilée). Dis « continue » pour reprendre.");
      }
    } catch (err) {
      const rateLimited = (err as { status?: number }).status === 429;
      console.error(rateLimited ? "[agent] 429 : le fournisseur du modèle est saturé" : "[agent] erreur:", rateLimited ? "" : err);
      journal.append("error", rateLimited ? "429 fournisseur saturé" : String((err as Error).message ?? err));
      bot.chat(
        rateLimited
          ? "Le service du modèle est saturé, redis-moi ça dans quelques secondes."
          : "Aïe, court-circuit dans mon cerveau... (regarde la console)",
      );
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
      const answer = parseApproval(message);
      if (answer === "unclear" && ++unclearAnswers < 2) {
        bot.chat("Je n'ai pas compris : réponds « oui » ou « non » pour la construction.");
        return;
      }
      clearApprovalTimer();
      awaitingApproval = false;
      void run(new Command({ resume: { approved: answer === "yes" } }));
      // Une réponse hors sujet annule la demande, mais le message est traité comme une nouvelle consigne.
      if (answer === "unclear") queue.push(`${username}\u0000${message}`);
      return;
    }
    // Le joueur reprend la main pendant une mission ou un ordre d'arrêt : on coupe l'action en cours.
    if (running && (memory.activeMission() || STOP_WORDS.test(message.trim()))) {
      ctx.run.interrupted = true;
      bot.pathfinder.stop();
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
