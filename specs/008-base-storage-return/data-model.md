# Data Model — 008 Base, stockage, retour

## Base (`base.ts`, pur)

- **Rect** : `{ minX; maxX; minZ; maxZ; minY; maxY }`
- **Base** : `{ id; origin: {x,y,z}; margin: number (12); buildings: { name; rect: Rect }[]; storage: StationRef; farms: string[]; perimeter: Rect[] }`
- `perimeterOf(buildings, margin) → Rect[]` ; `contains(base, pos) → boolean`
- **LightSample** : `{ pos; light: number }[]` ; `lightGaps(base, samples, threshold = 8) → Pos[]`
- `planLights(gaps, grid) → { add: { pos; block: "torch" | "lantern" }[] }` (réutilise `autoLight`, 005)
- `chooseExtensionSite(base, footprint, terrain) → SiteCandidate | null`
- `mergeIntoBase(base, building) → Base`

## Stockage (`storage.ts`, pur)

- **ThemeId** : `ores | stone | wood | redstone | redstone_parts | crops | food | mob_loot | gear | misc`
- **Theme** : `{ id; label: string; matches(item): boolean }` — dans l'ordre de priorité (R5)
- `themeOf(item: string) → ThemeId`
- **SurvivalKit** : `{ pickaxe: 1; axe: 1; sword: 1; shield: 1; food: 32 (points); torch: 16; shelterBlocks: 16; waterBucket: 1 }`
- `planDeposit(inventory, kit) → { keep: Record<string, number>; deposit: Record<ThemeId, Record<string, number>>; missingFromKit: Record<string, number> }`
- **ChestEntry** : `{ pos; theme: ThemeId | "unknown"; contents: Record<string, number>; seenAt: number; forbidden: boolean }`
- **StorageIndex** : `Map<posKey, ChestEntry>` ; `findResource(index, item) → ChestEntry[]` (thème attendu d'abord, puis fraîcheur)

## Coffre interdit (`forbidden.ts`, pur)

- `normalizeSign(text: string) → string`
- `isForbiddenText(text) → boolean` (mots entiers : `interdit`, `forbidden`, `ne pas ouvrir`, `prive`, `private`)
- `isForbiddenContainer(chestPos, signsAround: { pos; text }[], partnerPos?) → boolean` (coffre jumeau inclus)
- **Authorization** : `{ pos; grantedBy: string; scope: "once"; expiresAt: number }` — usage unique
- `checkAccess(entry, authorizations, requester) → { ok: true } | { ok: false; reason }`

## Retour (`return.ts`, pur)

- **ReturnConfig** : `{ tReturn: 200; tFinish: 100; itemValue: Record<string, number>; weights: {...}; forced: {...} }`
- **ReturnState** : `{ inventory; health; food; torches; durabilityMin: number; isNight: boolean; threatsNear: number; distanceToBase: number; lightAhead: boolean; fullness: number (0-1); defense: DefenseStatus }`
- `carriedValue(inventory, itemValue) → number` ; `fragility(state) → number (0-1)`
- `forcedReturn(state, cfg) → string | null` (inventaire plein ≥ 0,9 ; durabilité < 10 % ; nourriture critique ; torches 0 ; nuit + défense faible)
- `decideReturn(state, cfg) → { action: "continue" | "finish_then_return" | "return_now" | "emergency"; reason: string; value: number; risk: number }`

## Persistance (`base-store.ts` → `data/base.json`)

```text
{
  "base": { ...Base },
  "index": [ ChestEntry ],
  "trail": [ {x,y,z,t} ],
  "settings": { "tReturn": 200, "margin": 12, "kit": {...} },
  "log": [ { "t": number, "kind": "return"|"deposit"|"refused"|"light", "text": string } ]
}
```

## Transitions

Sortie : `depart (trail on) → work → decideReturn each tick → return_now → follow trail → arrive → base_routine`.
Routine : `deposit by theme → heal/eat → kit refill → light check → decide (leave | rest)`.
Coffre : `request → withChest guard → forbidden? → (owner approve) → open → update index`.
