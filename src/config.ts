import "dotenv/config";
import { existsSync } from "node:fs";
import { join } from "node:path";

const env = (key: string, fallback?: string) => process.env[key] || fallback;
const num = (key: string, fallback: number) => Number(env(key, String(fallback)));

const homeSet = env("HOME_X") !== undefined && env("HOME_Z") !== undefined;

export const config = {
  mc: {
    host: env("MC_HOST", "localhost")!,
    port: num("MC_PORT", 25565),
    username: env("MC_USERNAME", "Compagnon")!,
    version: env("MC_VERSION"), // undefined = auto-détection
    // Monde du serveur LOCAL : permet d'exécuter un plan de construction en un seul `/function` (voir tools.ts).
    // Sans lui, les commandes partent une par une dans le chat (lent). Par défaut : server/world s'il existe.
    worldDir: env("WORLD_DIR") ?? (existsSync(join("server", "world", "datapacks")) ? join("server", "world") : undefined),
  },
  llm: {
    // openrouter | google (AI Studio) | ollama | anthropic
    provider: env("LLM_PROVIDER", "openrouter")!,
    model: env("COMPANION_MODEL", "")!,
    // Par défaut, le même modèle que l'agent.
    idleModel: env("COMPANION_IDLE_MODEL") ?? env("COMPANION_MODEL", "")!,
    ollamaUrl: env("OLLAMA_BASE_URL", "http://localhost:11434")!,
    temperature: num("LLM_TEMPERATURE", 0.7),
  },
  // Si défini, seul ce joueur peut donner des ordres.
  owner: env("OWNER_USERNAME"),
  personality: env(
    "PERSONALITY",
    "Tu es Bob, un compagnon de survie fiable, direct et pince-sans-rire. Tu es compétent et tu le sais. " +
      "Ton humour est sec et discret : une petite vanne de temps en temps, jamais à chaque message. " +
      "Seul petit travers : une tendresse pour les poules.",
  )!,
  idle: {
    enabled: env("IDLE_ENABLED", "true") === "true",
    afterSeconds: num("IDLE_AFTER_SECONDS", 90),
    cooldownSeconds: num("IDLE_COOLDOWN_SECONDS", 180),
  },
  limits: {
    maxStepsPerRun: 12,
    maxCollect: 32,
    maxTunnel: 24,
    /** Plafond d'étapes LLM pour un tour pendant une mission (sinon `maxStepsPerRun`). */
    missionSteps: 60,
    historyMessages: 40,
  },
  safety: {
    // Les constructions demandent toujours une validation, sauf si tu le désactives.
    autoApproveBuilds: env("AUTO_APPROVE_BUILDS", "false") === "true",
    // Zone protégée : le bot n'y casse rien tout seul.
    home: homeSet
      ? {
          x: num("HOME_X", 0),
          y: num("HOME_Y", 64),
          z: num("HOME_Z", 0),
          radius: num("HOME_RADIUS", 20),
        }
      : null,
  },
};

export type Config = typeof config;
