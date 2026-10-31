# Research — 005 Construction

## R1. État du code existant (`src/construction.ts`, `src/tools.ts`)

- `validatePlan` vérifie déjà : listes fermées, bornes, coût, étanchéité (flood-fill), hauteur libre, porte
  accessible, torches murales accrochées. Il **ne vérifie pas** : fenêtres, éclairage (simple avertissement),
  chemin entre niveaux.
- `BUILD_BLOCKS` autorise `dirt` et `mud_bricks` ; l'exécution passe par des commandes qui « paient » en vidant
  l'inventaire (`clear @s …`) puis `/fill`/`/setblock` : c'est de la triche déclarée à remplacer.
- **Decision**: conserver la validation et la vérification ; remplacer l'exécuteur ; resserrer les matériaux ;
  renforcer les règles manquantes.

## R2. Faire dessiner la maison au LLM ou la générer ?

- **Decision**: générateur déterministe `generateHouse(params)`. Paramètres : `footprint [w,d]` (min 5×5, max 24×24),
  `levels` (1-3), `basement` (bool), `material` (famille de la liste fermée), `roof` (`flat | gable`), `windows`
  (densité), `door_side`.
- **Rationale**: les invariants du propriétaire (sol, toit, 4 murs, fenêtres, escaliers, lumière) deviennent vrais par
  construction et sont testables exhaustivement (grille de paramètres) ; réduit les erreurs de petits modèles.
  Les ouvrages `decor` gardent le plan libre.
- **Alternatives considered**: plan libre seulement (rejeté : fragile) ; schematics importés (hors périmètre).

## R3. Éclairage : quelle règle de lumière ?

- **Decision**: `lightMap(grid)` propage la lumière de bloc : torche = 14, lanterne/lueur = 15 ; −1 par bloc
  traversé, arrêt aux blocs opaques. Seuil d'apparition 1.21.4 : les monstres n'apparaissent qu'à **lumière de
  bloc 0** ; la règle du projet exige **≥ 8** partout au sol (marge, et compatible avec l'ancienne règle < 8),
  réglable. `autoLight` ajoute des torches murales/lanternes jusqu'à couverture complète, ou refuse si impossible.
- **Rationale**: FR-005, SC-006 ; testable sans serveur. À confirmer en jeu avec F3.
- **Alternatives considered**: placer des torches à intervalle fixe (rejeté : angles morts, escaliers, sous-sol).

## R4. Fenêtres et sécurité

- **Decision**: fenêtres = `glass_pane` ou `glass` à hauteur d'yeux dans les murs ; jamais d'ouverture vide ; si le
  verre manque (sable + four), le générateur propose `glass` de la liste « repli » ou des volets/trappes fermées en
  bois ; la validation refuse toute fenêtre vide.
- **Rationale**: FR-003 ; edge case verre manquant.

## R5. Étages, sous-sol, escaliers

- **Decision**: ajout de l'opération `stair_run` (suite de marches orientées + dégagement de 2 blocs de hauteur) au
  langage de plan ; `verifyGrid`/validation calculent la **connectivité** par parcours (marche = montée d'un
  bloc, tête libre) entre tous les niveaux et la porte. Sous-sol : excavation `clear` + murs/sol/plafond ; jamais
  sous eau ou lave (contrôle de site).
- **Rationale**: FR-006, SC-003.
- **Alternatives considered**: échelles (rejeté : escaliers demandés) ; escaliers en colimaçon (hors jalon).

## R6. Pose bloc par bloc : comment atteindre les hauteurs ?

- **Decision**: ordre `placementOrder` : excavation, sol, murs couche par couche, plafonds/toit ; pose depuis
  l'intérieur et l'anneau extérieur à portée de 4,5 blocs ; hauteurs via **échafaudages temporaires** (colonne de
  blocs de terre posés sous soi, **retirés ensuite** et vérifiés) ; `dirt` est autorisé *seulement* comme
  échafaudage, jamais dans l'ouvrage.
- **Rationale**: pas de triche ; borné ; vérification de retrait pour ne pas laisser de pilier.
- **Alternatives considered**: `/setblock` (tricherie), pathfinder creusant (non fiable).

## R7. Reprise après interruption

- **Decision**: `data/builds.json` stocke plan, ancre et poses terminées ; à la reprise, `reconcile(plan, readBlock)`
  recalcule les poses restantes depuis le **monde réel** (le fichier n'est qu'un indice).
- **Rationale**: FR-012, SC-007 ; principe VI.

## R8. Choix du site

- **Decision**: `chooseSite` échantillonne la hauteur du sol sur l'emprise (+ 2 de marge), refuse l'eau/lave,
  les blocs protégés, `inHome` au-delà de la base, et choisit la plus plate ; terrassement borné (≤ 2 blocs
  d'écart) sinon autre site ; adjacent à la base si extension (capacité 008).
- **Rationale**: FR-011, edge cases.

## R9. Mode rapide

- **Decision**: `BUILD_MODE=fast` (config, propriétaire uniquement) conserve `planCommands` ; défaut `survival`.
- **Rationale**: tests rapides, décision du propriétaire déjà prise (« légitime » par défaut).
