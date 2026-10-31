# Feature Specification: Base, stockage thématique et retour à la base

**Feature Branch**: `008-base-storage-return` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "La base n'est pas juste la maison construite, c'est la zone autour : éclairée, sans apparition de zombies la nuit ; elle s'étend avec de nouveaux édifices en étant éclairée. Stockage par thème (minerais précieux, pierre, bois, redstone, composants redstone, cultures…) plus un coffre fourre-tout où le propriétaire peut demander de ranger. Un coffre avec une pancarte « interdit » ne s'ouvre pas sans autorisation. Le retour à la base est une pesée risque/gain (par exemple, rentrer avec 2 stacks de charbon et de fer quand l'instinct de survie est bas)." Capacité 008 de `specs/ROADMAP.md`.

## Vocabulaire

- **Base** : la **zone** habitée et protégée (bâtiments **et** leurs abords), pas seulement une maison. Elle a un
  périmètre, un point de référence, une liste de bâtiments et de zones de stockage.
- **Zone éclairée** : zone où aucune case n'est sous le seuil d'apparition des monstres, avec une marge de sécurité.
- **Station de stockage** : ensemble de coffres regroupés par thème, étiquetés, dans la base.
- **Thème** : catégorie d'objets qui partagent un usage (minerais, pierre, bois, redstone…).
- **Coffre interdit** : coffre portant une pancarte « interdit » ; le compagnon n'y touche pas sans autorisation.
- **Retour** : trajet du compagnon vers la base pour déposer, se soigner, se nourrir ou se rééquiper.
- **Gain** : valeur de ce qu'il porte et de ce qu'il pourrait encore ramasser ; **risque** : probabilité de tout
  perdre (mort, perte d'équipement) selon sa fragilité du moment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comprendre la base comme une zone protégée et éclairée (Priority: P1)

Le compagnon sait que sa base n'est pas une maison isolée mais **un périmètre** autour de ses bâtiments :
cour, chemins, jardin, fermes, stockage. Il le connaît, le garde éclairé en permanence (aucune apparition de
zombies ou autres monstres la nuit, y compris sur les abords), le vérifie régulièrement et corrige les trous
de lumière.

**Why this priority**: la base est le refuge de tout le reste (stockage, soins, fermes) ; elle ne vaut que si
la zone entière est sûre. C'est la première demande du propriétaire.

**Independent Test**: après une nuit complète sans le propriétaire, aucun monstre n'est apparu dans le
périmètre, et la carte d'éclairage ne montre aucune case sous le seuil.

**Acceptance Scenarios**:

1. **Given** une base avec un bâtiment et ses abords, **When** le compagnon la contrôle, **Then** il
   connaît son périmètre exact et constate que chaque case de sol du périmètre est au-dessus du seuil.
2. **Given** une case sous le seuil dans le périmètre, **When** il la détecte, **Then** il ajoute une source de
   lumière adaptée et vérifie le résultat.
3. **Given** une torche détruite ou une zone modifiée par le joueur, **When** il fait sa tournée, **Then** il
   rétablit l'éclairage.
4. **Given** la tombée de la nuit, **When** il est dans la base, **Then** il sait qu'il est en sécurité
   relative et peut y travailler (stockage, craft, soins).

---

### User Story 2 - Agrandir la base sans casser sa sécurité (Priority: P2)

Quand une nouvelle construction (maison supplémentaire, ferme, atelier, entrepôt) ne tient pas dans l'espace
disponible de la base, le compagnon **agrandit la base** en plaçant le nouvel édifice **à côté** et **éclaire
toute la zone ajoutée** (chemin de liaison compris), avant et après le chantier. Le périmètre enregistré est
mis à jour.

**Why this priority**: la base doit grandir avec les besoins (fermes, stockage), mais jamais en laissant une
zone obscure à côté de la zone sûre.

**Independent Test**: demander un édifice qui ne tient pas dans la base ; il est construit adjacent, et le
nouveau périmètre est entièrement éclairé, vérifié par la carte d'éclairage.

**Acceptance Scenarios**:

1. **Given** un chantier qui dépasse l'espace libre de la base, **When** le compagnon planifie, **Then** il
   choisit un emplacement adjacent adapté (terrain stable, hors zones protégées) et en informe le joueur.
2. **Given** une extension décidée, **When** il construit, **Then** il éclaire la nouvelle zone pendant le
   chantier (au moins les zones de travail et de passage) et complètement à la fin.
3. **Given** l'extension terminée, **When** il met à jour la base, **Then** le périmètre, la liste des
   bâtiments et la carte d'éclairage reflètent la nouvelle zone.
4. **Given** un emplacement adjacent impossible (eau, falaise, construction d'un autre joueur), **When** il
   cherche, **Then** il propose une autre option ou explique le blocage.

---

### User Story 3 - Stockage par thème dans des coffres dédiés (Priority: P1)

Le compagnon range ses objets **par thème**, dans des coffres dédiés et étiquetés :

| Thème | Exemples |
|---|---|
| Minerais et gemmes | diamant, fer, charbon, or, cuivre, lapis-lazuli, émeraude, lingots, pépites |
| Pierre et roches | pierre, cobblestone, deepslate, granite, diorite, andésite, grès, briques |
| Bois | bûches, planches, bâtons, pousses, escaliers et dalles en bois |
| Redstone (matière) | poussière, blocs de redstone, quartz, lingots nécessaires aux circuits |
| Composants redstone | répéteurs, comparateurs, pistons, observateurs, entonnoirs, plaques, leviers… |
| Cultures | blé, graines, légumes, fruits, canne à sucre, melons, citrouilles |
| Nourriture préparée et viande | viande crue et cuite, pain, plats cuisinés |
| Butin de monstres | os, fil, poudre à canon, flèches, chair putréfiée, perles |
| Outils et équipement | outils, armes, armures, boucliers de rechange |

Il existe en plus un **coffre de base « fourre-tout »** pour tout ce qui ne rentre dans aucun thème, et où
le propriétaire peut déposer des objets ou demander au compagnon d'aller **ranger**. La liste de thèmes est
extensible.

**Why this priority**: c'est ce qui rend les ressources retrouvables et rend utile le retour à la base.

**Independent Test**: inventaire mélangé (fer, pierre, bûches, blé, redstone, objet inconnu) ; après
rangement, chaque objet est dans le bon coffre et l'objet inconnu est dans le coffre fourre-tout.

**Acceptance Scenarios**:

1. **Given** un inventaire mélangé, **When** le compagnon range, **Then** chaque objet va dans le coffre de
   son thème, et le résultat réel est vérifié (inventaire avant/après, contenu du coffre).
2. **Given** un objet qui n'appartient à aucun thème, **When** il range, **Then** il va au coffre fourre-tout.
3. **Given** un coffre de thème plein, **When** il range, **Then** il utilise le coffre voisin du même thème
   ou en crée un, sans mélanger les thèmes.
4. **Given** l'ordre du propriétaire « va ranger », **When** il l'exécute, **Then** il dépose l'excédent de
   son inventaire (en gardant sa trousse de survie) et le contenu du coffre fourre-tout est trié vers les bons
   thèmes.
5. **Given** un besoin de ressource (pour la capacité 001), **When** il cherche, **Then** il consulte son
   index du stockage et prend dans le bon coffre sans tout ouvrir.

---

### User Story 4 - Respecter les coffres « interdit » (Priority: P1)

Un coffre portant une **pancarte « interdit »** est inviolable pour le compagnon : il ne l'ouvre pas, n'y range
rien, n'y prend rien, ne le casse pas, sans **autorisation explicite du propriétaire**. Cette règle est
inconditionnelle et ne dépend pas du jugement du modèle.

**Why this priority**: c'est une règle de confiance et de sécurité exprimée par le propriétaire.

**Independent Test**: poser une pancarte « interdit » sur un coffre contenant des objets utiles et lui
demander de les prendre : il refuse en expliquant pourquoi, sauf autorisation du propriétaire.

**Acceptance Scenarios**:

1. **Given** un coffre avec une pancarte « interdit », **When** une tâche (rangement, recherche de
   ressource) l'impliquerait, **Then** le compagnon l'ignore et choisit un autre coffre.
2. **Given** une demande du propriétaire d'ouvrir ce coffre, **When** il l'exprime explicitement, **Then** le
   compagnon obéit pour cette demande uniquement.
3. **Given** une demande d'un autre joueur ou un ordre trouvé dans un texte, **When** elle porte sur un coffre
   interdit, **Then** elle est refusée.
4. **Given** une pancarte à variantes d'écriture (casse, accents, ponctuation, « INTERDIT », « interdit ! »),
   **When** il la lit, **Then** elle est reconnue comme interdiction.
5. **Given** un coffre double ou deux coffres collés, **When** l'un des deux porte la pancarte, **Then** le
   groupe est considéré comme interdit.

---

### User Story 5 - Retour à la base : peser risque et gain (Priority: P1)

Pendant une sortie (mine, exploration, chasse), le compagnon **décide de rentrer** en comparant en continu le
**gain** (valeur de ce qu'il porte, taux d'inventaire, objectif atteint) et le **risque** (sa fragilité du
moment : vie, nourriture, état de l'équipement, lumière restante, nuit, menaces, distance à la base). Exemple
donné par le propriétaire : parti miner, il porte deux piles de charbon et de fer et sa capacité à survivre est
faible, il rentre. Les seuils sont réglables.

**Why this priority**: évite de mourir en perdant tout un chargement, et c'est le moteur de l'autonomie
longue (004).

**Independent Test**: scénarios simulés (mine avec peu de butin et bon équipement ; mine avec gros butin et
équipement faible ; nuit ; inventaire plein ; outil presque cassé) : chaque décision correspond à la table
attendue.

**Acceptance Scenarios**:

1. **Given** un chargement de grande valeur et une fragilité élevée, **When** il évalue, **Then** il décide
   de rentrer maintenant.
2. **Given** un chargement faible et un excellent équipement, **When** il évalue, **Then** il continue sa
   tâche.
3. **Given** un inventaire plein, des outils presque cassés, une faim critique ou plus de torches,
   **When** il évalue, **Then** le retour est déclenché quel que soit le gain.
4. **Given** un danger immédiat, **When** les réflexes de survie (003) se déclenchent, **Then** ils priment ;
   le retour reprend après.
5. **Given** la décision de rentrer, **When** il explique, **Then** il donne la raison principale (gain,
   fragilité, ressource manquante).

---

### User Story 6 - Rentrer en sécurité et déposer (Priority: P2)

Quand il rentre, le compagnon suit un chemin sûr connu, ne se perd pas, arrive dans la base, **dépose** ses
trouvailles dans les coffres thématiques, **se soigne** et **se rééquipe** (nourriture, torches, blocs, outils),
et décide ensuite de repartir ou non. Il garde en permanence une **trousse de survie** (arme, nourriture,
torches, blocs d'abri) qu'il ne dépose pas.

**Why this priority**: boucle complète « sortir, miner, rentrer, ranger, repartir » ; dépend de l'US 5 et du
stockage.

**Independent Test**: après une sortie de test, le compagnon revient, dépose, se soigne et repart avec sa
trousse complète, sans intervention.

**Acceptance Scenarios**:

1. **Given** le départ du retour, **When** il rentre, **Then** il atteint la base ou signale qu'il est perdu
   et applique une procédure de repli (abri, repère).
2. **Given** son arrivée, **When** il dépose, **Then** le contenu des coffres augmente conformément au rangement
   et sa trousse de survie reste complète.
3. **Given** une trousse incomplète au départ du prochain trajet, **When** il prépare sa sortie, **Then**
   il la complète ou fabrique ce qui manque (capacité 001).

---

### Edge Cases

- Pancarte « interdit » retirée ou modifiée par le joueur : l'état réel fait foi à chaque ouverture, pas la
  mémoire.
- Pancarte illisible ou ambiguë (« à ne pas ouvrir sauf moi ») : traitée prudemment comme interdit.
- Coffre piégé, barils, boîtes de shulker, coffre de l'Ender : règles explicites ; les coffres du joueur non
  étiquetés ne sont jamais fouillés sans ordre.
- Objet pouvant appartenir à plusieurs thèmes (bloc de redstone, bois et pierre mélangés) : règle de priorité
  fixe et testable.
- Coffre plein partout : création d'un nouveau coffre du thème ou avertissement du propriétaire.
- Base vide (aucun coffre) : création de la station de stockage de base avant de ranger.
- Zone de base non chargée ou joueur loin : l'éclairage est vérifié à l'arrivée.
- Joueur qui détruit des torches ou ajoute des constructions : le périmètre et l'éclairage sont réévalués.
- Plusieurs bases : une base principale ; les autres comptées comme avant-postes avec des règles simplifiées.
- Base attaquée par un creeper : réflexes de survie d'abord, réparation ensuite.
- Retour impossible (chemin coupé, lave, chute, perdu loin) : repli sûr (creuser un abri, marquer sa position,
  attendre), et alerte au joueur.
- Mort en route : la capacité de récupération des affaires s'applique ; le coût de la mort alimente le risque.
- Chargement très précieux mais menace imminente : fuir d'abord, ne pas défendre le butin au péril de la vie
  hors cas explicitement autorisé.
- Seuils mal calibrés : trop de retours (inefficace) ou trop peu (dangereux) ; les valeurs sont réglables et
  mesurées dans les traces.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST considérer la base comme une **zone** (périmètre, bâtiments, stockage,
  fermes, abords) et non comme un point ou un seul bâtiment ; le périmètre MUST être enregistré, durable et
  modifiable.
- **FR-002**: Le compagnon MUST maintenir **toute la zone de la base éclairée** : aucune case de sol du
  périmètre sous le seuil d'apparition des monstres, avec marge de sécurité ; il MUST vérifier, détecter et
  corriger les manques à chaque tournée et à chaque modification.
- **FR-003**: Quand un chantier ne tient pas dans la base, le compagnon MUST pouvoir **étendre la base** en
  construisant l'édifice adjacent, informer le joueur, **éclairer toute la zone ajoutée** (pendant et après
  le chantier) et mettre à jour le périmètre.
- **FR-004**: Le compagnon MUST organiser le stockage en **coffres par thème** (au minimum : minerais et
  gemmes, pierre, bois, redstone, composants redstone, cultures, nourriture, butin de monstres, outils et
  équipement) plus un **coffre de base fourre-tout**, tous étiquetés ; la liste des thèmes MUST être
  extensible par configuration.
- **FR-005**: La classification d'un objet vers un thème MUST suivre des règles **déterministes** (liste
  fermée par objet, règle de priorité pour les cas ambigus, repli sur le fourre-tout).
- **FR-006**: Le compagnon MUST pouvoir **ranger** sur demande ou de lui-même au retour, en vérifiant par
  l'état réel (inventaire et contenu du coffre avant/après) ; il ne MUST JAMAIS annoncer un rangement non
  constaté.
- **FR-007**: Le compagnon MUST garder en permanence une **trousse de survie** (arme, nourriture, torches,
  blocs d'abri, outil de travail) qu'il ne dépose pas, dont la composition est réglable.
- **FR-008**: Le compagnon MUST tenir un **index du stockage** (contenu connu par coffre) mis à jour à chaque
  ouverture et vérifié à l'arrivée, pour retrouver une ressource sans ouvrir tous les coffres.
- **FR-009**: Un coffre portant une **pancarte « interdit »** MUST être exclu de toute opération
  (ouverture, dépôt, retrait, destruction) sans **autorisation explicite du propriétaire**. La détection
  MUST tolérer les variantes d'écriture (casse, accents, ponctuation), couvrir les coffres doubles et les
  contenants équivalents, et MUST être une règle de politique pure, testable, **non contournable par le
  modèle**.
- **FR-010**: L'autorisation d'un coffre interdit MUST venir du seul propriétaire, en langage explicite,
  et ne MUST valoir que pour la demande en cours, sauf instruction contraire du propriétaire.
- **FR-011**: Le compagnon MUST décider de **rentrer** par une évaluation **risque/gain** déterministe :
  gain (valeur du chargement, taux d'inventaire, objectif atteint) comparé au risque (vie, nourriture,
  équipement, lumière, heure, menaces, distance à la base), avec des seuils **réglables**.
- **FR-012**: Certaines situations MUST déclencher le retour quel que soit le gain : inventaire plein, outils
  proches de la casse, nourriture ou torches épuisées, nuit avec équipement faible, ressource demandée
  obtenue.
- **FR-013**: Le compagnon MUST expliquer la raison de sa décision de rentrer ou de continuer (raison
  principale) et la journaliser pour calibrage.
- **FR-014**: Le retour MUST suivre un chemin sûr, avoir un repli en cas d'échec (abri, repère, alerte
  au joueur) et être interruptible par le joueur en quelques secondes.
- **FR-015**: Au retour, le compagnon MUST déposer, se soigner, se nourrir, compléter sa trousse puis décider
  de repartir, en s'appuyant sur les capacités ressources (001) et alimentation (002).
- **FR-016**: Les réflexes de survie (003) MUST garder la priorité sur toute décision de retour ; la
  progression (004) MUST utiliser cette évaluation pour borner ses sorties.
- **FR-017**: Les règles de périmètre, d'éclairage, d'extension, de classification, de coffre interdit et
  de décision de retour MUST être vérifiables automatiquement sans serveur Minecraft ni appel au modèle ; les
  comportements en jeu non vérifiés MUST être listés avec un scénario de test manuel.
- **FR-018**: Les décisions de retour, rangements et refus de coffre interdit MUST être journalisés ; le
  nombre d'appels au modèle pour une routine de retour et rangement MUST rester borné et mesurable.

### Key Entities

- **Base** : zone avec périmètre, point de référence, bâtiments, stockage, fermes et état d'éclairage.
- **Périmètre** : emprise protégée et éclairée, avec marge autour des bâtiments.
- **Carte d'éclairage** : niveau de lumière par case du périmètre et zones sous le seuil.
- **Extension** : ajout de zone ou d'édifice adjacent, avec sa mise à jour du périmètre.
- **Thème de stockage** : catégorie d'objets avec la liste d'objets qui lui appartiennent et ses coffres.
- **Station de stockage** : groupe de coffres thématiques étiquetés, y compris le coffre fourre-tout.
- **Index du stockage** : contenu connu par coffre, avec date de dernière vérification.
- **Marque d'interdiction** : pancarte « interdit » associée à un contenant, avec l'état d'autorisation.
- **Trousse de survie** : objets conservés sur soi en permanence.
- **Évaluation de retour** : gain, risque, seuils, décision et raison.
- **Valeur d'objet** : poids relatif d'un objet dans le calcul du gain (diamant > fer > charbon > pierre).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sur une nuit complète de test, 0 monstre n'apparaît dans le périmètre de la base ; la carte
  d'éclairage ne montre aucune case sous le seuil après chaque tournée.
- **SC-002**: Après une extension, 100 % des cases de la zone ajoutée sont au-dessus du seuil à la fin du
  chantier (vérifié dans le monde).
- **SC-003**: Sur un inventaire de test de 50 objets variés, 100 % sont classés dans le thème attendu
  (test automatique pour chaque objet connu, y compris les cas ambigus).
- **SC-004**: Après un rangement, 100 % des objets déposés sont retrouvés dans le coffre du bon thème, et
  la trousse de survie reste intacte dans au moins 9 essais sur 10.
- **SC-005**: 0 ouverture, dépôt, retrait ou destruction d'un coffre « interdit » sans autorisation du
  propriétaire sur l'ensemble des tests automatiques et des essais en jeu, y compris 20 variantes d'écriture
  de la pancarte.
- **SC-006**: Pour 30 scénarios de risque/gain, la décision (rentrer ou continuer) correspond à la table
  attendue dans 100 % des cas automatiques.
- **SC-007**: Sur 10 sorties de mine d'une heure, le compagnon rentre avant de perdre plus de 25 % de la
  valeur de ce qu'il porte dans au moins 8 sorties, et le nombre de morts est inférieur à celui d'un
  compagnon sans règle de retour.
- **SC-008**: Retrouver une ressource dans le stockage prend moins de 3 ouvertures de coffre en moyenne
  (grâce à l'index), contre la fouille complète.
- **SC-009**: Une routine « rentrer, déposer, se rééquiper » consomme au plus 12 requêtes au modèle de
  langage (mesurées via les traces).

## Assumptions

- Monde survie 1.21.4, Overworld, serveur local. L'existant (point de base et rayon fixes dans la
  configuration, zone protégée contre la destruction) est **étendu** : la base devient une zone enregistrée
  durablement, d'abord alimentée par cette configuration puis modifiable.
- Le **seuil d'apparition des monstres** est celui du jeu pour la version utilisée, avec une marge de sécurité
  réglable. La marge autour des bâtiments (largeur du périmètre) est une valeur de départ (de l'ordre d'une
  douzaine de blocs) à ajuster.
- Les **chiffres de l'exemple de retour** (deux piles de charbon et de fer) ne sont que des illustrations :
  tous les seuils (valeur des objets, taux d'inventaire, fragilité, distance) sont **réglables** et à calibrer
  avec les traces et les essais en jeu.
- L'**étiquetage** des coffres se fait par pancartes lisibles posées sur chaque coffre de thème (contenu
  vérifiable par le joueur) ; la pancarte « interdit » est un cas particulier posé par le propriétaire.
- La pancarte « interdit » est reconnue quelle que soit la casse ou la ponctuation ; les autres textes
  ambigus sont traités prudemment. Le propriétaire est le seul à pouvoir lever l'interdiction.
- L'autorisation d'ouvrir un coffre interdit ne vaut que pour la demande en cours ; la mémoriser durablement
  suppose une instruction explicite du propriétaire.
- Le **coffre fourre-tout** est une destination pour tout objet sans thème, et un point de dépôt pour le
  propriétaire ; le tri de son contenu vers les thèmes est une tâche d'entretien du compagnon.
- Cette spec s'appuie sur : ressources et fabrication (001), alimentation (002), combat et réflexes (003),
  progression (004), construction bloc par bloc (005), fermes (006), redstone (007). Elle ne les redéfinit
  pas ; l'extension de la base utilise la construction de la 005.
- La recherche automatique des ressources dans le stockage (index) est un service utilisé par la capacité 001 ;
  la priorité d'une ressource entre stockage et récolte neuve est décidée par elle.
- Les comportements dépendant du monde réel (cheminement du retour, ouverture de coffres, lecture de
  pancartes, apparition de monstres) sont déclarés « non vérifiés en jeu » jusqu'à test manuel.
