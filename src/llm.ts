import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { z } from "zod";
import { config } from "./config.js";
import type { AgentModel, WhimModel } from "./graph.js";

export type Provider = "openrouter" | "google" | "ollama" | "anthropic";

const KEY_VARS: Record<Provider, string | null> = {
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  ollama: null,
};

/** Échoue tôt avec un message clair plutôt qu'à la première requête. */
export function assertLlmConfigured() {
  const { provider, model } = config.llm;
  if (!(provider in KEY_VARS)) {
    throw new Error(`LLM_PROVIDER inconnu: "${provider}" (openrouter | google | ollama | anthropic)`);
  }
  if (!model) throw new Error("COMPANION_MODEL est vide : choisis un modèle dans .env");
  const keyVar = KEY_VARS[provider as Provider];
  if (keyVar && !process.env[keyVar]) throw new Error(`${keyVar} manquante dans .env (provider "${provider}")`);
}

function createModel(model: string, temperature: number): any {
  switch (config.llm.provider as Provider) {
    case "openrouter":
      // OpenRouter parle le protocole OpenAI : on change juste l'URL de base.
      return new ChatOpenAI({
        model,
        temperature,
        apiKey: process.env.OPENROUTER_API_KEY,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
      });
    case "google":
      return new ChatGoogleGenerativeAI({ model, temperature, apiKey: process.env.GOOGLE_API_KEY });
    case "ollama":
      return new ChatOllama({ model, temperature, baseUrl: config.llm.ollamaUrl });
    case "anthropic":
      return new ChatAnthropic({ model, temperature, apiKey: process.env.ANTHROPIC_API_KEY });
  }
}

/** Modèle de l'agent, lié à un ensemble de tools. */
export function createAgentModel(tools: StructuredToolInterface[], model = config.llm.model): AgentModel {
  return createModel(model, config.llm.temperature).bindTools(tools) as AgentModel;
}

/** Petit modèle pour les lubies, avec sortie structurée. */
export function createWhimModel<T extends z.ZodTypeAny>(schema: T, model = config.llm.idleModel): WhimModel {
  return createModel(model, 1).withStructuredOutput(schema) as WhimModel;
}
