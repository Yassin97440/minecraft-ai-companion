# Research — 006 Fermes à ressources

## R1. Conception : plan libre ou générateur ?

- **Decision**: générateur paramétré par type (comme `generateHouse` en 005), validé par le même `validatePlan`
  avec `kind: "farm"` et une liste de blocs propre (`FARM_BLOCKS` : terre/herbe pour labour, eau, clôtures,
  portillons, entonnoirs, coffres, verre, torches, pierre).
- **Rationale**: FR-002 ; la règle « pas de terre » de la 005 vaut pour les bâtiments, pas pour un labour.
- **Alternatives considered**: plan libre du LLM (rejeté : eau mal placée, enclos ouverts).

## R2. Hydratation des cultures

- **Decision**: règle pure : une case de labour est hydratée si un bloc d'eau se trouve à ≤ 4 blocs (même niveau ou
  un niveau au-dessus) ; le générateur place une rangée d'eau tous les 9 blocs (modèle 9×9 avec eau au centre).
  La validation recalcule la couverture.
- **Rationale**: FR-003 ; règle simple, testable.

## R3. Élevage : effectif cible et paire reproductrice

- **Decision**: `herdActions(counts, target)` : si effectif < 2 → amener ; si 2 ≤ effectif < cible → reproduire ;
  si > cible → prélever le surplus (jamais sous 2, jamais un bébé) ; moutons : tondre en priorité.
  Nourriture d'élevage : blé (vaches, moutons), carottes (cochons), graines (poules). Cible par défaut 6 par
  enclos, plafond 12.
- **Rationale**: FR-004, SC-002 ; limite d'entités (le jeu limite les amas d'entités à 24).
- **Alternatives considered**: abattre au hasard (rejeté : casse l'élevage).

## R4. Bois renouvelable

- **Decision**: grille de pousses espacées de 2 blocs sur sol de terre/herbe avec dégagement vertical ; abattage
  = tout le tronc + feuilles proches pour les pommes/pousses ; replantation immédiate ; ne jamais raser une forêt
  hors plantation (zone enregistrée seulement).
- **Rationale**: FR-005 ; l'arbre ne pousse que s'il y a ≥ 7 blocs de dégagement et de la lumière ≥ 9.

## R5. Piège à monstres « pièce sombre »

- **Decision**: modèle `mobtrap` : plateforme de spawn (dalles) entièrement sans lumière, murs fermés, une
  ouverture vers un **puits de chute d'au moins 24 blocs** (la plupart des monstres meurent ou arrivent presque
  morts ; le bot achève à l'épée depuis une alcôve protégée), entonnoir et coffre de collecte au fond ;
  **éclairage extérieur complet** (réutilise `lighting.ts` de la 005 : cases autour ≥ 8).
- **Contrainte de jeu** : les monstres n'apparaissent qu'à plus de 24 blocs (distance 3D) du joueur et à moins
  de 128 : la plateforme doit donc être **≥ 24 blocs au-dessus** de l'alcôve où se tient le bot, d'où la hauteur
  de chute imposée. La validation calcule cette distance. Refus si l'emplacement est dans le périmètre de la
  base ou si la plateforme est à moins de 24 blocs de l'alcôve.
- **Rationale**: FR-006 ; décision du propriétaire (pas de spawner, pas de redstone).
- **Alternatives considered**: piège autour d'un spawner (hors périmètre ici).

## R6. Collecte « simple »

- **Decision**: eau pour regrouper les récoltes (canal), entonnoirs sous les cases de collecte vers un coffre.
  Entonnoir = 5 fer + 1 coffre (via 001). Si le fer manque, le compagnon ramasse à la main (`pickup_items`).
- **Rationale**: FR-007 ; aucun composant à signal.

## R7. Détection d'un besoin récurrent

- **Decision**: compteur dans `data/farms.json` (`needLog`) : à chaque `resupply_food` (002), manque de bois ou de
  matière (cuir, laine, os…), on incrémente `need:<ressource>` ; `proposeFarm` propose à partir de 3 occurrences
  en 24 h de jeu, avec coût et rendement estimés, sans doublon avec une ferme existante.
- **Rationale**: FR-010 ; déterministe, journalisé.

## R8. Rendement et chargement des chunks

- **Decision**: `estimateYield(kind, params)` donne une fourchette (par cycle) ; le rendement **observé** est
  stocké par cycle et affiché à côté. Le cycle ne s'exécute que zone chargée (le bot y est).
- **Rationale**: FR-008, SC-008.

## R9. Déclenchement

- **Decision**: `build_farm` et `tend_farms` sont hors `IDLE_TOOLS` ; la capacité 004 pourra les autoriser en
  mode `progress`. Le LLM peut *proposer* en chat (`farm_status` en lecture seule).
- **Rationale**: décision du propriétaire (« sur demande, ou en proposant »).
