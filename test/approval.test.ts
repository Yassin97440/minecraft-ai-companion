import test from "node:test";
import assert from "node:assert/strict";
import { parseApproval } from "../src/approval.js";

test("réponses positives, y compris celles qui étaient refusées à tort", () => {
  for (const m of ["oui", "Oui !", "ouii", "ouiii", "okok, oui ici stp", "ok", "go", "vas-y", "d'accord", "oui ici stp", "fonce"]) {
    assert.equal(parseApproval(m), "yes", m);
  }
});

test("réponses négatives", () => {
  for (const m of ["non", "nan", "non merci", "annule", "stop", "attends", "laisse tomber"]) {
    assert.equal(parseApproval(m), "no", m);
  }
});

test("réponses ambiguës ou hors sujet : ni oui ni non", () => {
  for (const m of ["tu fais quoi?", "il y a un établi là", "oui mais non", "je t'ai lancé 4 torches"]) {
    assert.equal(parseApproval(m), "unclear", m);
  }
});
