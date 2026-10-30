import test from "node:test";
import assert from "node:assert/strict";
import { PlanSchema, planCommands, summarizePlan, validatePlan, verifyGrid, type Plan } from "../src/construction.js";
import { checkToolCall } from "../src/policy.js";

const plan = (p: Plan): Plan => PlanSchema.parse(p);

/** Cabane 10x15 : sol en bois, murs de 3, toit, porte au nord, une torche murale. */
const cabin = (over: Partial<Plan> = {}): Plan =>
  plan({
    name: "cabane",
    steps: [
      { op: "box", from: [0, -1, 0], to: [9, -1, 14], block: "oak_planks" },
      { op: "box", from: [0, 0, 0], to: [9, 2, 14], block: "cobblestone", mode: "walls" },
      { op: "box", from: [0, 3, 0], to: [9, 3, 14], block: "cobblestone" },
      { op: "door", at: [4, 0, 0], block: "oak_door", facing: "north" },
      { op: "block", at: [1, 1, 3], block: "wall_torch", facing: "east" },
    ],
    ...over,
  });

test("cabane valide : coûts exacts, aucune erreur", () => {
  const v = validatePlan(cabin());
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.cost, { oak_planks: 150, cobblestone: 288, oak_door: 1, torch: 1 });
  assert.equal(summarizePlan(cabin(), v).startsWith("« cabane » 10x15x5"), true);
});

test("le schéma accepte un plan bien formé et refuse un plan sans étapes", () => {
  assert.ok(PlanSchema.safeParse(cabin()).success);
  assert.equal(PlanSchema.safeParse({ name: "x", steps: [] }).success, false);
});

test("toit manquant : aucun volume fermé", () => {
  const p = cabin();
  p.steps = p.steps.filter((s) => !(s.op === "box" && s.from?.[1] === 3));
  assert.match(validatePlan(p).errors.join(" "), /Aucun espace intérieur fermé/);
});

test("murs d'un seul bloc de haut : intérieur trop bas (le bug de l'ancienne cabane)", () => {
  const low = plan({
    name: "basse",
    steps: [
      { op: "box", from: [0, -1, 0], to: [4, -1, 4], block: "oak_planks" },
      { op: "box", from: [0, 0, 0], to: [4, 0, 4], block: "cobblestone", mode: "walls" },
      { op: "box", from: [0, 1, 0], to: [4, 1, 4], block: "cobblestone" },
      { op: "door", at: [2, 0, 0], block: "oak_door", facing: "north" },
    ],
  });
  assert.match(validatePlan(low).errors.join(" "), /trop bas/);
});

test("sans porte, ou porte tournée vers l'intérieur : erreurs explicites", () => {
  const noDoor = cabin();
  noDoor.steps = noDoor.steps.filter((s) => s.op !== "door");
  assert.match(validatePlan(noDoor).errors.join(" "), /Aucune porte/);

  const flipped = cabin();
  flipped.steps = flipped.steps.map((s) => (s.op === "door" ? { ...s, facing: "south" as const } : s));
  assert.match(validatePlan(flipped).errors.join(" "), /facing="north"/);
});

test("blocs interdits, coordonnées hors limites, torche flottante", () => {
  const bad = plan({
    name: "mauvais",
    kind: "decor",
    steps: [
      { op: "block", at: [1, 0, 1], block: "tnt" },
      { op: "block", at: [99, 0, 1], block: "cobblestone" },
      { op: "block", at: [3, 0, 3], block: "wall_torch", facing: "east" },
      { op: "block", at: [4, 0, 4], block: "oak_stairs", state: "half=sideways" },
    ],
  });
  const text = validatePlan(bad).errors.join("\n");
  assert.match(text, /"tnt" non autorisé/);
  assert.match(text, /hors limites/);
  assert.match(text, /état invalide/);
  assert.match(validatePlan(plan({ name: "t", kind: "decor", steps: [{ op: "block", at: [3, 0, 3], block: "wall_torch", facing: "east" }] })).errors.join(), /flottante/);
});

test("décor : un enclos sans toit ni porte est accepté", () => {
  const fence = plan({
    name: "enclos",
    kind: "decor",
    steps: [{ op: "box", from: [0, 0, 0], to: [6, 0, 6], block: "oak_fence", mode: "walls" }],
  });
  const v = validatePlan(fence);
  assert.deepEqual(v.errors, []);
  assert.equal(v.cost.oak_fence, 24);
});

test("taille maximale", () => {
  const huge = plan({ name: "énorme", kind: "decor", steps: [{ op: "box", from: [0, 0, 0], to: [23, 15, 23], block: "cobblestone" }] });
  assert.match(validatePlan(huge).errors.join(" "), /Trop de blocs/);
});

test("commandes : paiement, dégagement, étapes, coordonnées absolues", () => {
  const p = cabin();
  const cmds = planCommands(p, validatePlan(p), { x: 100, y: 64, z: 200 });
  assert.ok(cmds.slice(0, 4).every((c) => c.startsWith("clear @s minecraft:")), "paiement d'abord");
  assert.ok(cmds.includes("clear @s minecraft:cobblestone 288"));
  assert.ok(cmds.includes("fill 100 64 200 109 67 214 minecraft:air"), "dégagement de l'emprise");
  assert.ok(cmds.includes("fill 100 63 200 109 63 214 minecraft:oak_planks"));
  for (const wall of [
    "fill 100 64 200 109 66 200 minecraft:cobblestone", // nord
    "fill 100 64 214 109 66 214 minecraft:cobblestone", // sud
    "fill 100 64 200 100 66 214 minecraft:cobblestone", // ouest
    "fill 109 64 200 109 66 214 minecraft:cobblestone", // est
    "fill 100 67 200 109 67 214 minecraft:cobblestone", // toit
  ]) {
    assert.ok(cmds.includes(wall), wall);
  }
  assert.ok(cmds.includes("setblock 104 64 200 minecraft:oak_door[half=lower,facing=north,hinge=left]"));
  assert.ok(cmds.includes("setblock 104 65 200 minecraft:oak_door[half=upper,facing=north,hinge=left]"));
  assert.ok(cmds.includes("setblock 101 65 203 minecraft:wall_torch[facing=east]"));
  assert.ok(cmds.every((c) => c.length < 200), "chaque commande tient dans un message de chat");
});

test("commande hollow seulement si chaque dimension fait 3 ou plus", () => {
  const p = plan({
    name: "h",
    kind: "decor",
    steps: [
      { op: "box", from: [0, 0, 0], to: [4, 3, 4], block: "stone_bricks", mode: "hollow" },
      { op: "box", from: [6, 0, 0], to: [7, 3, 4], block: "stone_bricks", mode: "hollow" },
    ],
  });
  const cmds = planCommands(p, validatePlan(p), { x: 0, y: 0, z: 0 }).filter((c) => c.startsWith("fill") && c.includes("stone_bricks"));
  assert.ok(cmds[0].endsWith(" hollow"));
  assert.ok(!cmds[1].endsWith(" hollow"));
});

test("vérification du monde réel contre le plan", () => {
  const v = validatePlan(cabin());
  const perfect = verifyGrid(v.grid, (x, y, z) => v.grid.get(`${x},${y},${z}`) ?? null);
  assert.equal(perfect.ratio, 1);
  const holey = verifyGrid(v.grid, (x, y, z) => (x === 0 ? "air" : (v.grid.get(`${x},${y},${z}`) ?? null)));
  assert.ok(holey.ratio < 1 && holey.mismatches.length > 0);
});

test("politique : plan valide => accord demandé ; plan invalide => l'outil renvoie les erreurs", () => {
  const opts = { autoApproveBuilds: false, maxCollect: 32 };
  const verdict = checkToolCall("build_structure", cabin() as any, "chat", opts);
  assert.equal(verdict.kind, "approve");
  if (verdict.kind === "approve") assert.match(verdict.question, /cabane.*10x15x5/);

  const invalid = cabin();
  invalid.steps = invalid.steps.filter((s) => s.op !== "door");
  assert.equal(checkToolCall("build_structure", invalid as any, "chat", opts).kind, "allow");
  assert.equal(checkToolCall("build_structure", cabin() as any, "chat", { ...opts, autoApproveBuilds: true }).kind, "allow");
  assert.equal(checkToolCall("build_structure", cabin() as any, "idle", opts).kind, "deny");
});
