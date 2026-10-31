# Data Model — 002 Alimentation

## Types purs (`food.ts`)

- **FoodCategory** : `safe | fallback | harmful | precious`
- **FoodInfo** : `{ name; points: number; saturation: number; category; cooked: boolean }` (dérivé du registre)
- **Stock** : `{ total: number; byCategory: Record<FoodCategory, number>; items: Record<string, number> }`
  (points de faim restaurables ; `harmful` exclu du total)
- **MealChoice** : `{ item }` ou `{ refusal: "full" | "none" | "only_harmful" | "only_precious_not_urgent" | "interrupted"; detail }`
- **Thresholds** : `{ safeStock: 40; eatBelow: 10; resupplyBelowFood: 14; criticalFood: 6 }`
- **Urgency** : `{ food: number; health: number; threatNear: boolean }`

Règles : `chooseMeal(inventory, urgency) → MealChoice` (déterministe) ; `needsResupply(stock, urgency, planned) → boolean`.

## Approvisionnement (`resupply.ts`)

- **FoodSource** : `chest | crop | hunt | fish | explore`, avec `estimate: { cost: number; yield: number }`
- **ResupplyPlan** : liste ordonnée de sources à essayer jusqu'à atteindre le stock cible
- **Budget** : `{ maxMs: 300_000; maxSteps: 30; maxFailStreak: 3 }`
- **ResupplyReport** : `{ status: "done" | "failed" | "interrupted" | "budget"; gained: number (points); message }`

## Mémoire

`nourriture:<source>` → `{ kind: "place", text, pos, seenAt }` (existant). Vérifié à l'arrivée, effacé si absent.

## Transitions

Repas : `choose → equip → consume → wait(≤1,5 s) → verify (faim↑ ?) → done | retry(≤2) | fail`.
