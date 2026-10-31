# Data Model — 004 Progression

## Paliers et situation (`progression.ts`, pur)

- **TierId** : `wood | stone | iron | diamond | nether | ender`
- **Tier** : `{ id; requires: (s: Situation) => boolean; goals: Goal[]; advanced: boolean }`
- **Situation** : `{ inventory; equipment: DefenseStatus; foodStock: number; health; food; timeOfDay; isNight; torches; shelterBlocks; knownSites: Site[]; ownerOnline; deaths; budgetLeft }`
- **Goal** : `{ kind: "shelter" | "heal" | "resupply" | "gear" | "obtain" | "explore" | "return" | "wait"; item?; count?; tier?; reason: string }`
- **Equipped** : `{ ok: boolean; missing: string[] }` — résultat de `isEquipped(situation, thresholds)`

Règles :
- `currentTier(situation) → TierId` (déterministe, état réel).
- `chooseGoal(situation, settings) → Goal` (ordre de R4 ; `settings` = priorités/interdictions du joueur).
- Un objectif de palier `advanced` (nether, ender) exige `ownerOnline` pour être **exécuté** ; sinon `Goal.kind = "gear"` ou `wait` (préparation).

## Autorisation (`policy.ts`, pur)

- **AutonomyContext** : `{ ownerConfigured: boolean; ownerOnline: boolean; busy: boolean; enabled: boolean; paused: boolean; budgetLeft: boolean }`
- `canStartAutonomy(ctx) → { ok: true } | { ok: false; reason }` — vrai seulement si propriétaire configuré, hors ligne, inactif, activé, non suspendu, budget restant.
- `PROGRESS_TOOLS` = `IDLE_TOOLS` + `obtain_item`, `resupply_food`, `prepare_for_trip`, `explore`, `return_to_base`.

## Durable (`progress-store.ts` → `data/progress.json`)

```text
{
  "settings": { "enabled": true, "paused": false, "priority": "diamond" | null, "forbid": ["descendre"], "maxDeaths": 3 },
  "tier": "stone",
  "log": [ { "t": 1700000000000, "kind": "tier"|"goal"|"find"|"incident"|"death"|"stop", "text": "…", "pos"?: {x,y,z} } ],
  "session": { "startedAt": number, "llmRequests": number, "deaths": number, "failStreak": number } | null,
  "lastOwnerSeen": number
}
```

Le journal est borné (500 entrées) ; seules les entrées **constatées** y entrent.

## Exécuteur (`autonomy.ts`)

- **Deps** (injectées) : `{ situation(): Situation; obtain(item,count); resupply(); prepare(distance); explore(leg); returnToBase(); say(text); now(); interrupted(): boolean; llmRequests(): number }`
- **Budget** : `{ maxLlmRequests: 60; maxDeaths: 3; maxMs: 5_400_000; maxFailStreak: 5 }`
- **Tick** : `situation → canStartAutonomy → chooseGoal → policy check → exécution d'une étape → journal → vérification de l'interruption`

## Transitions de la session

`idle → running (canStartAutonomy ok) → (stopped: owner online | budget | deaths | failStreak | disabled) → summary → idle`
