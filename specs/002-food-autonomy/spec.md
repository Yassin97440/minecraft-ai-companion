# Feature Specification: Alimentation autonome (manger tout ce qui nourrit, s'approvisionner seul)

**Feature Branch**: `002-food-autonomy` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Alimentation : en testant, l'agent disait que son tool ne lui permettait pas de manger des steaks ou du poulet cuit (limité au pain ou autre ?). Tout ce qui régénère de la faim doit pouvoir être mangé, sauf ce qui empoisonne. Il doit aussi savoir aller chercher les ressources nécessaires pour s'alimenter." Capacité 002 de `specs/ROADMAP.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manger n'importe quelle nourriture utile (Priority: P1)

Quand le compagnon a faim (ou doit se soigner), il mange la meilleure nourriture qu'il possède, quelle
qu'elle soit : viande cuite (steak, porc, mouton, poulet, lapin, poisson cuit), pain, pommes, carottes,
patates cuites, pastèque, baies, ragoût, tarte, cookies, etc. Seules les aliments **nuisibles** sont exclus.
Il ne répond plus jamais « je ne peux pas manger ça » pour une nourriture saine.

**Why this priority**: c'est le défaut constaté en test et le prérequis de toute survie durable ; sans
cela, le compagnon meurt de faim avec un inventaire plein de viande cuite.

**Independent Test**: inventaire contenant uniquement du steak (puis uniquement du poulet cuit, puis
uniquement des pommes) et faim à 10/20 : le compagnon mange et la faim monte, pour chacun.

**Acceptance Scenarios**:

1. **Given** du steak cuit comme seule nourriture et une faim à 10/20, **When** le compagnon mange (sur
   ordre ou de lui-même), **Then** la faim augmente et il l'annonce avec les valeurs avant/après.
2. **Given** du poulet cuit, du pain et des pommes, **When** il mange, **Then** il choisit selon la règle
   de sélection (voir FR-004) et non selon une liste figée de quelques aliments.
3. **Given** n'importe quel aliment du jeu qui restaure de la faim et n'est pas classé nuisible, **When**
   il est dans l'inventaire et que le compagnon a faim, **Then** il est considéré comme mangeable.
4. **Given** une nourriture que le compagnon refuse, **When** il l'explique, **Then** la raison réelle est
   donnée (nuisible, faim déjà pleine, rien à manger) et jamais un faux « mon outil ne le permet pas ».

---

### User Story 2 - Éviter ce qui empoisonne, avec un régime de secours explicite (Priority: P1)

Le compagnon ne mange jamais volontairement un aliment qui empoisonne ou aux effets pénalisants graves
(poison, téléportation incontrôlée, effets aléatoires). Les aliments à risque léger (viande crue, chair
putréfiée) forment une **catégorie de secours** : mangés seulement quand il n'a rien d'autre et que la faim
met sa vie en danger, et signalés comme tels.

**Why this priority**: manger tout ce qui « régénère » sans filtre est dangereux ; la sécurité fait partie
du besoin exprimé.

**Independent Test**: inventaire avec seulement un œil d'araignée, une patate empoisonnée et un poisson-
globe : le compagnon refuse et le dit ; avec un seul morceau de viande crue et une faim critique, il mange
en annonçant le risque ; avec en plus du pain, il mange le pain.

**Acceptance Scenarios**:

1. **Given** uniquement des aliments nuisibles (œil d'araignée, patate empoisonnée, poisson-globe, fruit
   de chorus, ragoût suspect), **When** le compagnon a faim, **Then** il n'en mange aucun et cherche de la
   nourriture saine.
2. **Given** de la viande crue et rien d'autre, avec une faim critique et sans nourriture sûre trouvable
   rapidement, **When** il doit manger, **Then** il mange la viande en le signalant.
3. **Given** la faim modérée et de la viande crue, **When** la cuisson est possible, **Then** il préfère la
   cuire plutôt que de la manger crue.
4. **Given** des aliments précieux (pomme dorée), **When** la faim est ordinaire, **Then** il ne les gaspille
   pas ; ils restent réservés aux urgences de santé.

---

### User Story 3 - Savoir s'il a assez à manger et agir avant la pénurie (Priority: P1)

Le compagnon connaît son **stock de nourriture** (quantité totale de faim restaurable) et le compare à un
seuil de sécurité. S'il est trop bas, il décide lui-même d'aller en chercher avant d'avoir faim, et prévient
le joueur.

**Why this priority**: l'autonomie consiste à anticiper, pas à réagir quand la barre est vide.

**Independent Test**: inventaire quasi vide de nourriture et faim à 14/20 ; le compagnon annonce un stock
insuffisant et lance un approvisionnement.

**Acceptance Scenarios**:

1. **Given** un stock sous le seuil, **When** la faim n'est pas encore critique, **Then** le compagnon lance
   un approvisionnement (chasse, cueillette, pêche ou culture).
2. **Given** un stock suffisant, **When** il part en mission longue, **Then** il ne perd pas de temps à
   s'approvisionner en plus.
3. **Given** un stock bas pendant une mission demandée par le joueur, **When** la faim devient un risque,
   **Then** il prévient, mange ou s'approvisionne, puis reprend la mission.

---

### User Story 4 - S'approvisionner : chasser, pêcher, cueillir, cuisiner (Priority: P2)

Quand il manque de nourriture, le compagnon choisit la source la plus simple disponible autour de lui :
**chasse** (vache, cochon, mouton, poulet, lapin), **cueillette** (pommes, baies, melons, citrouilles, champi-
gnons non toxiques), **pêche**, ou **récolte de cultures** déjà plantées. Il **cuit** les viandes crues dans
un four avec un combustible. Il rapporte ce qu'il a obtenu en valeur nutritive.

**Why this priority**: c'est la deuxième moitié de la demande (« savoir aller chercher les ressources »),
mais dépend d'un mangeur fiable (story 1).

**Independent Test**: dans un monde avec des animaux proches et un inventaire sans nourriture, le compagnon
revient avec de la viande cuite (ou à défaut crue) et le stock dépasse le seuil.

**Acceptance Scenarios**:

1. **Given** des animaux à proximité, **When** il chasse, **Then** il en abat plusieurs (en gardant des
   reproducteurs si un élevage existe), récupère la viande et les objets utiles (cuir, plumes).
2. **Given** de la viande crue, un four (ou de quoi en faire un) et un combustible, **When** il cuisine,
   **Then** il obtient de la viande cuite et le vérifie par l'inventaire.
3. **Given** aucun animal visible, **When** il cherche, **Then** il explore de façon bornée, essaie
   d'autres sources (cueillette, pêche), puis rapporte l'échec avec ce qu'il a tenté.
4. **Given** une source de nourriture connue en mémoire (pommier, champ, pêcherie), **When** le stock est
   bas, **Then** il s'y rend en premier.

---

### User Story 5 - Se nourrir durablement sans épuiser le monde (Priority: P3)

Au-delà de la chasse ponctuelle, le compagnon sait entretenir une source renouvelable simple : replanter
ce qu'il récolte (blé, carottes, patates), ne pas exterminer les derniers animaux d'une zone, et noter les
sources dans sa mémoire. L'élevage en enclos est traité par la capacité 006.

**Why this priority**: valeur à long terme, non nécessaire au premier jalon.

**Independent Test**: après plusieurs récoltes sur un champ, des plants sont toujours présents ; après
plusieurs chasses, il reste des animaux dans la zone.

**Acceptance Scenarios**:

1. **Given** une culture mûre, **When** il la récolte, **Then** il replante si possible.
2. **Given** moins de deux animaux d'une espèce dans la zone, **When** il chasse, **Then** il choisit une
   autre source ou une autre zone, sauf urgence de faim.

---

### Edge Cases

- Faim à 20/20 : refus poli (« je n'ai pas faim »), sans consommer de nourriture ; exception autorisée
  pour les aliments qui soignent quand la vie est basse (voir FR-011).
- Inventaire sans aucune nourriture et en pleine nuit ou en grotte : la sécurité prime sur la chasse.
- Menace proche pendant un repas : le repas s'interrompt, les réflexes de survie gardent la priorité.
- Aliment à plusieurs états (pomme de terre crue vs cuite, poisson cru vs cuit) : la version cuite est
  préférée si disponible ; la version crue saine reste mangeable.
- Aliments qui laissent un objet en retour (ragoût → bol, miel → bouteille) : l'objet est conservé
  correctement, jamais jeté.
- Animal apprivoisé ou nommé (chien, chat, cheval, animal appartenant au joueur) : jamais chassé.
- Joueur qui demande explicitement de garder une nourriture (« garde les pommes dorées ») : respecté.
- Faim qui ne bouge pas après le repas (effet, lag, nourriture refusée par le jeu) : échec signalé, pas de
  boucle ; au plus deux essais, puis changement de nourriture.
- Famine prolongée sans source trouvée : demander de l'aide au joueur plutôt que d'errer indéfiniment.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST considérer comme mangeable **tout aliment qui restaure de la faim** et n'est
  pas classé nuisible, sans liste restreinte de quelques aliments autorisés.
- **FR-002**: Le compagnon MUST NOT manger volontairement un aliment **nuisible** (liste explicite :
  œil d'araignée, patate empoisonnée, poisson-globe, fruit de chorus, ragoût suspect). La liste MUST être
  centralisée, modifiable et couverte par des tests.
- **FR-003**: Le compagnon MUST distinguer trois catégories : **sûr** (mangé normalement), **de secours**
  (viande crue, chair putréfiée : mangé seulement en dernier recours quand la faim est critique, avec
  avertissement) et **nuisible** (jamais). Les aliments **précieux** (pommes dorées) sont réservés aux
  urgences de santé.
- **FR-004**: La sélection de l'aliment MUST suivre une règle prévisible : préférer le plus nourrissant
  sans gaspillage (ne pas dépasser inutilement la barre de faim), préférer le cuit au cru, consommer d'abord
  ce qui est le moins utile ailleurs, et ne jamais consommer un aliment précieux hors urgence.
- **FR-005**: Après chaque repas, le compagnon MUST vérifier l'effet réel (faim avant/après) et le
  rapporter ; un repas sans effet MUST être signalé comme un échec, avec au plus deux essais avant de
  changer d'aliment ou de renoncer.
- **FR-006**: En cas de refus ou d'impossibilité, le compagnon MUST donner la **raison réelle** (faim pleine,
  aucun aliment, aliment nuisible, interrompu par une menace), jamais une justification inexacte sur ses
  propres capacités.
- **FR-007**: Le compagnon MUST connaître en permanence son **stock de nourriture** (quantité totale de
  faim restaurable, par catégorie) et le mentionner dans sa perception.
- **FR-008**: Le compagnon MUST déclencher un approvisionnement lorsque le stock passe sous un seuil de
  sécurité, **avant** que la faim ne soit critique, et MUST en informer le joueur.
- **FR-009**: L'approvisionnement MUST choisir parmi plusieurs sources (chasse, cueillette, pêche, cultures
  existantes, coffres connus) celle qui est la plus accessible et sûre, avec repli sur les autres.
- **FR-010**: Le compagnon MUST pouvoir **cuire** les aliments crus (four ou équivalent + combustible),
  y compris obtenir l'équipement et le combustible via la capacité 001, et vérifier le résultat.
- **FR-011**: Quand sa vie est basse, le compagnon MUST pouvoir manger pour se soigner même si la faim
  est presque pleine, si le jeu l'autorise, en préférant les aliments qui régénèrent le plus.
- **FR-012**: Le compagnon MUST NOT chasser les animaux apprivoisés, nommés ou appartenant à un joueur,
  ni les derniers représentants d'une espèce dans la zone hors urgence de faim.
- **FR-013**: Toute recherche de nourriture MUST être bornée (distance, durée, essais) et se terminer par
  un compte rendu ; en cas d'échec prolongé, le compagnon MUST demander de l'aide au joueur.
- **FR-014**: Les menaces et réflexes de survie MUST garder la priorité sur le repas et sur la chasse.
- **FR-015**: Le compagnon MUST mémoriser les sources de nourriture rencontrées (champs, pommiers, zones
  d'élevage, plans d'eau poissonneux) et les vérifier à l'arrivée.
- **FR-016**: Le compagnon MUST respecter les zones protégées (cultures et coffres de la base ne sont pas
  détruits ; on récolte et on replante, on ne rase pas).
- **FR-017**: Les règles de classification, de sélection et de seuil MUST être vérifiables automatiquement
  sans serveur Minecraft ni appel au modèle, y compris pour **chaque aliment** du jeu (tout aliment connu
  est classé sûr, de secours, nuisible ou précieux) ; les comportements en jeu non vérifiés MUST être
  listés avec un scénario de test manuel.
- **FR-018**: Le nombre d'appels au modèle pour un approvisionnement MUST rester borné et mesurable ; le
  choix de l'aliment et la détection du seuil MUST être déterministes.

### Key Entities

- **Aliment** : un objet comestible, avec sa valeur nutritive, sa catégorie (sûr, de secours, nuisible,
  précieux) et son éventuel état cru/cuit.
- **Stock de nourriture** : somme de faim restaurable par catégorie, comparée à un seuil de sécurité.
- **Source de nourriture** : lieu ou type de ressource (animaux, arbre fruitier, champ, eau, coffre), avec
  disponibilité estimée et date de dernière vérification.
- **Plan d'approvisionnement** : étapes ordonnées (trouver, récolter ou chasser, cuire, ranger) pour
  atteindre un stock cible.
- **Compte rendu de repas ou de collecte** : aliment consommé, faim avant/après, ou quantité nutritive
  obtenue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pour 100 % des aliments classés sûrs ou de secours du jeu, un compagnon à faim réduite mange
  l'aliment et sa faim augmente (test automatique pour chacun).
- **SC-002**: 0 aliment nuisible mangé volontairement sur l'ensemble des tests automatiques et des essais
  en jeu.
- **SC-003**: Avec du steak, du poulet cuit ou des pommes comme seule nourriture, le compagnon mange avec
  succès dans 10 essais sur 10 en jeu (reproduction du défaut constaté).
- **SC-004**: Un compagnon sans nourriture dans une zone avec animaux reconstitue un stock au-dessus du
  seuil de sécurité en moins de 10 minutes de jeu dans au moins 8 essais sur 10.
- **SC-005**: Sur une mission de 30 minutes sans intervention, le compagnon ne descend jamais à une faim
  qui l'empêche de courir ou qui lui fait perdre de la vie, hors zone sans aucune ressource.
- **SC-006**: Aucun refus de manger fondé sur une raison inexacte : 100 % des refus donnent une des
  raisons listées dans FR-006.
- **SC-007**: Une recherche de nourriture infructueuse se termine avec compte rendu en moins de 5 minutes
  de jeu, sans boucle.
- **SC-008**: Un repas ou un approvisionnement ordinaire consomme au plus 6 requêtes au modèle de langage
  (mesurées via les traces).

## Assumptions

- Monde survie 1.21.4, Overworld uniquement, serveur local ; données de nourriture issues de la version du
  jeu utilisée.
- La cause exacte du refus constaté en test (steak, poulet cuit) n'est pas établie (aucune trace
  enregistrée n'a pu être consultée). Le filtre de nourriture actuel accepte déjà la viande cuite ; les
  pistes crédibles, à reproduire dans le plan, sont : l'outil de repas ne permet pas de **choisir** un
  aliment (le modèle conclut qu'il ne peut pas manger tel aliment), le repas peut être jugé raté à tort si
  la faim n'est pas encore mise à jour juste après, et l'absence de gestion d'erreur autour du repas.
  Cette spec fixe le comportement attendu, pas la cause.
- Le réflexe de survie existant (manger quand la faim baisse) est conservé et doit adopter les mêmes
  règles de classification que l'outil de repas.
- La viande crue et la chair putréfiée sont classées « de secours » ; si le propriétaire préfère les
  interdire totalement, c'est un simple changement de catégorie.
- L'élevage en enclos, les fermes automatiques et les pièges à mobs sont hors périmètre (capacités 006 et
  007) ; seuls la chasse, la cueillette, la pêche, la récolte de cultures simples et la cuisson sont ici.
- La fabrication d'équipement (four, canne à pêche, houe) et la récolte de combustible passent par la
  capacité 001 ; cette spec les utilise sans les redéfinir.
- Les seuils de stock et de faim sont des valeurs de départ à calibrer avec les traces et les essais en jeu.
- Les comportements dépendant du monde réel (pathfinding vers les animaux, pêche, cuisson) sont déclarés
  « non vérifiés en jeu » jusqu'à test manuel.
