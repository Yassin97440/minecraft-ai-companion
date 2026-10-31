# Data Model — 006 Fermes à ressources

## Conceptions (`farms.ts`, pur)

- **FarmKind** : `crop | animal | wood | mobtrap`
- **CropParams** : `{ crop: "wheat" | "carrot" | "potato" | "beetroot" | "melon" | "pumpkin" | "sugar_cane"; size: [w, d] (≤ 15×15); collector: boolean }`
- **AnimalParams** : `{ species: "cow" | "pig" | "sheep" | "chicken" | "rabbit"; pen: [w, d] (≤ 12×12); target: number (≤ 12); collector: boolean }`
- **WoodParams** : `{ species: "oak" | "birch" | "spruce" | ...; grid: [cols, rows] (≤ 5×5) }`
- **MobTrapParams** : `{ platform: [w, d] (≤ 11×11); dropHeight: integer ≥ 24 (≤ 40); collector: true }`
- `generateFarm(kind, params) → Plan` (avec `kind: "farm"`) ; `validateFarm(plan, kind, params) → FarmValidation`
- **FarmValidation** : `{ errors; hydrationUncovered: number; fenceOpen: boolean; lightOutsideUncovered: number; darkInsideOk: boolean; entityCap: number }`

## Règles de gestion (pures)

- `herdActions(counts: { adults; babies }, target) → { breed: number; cull: number; shear: boolean; bring: number }`
- `cropActions(cells: { pos; stage; maxStage }[]) → { harvest: pos[]; wait: pos[]; replant: pos[] }`
- `forestActions(trees: { pos; mature: boolean }[], saplings: number) → { fell: pos[]; plant: pos[] }`
- `estimateYield(kind, params, cycleMinutes) → { item: string; min: number; max: number }[]`
- `proposeFarm(needLog, registry) → { kind; params; cost: Record<string, number>; yield; reason } | null`

## Registre (`farm-registry.ts` → `data/farms.json`)

```text
{
  "farms": [ {
    "id": "crop-1", "kind": "crop", "origin": {x,y,z}, "size": [9,9], "params": {...},
    "createdAt": number, "lastVisit": number, "population": number | null,
    "observedYield": [ { "t": number, "gained": { "wheat": 38 } } ],
    "issues": [ "eau manquante en (x,y,z)" ], "status": "ok" | "degraded" | "broken"
  } ],
  "needLog": { "need:wood": [ts, ts, ts] }
}
```

Règle : un registre ancien est **vérifié à l'arrivée** (cases attendues vs monde) avant toute action.

## Cycle (`farm-cycle.ts`)

- **Actions** (injectées) : `{ readCells(farm); harvest(pos); plant(pos, seed); countAnimals(farm); breed(species); shear(); slaughter(id); fell(pos); plantSapling(pos); emptyCollector(farm); isProtected(entity); count(item); interrupted() }`
- **Budget** : `{ maxMs: 300_000; maxFailStreak: 3 }`
- **CycleReport** : `{ farmId; status: "done" | "partial" | "failed" | "interrupted"; gained: Record<string, number>; actions: string[]; issues: string[]; message }`

## Transitions

Ferme : `proposed → approved → built → verified (test cycle) → active ↔ degraded → repaired | abandoned`.
Cycle : `arrive → verify registry → act (harvest / breed / shear / fell …) → replant → collect → report → leave`.
