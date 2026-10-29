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
    const results: ToolMessage[] = [];
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
    return { messages: results, blocked: {} };
  }

  return new StateGraph(State)
    .addNode("lubie", whimNode)
    .addNode("plan", planNode)
    .addNode("guard", guardNode)
    .addNode("act", actNode)
    .addConditionalEdges(START, (s: S) => (s.mode === "idle" ? "lubie" : "plan"), ["lubie", "plan"])
    .addConditionalEdges("lubie", (s: S) => (s.whim ? "plan" : END), ["plan", END])
    // Tant qu'il y a des tool_calls on passe par guard -> act, même au-delà du plafond,
    // pour ne jamais laisser un tool_call sans ToolMessage dans l'historique.
    .addConditionalEdges(
      "plan",
      (s: S) => ((s.messages.at(-1) as AIMessage).tool_calls?.length ? "guard" : END),
      ["guard", END],
    )
    .addEdge("guard", "act")
    .addConditionalEdges("act", (s: S) => (s.steps >= deps.maxSteps ? END : "plan"), ["plan", END])
    .compile({ checkpointer: new MemorySaver() });
}

export type CompanionGraph = ReturnType<typeof buildGraph>;
