# Data Model — 003 Combat et défense

## Équipement (`combat.ts`, pur)

- **Slot** : `head | torso | legs | feet | off-hand | hand`
- **GearItem** : `{ name; slot; score; durabilityLeft: number (0-1); enchants: Record<string, number> }`
- **Loadout** : `Record<Slot, GearItem | null>`
- **LoadoutDiff** : liste ordonnée de `{ slot; equip: GearItem; replaces: GearItem | null }` (vide = rien à faire)
- **DefenseStatus** : `{ armorPoints: number /20; weapon: GearItem | null; shield: boolean; weakest: Slot | null; lowDurability: GearItem[] }`

Règles : `bestLoadout(inventory, equipped) → LoadoutDiff` ; `chooseWeapon(inventory, ctx: { enemies: number; distance: number }) → GearItem | null`
(épée si ≥ 2 adversaires, hache si 1 adversaire et score hache > épée ; arc/arbalète si présents et distance > 6 ; sinon mains nues).

## Monstres

- **Stance** : `fight | ranged | avoid | flee`
- **MobProfile** : `{ stance; keepDistance?: number; weakness?: string; avoidLooking?: boolean }`
- **Threat** : `{ name; dist; hostile: boolean; provoked: boolean }`

## Décision

- **EngagementInput** : `{ health; food; threats: Threat[]; defense: DefenseStatus; shelterBlocks: number; underFire: boolean }`
- **Engagement** : `{ action: "fight" | "flee" | "shelter" | "kite" | "none"; reason: string; keepDistance?: number }`
- **UnseenDamage** : `{ hits: number; windowMs: number; visibleThreats: number }` → `look | retreat | shelter`

## Armement

- **ArmorPlan** : `{ craft: { item; ingots }[]; leftover: number; protectionGain: number }`

## Rapport

- **CombatReport** : `{ killed: number; healthBefore; healthAfter; weapon: string; outcome: string; durationMs }`
  (texte renvoyé + journalisé).

## Transitions d'un combat

`idle → detect → decide(fight|flee|shelter) → (fight: approach → strike → recheck) → end(killed | retreat | timeout | interrupted)`
