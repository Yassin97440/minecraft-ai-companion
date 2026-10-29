import {
  Annotation,
  END,
  MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  trimMessages,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type { Journal } from "./memory.js";
import { checkToolCall, type Mode } from "./policy.js";
import { WHIM_SYSTEM, buildSystemPrompt } from "./prompts.js";

export const WhimSchema = z.object({
  idea: z.string().describe("La lubie, en une phrase"),
  risk: z.enum(["low", "medium", "high"]),
});
export type Whim = z.infer<typeof WhimSchema>;

const ACTION_REQUEST =
  /\b(mine|miner|creuse|creuser|casse|casser|coupe|couper|r[ée]colte|r[ée]colter|ramasse|va|aller|viens|rejoins|suis|reviens|cherche|trouve|dors|dormir|couche|mange|manger|[ée]quipe|prends|sors|sortir|monte|descends|construis|construire|fabrique|crafte|donne|apporte|cache|prot[èe]ge|farme|continue|avance)\b/i;

const NUDGE_PREFIX = "[Système]";

/** Texte du dernier vrai message du joueur (hors rappels système). */
function lastUserText(messages: BaseMessage[]): { index: number; text: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.getType() !== "human") continue;
    const text = typeof m.content === "string" ? m.content : "";
    if (!text.startsWith(NUDGE_PREFIX)) return { index: i, text };
  }
  return null;
}

/**
 * Le joueur a demandé une action mais le modèle n'a fait que parler (aucun tool autre que `say`)
 * et n'a pas encore été relancé : on le renvoie agir, une seule fois par demande.
 */
export function needsNudge(messages: BaseMessage[]): boolean {
  const last = lastUserText(messages);
  if (!last || !ACTION_REQUEST.test(last.text)) return false;
  const after = messages.slice(last.index + 1);
  const alreadyNudged = after.some((m) => m.getType() === "human");
  const acted = after.some((m) => m.getType() === "ai" && ((m as AIMessage).tool_calls ?? []).some((c) => c.name !== "say"));
  return !alreadyNudged && !acted;
}

const FAILURE =
  /^(REFUSÉ|Erreur|Impossible|Échec|Pas arrivé|Pas encore|Aucun|Je n'ai pas|Je ne |Matériaux manquants|Rien ne|Chemin|Bloc inconnu|Item inconnu)/i;
const ABANDON_PREFIX = `${NUDGE_PREFIX} Abandon`;
const NOTICE_AFTER = 3; // échecs d'affilée avant le rappel
const STOP_AFTER = 6; // échecs d'affilée avant l'arrêt du tour

export function isFailure(m: BaseMessage): boolean {
  if (m.getType() !== "tool") return false;
  return (m as ToolMessage).status === "error" || FAILURE.test(typeof m.content === "string" ? m.content : "");
}

/** Échecs de tools consécutifs depuis la dernière demande du joueur, et rappel déjà envoyé ou non. */
export function failureStreak(messages: BaseMessage[]): { streak: number; noticed: boolean } {
  const last = lastUserText(messages);
  const after = last ? messages.slice(last.index + 1) : messages;
  let streak = 0;
  for (const m of after) {
    if (m.getType() !== "tool") continue;
    streak = isFailure(m) ? streak + 1 : 0;
  }
  const noticed = after.some((m) => m.getType() === "human" && String(m.content).startsWith(ABANDON_PREFIX));
  return { streak, noticed };
}

/** Abstractions minimales : en prod ce sont des ChatAnthropic, en test des scripts. */
export interface AgentModel {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
}
export interface WhimModel {
  invoke(messages: BaseMessage[]): Promise<Whim>;
}

/** Valeur à passer à `new Command({ resume })` pour répondre à une demande d'accord. */
export type ApprovalAnswer = { approved: boolean };

export type GraphDeps = {
  tools: StructuredToolInterface[];
  chatModel: AgentModel; // lié à tous les tools
  idleModel: AgentModel; // lié aux tools autorisés en mode autonome
  whimModel: WhimModel;
  world: () => string;
  journal: Journal;
  maxSteps: number;
  historyMessages: number;
  policy?: Parameters<typeof checkToolCall>[3];
};

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  mode: Annotation<Mode>({ reducer: (_, b) => b, default: () => "chat" }),
  steps: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  whim: Annotation<Whim | null>({ reducer: (_, b) => b, default: () => null }),
  /** tool_call_id -> raison du refus, rempli par `guard`, lu par `act`. */
  blocked: Annotation<Record<string, string>>({ reducer: (_, b) => b, default: () => ({}) }),
});
type S = typeof State.State;

export function buildGraph(deps: GraphDeps) {
  const toolsByName = new Map(deps.tools.map((t) => [t.name, t]));

  /** Lubie : en mode autonome, un petit modèle invente une idée, filtrée avant d'agir. */
  async function whimNode(state: S) {
    let whim: Whim | null = null;
    try {
      whim = await deps.whimModel.invoke([
        new SystemMessage(WHIM_SYSTEM),
        new HumanMessage(`État du monde:\n${deps.world()}\n\nJournal récent:\n${deps.journal.format(10)}\n\nPropose une lubie.`),
      ]);
    } catch (err) {
      // Les petits modèles ratent parfois la sortie structurée : on saute simplement cette lubie.
      deps.journal.append("whim", `lubie ratée (sortie invalide): ${(err as Error).message}`);
      return { whim: null };
    }
    if (!whim?.idea || whim.risk === "high") {
      deps.journal.append("whim", `lubie rejetée (${whim.risk}): ${whim.idea}`);
      return { whim: null };
    }
    deps.journal.append("whim", whim.idea);
    return {
      whim,
      messages: [new HumanMessage(`[Lubie] ${whim.idea}`)],
    };
  }

  async function planNode(state: S) {
    const system = new SystemMessage(buildSystemPrompt(state.mode, deps.world(), deps.journal.format(12)));
    let history = await trimMessages(state.messages, {
      maxTokens: deps.historyMessages,
      tokenCounter: (msgs: BaseMessage[]) => msgs.length,
      strategy: "last",
      startOn: "human",
      endOn: ["human", "tool"],
      includeSystem: false,
    });
    if (!history.length) history = state.messages.slice(-1);

    const model = state.mode === "idle" ? deps.idleModel : deps.chatModel;
    const reply = await model.invoke([system, ...history]);
    return { messages: [reply], steps: state.steps + 1 };
  }

  function nudgeNode() {
    return {
      messages: [
        new HumanMessage(
          `${NUDGE_PREFIX} Tu n'as appelé aucun tool d'action alors que le joueur te demande d'agir. ` +
            "Appelle maintenant le tool adapté (mine_tunnel, collect_block, sleep_in_bed, dig_out, go_to_player, find_block, look_around...). " +
            "Si c'est vraiment impossible, explique précisément pourquoi avec say.",
        ),
      ],
    };
  }

  /** Garde-fou : aucun effet de bord ici, seulement des verdicts (et d'éventuelles pauses humaines). */
  function guardNode(state: S) {
    const last = state.messages.at(-1) as AIMessage;
    const blocked: Record<string, string> = {};
    for (const call of last.tool_calls ?? []) {
      const verdict = checkToolCall(call.name, call.args, state.mode, deps.policy);
      if (verdict.kind === "deny") {
        blocked[call.id!] = verdict.reason;
      } else if (verdict.kind === "approve") {
        // La valeur de reprise est un objet : LangGraph refuse un `resume` falsy (false).
        const answer = interrupt({ question: verdict.question, tool: call.name, args: call.args }) as ApprovalAnswer;
        if (!answer?.approved) blocked[call.id!] = "Le joueur a refusé.";
      }
    }
    return { blocked };
  }

  async function actNode(state: S) {
    const last = state.messages.at(-1) as AIMessage;
    const results: BaseMessage[] = [];
    for (const call of last.tool_calls ?? []) {
      const base = { tool_call_id: call.id!, name: call.name };
      const reason = state.blocked[call.id!];
      if (reason) {
        results.push(new ToolMessage({ ...base, status: "error", content: `REFUSÉ: ${reason}` }));
        continue;
      }
      const t = toolsByName.get(call.name);
      if (!t) {
        results.push(new ToolMessage({ ...base, status: "error", content: `Tool inconnu: ${call.name}` }));
        continue;
      }
      try {
        const out = await t.invoke(call.args);
        results.push(new ToolMessage({ ...base, content: typeof out === "string" ? out : JSON.stringify(out) }));
      } catch (err) {
        results.push(new ToolMessage({ ...base, status: "error", content: `Erreur: ${(err as Error).message}` }));
      }
    }
    const { streak, noticed } = failureStreak([...state.messages, ...results]);
    if (state.mode === "chat" && streak >= NOTICE_AFTER && !noticed) {
      results.push(
        new HumanMessage(
          `${ABANDON_PREFIX} : ${streak} actions ratées d'affilée. Cesse d'insister sur cette tâche : explique au joueur en une phrase ` +
            "ce qui bloque (avec say), propose une alternative, puis arrête-toi. Le dernier message du joueur prime sur tout le reste.",
        ),
      );
    }
    return { messages: results, blocked: {} };
  }

  return new StateGraph(State)
    .addNode("lubie", whimNode)
    .addNode("plan", planNode)
    .addNode("guard", guardNode)
    .addNode("act", actNode)
    .addNode("nudge", nudgeNode)
    .addConditionalEdges(START, (s: S) => (s.mode === "idle" ? "lubie" : "plan"), ["lubie", "plan"])
    .addConditionalEdges("lubie", (s: S) => (s.whim ? "plan" : END), ["plan", END])
    // Tant qu'il y a des tool_calls on passe par guard -> act, même au-delà du plafond,
    // pour ne jamais laisser un tool_call sans ToolMessage dans l'historique.
    .addConditionalEdges(
      "plan",
      (s: S) => {
        if ((s.messages.at(-1) as AIMessage).tool_calls?.length) return "guard";
        return s.mode === "chat" && s.steps < deps.maxSteps && needsNudge(s.messages) ? "nudge" : END;
      },
      ["guard", "nudge", END],
    )
    .addEdge("nudge", "plan")
    .addEdge("guard", "act")
    .addConditionalEdges(
      "act",
      (s: S) => (s.steps >= deps.maxSteps || failureStreak(s.messages).streak >= STOP_AFTER ? END : "plan"),
      ["plan", END],
    )
    .compile({ checkpointer: new MemorySaver() });
}

export type CompanionGraph = ReturnType<typeof buildGraph>;
