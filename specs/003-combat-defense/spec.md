# Feature Specification: Combat et défense (s'équiper, se défendre, riposter)

**Feature Branch**: `003-combat-defense` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Combat et défense du bot : il doit comprendre qu'il doit se défendre des mobs hostiles, et que certains outils lui permettent de mieux attaquer et de mieux se protéger. Il doit donc savoir s'équiper en armure, mais aussi en épée et/ou hache." Capacité 003 de `specs/ROADMAP.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - S'équiper automatiquement du meilleur matériel (Priority: P1)

Dès qu'il possède de l'armure, une arme ou un bouclier, le compagnon les équipe sans qu'on le lui demande, en
choisissant le meilleur de chaque catégorie (casque, plastron, jambières, bottes, bouclier, arme). Il
rééquipe après chaque ramassage, fabrication, don du joueur ou mort. Il sait aussi **comparer** deux
équipements (une épée en fer vaut mieux qu'une hache en pierre ; une armure en diamant mieux que du fer).

**Why this priority**: sans équipement porté, les autres comportements de combat n'ont aucun effet ; c'est
la demande explicite du propriétaire.

**Independent Test**: donner au compagnon, un par un, une épée en pierre, une hache en fer, un plastron en
fer, un casque en cuir puis un bouclier ; chaque pièce est portée en moins de 10 secondes et l'état de
l'équipement est annoncé.

**Acceptance Scenarios**:

1. **Given** de l'armure dans l'inventaire et aucune portée, **When** une phase calme commence, **Then**
   le compagnon équipe chaque pièce à son emplacement et le confirme par l'état réel de ses emplacements.
2. **Given** une armure en cuir portée et une en fer ramassée, **When** il l'équipe, **Then** la meilleure
   remplace la moins bonne et l'ancienne est rangée (pas jetée).
3. **Given** une épée et une hache dans l'inventaire, **When** il doit combattre, **Then** il choisit selon
   la règle de choix d'arme (voir FR-004) et annonce son choix.
4. **Given** un équipement très abîmé, **When** il approche de la casse, **Then** il le signale et préfère
   un équipement en meilleur état si disponible.

---

### User Story 2 - Savoir quand se battre, fuir ou s'abriter (Priority: P1)

Face à un monstre hostile, le compagnon décide de manière prévisible : **combattre** s'il est équipé et en
bonne santé, **fuir** ou **s'abriter** sinon, selon le type de monstre, le nombre d'adversaires, sa vie et
son équipement. Il comprend et dit pourquoi il choisit cette option.

**Why this priority**: c'est « comprendre qu'il doit se défendre » dans la demande, et c'est de la survie
immédiate.

**Independent Test**: scénarios simulés (un zombie ; trois zombies sans arme ; un creeper ; vie basse) :
chaque décision correspond à la table attendue.

**Acceptance Scenarios**:

1. **Given** un zombie isolé, une épée et une vie correcte, **When** il approche, **Then** le compagnon le
   combat et le tue.
2. **Given** trois monstres ou plus, ou une vie basse, **When** ils approchent, **Then** il fuit ou s'abrite
   plutôt que de combattre.
3. **Given** un creeper proche, **When** il est détecté, **Then** le compagnon s'éloigne ou le frappe puis
   recule selon la règle du monstre, mais ne reste jamais à portée d'explosion.
4. **Given** aucune arme et un monstre qui approche, **When** il décide, **Then** il s'abrite ou fuit et
   ne frappe à mains nues qu'en dernier recours.

---

### User Story 3 - Combattre efficacement (Priority: P2)

Quand il combat, le compagnon utilise le matériel au mieux : frappe quand l'attaque est chargée, recule
face aux monstres à distance et aux explosifs, fait face à son adversaire, se protège avec le bouclier si
possible, mange pour se soigner quand c'est sûr, et évite de se laisser encercler.

**Why this priority**: améliore les chances de survie et la valeur du matériel, mais dépend des stories 1-2.

**Independent Test**: affronter un zombie, un squelette et une araignée avec une épée en fer ; il survit
avec plus de la moitié de sa vie dans la majorité des essais.

**Acceptance Scenarios**:

1. **Given** un squelette à distance, **When** il le combat, **Then** il réduit la distance en se mettant à
   couvert ou le contourne, au lieu de rester dans la ligne de tir.
2. **Given** une araignée ou un zombie, **When** il combat, **Then** il se bat avec son arme équipée et
   rapporte les dégâts subis et le résultat.
3. **Given** un combat gagné, **When** le calme revient, **Then** il ramasse le butin proche, soigne sa vie
   (manger, se reposer) et reprend sa tâche précédente.

---

### User Story 4 - S'armer et s'équiper quand il en manque (Priority: P2)

Si le compagnon n'a ni arme ni armure suffisantes, il le sait, l'annonce, et se les procure : fabrication
d'une épée ou d'une hache et d'une armure avec la capacité « ressources » (001), en visant d'abord le
minimum utile (une épée en pierre, puis une armure en fer), avant de s'éloigner de la base ou de descendre
dans une mine.

**Why this priority**: c'est l'autonomie : ne pas dépendre du joueur pour s'armer. Dépend de la 001.

**Independent Test**: inventaire avec seulement une pioche en bois ; le compagnon décide de fabriquer une
arme avant d'aller loin, et l'obtient.

**Acceptance Scenarios**:

1. **Given** aucun équipement et un projet d'exploration, **When** il prépare sa sortie, **Then** il se
   procure au minimum une arme avant de partir.
2. **Given** du fer disponible, **When** il choisit sa priorité, **Then** il fabrique d'abord la pièce qui
   protège le plus par unité de fer (voir hypothèses), puis complète l'armure.
3. **Given** une ressource d'équipement introuvable, **When** il échoue, **Then** il le dit et continue
   avec ce qu'il a, en réduisant le risque (rester proche de la base).

---

### User Story 5 - Se défendre dans le temps : nuit, abri, soin (Priority: P3)

Au-delà du combat ponctuel, le compagnon gère le risque : il évite les sorties lointaines en pleine nuit
sans équipement, s'abrite ou dort quand les monstres se multiplient, éclaire les zones où il travaille,
et récupère de la vie après un combat avant de repartir.

**Why this priority**: réduit le nombre de combats subis, mais s'appuie sur tout ce qui précède.

**Independent Test**: laisser tomber la nuit pendant une mission en surface avec un équipement faible ; le
compagnon suspend sa mission et se met à l'abri sans mourir.

**Acceptance Scenarios**:

1. **Given** la tombée de la nuit et un équipement faible, **When** les monstres apparaissent, **Then** il
   rentre à l'abri (ou en construit un) et reprend sa mission au matin.
2. **Given** une vie basse après un combat, **When** le calme revient, **Then** il se soigne avant de
   reprendre une activité risquée.

---

### Edge Cases

- Plusieurs types de monstres en même temps (zombies + squelettes) : priorité aux plus dangereux, abri si
  le total dépasse le seuil.
- Monstres que l'on ne peut pas combattre en l'état (creeper en intérieur, enderman, golem hostile,
  boss) : éviter, ne pas provoquer ; ne jamais frapper un enderman sans raison.
- Animaux neutres, villageois et joueurs : jamais attaqués, même par erreur de ciblage.
- Mobs apprivoisés ou appartenant au joueur : jamais attaqués.
- Attaque à distance ou dans le dos : le compagnon réagit à la source des dégâts, pas seulement aux monstres
  déjà visibles.
- Équipement perdu (mort, casse) en plein combat : il continue avec ce qu'il a ou fuit, sans bloquer.
- Armure ou arme offerte par le joueur dans une mauvaise taille de pile ou inversement : géré sans erreur.
- Dégâts environnementaux (chute, lave, noyade) : traités par les réflexes existants, pas par ce combat.
- Combat interrompu par un ordre du joueur (`stop`) : arrêt rapide et propre.
- Joueur qui demande explicitement de ne pas combattre : respecté (mode pacifique) tant qu'il n'y a pas de
  danger vital.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST équiper automatiquement, dès que c'est possible et sûr, la meilleure pièce
  disponible dans chacun de ces emplacements : casque, plastron, jambières, bottes, main secondaire
  (bouclier) et arme en main.
- **FR-002**: Le compagnon MUST classer les équipements par qualité selon une échelle explicite (matériau,
  type, état d'usure, enchantements si présents) et la comparer à ce qu'il porte avant de remplacer.
- **FR-003**: Le compagnon MUST ré-équiper après tout événement qui change son équipement (ramassage,
  fabrication, don, mort, casse).
- **FR-004**: Le choix de l'arme MUST suivre une règle prévisible et testable : par défaut l'épée la plus
  forte ; la hache en alternative si elle est meilleure ou si aucune épée n'est disponible ; arc ou
  arbalète selon la distance si disponibles ; mains nues en dernier recours.
- **FR-005**: Le compagnon MUST vérifier par l'état réel de ses emplacements que l'équipement est porté
  et le rapporter ; un équipement non porté après tentative MUST être signalé comme un échec.
- **FR-006**: Le compagnon MUST décider face à une menace entre combattre, fuir et s'abriter, selon une
  règle déterministe qui dépend du type de monstre, du nombre d'adversaires, de sa vie et de son
  équipement.
- **FR-007**: Le compagnon MUST NOT attaquer : joueurs, villageois, animaux apprivoisés ou nommés,
  mobs neutres non provoqués, golems alliés. Le ciblage MUST être vérifié avant chaque attaque.
- **FR-008**: Le compagnon MUST posséder une table de comportements par type de monstre (zombie, squelette,
  creeper, araignée, enderman, sorcière, etc.) indiquant : combattre ou éviter, distance à tenir, point
  faible éventuel. Un monstre inconnu MUST suivre un comportement prudent par défaut.
- **FR-009**: Le compagnon MUST réagir aux dégâts reçus d'une source non visible (projectile, attaque dans
  le dos) en cherchant la source ou en se mettant à couvert.
- **FR-010**: Après un combat, le compagnon MUST ramasser le butin proche, évaluer sa vie et se soigner
  (nourriture, repos) avant de reprendre une tâche risquée.
- **FR-011**: Le compagnon MUST s'assurer d'avoir une arme avant une sortie lointaine, une descente en
  mine ou la nuit ; sinon il MUST s'en procurer (via la capacité « ressources » 001) ou limiter ses
  déplacements et le dire.
- **FR-012**: Le compagnon MUST se procurer l'armure par priorité d'efficacité, en commençant par le
  minimum utile, et signaler ce qui manque à une protection complète.
- **FR-013**: Le compagnon MUST pouvoir énoncer son état de défense (armure portée, arme, bouclier,
  protection estimée, durabilité) sur demande et dans sa perception.
- **FR-014**: Les combats MUST être bornés (durée maximale, nombre d'attaques, fuite si la vie descend
  sous un seuil) et interruptibles par le joueur.
- **FR-015**: Les réactions vitales de combat et de fuite MUST rester des réflexes hors modèle de langage
  et garder priorité sur toute mission ; le modèle ne MUST PAS être consulté pendant un combat.
- **FR-016**: Le joueur MUST pouvoir demander un équipement (« équipe-toi », « prends la hache »,
  « garde l'épée en diamant pour moi ») et l'agent MUST l'honorer, y compris le choix d'une arme précise.
- **FR-017**: Les règles de classification d'équipement, de choix d'arme et de décision face aux menaces
  MUST être vérifiables automatiquement sans serveur Minecraft ni appel au modèle, pour **chaque**
  équipement et chaque monstre connus ; les comportements en jeu non vérifiés MUST être listés avec un
  scénario de test manuel.
- **FR-018**: Les événements de combat (décision, arme choisie, dégâts, issue) MUST être journalisés et
  traçables pour l'évaluation et le calibrage.

### Key Entities

- **Équipement** : pièce d'armure, arme, bouclier ou outil de combat, avec sa qualité, sa durabilité et
  son emplacement.
- **Tenue de combat** : l'ensemble porté (armure, bouclier, arme) et le niveau de protection estimé.
- **Menace** : monstre hostile identifié, avec type, distance, nombre, danger et comportement prévu.
- **Décision de combat** : choix (combattre, fuir, s'abriter, éviter) avec sa raison et son résultat.
- **Profil de monstre** : règle de comportement par type (cible prioritaire, distance à tenir, point faible).
- **Bilan de combat** : durée, dégâts subis, adversaires vaincus, butin, équipement abîmé.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pour chaque pièce d'armure, arme et bouclier du jeu, un compagnon qui la possède l'équipe
  correctement en moins de 10 secondes (test automatique pour chacune, vérifié ensuite en jeu).
- **SC-002**: Face à un équipement mixte (cuir/fer/diamant, épée/hache), le meilleur est porté dans
  100 % des cas de test automatiques.
- **SC-003**: Un zombie isolé affronté avec une épée en pierre est vaincu avec au moins la moitié de la
  vie restante dans au moins 9 essais sur 10.
- **SC-004**: Face à trois monstres ou plus, ou à une vie basse, la décision de fuir ou de s'abriter est
  prise dans 100 % des cas de test automatiques.
- **SC-005**: 0 attaque contre un joueur, un villageois ou un animal apprivoisé sur l'ensemble des
  essais en jeu et des tests automatiques.
- **SC-006**: Sur une nuit complète (une dizaine de minutes de jeu) en surface avec équipement correct, le
  compagnon survit dans au moins 8 essais sur 10, en gardant ou reprenant sa tâche.
- **SC-007**: Sans arme au départ, il en possède une avant de s'éloigner de plus de 50 blocs de la base
  dans au moins 9 essais sur 10, en moins de 10 minutes de jeu.
- **SC-008**: Le compagnon cesse de combattre en moins de 3 secondes après un « stop » du joueur.
- **SC-009**: Aucune consultation du modèle de langage pendant un combat ; une préparation d'équipement
  ordinaire consomme au plus 6 requêtes (mesurées via les traces).

## Assumptions

- Monde survie 1.21.4, Overworld uniquement, difficulté standard ; Nether, End et boss hors périmètre.
- Une base existe déjà : réflexes de survie, combat et abri, équipement automatique de base (`gear_up`),
  choix d'outil par catégorie. Cette spec **fiabilise, étend et rend vérifiable** ces comportements
  plutôt que de les réécrire ; l'état actuel est non vérifié en jeu (voir `CLAUDE.md`).
- Le choix entre épée et hache suit une règle simple par défaut (l'épée pour les dégâts continus, la hache
  si elle fait plus de dégâts ou en l'absence d'épée) ; le propriétaire pourra la modifier.
- L'ordre de fabrication d'armure par défaut est : plastron, jambières, casque, bottes (du plus protecteur
  au moins protecteur par unité de matériau), avec le bouclier en complément.
- Les armes à distance (arc, arbalète) et les enchantements sont pris en charge s'ils sont déjà dans
  l'inventaire, mais leur fabrication et leur obtention sont un second jalon.
- La fabrication et la récolte d'équipement passent par la capacité 001 ; la nourriture et la guérison par
  la 002 ; la construction d'abris élaborés par la 005. Cette spec les utilise sans les redéfinir.
- Les seuils (vie minimale pour combattre, nombre maximal d'adversaires, durée maximale d'un combat) sont
  des valeurs de départ à calibrer avec les traces et les essais en jeu.
- Le superviseur à cadence rapide et le mode autonome (allowlist) existants restent le cadre d'exécution ;
  tout nouvel outil ou réflexe MUST rester compatible avec les principes de la constitution.
