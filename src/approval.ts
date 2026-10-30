export type Approval = "yes" | "no" | "unclear";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "oui", "ouii", "ouiii", "okok", "ok", "d'accord", "vas-y", "go"...
const YES_START = /^(o+u+i+|ouais|yes|yep|yeah|(ok)+|okay|d'?accord|dac|go|vas y|fonce|allez|carrement|bien sur|parfait|lance|construis|c'?est bon|ca marche)\b/;
const YES_ANYWHERE = /\b(o+u+i+|ouais|yes|ok|okay|d'?accord|go|fonce|vas y)\b/;
const NO_ANYWHERE = /\b(non+|nan|nope|annule|stop|arrete|attends|laisse tomber|pas maintenant|surtout pas)\b/;

/**
 * Interprète la réponse du joueur à une demande d'accord.
 * "unclear" = ni oui ni non (ou les deux) : on repose la question au lieu de compter ça comme un refus.
 */
export function parseApproval(message: string): Approval {
  const text = normalize(message);
  const yes = YES_START.test(text) || YES_ANYWHERE.test(text);
  const no = NO_ANYWHERE.test(text);
  if (yes && !no) return "yes";
  if (no && !yes) return "no";
  return "unclear";
}
