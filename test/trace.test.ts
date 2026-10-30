import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Tracer, readTrace, summarize } from "../src/trace.js";

const mkTracer = (full = true) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-"));
  return { dir, tracer: new Tracer({ dir, full, log: () => {} }) };
};

const echo = tool(async () => "Échec : rien trouvé", { name: "find_block", description: "cherche", schema: z.object({ block: z.string() }) });

test("trace : appels LLM et tools sont journalisés avec tokens, durée et échec", async () => {
  const { tracer } = mkTracer();
  const [t] = tracer.wrapTools([echo]);
  const model = tracer.wrapModel(
    {
      async invoke() {
        return new AIMessage({
          content: "",
          tool_calls: [{ id: "1", name: "find_block", args: { block: "coal_ore" }, type: "tool_call" }],
          usage_metadata: { input_tokens: 1200, output_tokens: 30, total_tokens: 1230 },
        });
      },
    },
    "chat",
    [t],
  );

  tracer.startRun("chat", "Yassin: trouve du charbon");
  await model.invoke([new SystemMessage("système"), new HumanMessage("trouve du charbon")]);
  await t.invoke({ block: "coal_ore" });
  tracer.endRun();

  const recs = readTrace(tracer.filePath!);
  assert.deepEqual(recs.map((r) => r.type), ["llm", "tool", "run"]);
  const [llm, tl, run] = recs as any[];
  assert.equal(llm.inTokens, 1200);
  assert.equal(llm.usage, true);
  assert.deepEqual(llm.toolCalls, ["find_block"]);
  assert.ok(llm.schemaChars > 0, "les schémas de tools sont comptés");
  assert.equal(llm.messages.length, 2, "prompt complet conservé");
  assert.equal(tl.failed, true);
  assert.equal(run.llmCalls, 1);
  assert.equal(run.failures, 1);
  assert.match(summarize(recs), /chat\s+1 appels/);
});

test("trace : sans usage fournisseur, les tokens sont estimés ; TRACE_FULL=false n'écrit pas les prompts", async () => {
  const { tracer } = mkTracer(false);
  const model = tracer.wrapModel({ async invoke() { return new AIMessage("salut"); } }, "idle");
  await model.invoke([new HumanMessage("a".repeat(400))]);
  const [llm] = readTrace(tracer.filePath!) as any[];
  assert.equal(llm.usage, false);
  assert.equal(llm.inTokens, 100);
  assert.equal(llm.messages, undefined);
});

test("trace : une erreur du modèle est journalisée puis relancée", async () => {
  const { tracer } = mkTracer();
  const model = tracer.wrapModel({ async invoke(): Promise<AIMessage> { throw new Error("429"); } }, "chat");
  await assert.rejects(() => model.invoke([new HumanMessage("x")]), /429/);
  const [llm] = readTrace(tracer.filePath!) as any[];
  assert.equal(llm.error, "429");
});

test("trace : désactivé, rien n'est écrit", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-"));
  const tracer = new Tracer({ dir, enabled: false, log: () => {} });
  const model = tracer.wrapModel({ async invoke() { return new AIMessage("x"); } }, "chat");
  await model.invoke([new HumanMessage("x")]);
  assert.equal(fs.readdirSync(dir).length, 0);
});
