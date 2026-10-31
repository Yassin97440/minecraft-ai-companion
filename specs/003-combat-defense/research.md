# Research — 003 Combat et défense

## R1. État du code existant

- `gearUp` : meilleure armure par rang de matériau, bouclier, puis `bestTool("sword") ?? bestTool("axe")` : il
  choisit **toujours l'épée**, même une épée en pierre contre une hache en fer ; ignore l'usure et les
  enchantements ; n'est lancé que sur appel (outil ou réflexe), jamais après un ramassage.
- `decideReflex` : pure, bonne base (creeper, vie ≤ 6, arme + vie ≥ 8 + ≤ 3 monstres) mais **sans profil par
  monstre** (squelette, araignée, sorcière traitées comme un zombie).
- `fight` : suit la cible et frappe avec cooldown ; pas de recul face aux tireurs, pas de bouclier, pas de
  réaction aux dégâts venant de l'ombre.
- `threats` filtre déjà `type === "hostile"` et un ensemble `NEUTRAL` : bonne base du ciblage.
- **Decision**: refactorer par-dessus des tests de caractérisation ; ne pas réécrire.

## R2. Comment comparer deux équipements ?

- **Decision**: `gearScore(item)` = valeur de base par matériau/type (points d'armure ou dégâts par seconde
  selon le cooldown) × facteur d'usure (durabilité restante) + bonus d'enchantement connus (protection,
  tranchant). Table fermée de valeurs issues de la version 1.21.4 (armure : cuir 1/2/3/1 … netherite 3/8/6/3 ;
  dégâts : bois 4, pierre 5, fer 6, diamant 7, netherite 8 pour l'épée ; hache : 7/9/9/9/10 mais plus lente).
- **Rationale**: FR-002, FR-004 ; un vrai joueur préfère une hache en fer (9 dégâts) à une épée en pierre (5)
  en duel isolé, et l'épée en fer (6, rapide) contre plusieurs ennemis. Règle : `chooseWeapon(context)`.
- **Alternatives considered**: simple rang de matériau (rejeté : cas hache/épée faux).

## R3. Profils de monstres

- **Decision**: table `MOB_PROFILES: Record<string, { stance: "fight" | "avoid" | "ranged" | "flee"; keepDistance?: number; weakness?: string; notes }>`
  - zombie, husk, drowned, zombie_villager : fight ;
  - skeleton, stray, bogged : ranged (se rapprocher en zigzag ou se mettre à couvert) ;
  - creeper : flee/frapper puis reculer, jamais à portée d'explosion (3 blocs) ;
  - spider, cave_spider : fight (cave_spider : poison, prudence) ;
  - enderman : avoid (ne jamais regarder ni frapper) ;
  - witch : ranged, priorité ; phantom : abri ; pillager/vindicator : flee sans armure ;
  - inconnu : stance prudente `flee` si pas d'arme, `fight` si arme et vie ≥ 12.
- **Rationale**: FR-008 ; données, pas code.

## R4. Quand s'équiper automatiquement ?

- **Decision**: écouter les changements d'inventaire (`updateSlot`/`playerCollect`), anti-rebond de 5 s, et
  n'équiper que quand aucune menace n'est dans 16 blocs. Aussi au respawn et à l'ouverture d'un coffre.
- **Rationale**: FR-003 ; évite de changer d'arme en plein combat.

## R5. Dégâts de source inconnue

- **Decision**: détecter `bot.health` en baisse sans menace visible ni lave/feu/chute ; réaction pure
  `decideOnUnseenDamage` : s'arrêter, regarder autour (`look_around`), reculer vers un mur ou s'abriter si
  répétition (≥ 2 en 6 s).
- **Rationale**: FR-009 (squelette lointain, mob dans le dos).

## R6. Armurerie autonome

- **Decision**: `armorPlan(ironIngots, have)` ordonne plastron (8) > jambières (7) > casque (5) > bottes (4)
  en protection par lingot ; avec le bouclier (1 fer + 6 planches) en complément ; la fabrication passe par
  `obtain_item` de la 001.
- **Rationale**: FR-012 ; protection par lingot maximale d'abord.

## R7. Ciblage et protection

- **Decision**: `isValidTarget(entity, context)` pur : hostile connu, non neutre, non apprivoisé, pas de
  nom personnalisé, pas joueur ni villageois ; l'enderman n'est ciblé que s'il attaque.
- **Rationale**: FR-007, SC-005.

## R8. Seuils de départ (réglables)

- Retrait sous 6 de vie ; combat si ≥ 8 de vie et ≤ 3 adversaires ; durée max 25 s ; abri si ≥ 13 blocs ;
  portée de mêlée 3,1 blocs. À calibrer avec les traces.
