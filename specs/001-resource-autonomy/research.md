# Research — 001 Autonomie en ressources

Aucune inconnue bloquante ; les points ci-dessous ont été vérifiés en interrogeant `minecraft-data` 1.21.4
(installé avec mineflayer).

## R1. D'où viennent les recettes ?

- **Decision**: utiliser les recettes de `minecraft-data` (`registry.recipes`), indexées par identifiant de
  résultat.
- **Rationale**: 803 recettes de fabrication, alternatives incluses (ex. `stone_pickaxe` en 3 variantes :
  cobblestone, cobbled_deepslate, blackstone ; `stick` en 13 variantes de bois). Données exactes de la
  version, sans maintenance manuelle (FR-001, SC-003).
- **Alternatives considered**: table de recettes écrite à la main (rejeté : erreurs et maintenance) ;
  demander au modèle (rejeté : viole le principe III).

## R2. Où sont les recettes de fonte ?

- **Decision**: petite **table fermée** dans `src/sources.ts` (minerai/aliment cru → produit cuit, avec le
  nombre d'objets cuits par unité de combustible).
- **Rationale**: `minecraft-data` n'expose pas les recettes de four (aucune clé « smelt/furnace »).
  Les besoins du périmètre se résument à ~12 transformations (raw_iron, raw_copper, raw_gold, sable → verre,
  pierre, argile → brique, viandes crues). Les viandes sont partagées avec la capacité 002.
- **Alternatives considered**: lire les données du serveur (rejeté : dépendance au serveur, non testable).

## R3. Comment connaître l'outil minimal pour un bloc ?

- **Decision**: lire `harvestTools` du bloc dans le registre, le convertir en rang d'outil
  (bois < pierre < fer < diamant) et inclure l'outil manquant comme **dépendance** du plan.
- **Rationale**: `iron_ore` demande une pioche en pierre ou mieux (ids 856, 866, 871, 876) ; `stone`
  accepte toute pioche. Donne le bon ordre automatiquement (FR-002).
- **Alternatives considered**: table codée en dur (redondante avec le registre).

## R4. Comment choisir entre plusieurs recettes ?

- **Decision**: score déterministe : préférer la recette dont les ingrédients sont **déjà possédés**
  (ex. le type de bois le plus abondant), puis le moins d'étapes à récolter, puis l'ordre du registre.
- **Rationale**: évite de récolter un nouveau bois alors qu'on a déjà des planches (edge case de la spec).
- **Alternatives considered**: première recette du registre (rejeté : choisirait toujours le chêne).

## R5. Comment exécuter sans réécrire les tools existants ?

- **Decision**: extraire de `tools.ts` les fonctions `collectBlocks`, `craftOne`, `smeltBatch` dans
  `actions.ts`, et définir dans `obtain.ts` une interface `Actions` que ces fonctions implémentent.
- **Rationale**: `collect_block` et `craft_item` fonctionnent déjà (établi auto-posé, refus de blocs
  dangereux) ; on les réutilise sans duplication et on rend l'exécuteur testable (principe IV).
- **Alternatives considered**: laisser le LLM enchaîner les tools existants un par un (rejeté : 1 requête
  par étape, coût et dérive) ; tout réécrire (rejeté : YAGNI).

## R6. Quelle borne pour éviter les boucles ?

- **Decision**: budget par objectif : 40 étapes, 3 échecs d'affilée par étape, 8 minutes de jeu, quantité
  max par demande (256 pour les blocs/bûches, 64 pour les autres) ; interruption testée entre chaque étape
  via `ctx.run.interrupted`.
- **Rationale**: constitution V ; SC-005 (< 3 min d'arrêt sur objectif irréalisable) et SC-006 (< 5 s après
  « stop ») : les étapes de récolte sont elles-mêmes bornées (`collect_block` : distance et délais).
- **Alternatives considered**: budget en tokens seulement (rejeté : ne borne pas le temps de jeu).

## R7. Mode autonome et sécurité

- **Decision**: `plan_needs` (lecture seule) rejoint `IDLE_TOOLS` ; `obtain_item` **n'y est pas** tant que la
  capacité 004 n'a pas défini la condition « propriétaire déconnecté » et son budget.
- **Rationale**: principe II (allowlist du mode autonome) ; évite d'élargir la surface autonome avant
  d'avoir les garde-fous de 004.
- **Alternatives considered**: autoriser `obtain_item` en idle dès maintenant (rejeté : voir ci-dessus).

## R8. Mémoire des gisements

- **Decision**: après une récolte réussie, écrire `gisement:<ressource>` (lieu + date) via `Memory.set` ;
  à la demande suivante, y aller en premier et **revérifier** à l'arrivée ; effacer si absent.
- **Rationale**: FR-011, principe VI (pas de souvenir non constaté).
- **Alternatives considered**: stockage séparé (rejeté : `Memory` suffit).

## R9. Hors périmètre déclaré

- **Decision**: table `OUT_OF_SCOPE` (quartz, blaze, perle d'ender, débris antiques…, tout ce qui exige le
  Nether/End) → refus clair « hors périmètre actuel » (FR-013).
- **Rationale**: Nether/End dépendent de 004 ; ne pas laisser le modèle promettre l'impossible.
