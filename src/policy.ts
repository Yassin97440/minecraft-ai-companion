import { config } from "./config.js";
import { PlanSchema, summarizePlan, validatePlan } from "./construction.js";

export type Mode = "chat" | "idle";

export type Verdict =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "approve"; question: string };

/** Tools autorisés quand le compagnon agit seul (mode lubie). */
export const IDLE_TOOLS = new Set([
  "say",
  "get_status",
  "look_around",
  "find_block",
  "go_to",
  "wander",
  "emote",
  "equip_item",
  "pickup_items",
  "eat",
  "dig_out",
  "collect_block",
  "craft_item",
  "remember",
]);

const PROTECTED_EXACT = new Set([
  "chest",
  "trapped_chest",
  "ender_chest",
  "barrel",
  "furnace",
  "blast_furnace",
  "smoker",
  "crafting_table",
  "enchanting_table",
  "anvil",
  "beacon",
  "spawner",
  "bedrock",
  "hopper",
  "dispenser",
  "dropper",
  "lectern",
  "jukebox",
]);

export function isProtectedBlock(name: string): boolean {
  return PROTECTED_EXACT.has(name) || name.endsWith("_bed") || name.endsWith("shulker_box") || name.endsWith("_sign");
}

export function inHome(pos: { x: number; y: number; z: number }): boolean {
  const home = config.safety.home;
  if (!home) return false;
  const dx = pos.x - home.x;
  const dz = pos.z - home.z;
  return Math.hypot(dx, dz) <= home.radius;
}

export type PolicyOptions = { autoApproveBuilds: boolean; maxCollect: number; maxTunnel?: number };

/** Fonction pure : décide si un appel de tool passe, est refusé, ou demande l'accord du joueur. */
export function checkToolCall(
  name: string,
  args: Record<string, any>,
  mode: Mode,
  opts: PolicyOptions = {
    autoApproveBuilds: config.safety.autoApproveBuilds,
    maxCollect: config.limits.maxCollect,
    maxTunnel: config.limits.maxTunnel,
  },
): Verdict {
  if (mode === "idle" && !IDLE_TOOLS.has(name)) {
    return { kind: "deny", reason: `Le tool "${name}" n'est pas autorisé quand tu agis seul.` };
  }

  switch (name) {
    case "collect_block": {
      const block = String(args.block ?? "");
      if (isProtectedBlock(block)) {
        return { kind: "deny", reason: `Le bloc "${block}" est protégé, tu ne peux pas le casser.` };
      }
      if (Number(args.count ?? 1) > opts.maxCollect) {
        return { kind: "deny", reason: `Maximum ${opts.maxCollect} blocs par appel. Fais plusieurs appels.` };
      }
      return { kind: "allow" };
    }
    case "mine_tunnel": {
      const max = opts.maxTunnel ?? config.limits.maxTunnel;
      if (Number(args.length ?? 1) > max) {
        return { kind: "deny", reason: `Maximum ${max} pas par tunnel. Fais plusieurs appels.` };
      }
      return { kind: "allow" };
    }
    case "build_structure": {
      // Plan invalide : l'outil renvoie les erreurs au modèle (il corrige son plan) ; rien n'est construit, donc rien à approuver.
      const parsed = PlanSchema.safeParse(args);
      if (!parsed.success) return { kind: "allow" };
      const v = validatePlan(parsed.data);
      if (v.errors.length || opts.autoApproveBuilds) return { kind: "allow" };
      return {
        kind: "approve",
        question: `Je construis ${summarizePlan(parsed.data, v)} ici (devant et à droite de moi) ? (oui/non)`.slice(0, 250),
      };
    }
    case "run_blueprint": {
      if (opts.autoApproveBuilds) return { kind: "allow" };
      return {
        kind: "approve",
        question: `Je construis "${args.name}"${args.wall ? ` (murs: ${args.wall})` : args.wood ? ` (bois: ${args.wood})` : ""} ici, à cet endroit ? (oui/non)`,
      };
    }
    default:
      return { kind: "allow" };
  }
}
