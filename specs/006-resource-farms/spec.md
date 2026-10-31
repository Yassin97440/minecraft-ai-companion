# Feature Specification: Fermes à ressources (cultures, élevage, bois, loot de monstres)

**Feature Branch**: `006-resource-farms` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Fermes à ressources : consommables pour manger, mais aussi ressources pour construire et s'équiper. Semi-automatiser au moins les ressources utilisées souvent, y compris les mobs qui apportent beaucoup de loot utile." Capacité 006 de `specs/ROADMAP.md`.

**Décisions du propriétaire (questions de cadrage)** :
- Ressources visées : **cultures, élevage, bois et loot de monstres**.
- Automatisation : **semi-automatique avec éléments simples** (eau, enclos, entonnoirs et coffres de collecte) ; **pas de circuits redstone** (capacité 007).
- Monstres : **piège simple en pièce sombre** (sans spawner).
- Déclenchement : **sur demande, ou en proposant** (accord du joueur, ou joueur déconnecté si la progression 004 l'autorise).

## Vocabulaire

- **Ferme** : installation durable qui produit une ressource à répétition (champ, enclos, plantation, piège).
- **Semi-automatique** : la ferme réduit le travail (eau, regroupement, collecte vers un coffre) mais le compagnon
  intervient encore pour récolter, replanter, trier ou achever les monstres. Aucun circuit redstone.
- **Cycle** : une tournée complète de la ferme : récolter, replanter ou relâcher, rapporter, ranger.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un champ de cultures qui nourrit en continu (Priority: P1)

Le compagnon aménage un champ (blé, carottes, pommes de terre, betteraves, canne à sucre, melons/citrouilles) :
terre labourée, eau en quantité suffisante, clôture, lumière. Il le récolte quand les plants sont mûrs,
**replante** à chaque cycle, range les produits dans un coffre et fournit ainsi de la nourriture au compagnon
(capacité 002) et des ingrédients (pain, papier, sucre).

**Why this priority**: la nourriture renouvelable est le besoin le plus fréquent et le plus simple à
automatiser ; elle sert de base aux autres fermes (le blé nourrit l'élevage).

**Independent Test**: dans un terrain dégagé avec une houe, des graines et un point d'eau, le compagnon
aménage le champ ; après plusieurs cycles, le stock de nourriture augmente et le champ reste planté.

**Acceptance Scenarios**:

1. **Given** des graines, une houe et de l'eau accessible, **When** il aménage un champ, **Then** le sol est
   labouré, hydraté, clôturé et éclairé, et le résultat est vérifié dans le monde.
2. **Given** des plants mûrs, **When** il récolte, **Then** il replante aussitôt chaque case et rapporte
   le gain réel (inventaire avant/après).
3. **Given** des plants pas encore mûrs, **When** il passe, **Then** il attend ou fait autre chose et ne
   détruit rien.
4. **Given** un champ endommagé (trampling, mob, manque d'eau), **When** il le contrôle, **Then** il répare
   ou signale ce qui ne va pas.

---

### User Story 2 - Un élevage qui fournit viande, cuir, laine et œufs (Priority: P1)

Le compagnon aménage un enclos (vaches, cochons, moutons, poules, lapins), y amène ses animaux, les
**reproduit** avec la nourriture adaptée, garde un effectif cible (de quoi rester viable sans surpeupler) et
prélève le surplus (viande, cuir, laine par tonte, œufs, plumes). L'enclos est solide, éclairé et fermé.

**Why this priority**: la viande est la nourriture la plus nourrissante (capacité 002) et le cuir/la laine
servent à s'équiper et à construire (lits, livres).

**Independent Test**: à partir de deux animaux d'une espèce et de leur nourriture, l'enclos produit une
descendance, l'effectif cible est maintenu et du surplus est prélevé.

**Acceptance Scenarios**:

1. **Given** deux animaux et leur nourriture d'élevage, **When** il les reproduit, **Then** un petit naît et
   l'effectif augmente, vérifié par comptage.
2. **Given** un effectif au-dessus de la cible, **When** il prélève, **Then** il garde toujours au moins une
   paire reproductrice par espèce et rapporte la viande et les objets obtenus.
3. **Given** des moutons, **When** il en a besoin, **Then** il les tond (sans les tuer) pour obtenir de la
   laine.
4. **Given** un animal apprivoisé, nommé ou étranger à l'enclos, **When** il prélève, **Then** il ne le touche
   jamais.

---

### User Story 3 - Une plantation de bois renouvelable (Priority: P1)

Le compagnon plante des arbres dans une zone dédiée, coupe les arbres arrivés à maturité, **replante**
chaque pousse, récupère bûches, bâtons, pommes et pousses, et évite de raser la forêt alentour. Le bois est
la ressource la plus utilisée (outils, planches, construction, combustible).

**Why this priority**: le bois est la ressource principale de l'outillage et de la construction (capacité 005).

**Independent Test**: sur une zone de test, le compagnon plante et coupe plusieurs arbres : le stock de bûches
augmente et la zone reste replantée.

**Acceptance Scenarios**:

1. **Given** des pousses et un espace dégagé, **When** il plante, **Then** les pousses sont posées avec
   l'écart nécessaire à la croissance.
2. **Given** un arbre mûr, **When** il le coupe, **Then** il récupère le bois entier (y compris le haut du
   tronc), les pommes et les pousses, et replante.
3. **Given** une zone dont les feuilles tombent, **When** il entretient, **Then** il ramasse pousses et
   pommes et évite de laisser des restes dangereux (troncs flottants, trous).

---

### User Story 4 - Un piège à monstres simple qui rapporte du loot (Priority: P2)

Le compagnon construit un piège en **pièce sombre** : une salle fermée, sans aucune lumière, où les monstres
apparaissent ; ils sont amenés à une zone de mise à mort sûre (chute, dalle, trou) où le compagnon les achève
à l'arme, puis ramasse le butin dans un coffre de collecte. Il rapporte os, fil, poudre à canon, flèches,
chair putréfiée, perles d'enderman éventuelles, et de l'expérience, sans s'exposer.

**Why this priority**: sources de loot importantes mais plus risquées, d'où une priorité inférieure ; elle
dépend du combat (003) et de la construction (005).

**Independent Test**: sur une nuit de test, le piège produit du butin collecté dans le coffre sans que le
compagnon ne perde plus de la moitié de sa vie.

**Acceptance Scenarios**:

1. **Given** un emplacement adapté, **When** il construit le piège, **Then** la salle est fermée, sombre
   à l'intérieur et **éclairée à l'extérieur** (aucune zone d'apparition de monstres hors du piège).
2. **Given** des monstres apparus, **When** ils tombent dans la zone de mise à mort, **Then** le compagnon les
   achève depuis une position sûre sans subir de dégâts significatifs.
3. **Given** du butin accumulé, **When** il passe, **Then** il le récupère dans le coffre, trie l'utile et
   rapporte les quantités obtenues.
4. **Given** un creeper ou un squelette dans le piège, **When** il les rencontre, **Then** la conception
   limite le risque (distance, abri, vitre) et il applique les règles de combat de la capacité 003.

---

### User Story 5 - Choisir quelles fermes sont utiles et les entretenir (Priority: P2)

Le compagnon sait quelles ressources il consomme souvent (nourriture, bois, cuir, laine, os, fil…), propose la
ferme la plus rentable pour un besoin répété, annonce coût, emplacement et rendement attendu, la construit
après accord, puis l'**entretient** : cycles de récolte réguliers, réparations, effectifs, remplacement des
plants et des animaux perdus.

**Why this priority**: évite les fermes inutiles et assure que celles qui existent continuent de produire.

**Independent Test**: après un manque répété de nourriture, le compagnon propose une ferme adaptée avec
son coût et son rendement ; une fois acceptée et construite, un cycle d'entretien est exécuté.

**Acceptance Scenarios**:

1. **Given** un besoin répété (par exemple plusieurs approvisionnements en viande), **When** il le détecte,
   **Then** il propose la ferme adaptée avec coût et rendement estimés et attend l'accord.
2. **Given** plusieurs fermes, **When** il organise son temps, **Then** il visite en priorité celles dont
   le stock est bas ou dont la récolte est mûre.
3. **Given** une ferme qui ne produit plus, **When** il la contrôle, **Then** il diagnostique la cause
   (manque d'eau, de lumière, d'animaux, de plants) et la corrige ou la signale.

---

### User Story 6 - Collecte simple vers des coffres (Priority: P3)

Les fermes sont équipées d'éléments simples qui regroupent les produits : eau qui rassemble les récoltes,
entonnoirs qui les amènent vers un coffre, coffres de stockage repérés. Aucun circuit redstone. Le
compagnon vide ces coffres lors de ses cycles et range le contenu.

**Why this priority**: gain de confort et de temps, mais non indispensable aux fermes de base.

**Independent Test**: après une récolte, les produits se trouvent dans le coffre de la ferme sans que le
compagnon ait ramassé chaque objet un par un.

**Acceptance Scenarios**:

1. **Given** une ferme équipée de collecte, **When** une récolte a lieu, **Then** les produits arrivent dans
   le coffre associé.
2. **Given** un coffre de ferme plein, **When** il passe, **Then** il le vide vers le stockage de la base
   (capacité 008) ou prévient.

---

### Edge Cases

- Terrain en pente, eau absente ou sol non labourable : choix d'un autre emplacement ou terrassement ;
  refus expliqué sinon.
- Hiver, nuit, orage : les cycles dangereux sont reportés ; la sécurité prime.
- Animaux qui s'échappent ou monstres qui entrent dans un enclos : réparation de la clôture, recensement.
- Limite d'entités : un effectif trop élevé (animaux, objets au sol) dégrade le jeu et fait mourir les
  animaux ; plafond d'effectif par enclos et par zone.
- Creeper dans une zone de culture : réflexes de survie d'abord, réparation ensuite.
- Joueur qui détruit ou modifie une ferme : détection au prochain cycle, mise à jour de la mémoire.
- Feu, lave, eau mal placée : ne détruisent pas la ferme ; la conception évite ces risques.
- Piège à monstres sans lumière extérieure : refusé, car il ferait apparaître des monstres tout autour.
- Ressource demandée pour une ferme introuvable (graines, pousses, animaux de départ) : le compagnon la
  cherche via les capacités 001 et 002, ou le dit.
- Plusieurs fermes concurrentes pour la même ressource : il évite les doublons inutiles.
- Chunks non chargés : les fermes ne produisent que si la zone est chargée ; les rendements annoncés en
  tiennent compte.
- Ferme à monstres et sommeil : si le joueur ou le bot dort, la ferme ne fonctionne pas comme prévu ; le dire.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST pouvoir aménager et exploiter quatre familles de fermes : **cultures**,
  **élevage**, **plantation de bois** et **piège à monstres en pièce sombre**.
- **FR-002**: Chaque ferme MUST respecter un cahier de conception minimal vérifiable : emplacement
  adapté, clôture ou enclos fermé, lumière extérieure correcte, accès pour le compagnon, point de collecte.
- **FR-003**: Pour les cultures, le compagnon MUST labourer, hydrater (eau suffisante), planter, attendre
  la maturité, récolter et **replanter** à chaque cycle ; il MUST NOT piétiner ni détruire des plants non
  mûrs.
- **FR-004**: Pour l'élevage, il MUST amener des animaux, les reproduire avec leur nourriture, maintenir
  un effectif cible borné et garder au moins une **paire reproductrice** par espèce ; il MUST tondre les
  moutons plutôt que de les tuer quand seule la laine est visée.
- **FR-005**: Pour le bois, il MUST planter, couper à maturité et replanter chaque pousse, ramasser les
  produits associés (pommes, pousses, bâtons) et ne PAS raser une forêt qui n'est pas la sienne.
- **FR-006**: Pour le piège à monstres, il MUST le concevoir avec une salle d'apparition fermée et sombre,
  une zone de mise à mort sûre, un point de collecte, et un **éclairage extérieur complet** ; il MUST
  refuser un emplacement où le piège créerait un risque pour la base. Aucun circuit redstone.
- **FR-007**: Le compagnon MUST n'utiliser que des éléments simples de regroupement et de collecte (eau,
  pentes, clôtures, entonnoirs, coffres) ; tout dispositif nécessitant de la redstone MUST être renvoyé à
  la capacité 007.
- **FR-008**: Le compagnon MUST vérifier chaque étape et chaque cycle par l'état réel du monde (plants,
  animaux, objets obtenus) et rapporter les gains avant/après ; il ne MUST JAMAIS annoncer un rendement
  non constaté.
- **FR-009**: Il MUST tenir un **registre des fermes** durable (type, emplacement, état, effectif,
  dernière visite, rendement observé) qui survit au redémarrage et se vérifie à l'arrivée.
- **FR-010**: Il MUST identifier ses besoins répétés de ressources et proposer la ferme la plus
  appropriée, en annonçant coût (matériaux et temps), emplacement et rendement estimé.
- **FR-011**: Il MUST obtenir l'accord du joueur avant de construire une ferme, sauf lorsque le joueur est
  déconnecté **et** que la capacité 004 autorise l'initiative ; il peut proposer librement.
- **FR-012**: Il MUST entretenir les fermes : cycles réguliers, priorité aux fermes mûres ou à stock bas,
  réparation des clôtures, remplacement des plants et des animaux perdus, diagnostic d'une ferme qui ne
  produit plus.
- **FR-013**: Il MUST borner chaque ferme (taille, effectif, nombre de fermes, temps de cycle, essais) pour
  protéger les performances du jeu et éviter les boucles ; un dépassement est refusé avec explication.
- **FR-014**: Il MUST respecter les zones protégées, les animaux apprivoisés ou nommés, les animaux et
  champs d'autres joueurs, et ne MUST PAS détruire les constructions existantes.
- **FR-015**: Il MUST s'appuyer sur les capacités existantes sans les redéfinir : ressources et fabrication
  (001), alimentation (002), combat et sécurité (003), progression (004), construction (005), stockage (008).
- **FR-016**: Les réflexes de survie MUST garder la priorité sur toute tournée de ferme ; la tournée reprend
  ensuite. Le joueur MUST pouvoir interrompre un cycle (`stop`) en quelques secondes.
- **FR-017**: Les règles de conception d'une ferme, de calcul d'effectif, de rendement attendu et de
  bornes MUST être vérifiables automatiquement sans serveur Minecraft ni appel au modèle ; les
  comportements en jeu non vérifiés MUST être listés avec un scénario de test manuel.
- **FR-018**: Le nombre d'appels au modèle pour un cycle de ferme MUST rester borné et mesurable ; le
  planning des cycles et les calculs d'effectif MUST être déterministes.

### Key Entities

- **Ferme** : installation durable d'un type donné, avec emplacement, emprise, état et ressource produite.
- **Registre des fermes** : liste durable des fermes avec dernière visite, rendement observé et problèmes.
- **Conception de ferme** : plan validé de l'aménagement (sol, eau, clôture, lumière, collecte).
- **Cycle** : une tournée complète d'une ferme, avec ses gains et ses incidents.
- **Effectif cible** : nombre d'animaux ou de plants à maintenir pour une production durable.
- **Besoin récurrent** : ressource consommée régulièrement qui justifie une ferme.
- **Point de collecte** : coffre ou zone qui regroupe les produits d'une ferme.
- **Rapport de ferme** : bilan d'un cycle (produits, gains, problèmes, actions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un champ de cultures aménagé est replanté entièrement après récolte dans au moins 9 cycles
  sur 10, sans plant non mûr détruit.
- **SC-002**: Un élevage de deux animaux d'une espèce atteint l'effectif cible dans les limites de temps
  fixées dans au moins 8 essais sur 10, et conserve toujours une paire reproductrice (0 cas contraire).
- **SC-003**: Une plantation de bois fournit au moins la quantité de bûches visée par cycle et reste
  replantée dans au moins 8 cycles sur 10.
- **SC-004**: Un piège à monstres produit du butin collecté sur une nuit de test sans que le compagnon
  perde plus de la moitié de sa vie dans au moins 7 essais sur 10, et aucune zone extérieure proche ne
  voit apparaître de monstre.
- **SC-005**: Avec au moins une ferme de nourriture active, le compagnon ne manque jamais de nourriture
  durant 30 minutes de jeu d'activité normale (stock au-dessus du seuil de sécurité de la capacité 002).
- **SC-006**: Pour 20 conceptions de ferme de test, la validation (étanchéité, lumière extérieure, eau,
  bornes) donne le bon verdict dans 100 % des cas.
- **SC-007**: 0 animal apprivoisé, nommé ou appartenant à un autre joueur n'est tué sur l'ensemble des
  tests et essais.
- **SC-008**: Les rendements annoncés par le compagnon correspondent aux gains réellement constatés à
  ± 25 % sur 10 cycles ; 0 annonce de gain non constaté.
- **SC-009**: Un cycle de ferme ordinaire consomme au plus 10 requêtes au modèle de langage (mesurées via
  les traces).

## Assumptions

- Monde survie 1.21.4, Overworld, serveur local ; fermes d'Overworld uniquement (pas de ferme de Nether).
- **Frontière avec la capacité 007** : ici seulement eau, enclos, pentes, clôtures, entonnoirs et coffres ;
  les circuits redstone (pistons, observateurs, horloges, trieurs) sont exclus et renvoyés à la 007.
- **Frontière avec la capacité 008** : les coffres de ferme sont vidés vers le stockage de la base ; le
  rangement trié complet relève de la 008.
- Le piège à monstres est un **piège de pièce sombre simple** : sans spawner, avec zone de chute et
  mise à mort à l'arme ; les spawners, les fermes d'enderman/de gardiens et les rendements industriels sont
  des évolutions futures.
- Le compagnon n'a pas besoin de redstone pour les entonnoirs : un entonnoir est un bloc de collecte
  simple, qui demande du fer (capacité 001).
- La croissance dépend du jeu (lumière, eau, temps) et d'un chargement de zone : les rendements annoncés
  sont des estimations dont la fiabilité sera mesurée avec les traces.
- Les seuils d'effectif, la taille des fermes et le rythme des cycles sont des valeurs de départ à
  calibrer en jeu pour éviter les problèmes de performance.
- Les constructions de fermes passent par la validation et l'accord du joueur de la capacité 005
  (pose bloc par bloc), et le déclenchement autonome par la capacité 004.
- Les comportements dépendant du monde réel (croissance, reproduction, apparition de monstres, collecte)
  sont déclarés « non vérifiés en jeu » jusqu'à test manuel.
