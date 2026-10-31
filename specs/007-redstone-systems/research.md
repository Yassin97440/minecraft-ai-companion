# Research — 007 Redstone

## R1. Source des recettes

- **Decision**: lire les recettes dans `minecraft-data` ; vérifié pour 1.21.4 : redstone, torche, bloc, levier,
  boutons, plaques, répéteur, comparateur, capteur de lumière, observateur, pistons, entonnoir, dispensateur,
  lanceur, lampe, cible, crochet, bloc de slime/miel, rails, TNT, crafter, ampoule de cuivre, coffre piégé
  ont tous une recette (le capteur de sculk n'est pas fabricable).
- **Rationale**: FR-001/003 : listes de matériaux exactes (SC-002) sans table maintenue à la main. La planification
  des fabrications réutilise `plan_needs` (001).

## R2. Que doit contenir le catalogue en plus des recettes ?

- **Decision**: données de comportement, par composant : `role` (source | transmission | detection | action |
  stockage), `signal` (puissance émise/relevée, portée), `delayTicks`, `orientation` (face significative et règle
  de pose), `support` (bloc requis dessous/derrière), `quartz: boolean` (via la recette), `hazard` (feu, explosion).
- **Rationale**: FR-001/002 ; test de complétude : chaque nom de la liste existe dans le registre ; un composant
  inconnu → réponse « inconnu » (jamais inventé).

## R3. Pourquoi une bibliothèque et pas des circuits libres ?

- **Decision**: gabarits validés ; pas de conception libre (décision du propriétaire).
- **Rationale**: sans simulateur, la conception libre n'est pas vérifiable (principe I). Les gabarits sont
  **paramétrables** (taille, orientation, nombre d'éléments) et testés une fois en jeu.
- **Alternatives considered**: simulateur de redstone (hors périmètre) ; import de schematics (hors périmètre).

## R4. Quels montages et dans quel ordre ?

- **Decision** (ordre de risque croissant) :
  1. `auto_door` : plaque de pression + porte (sans quartz) ;
  2. `daylight_lamps` : capteur de lumière inversé + lampes (**quartz**) et repli `lever_lamps` (levier + lampes,
     sans quartz) ;
  3. `melon_pumpkin_farm`, `sugar_cane_farm` : observateurs + pistons (**quartz**), repousse naturelle = relance
     automatique ; `wheat_flush_farm` : récolte à l'eau (dispensateur + horloge d'entonnoirs), **replantation par le
     bot** (déclarée semi-automatique) ;
  4. `mob_trap_auto` : plateforme sombre + eau + chute ≥ 24 + collecte (aucun signal, réutilise la 006) ;
  5. `animal_farm_auto` : dispensateurs de blé sur horloge, tunnel d'1 bloc de haut laissant passer les petits
     seulement (les adultes restent), entonnoirs : **expérimental**, à valider en jeu avant d'être marqué
     `validated`.
- **Rationale**: couvre les quatre montages du premier jalon ; honnête sur le fait que le blé/carottes/pommes de
  terre demandent un villageois pour être 100 % automatiques.

## R5. Quartz du Nether

- **Decision**: chaque gabarit déclare `quartz: n`. `quartzNeeds(blueprint)` + inventaire → si manquant : repli
  (levier manuel, `lever_lamps`) ou demande au joueur ; message clair, jamais de blocage de la suite. Le Nether
  autonome reste un palier avancé de la 004.
- **Rationale**: FR-012 ; capteur de lumière, observateur et comparateur nécessitent du quartz.

## R6. Comment prouver qu'un montage marche sans simulateur ?

- **Decision**: **test d'activation en jeu**, déclaré dans le gabarit : suite d'actions et états attendus.
  Exemple pour `daylight_lamps` : couvrir le capteur d'un bloc opaque → les lampes doivent passer à `lit=true`,
  retirer le bloc → `lit=false` (aucune attente du soir, aucune commande `/time`). Pour `auto_door` : se tenir sur
  la plaque → `open=true`, quitter → `open=false`.
- **Rationale**: principe I ; états lus avec `bot.blockAt(pos).getProperties()`.
- **Alternatives considered**: `/time set` (triche, réservé aux tests du propriétaire).

## R7. Orientation à la pose

- **Decision**: `orientationPlan(item, desiredFacing)` donne la position de pose et la face à viser ; la règle
  (pistons et observateurs « regardent » le joueur, répéteurs et comparateurs pointent dans le sens du joueur…) est
  vérifiée **après** la pose en lisant `facing`, et corrigée (casser/reposer, ≤ 2 essais).
- **Rationale**: FR-006/007 ; c'est le point le plus fragile en jeu, donc testé par lecture d'état.

## R8. Diagnostic et réparation

- **Decision**: `diagnose(blueprint, readState)` compare blocs et états attendus : manquant → reposer ; mauvaise
  orientation → recaser ; poussière coupée → compléter ; coffre plein → vider (008) ; production arrêtée → test
  d'activation. Au plus 3 essais de réparation par panne, puis alerte du joueur.
- **Rationale**: FR-009/014, SC-008.

## R9. Sécurité

- **Decision**: interdits codés : TNT, lave exposée, bloc de feu, horloge > 1 Hz, structures dépassant 150
  composants, matériaux inflammables adjacents aux composants chauds.
- **Rationale**: FR-013, edge cases lag/explosion.
