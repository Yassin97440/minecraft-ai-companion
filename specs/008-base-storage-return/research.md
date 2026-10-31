# Research — 008 Base, stockage, retour

## R1. État du code existant

- La « base » est un point + rayon dans `.env` (`HOME_X/Y/Z`, `HOME_RADIUS`) ; `inHome` protège seulement contre
  la destruction. Aucune notion de périmètre éclairé ni d'extension.
- Tous les tools de coffre passent par `withChest(args, fn)` (`src/tools.ts`) : bon **point d'application unique**
  pour la règle « interdit ». `store_in_chest("*")` garde déjà outils, armures, nourriture, torches : base de la
  trousse de survie.
- `isProtectedBlock` protège coffres, lits, établis, pancartes… de la destruction.
- **Decision**: conserver `HOME_*` comme amorce (migration douce vers `data/base.json`), appliquer les nouvelles règles
  à `withChest` et au casseur de blocs.

## R2. Définition du périmètre

- **Decision**: `perimeterOf(buildings, margin)` = union des boîtes englobantes des bâtiments agrandies de `margin`
  (défaut 12 blocs) ; stocké comme liste de rectangles ; `contains(pos)` pur. La base garde un `origin` (point de
  retour) et une liste de bâtiments/fermes/stockage.
- **Rationale**: FR-001 ; simple, testable, extensible.
- **Alternatives considered**: cercle autour d'un point (insuffisant pour des extensions allongées).

## R3. Lumière : comment la mesurer ?

- **Decision**: échantillonner une grille (pas de 2) sur le sol du périmètre avec `bot.blockAt(pos).light` (lumière de
  bloc) ; une case est « sous le seuil » si `light < seuil` (défaut 8 ; le jeu 1.21.4 n'autorise l'apparition qu'à
  lumière de bloc 0, donc 8 est une marge, réglable). `planLights(gaps, existing)` réutilise `autoLight` de la 005.
- **Rationale**: FR-002, SC-001 ; mesure réelle, pas supposée.

## R4. Extension de la base

- **Decision**: `chooseExtensionSite(base, footprint)` choisit un emplacement adjacent (≤ 6 blocs d'un bâtiment) selon
  `chooseSite` (005) ; le chantier éclaire la zone **avant** (zones de travail) et **après** ; `mergeIntoBase` met le
  périmètre à jour ; la zone ajoutée est vérifiée par échantillonnage.
- **Rationale**: FR-003, SC-002.

## R5. Classification en thèmes

- **Decision**: thèmes = listes fermées par nom exact + règles de préfixe/suffixe (`*_log`, `*_planks`, `*_ore`,
  `raw_*`, `*_ingot`, `*_pickaxe`, etc.), priorité : *redstone-composants* (pistons, répéteurs…) > *redstone-matière*
  > *minerais* > *pierre* > *bois* > *cultures* > *nourriture* > *butin* > *équipement* > *fourre-tout*.
  Un test parcourt **tous** les objets de `minecraft-data` et vérifie qu'ils ont un thème (au pire fourre-tout) et
  que les cas ambigus suivent la priorité (ex. `redstone_block` → redstone-matière, `piston` → composants).
- **Rationale**: FR-005, SC-003 ; déterministe.

## R6. Trousse de survie

- **Decision**: `SURVIVAL_KIT` configurable : 1 pioche, 1 hache, 1 épée, armure portée, 1 bouclier, 32 nourriture
  (≈ 4 pièces), 16 torches, 16 blocs d'abri, 1 seau d'eau. `planDeposit` retire ces objets du dépôt, complète le
  manque via `obtain_item` (001) ou reprise au stockage.
- **Rationale**: FR-007, SC-004.

## R7. Index du stockage

- **Decision**: `StorageIndex` : coffre → `{ pos, theme, contents, seenAt }` ; mis à jour à chaque ouverture ;
  `findResource(item)` renvoie les coffres candidats triés par thème attendu puis fraîcheur ; revérifié à l'arrivée.
- **Rationale**: FR-008, SC-008 ; utilisé par `plan_needs`/`obtain_item` (001) et `resupply_food` (002).

## R8. Pancarte « interdit » : reconnaissance et garde

- **Decision**: `normalizeSign(text)` = minuscules, sans accents ni ponctuation ni espaces superflus ; interdit si le
  texte normalisé contient `interdit`, `forbidden`, `ne pas ouvrir`, `prive`, `private` (liste fermée, mots
  entiers, testée avec 20+ variantes). Cherche les pancartes sur les 6 faces voisines du coffre **et** du coffre
  jumeau ; le groupe de coffres collés est interdit si l'un l'est. Les textes ambigus (« à ne pas ouvrir sauf moi »)
  sont interdits par prudence. **Garde dans `withChest` et dans le casseur** : refus avec la raison.
- **Rationale**: FR-009, SC-005 ; défense en profondeur (le modèle ne peut pas la contourner).

## R9. Autorisation par le propriétaire

- **Decision**: `authorize_chest({ pos })` renvoie le verdict `approve` (interruption humaine existante) ; l'accord
  n'ouvre que **cette** demande (jeton à usage unique expirant à la fin du tour) ; seul `OWNER_USERNAME` répond ;
  une autorisation durable exige l'instruction explicite « retiens que… ».
- **Rationale**: FR-010 ; résiste à l'injection (texte lu dans un document ou une pancarte n'autorise rien).

## R10. Décision de retour

- **Decision**: `value = Σ count × ITEM_VALUE[item]` (diamant 40, émeraude 30, or 6, fer 3, lapis 2, redstone 1,
  charbon 1, pierre 0,05…) ; `risk = clamp(0..1)` pondéré par vie, nourriture, usure, lumière, nuit, menaces,
  distance (`fragility` du 003/002) ; `returnNow` si `value × risk ≥ T_return` (défaut 200) ; `finishThenReturn` si
  ≥ 100 ; retours forcés indépendants du gain. Exemple du propriétaire : deux piles de charbon (128) et de fer
  (128 × 3 = 384) → valeur 512, fragilité moyenne 0,5 → 256 ≥ 200 → rentre.
- **Rationale**: FR-011/012/013 ; chiffres illustratifs, **tous réglables** et journalisés pour calibrage.

## R11. Retour sûr et repli

- **Decision**: enregistrer une **piste** (un point tous les ~16 blocs, ≤ 200) pendant la sortie ; `return_to_base`
  la remonte à l'envers avec le pathfinder ; échec ou 3 min dépassées → `shelterAndMark` (abri via 003 si assez
  de blocs, position mémorisée, alerte au joueur).
- **Rationale**: FR-014 ; évite de se perdre sans carte.
