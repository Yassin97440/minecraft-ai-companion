# Data Model — 007 Redstone

## Catalogue (`redstone.ts`, pur)

- **ComponentRole** : `source | transmission | detection | action | storage`
- **Component** : `{ name; role; signal: { emits?: number; reads?: string; range?: number }; delayTicks?: number; orientation?: { significantFace: boolean; rule: string }; support?: string; hazard?: "fire" | "explosion" | null; description: string }`
- `explain(name) → string | { unknown: true }`
- `materialsFor(name, count, registry) → Record<string, number>` — dérivé des recettes de `minecraft-data`
- `quartzNeeds(items) → number`

## Montages (`circuits.ts`, pur)

- **CircuitId** : `auto_door | daylight_lamps | lever_lamps | melon_pumpkin_farm | sugar_cane_farm | wheat_flush_farm | mob_trap_auto | animal_farm_auto`
- **CircuitTemplate** : `{ id; title; params: ZodSchema; quartz: (p) => number; status: "validated" | "experimental"; fallback?: CircuitId; instantiate(p, facing) → Blueprint; test(p) → ActivationTest }`
- **Blueprint** : `{ id; name; blocks: { pos: [x,y,z]; block: string; state?: Record<string,string> }[]; bbox; components: Record<string, number>; cost: Record<string, number>; quartz: number }`
- **ActivationTest** : `{ steps: ({ act: "step_on" | "step_off" | "pull_lever" | "cover" | "uncover" | "wait"; at?: [x,y,z]; ticks?: number })[]; expect: { at: [x,y,z]; state: Record<string,string> }[]; productionAt?: [x,y,z] }`
- `validateCircuit(blueprint) → { errors: string[]; warnings: string[] }` — règles : composants autorisés ; orientation ;
  appui ; portée du signal (≤ 15 entre répéteurs) ; interdits (TNT, lave, feu, horloge rapide) ; ≤ 150 composants.
- **Orientation** (`circuit-orient.ts`) : `orientationPlan(item, facing) → { standOffset: [dx,dy,dz]; lookAtFace: Face }` ; `verifyFacing(readState, expected)`.

## Supervision (`systems-monitor.ts`)

- **Fault** : `{ kind: "missing" | "wrong_facing" | "signal_cut" | "chest_full" | "no_production"; at?: [x,y,z]; repair: RepairAction }`
- **RepairAction** : `place(block, state) | rotate | refill_wire | empty_chest | retest | alert_player`
- `diagnose(blueprint, readState, productionObserved) → Fault[]` (pur)

## Registre (`systems-registry.ts` → `data/systems.json`)

```text
{ "systems": [ {
  "id": "lamps-1", "circuit": "daylight_lamps", "origin": {x,y,z}, "facing": "north", "params": {...},
  "builtAt": number, "lastTest": { "t": number, "ok": boolean, "detail": string } | null,
  "lastCheck": number, "faults": [], "status": "ok" | "degraded" | "broken" | "untested"
} ] }
```

## Chantier (réutilisation 005)

`Placement` gagne `state` (propriétés du bloc) et `orientation` ; l'ordre : appui → composants (pistons, observateurs,
entonnoirs) → poussière et répéteurs → portes/plaques ; poussière en dernier.

## Transitions

Système : `selected → validated → approved → built → tested (ok | failed → repaired ≤ 3) → active → (check) degraded → repaired | alert`.
