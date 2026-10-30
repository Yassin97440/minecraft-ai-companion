# Feature Specification: Objectifs et progression (jouer comme un vrai joueur)

**Feature Branch**: `004-progression-goals` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Objectifs et progression : le bot doit avoir une réflexion de vrai joueur, par exemple commencer en cassant du bois, faire des outils en bois pour casser de la pierre, refaire ses outils en pierre, puis pareil avec le fer, etc., chercher de meilleurs loots…" Capacité 004 de `specs/ROADMAP.md`.

**Décisions du propriétaire (questions de cadrage)** :
- Portée : la progression va **jusqu'au Nether et au-delà** (voir paliers).
- Initiative : le compagnon choisit seul ses objectifs **quand il est inactif ET que le propriétaire est déconnecté**.
- Exploration : **sans limite de distance s'il est équipé**.
- Paliers Nether et Ender : tentés **seulement en présence du propriétaire** ; préparation uniquement en son absence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enchaîner les paliers comme un vrai joueur (Priority: P1)

Laissé seul, le compagnon suit l'arbre technologique naturel : bois → outils en bois → pierre → outils en
pierre → fer (minerai, fonte, outils et armure en fer) → diamant → etc. Il ne fabrique pas un outil qu'il
vient de rendre obsolète, remplace ses outils dès qu'un meilleur matériau est accessible, et sait à tout
moment à quel **palier** il se trouve et quel est le suivant.

**Why this priority**: c'est le cœur de la demande ; la progression ordonnée transforme les capacités 001
à 003 en comportement de jeu cohérent.

**Independent Test**: dans un monde neuf, propriétaire déconnecté, inventaire vide : au bout d'un temps
borné le compagnon possède des outils en pierre puis en fer, a remplacé les premiers, et annonce son palier.

**Acceptance Scenarios**:

1. **Given** un monde neuf et un inventaire vide, **When** il n'a aucune tâche, **Then** il commence par le
   bois, fabrique un établi et des outils en bois, puis passe à la pierre.
2. **Given** des outils en bois et de la pierre accessible, **When** il récolte assez de pierre, **Then** il
   fabrique des outils en pierre et délaisse (range ou jette sans gâcher) ceux en bois.
3. **Given** des outils en pierre et du fer repéré, **When** il atteint ce palier, **Then** il fabrique four,
   lingots, outils en fer, puis armure, en suivant la priorité de la capacité 003.
4. **Given** un palier atteint, **When** il est interrogé, **Then** il dit où il en est, ce qu'il a obtenu
   et ce qu'il vise ensuite.

---

### User Story 2 - Choisir seul le prochain objectif utile (Priority: P1)

À chaque instant d'initiative libre, le compagnon évalue sa situation (équipement, nourriture, santé, heure,
ressources connues, dangers) et choisit **l'objectif le plus utile et le plus sûr**, pas le plus ambitieux :
manger avant d'explorer, s'abriter la nuit, s'armer avant de descendre.

**Why this priority**: sans priorisation, l'enchaînement de paliers serait fragile et dangereux.

**Independent Test**: scénarios simulés (faim basse ; nuit qui tombe ; aucune arme ; tout va bien) : l'objectif
choisi correspond à la priorité attendue dans 100 % des cas.

**Acceptance Scenarios**:

1. **Given** un stock de nourriture bas, **When** il choisit un objectif, **Then** l'approvisionnement
   (capacité 002) passe avant toute exploration.
2. **Given** la nuit et un équipement faible, **When** il choisit, **Then** il privilégie une activité sûre
   (abri, mine peu risquée, fabrication) plutôt qu'une sortie lointaine.
3. **Given** deux objectifs possibles de même utilité, **When** il choisit, **Then** il prend le moins
   risqué et le moins coûteux, et explique son choix.

---

### User Story 3 - N'agir seul que quand le propriétaire est absent (Priority: P1)

Le compagnon ne démarre une progression autonome que lorsqu'il est **inactif et que le propriétaire est
déconnecté**. Dès que le propriétaire se reconnecte, parle ou donne un ordre, le compagnon termine
proprement l'étape en cours (ou l'interrompt si dangereux), résume ce qu'il a fait et se met à son écoute.

**Why this priority**: la progression sans surveillance est la plus risquée ; l'arrêt immédiat à la
reprise de main est une exigence de sécurité de la constitution (principe V).

**Independent Test**: lancer une progression propriétaire déconnecté, puis le reconnecter : l'agent cesse
ses actions longues en moins de 10 secondes et produit un résumé.

**Acceptance Scenarios**:

1. **Given** le propriétaire connecté, **When** le compagnon est inactif, **Then** il ne lance aucune
   progression autonome (seuls les comportements actuels d'attente restent actifs).
2. **Given** une progression en cours, **When** le propriétaire se reconnecte ou envoie un message,
   **Then** le compagnon s'interrompt de façon sûre et rend compte.
3. **Given** le propriétaire déconnecté et un objectif en cours, **When** le compagnon est dans un état
   dangereux (vie basse, nuit sans abri), **Then** la sécurité prime et l'objectif est mis en pause.

---

### User Story 4 - Chercher de meilleurs loots et explorer, sans limite si équipé (Priority: P2)

Pour progresser, le compagnon repère et visite des lieux riches (villages, mines abandonnées, donjons,
temples, grottes à minerais, ravins) pour obtenir fer, diamant, nourriture, outils et équipement meilleurs.
Il peut aller **aussi loin que nécessaire tant qu'il est « équipé »** (voir FR-010), mémorise ce qu'il
découvre et sait retrouver sa base.

**Why this priority**: indispensable aux paliers avancés, mais plus risqué ; vient après le cœur.

**Independent Test**: dans un monde de test avec un village à 300 blocs, un compagnon équipé et nourri le
découvre, en tire du butin utile et le mémorise ; le même compagnon mal équipé n'y va pas.

**Acceptance Scenarios**:

1. **Given** un équipement et une nourriture suffisants, **When** un palier exige une ressource introuvable
   à proximité, **Then** il explore plus loin, par étapes, en notant sa route.
2. **Given** un équipement ou une nourriture insuffisants, **When** il voudrait explorer, **Then** il s'en
   tient à des zones proches et s'équipe d'abord.
3. **Given** un coffre de butin trouvé, **When** il l'ouvre, **Then** il prend ce qui sert à son palier
   actuel, garde l'utile pour plus tard et note l'emplacement.
4. **Given** une exploration lointaine, **When** les conditions se dégradent (nuit, nourriture, vie), **Then**
   il suspend l'exploration et revient vers un abri ou la base.

---

### User Story 5 - Se souvenir, rendre compte et se laisser piloter (Priority: P2)

Le compagnon tient un **journal de progression** : paliers atteints, objectifs en cours, ressources et lieux
mémorisés, échecs. Il le résume au joueur à sa reconnexion, accepte de recevoir un objectif imposé
(« va chercher du diamant »), de mettre sa progression en pause ou de la désactiver.

**Why this priority**: rend l'autonomie lisible et contrôlable ; indispensable pour faire confiance à un
agent qui joue seul.

**Independent Test**: après une session sans le propriétaire, la reconnexion produit un résumé exact
(paliers, trouvailles, morts éventuelles) vérifiable contre l'état du monde.

**Acceptance Scenarios**:

1. **Given** une progression en l'absence du propriétaire, **When** il revient, **Then** il reçoit un résumé
   fidèle et honnête (y compris échecs et morts).
2. **Given** une consigne du joueur (« priorité au diamant », « ne descends pas »), **When** elle est donnée,
   **Then** elle modifie les priorités et est mémorisée.
3. **Given** « désactive la progression automatique », **When** le joueur le dit, **Then** aucune initiative
   n'est prise tant qu'il ne la réactive pas.

---

### User Story 6 - Paliers avancés : Nether et au-delà (Priority: P3)

Une fois l'équipement de base solide (fer complet, outils en diamant), le compagnon prépare et franchit le
palier suivant : obsidienne, portail du Nether, ressources du Nether (forteresse, quartz, blaze), puis, en
bout de piste, préparation et affrontement de l'Ender Dragon. Chaque palier avancé est une **sous-spécification
ultérieure** : cette spec définit le cadre, l'ordre et les conditions de passage.

**Why this priority**: ambition finale demandée par le propriétaire, mais dépend de tout le reste et exige
de nouvelles capacités (autres dimensions, combats avancés).

**Independent Test**: validation palier par palier, chacun avec son propre scénario de test en jeu.

**Acceptance Scenarios**:

1. **Given** les prérequis du palier (équipement, nourriture, blocs, outils de feu), **When** les conditions
   sont remplies, **Then** il décide d'y aller et l'annonce au journal.
2. **Given** des prérequis non remplis, **When** il envisage le palier, **Then** il retourne d'abord
   combler ce qui manque.
3. **Given** un palier jugé trop dangereux en l'absence du propriétaire, **When** il y arrive, **Then** il
   attend la présence du propriétaire (voir FR-011).

---

### Edge Cases

- Le propriétaire se reconnecte en plein déplacement dangereux : la sécurité immédiate (réflexes) précède
  l'écoute du joueur, mais le joueur est informé dès que possible.
- Le compagnon meurt pendant une progression autonome : il récupère ses affaires si possible, consigne la
  mort et réévalue son palier ; après plusieurs morts rapprochées il s'arrête et attend le propriétaire.
- Ressource nécessaire introuvable après exploration étendue : il bascule sur un autre objectif ou attend ;
  jamais de boucle infinie.
- Monde dont le relief rend un palier impossible (pas de pierre accessible, île isolée) : il l'explique.
- Consommation d'appels au modèle sur de longues périodes sans surveillance : plafond de budget, arrêt
  propre quand il est atteint.
- Ordre du joueur contradictoire avec la progression en cours : l'ordre l'emporte, la progression reprend
  ensuite si le joueur ne dit rien.
- Joueur qui détruit ou déplace la base : la mémoire est vérifiée à l'arrivée et mise à jour.
- Plusieurs mondes ou redémarrage du bot : l'état de progression survit au redémarrage ; au premier doute
  sur l'état réel, il se réfère à l'inventaire et au monde, pas à la mémoire seule.
- Objectif ambitieux avec équipement dégradé en cours de route (casse, perte) : repli vers l'étape de
  rééquipement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST connaître une **échelle de paliers** explicite et ordonnée (au minimum :
  bois, pierre, fer, diamant, Nether, Ender), avec pour chacun ses prérequis, ses objectifs, et ses conditions
  de réussite vérifiables sur l'inventaire et le monde.
- **FR-002**: Le compagnon MUST déterminer son palier actuel à partir de l'état réel (équipement,
  inventaire, lieux connus), pas uniquement de sa mémoire.
- **FR-003**: Le compagnon MUST choisir son prochain objectif par priorité : sécurité et besoins vitaux
  (abri, nourriture, soin) avant équipement, avant progression, avant exploration. La règle de priorité MUST
  être déterministe, testable et expliquée dans le journal.
- **FR-004**: Le compagnon MUST remplacer ses outils et son équipement dès qu'un meilleur matériau est
  atteint, sans gaspiller de ressources pour des objets obsolètes.
- **FR-005**: Il MUST transformer chaque objectif en demande de fabrication ou de récolte exécutable par les
  capacités 001 (ressources), 002 (alimentation) et 003 (combat), sans les réimplémenter.
- **FR-006**: Il MUST n'initier de progression autonome que lorsque **les deux conditions** sont réunies :
  aucune tâche ni ordre en cours **et** propriétaire déconnecté. Cette règle MUST être une règle de politique
  testable et ne pas pouvoir être contournée par le modèle.
- **FR-007**: Dès la reconnexion, un message ou un ordre du propriétaire, le compagnon MUST interrompre ses
  actions longues en moins de 10 secondes, mettre en sécurité ce qui l'est, et résumer ce qu'il a fait.
- **FR-008**: Il MUST permettre au joueur de désactiver, suspendre, réactiver et orienter la progression
  (priorités, interdictions, objectif imposé) par commande en langage naturel.
- **FR-009**: Il MUST tenir un journal de progression persistant (paliers atteints, objectifs, lieux,
  trouvailles, échecs, morts) qui survit au redémarrage, honnête et sans informations inventées.
- **FR-010**: Il MUST définir ce qu'« équipé » signifie pour autoriser l'exploration lointaine : seuils
  minimaux d'armure, d'arme, de nourriture, de lumière, de blocs d'abri, d'outils et de santé, calculés par
  une règle pure et testable ; en dessous, l'exploration se limite aux zones proches.
- **FR-011**: Il MUST appliquer une **règle de risque** pour chaque palier avancé (Nether, Ender) :
  conditions de départ, niveau de danger accepté, et arrêt si ces conditions ne sont plus remplies. Ces
  paliers MUST être tentés **uniquement en présence du propriétaire** (décision du propriétaire) ; en son
  absence, le compagnon s'en tient à la préparation (équipement, ressources, blocs, outils) et attend.
- **FR-012**: Il MUST repérer, mémoriser et réutiliser les lieux de loot et les gisements découverts, et
  retrouver sa base à tout moment.
- **FR-013**: Il MUST se replier (retour à l'abri, base, ou arrêt) quand ses conditions d'équipement, de
  nourriture, de vie, de lumière ou d'heure se dégradent en cours d'exploration.
- **FR-014**: Il MUST borner le travail autonome : plafond de requêtes au modèle de langage par période,
  limite d'essais par objectif, nombre maximal de morts avant arrêt, délai de repli ; à l'épuisement du
  budget il s'arrête proprement et le consigne.
- **FR-015**: Il MUST rester dans le cadre des garde-fous de la constitution : en l'absence du
  propriétaire, l'ensemble des actions autonomes autorisées MUST être défini par une liste explicite,
  extensible seulement par règle testée ; aucune destruction de zones protégées.
- **FR-016**: Il MUST rendre compte à la reconnexion d'un résumé fidèle : paliers franchis, ressources
  obtenues, lieux trouvés, incidents, morts, budget consommé.
- **FR-017**: Toute règle de palier, de priorité, d'état « équipé », de règle de risque et d'autorisation
  d'initiative MUST être vérifiable automatiquement sans serveur Minecraft ni appel au modèle ; les
  comportements en jeu non vérifiés MUST être listés avec un scénario de test manuel.
- **FR-018**: Les décisions d'objectif (objectif choisi, raison, résultat) MUST être journalisées et
  traçables pour l'évaluation et le calibrage.

### Key Entities

- **Palier** : étape de l'échelle (bois, pierre, fer, diamant, Nether, Ender) avec prérequis, objectifs et
  condition de réussite.
- **Objectif** : but concret choisi (ex. « avoir des outils en fer »), avec priorité, origine (initiative
  ou joueur), budget et état.
- **État de situation** : équipement, nourriture, santé, heure, lieux connus, dangers, présence du
  propriétaire, budget restant.
- **Condition « équipé »** : seuils minimums permettant l'exploration lointaine.
- **Lieu d'intérêt** : village, mine, donjon, gisement ou structure découverts, avec date de vérification
  et butin restant estimé.
- **Journal de progression** : historique durable des paliers, objectifs, trouvailles, échecs et morts.
- **Budget autonome** : plafonds de requêtes, d'essais, de morts et de temps pour une session sans
  surveillance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dans un monde neuf, propriétaire déconnecté, le compagnon atteint le palier « pierre »
  (outils en pierre fabriqués, ceux en bois remplacés) dans au moins 8 essais sur 10 en moins de
  15 minutes de jeu.
- **SC-002**: Dans le même contexte, il atteint le palier « fer » (outils et au moins un plastron en fer)
  dans au moins 6 essais sur 10 en moins de 45 minutes de jeu.
- **SC-003**: Pour 30 situations de test (faim, nuit, sans arme, tout va bien, etc.), l'objectif choisi
  correspond à la priorité attendue dans 100 % des cas.
- **SC-004**: Aucune progression autonome ne démarre alors que le propriétaire est connecté ou qu'une tâche
  est en cours (0 cas sur l'ensemble des tests).
- **SC-005**: Après reconnexion ou message du propriétaire, le compagnon cesse ses actions longues en moins
  de 10 secondes dans 100 % des essais.
- **SC-006**: Le résumé de reconnexion est exact dans 100 % des essais évalués (aucun palier, objet ou
  lieu faussement annoncé).
- **SC-007**: Sur une session autonome de 60 minutes, le compagnon ne dépasse jamais son budget de requêtes
  et s'arrête proprement à l'épuisement ; le coût est relevé via les traces.
- **SC-008**: Un compagnon qui ne remplit pas la condition « équipé » n'entreprend aucune exploration
  lointaine (0 cas sur l'ensemble des tests automatiques).
- **SC-009**: Sur 10 sessions autonomes d'une heure, le compagnon meurt en moyenne moins de 1 fois par
  session et, après le nombre maximal de morts, s'arrête dans 100 % des cas.

## Assumptions

- Monde survie 1.21.4 sur serveur local ; l'Overworld est le terrain principal. Le **Nether et l'End** font
  partie de l'ambition (cadre défini ici) mais chaque palier avancé exige une sous-spécification et de
  nouvelles capacités ; `specs/ROADMAP.md` est mis à jour en conséquence.
- Les capacités 001 (ressources), 002 (alimentation) et 003 (combat) sont des prérequis : cette spec les
  orchestre et ne les redéfinit pas. Tant que leurs spécifications ne sont pas implémentées, la
  progression ne dépassera pas ce qu'elles permettent.
- Le « propriétaire déconnecté » est détecté par l'absence du joueur propriétaire (`OWNER_USERNAME`) sur le
  serveur ; les autres joueurs ne déclenchent ni n'empêchent la progression.
- **Tension avec la constitution (principe II)** : le mode autonome actuel est limité à une liste de tools
  inoffensifs. La progression étend cette liste (fabrication, récolte, combat, exploration). Au
  `/speckit-plan`, cela doit être justifié dans « Complexity Tracking » : l'extension est bornée par la
  condition de propriétaire absent, les budgets (FR-014), l'arrêt à la reconnexion (FR-007) et la
  protection des zones, et elle exclut toute action destructrice envers la base ou les autres joueurs.
- Les lubies (humour) existantes restent actives quand la progression n'est pas autorisée ; elles ne
  s'exécutent pas pendant une progression autonome.
- Les seuils (« équipé », budget de requêtes, nombre de morts, durées) sont des valeurs de départ à
  calibrer avec les traces et les essais en jeu.
- Aucun accès à l'API payante n'est supposé : le budget de requêtes doit tenir compte du modèle gratuit ou
  local (quotas, 429).
- La découverte de structures s'appuie sur ce que le jeu permet à un joueur légitime (exploration, indices
  du terrain) ; l'usage de commandes de localisation est un choix à justifier dans le plan, pas un défaut.
