# Data Model — 005 Construction

## Cahier des charges et génération (`house.ts`, pur)

- **HouseParams** : `{ footprint: [w, d]; levels: 1 | 2 | 3; basement: boolean; material: WallFamily; roof: "flat" | "gable"; windows: "few" | "normal" | "many"; doorSide: Facing }`
  (bornes : w, d ∈ [5, 24] ; hauteur libre par niveau 3 ; sous-sol ≤ 4 blocs sous le sol)
- `generateHouse(params) → Plan` — déterministe ; garantit : sol plein, murs fermés, toit fermé, porte, ≥ 1 fenêtre
  vitrée par mur extérieur, escaliers reliant tous les niveaux, éclairage suffisant.
- `defaultParams(brief) → HouseParams` — valeurs par défaut sensées pour une demande vague.

## Lumière (`lighting.ts`, pur)

- **LightMap** : `Map<"x,y,z", number>` (0-15) ; `lightMap(grid) → LightMap`
- `uncoveredCells(grid, threshold = 8) → Cell[]` — cases de sol (et abords de la porte, rayon 3) sous le seuil
- `autoLight(grid, budget) → { added: Cell[] } | { error }` — ajoute torches/lanternes jusqu'à couverture

## Plan (extensions de `construction.ts`)

- **Step** gagne `stair_run { from, direction, length, block, headroom }` ; `PlanSchema` inchangé hors cette op.
- **Validation** : `errors` + `essentials: { floor; roof; walls; door; windows; lights; stairs }` (booléens) +
  `connectivity: { levels: number; reachable: boolean }` + `lightUncovered: number`.
- **BUILD_BLOCKS** : sans `dirt`, `mud` brute, `sand`, `gravel`, `red_sand` (garde `mud_bricks`) ; `SCAFFOLD_BLOCK = "dirt"`.

## Chantier (`builder.ts`)

- **Placement** : `{ pos: [x,y,z]; block: string; state?: string; facing?: Facing; support: [x,y,z] | "ground" }`
- `placementOrder(plan, validation) → Placement[]` — pur ; chaque bloc après son appui.
- `reconcile(placements, readBlock) → { done: number; remaining: Placement[]; wrong: Placement[] }` — pur.
- **BuildState** (`data/builds.json`) : `{ id; name; anchor; plan; createdAt; placedHint: number; status: "running" | "paused" | "done" | "failed" }`
- **Actions** (injectées) : `{ placeBlock(placement); breakBlock(pos); goto(pos); count(item); readBlock(pos); scaffoldUp(pos); scaffoldDown(); obtain(item, n); interrupted() }`
- **BuildBudget** : `{ maxMs: 2_400_000; maxFailStreak: 3; maxObtainCalls: 4 }`
- **BuildReport** : `{ status; placed; verified: { checked; ok; ratio }; light: { uncovered }; essentials; mismatches: string[]; message }`

## Site (`site.ts`, pur)

- **SiteCandidate** : `{ anchor; flatness: number; hazards: string[]; protectedHit: boolean }`
- `chooseSite(heights, footprint, protectedZones, home, mode: "free" | "adjacent") → SiteCandidate | null`

## Transitions

`brief → params → plan → validate(+autoLight) → approval → [site] → materials(obtain) → build(placements) → scaffold cleanup → verify → report`
(`paused` possible à tout moment ; `reconcile` à chaque reprise).
