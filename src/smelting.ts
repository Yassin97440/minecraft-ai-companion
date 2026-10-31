import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { goto, sleep } from "./actions.js";
import { FUELS } from "./sources.js";
import { itemCount } from "./world.js";

const { goals } = pathfinderPkg;

/**
 * Fonte dans un four (spec 001, tranche 2b).
 * `runFurnace` est la boucle d'attente, bornée et interruptible, écrite contre une interface `FurnaceLike` : elle se teste
 * avec un faux four et une horloge injectée. `smeltInFurnace` est l'adaptation Mineflayer, mince et NON vérifiée en jeu.
 */

export interface FurnaceLike {
  putInput(itemType: number, metadata: number | null, count: number): Promise<void>;
  putFuel(itemType: number, metadata: number | null, count: number): Promise<void>;
  outputItem(): { count: number } | null;
  takeOutput(): Promise<unknown>;
  takeInput(): Promise<unknown>;
  takeFuel(): Promise<unknown>;
  close(): void;
}

export type SmeltJob = { inputType: number; fuelType: number; count: number; fuelUnits: number };
export type SmeltDeps = { sleep(ms: number): Promise<void>; interrupted(): boolean; now(): number; msPerItem?: number };
export type SmeltResult = { collected: number; stopped: "done" | "interrupted" | "timeout"; note: string };

/** Un four cuit un objet en 10 s ; on ajoute une marge fixe pour le chargement. */
export const SMELT_MS_PER_ITEM = 10_000;
export const FURNACE_STACK = 64;

export async function runFurnace(furnace: FurnaceLike, job: SmeltJob, deps: SmeltDeps): Promise<SmeltResult> {
  const perItem = deps.msPerItem ?? SMELT_MS_PER_ITEM;
  const deadline = deps.now() + perItem * job.count + 15_000;
  let collected = 0;
  let stopped: SmeltResult["stopped"] = "done";

  await furnace.putFuel(job.fuelType, null, job.fuelUnits);
  await furnace.putInput(job.inputType, null, job.count);

  const harvest = async () => {
    const out = furnace.outputItem();
    if (out && out.count > 0) {
      collected += out.count;
      await furnace.takeOutput();
    }
  };

  while (collected < job.count) {
    if (deps.interrupted()) {
      stopped = "interrupted";
      break;
    }
    if (deps.now() > deadline) {
      stopped = "timeout";
      break;
    }
    await deps.sleep(1000);
    await harvest();
  }
  await harvest();
  // Rien ne reste dans le four : on récupère ce qui n'a pas été cuit et le combustible restant.
  await furnace.takeInput().catch(() => {});
  await furnace.takeFuel().catch(() => {});

  const note =
    stopped === "done"
      ? `${collected} cuit(s)`
      : `${stopped === "interrupted" ? "interrompu par le joueur" : "délai dépassé"} après ${collected}/${job.count} cuit(s)`;
  return { collected, stopped, note };
}

/** Fonte réelle : trouve un four à ≤ 32 blocs, y va, l'ouvre, charge combustible et ingrédient, attend, récupère. */
export async function smeltInFurnace(
  bot: Bot,
  step: { input: string; output: string; fuel: string },
  remaining: number,
  interrupted: () => boolean,
): Promise<string> {
  const furnaceId = bot.registry.blocksByName.furnace?.id;
  const block = furnaceId === undefined ? null : bot.findBlock({ matching: furnaceId, maxDistance: 32 });
  if (!block) return "Impossible : aucun four à proximité (32 blocs).";

  const inputDef = bot.registry.itemsByName[step.input];
  const fuelDef = bot.registry.itemsByName[step.fuel];
  if (!inputDef || !fuelDef) return `Impossible : objet inconnu (${step.input} / ${step.fuel}).`;

  const count = Math.min(remaining, FURNACE_STACK, itemCount(bot, step.input));
  if (count < 1) return `Impossible : je n'ai pas de ${step.input} à cuire.`;
  const perFuel = FUELS.find((f) => f.item === step.fuel)?.smelts ?? 1;
  const fuelUnits = Math.ceil(count / perFuel);
  if (itemCount(bot, step.fuel) < fuelUnits) return `Impossible : il me faut ${fuelUnits} ${step.fuel} comme combustible, j'en ai ${itemCount(bot, step.fuel)}.`;

  try {
    await goto(bot, new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z), 15_000);
  } catch (err) {
    return `Impossible d'atteindre le four (${(err as Error).message}).`;
  }
  let furnace;
  try {
    furnace = await bot.openFurnace(block);
  } catch (err) {
    return `Impossible d'ouvrir le four (${(err as Error).message}).`;
  }
  try {
    const result = await runFurnace(furnace as unknown as FurnaceLike, { inputType: inputDef.id, fuelType: fuelDef.id, count, fuelUnits }, { sleep: async (ms) => void (await sleep(ms)), interrupted, now: Date.now });
    return `Four : ${result.note} (${step.input} -> ${step.output}).`;
  } catch (err) {
    return `Échec de la fonte : ${(err as Error).message}`;
  } finally {
    furnace.close();
  }
}
