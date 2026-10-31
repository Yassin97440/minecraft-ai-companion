import { buildingTools } from "./tools/building.js";
import { chestsTools } from "./tools/chests.js";
import { coreTools } from "./tools/core.js";
import { craftingTools } from "./tools/crafting.js";
import { makeEnv } from "./tools/env.js";
import { memoryTools } from "./tools/memory.js";
import { miningTools } from "./tools/mining.js";
import { survivalTools } from "./tools/survival.js";
import type { Ctx } from "./world.js";

/**
 * Assemble tous les tools du compagnon. Chaque groupe vit dans `src/tools/<groupe>.ts` :
 * core (perception, déplacement), survival, mining, chests, crafting (dont plan_needs/obtain_item),
 * building, memory (mémoire et missions). Un nouveau tool va dans son groupe (ou un nouveau fichier),
 * puis s'ajoute ici ; s'il est inoffensif en mode autonome, aussi à `IDLE_TOOLS` (policy.ts).
 */
export function createTools(ctx: Ctx) {
  const env = makeEnv(ctx);
  const core = coreTools(env);
  const survival = survivalTools(env);
  const mining = miningTools(env);
  const chests = chestsTools(env);
  const crafting = craftingTools(env, mining);
  const building = buildingTools(env);
  const mem = memoryTools(env);

  return [
    core.say,
    core.getStatus,
    core.lookAroundTool,
    core.findBlock,
    crafting.planNeedsTool,
    crafting.obtainItemTool,
    core.goToPlayer,
    core.goTo,
    core.wander,
    core.emote,
    survival.equipItem,
    crafting.placeBlockTool,
    survival.pickupItems,
    survival.fightTool,
    survival.fleeTool,
    survival.takeShelter,
    survival.gearUpTool,
    survival.eat,
    survival.sleepInBed,
    survival.digOut,
    mining.collectBlock,
    mining.mineTunnel,
    chests.chestContents,
    chests.storeInChest,
    chests.takeFromChest,
    crafting.craftItem,
    chests.giveToPlayer,
    building.listBlueprints,
    building.runBlueprint,
    building.buildStructure,
    mem.remember,
    mem.forget,
    mem.startMission,
    mem.missionProgress,
    mem.endMission,
  ];
}
