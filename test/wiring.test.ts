import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { WhimSchema } from "../src/graph.js";
import { assertLlmConfigured, createAgentModel, createWhimModel } from "../src/llm.js";
import { Journal } from "../src/memory.js";
import { createTools } from "../src/tools.js";

const tools = createTools({ bot: {} as any, journal: new Journal("data/_wiring.json"), run: { saidThisRun: false } });

// Vérifie le câblage LangChain (schémas zod -> tools de chaque fournisseur) sans réseau ni serveur Minecraft.
for (const provider of ["openrouter", "google", "ollama", "anthropic"]) {
  test(`provider ${provider} : tools liés et sortie structurée construits`, () => {
    config.llm.provider = provider;
    config.llm.model = "modele-test";
    process.env.OPENROUTER_API_KEY = process.env.GOOGLE_API_KEY = process.env.ANTHROPIC_API_KEY = "test";
    assert.doesNotThrow(() => assertLlmConfigured());
    assert.ok(tools.length >= 10);
    assert.ok(createAgentModel(tools, "modele-test"));
    assert.ok(createWhimModel(WhimSchema, "modele-test"));
  });
}

test("config LLM invalide => erreur claire", () => {
  config.llm.provider = "nimporte";
  assert.throws(() => assertLlmConfigured(), /LLM_PROVIDER inconnu/);
  config.llm.provider = "ollama";
  config.llm.model = "";
  assert.throws(() => assertLlmConfigured(), /COMPANION_MODEL/);
  config.llm.provider = "openrouter";
  config.llm.model = "x";
  delete process.env.OPENROUTER_API_KEY;
  assert.throws(() => assertLlmConfigured(), /OPENROUTER_API_KEY/);
});
