# Data Model — 001 Autonomie en ressources

Types TypeScript purs (sans dépendance Mineflayer) ; noms indicatifs.

## Entrées

- **Goal** : `{ item: string; count: number }` — `item` validé contre le registre (nom canonique).
- **Inventory** : `Map<string, number>` — total par nom d'objet (déjà fourni par `inventoryTotals`).
- **RecipeDb** : accès en lecture aux recettes (`recipesFor(itemName) → Recipe[]`), aux blocs (`harvestTools`,
  `drops`) et aux noms d'objets. Implémenté par `minecraft-data` ; remplaçable en test.

## Tables fermées (`sources.ts`)

- **RawSource** : `{ resource: string; blocks: string[]; minTool: Tier | null; drops: string }`
  ex. `iron` → blocs `iron_ore`, `deepslate_iron_ore`, outil `stone`, donne `raw_iron`.
- **SmeltRule** : `{ input: string; output: string; perFuelUnit: number }` ex. `raw_iron → iron_ingot`.
- **Fuel** : `{ item: string; smelts: number }` ex. `coal: 8`, `oak_planks: 1.5`.
- **OutOfScope** : ensemble de noms d'objets refusés (Nether/End).
- **Tier** : `wooden < stone < iron < diamond`.

## Sortie du planificateur

- **Step** (union discriminée) :
  - `gather { resource, block[], count, tool: Tier | null }`
  - `craft { item, count, station: "hand" | "table" }`
  - `smelt { input, output, count, fuel }`
  - `place_station { station: "crafting_table" | "furnace" }`
- **NeedsPlan** : `{ goal, have: Record<string, number>, missing: Record<string, number>, steps: Step[], ok: true }`
- **Refusal** : `{ ok: false, reason: "unknown_item" | "out_of_scope" | "not_craftable" | "quantity_cap" | "cycle"; detail: string }`

Règles de validation :
- Quantité entière ≥ 1 et ≤ plafond (256 blocs/bûches, 64 sinon).
- Déjà possédé en quantité suffisante → plan vide avec `missing = {}` et message « rien à faire ».
- Profondeur de développement ≤ 12 ; cycle détecté → `Refusal.cycle`.
- Les étapes sont topologiquement ordonnées : outil → récolte → transformation → fabrication.

## Exécution

- **Budget** : `{ maxSteps: 40; maxFailStreak: 3; maxMs: 480_000 }`
- **StepResult** : `{ ok: boolean; gained: Record<string, number>; note: string }` — `gained` calculé
  par différence d'inventaire, jamais déclaré par l'action.
- **ObtainReport** : `{ status: "done" | "failed" | "interrupted" | "budget"; obtained: Record<string, number>;
  stepsRun: number; failedStep?: Step; message: string }` — le message commence par un mot de la convention
  d'échec si `status !== "done"`.

## État durable

- Mémoire : `gisement:<ressource>` → `{ kind: "place", text, pos, seenAt }` (existant, aucune migration).

## Transitions d'une étape

`pending → running → (done | retry(≤3) → failed)` ; `running → interrupted` à tout moment.
