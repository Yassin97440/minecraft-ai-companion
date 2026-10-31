/** File d'instructions en attente : bornée, sans doublon (chaque entrée coûte des requêtes LLM). */
export const MAX_QUEUE = 5;

export type Queued = { username: string; text: string };

/** Ajoute une instruction ; renvoie false si elle est ignorée (doublon). Au-delà du plafond, la plus ancienne saute. */
export function enqueue(queue: Queued[], item: Queued, max = MAX_QUEUE): boolean {
  if (queue.some((q) => q.username === item.username && q.text === item.text)) return false;
  queue.push(item);
  while (queue.length > max) queue.shift();
  return true;
}

/** Délai minimal entre deux « reprends ta mission » déclenchés par des réflexes : un épisode de danger = une relance. */
export const RESUME_COOLDOWN_MS = 30_000;

export function canResumeAfterReflex(lastResumeAt: number, now: number, cooldown = RESUME_COOLDOWN_MS): boolean {
  return now - lastResumeAt >= cooldown;
}
