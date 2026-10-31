/** Mémoire durable et missions : remember, forget, start_mission, mission_progress, end_mission. */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolEnv } from "./env.js";



export function memoryTools(env: ToolEnv) {
  const { memory } = env;

  const remember = tool(
    async ({ key, kind, text, x, y, z: zc }) => {
      const pos = x !== undefined && y !== undefined && zc !== undefined ? { x, y, z: zc } : undefined;
      memory.set(key, kind, text, pos);
      return `Mémorisé "${key}" (${kind}). Je le retrouverai dans ma mémoire durable, même après un redémarrage.`;
    },
    {
      name: "remember",
      description:
        "Enregistrer dans ta mémoire durable (relue à chaque décision) une info utile PLUS TARD : un lieu (mine, base, ferme, coffre), " +
        "une préférence ou règle du joueur, un fait important. Même clé = remplace l'ancienne valeur. " +
        "Pas pour l'état instantané (position, inventaire) ni pour ce qui est déjà dans la mémoire. Les lits, coffres et la mine sont notés automatiquement.",
      schema: z.object({
        key: z.string().describe("Identifiant court et stable, ex: base, mine_fer, pref_humour"),
        kind: z.enum(["place", "preference", "fact"]),
        text: z.string().describe("L'info, en une phrase"),
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
      }),
    },
  );

  const forget = tool(
    async ({ key }) => (memory.forget(key) ? `Oublié "${key}".` : `Rien à oublier sous la clé "${key}".`),
    {
      name: "forget",
      description: "Supprimer une entrée de ta mémoire durable devenue fausse ou inutile (par sa clé).",
      schema: z.object({ key: z.string() }),
    },
  );

  const startMission = tool(
    async ({ goal, objectives }) => {
      memory.startMission(goal, objectives);
      return `Mission enregistrée : ${goal}. Objectifs : ${objectives.join(", ")}. Enchaîne maintenant avec le premier, sans t'arrêter à chaque étape.`;
    },
    {
      name: "start_mission",
      description:
        "À appeler dès que le joueur donne une consigne en PLUSIEURS étapes ou longue (ex: 'trouve du fer, du diamant et de la redstone'). " +
        "Tu continueras automatiquement jusqu'à la fin. Pas pour une action simple et immédiate.",
      schema: z.object({
        goal: z.string().describe("La consigne du joueur, résumée"),
        objectives: z.array(z.string()).min(1).max(8).describe("Les objectifs concrets, ex: ['10 fer', '3 diamants']"),
      }),
    },
  );

  const missionProgress = tool(
    async ({ objective }) => {
      const m = memory.markObjective(objective);
      if (!m) return `Aucun objectif ne correspond à "${objective}" (ou pas de mission active).`;
      const left = m.objectives.filter((o) => !o.done).map((o) => o.text);
      return left.length
        ? `Objectif coché. Il reste : ${left.join(", ")}. Continue avec le suivant.`
        : "Tous les objectifs sont faits : appelle end_mission(done) avec un résumé.";
    },
    {
      name: "mission_progress",
      description: "Cocher un objectif de la mission une fois réellement atteint (vérifié par l'inventaire), puis enchaîner sur le suivant.",
      schema: z.object({ objective: z.string() }),
    },
  );

  const endMission = tool(
    async ({ status, summary }) =>
      memory.endMission(status, summary)
        ? `Mission ${status === "done" ? "terminée" : "abandonnée"}. Annonce le résultat au joueur en une phrase.`
        : "Pas de mission active.",
    {
      name: "end_mission",
      description: "Terminer la mission : done si tout est fait, abandoned si c'est impossible ou si le joueur change de plan.",
      schema: z.object({ status: z.enum(["done", "abandoned"]), summary: z.string() }),
    },
  );

  return { remember, forget, startMission, missionProgress, endMission };
}
