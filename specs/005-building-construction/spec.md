# Feature Specification: Construction (comprendre une demande et bâtir une vraie maison)

**Feature Branch**: `005-building-construction` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Capacités de construction : le bot doit comprendre la demande de construire et partir de là, comprendre qu'une construction a toujours un sol, un toit, au minimum 4 murs, des fenêtres, éventuellement des étages ou sous-sols (donc des escaliers), et doit être éclairée pour éviter les mobs ; avec des matériaux de construction usuels (pas de terre ni de boue)." Capacité 005 de `specs/ROADMAP.md`.

**Décisions du propriétaire (questions de cadrage)** :
- Exécution : **bloc par bloc, légitime** (il pose réellement chaque bloc en survie, sans triche).
- Matériaux : **il les récolte seul** (avec les capacités ressources, alimentation et combat).
- Ambition : **maison jusqu'à plusieurs étages avec sous-sol** ; les châteaux et grandes structures sont un jalon ultérieur.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - « Construis-moi une maison » : de la demande à une maison habitable (Priority: P1)

Le joueur demande une construction en quelques mots (« une maison », « une petite cabane en pierre », « une
maison à deux étages avec sous-sol »). Le compagnon comprend l'intention, en déduit une conception complète
(taille, matériaux, pièces), l'annonce avec la liste de matériaux, obtient l'accord du joueur, puis la bâtit
entièrement. Le résultat est une **maison réellement habitable**.

**Why this priority**: c'est la demande centrale ; tout le reste (étages, lumière, matériaux) en découle.

**Independent Test**: demander « une maison » en terrain dégagé ; une structure fermée, éclairée et
accessible est construite et vérifiée, sans intervention supplémentaire.

**Acceptance Scenarios**:

1. **Given** une demande vague (« construis une maison »), **When** le compagnon la comprend, **Then** il
   propose une conception par défaut sensée (dimensions, matériau principal, nombre de pièces) et demande
   l'accord avant d'agir.
2. **Given** une demande précise (« 8x8 en pierre avec un étage »), **When** il conçoit, **Then** il
   respecte ces contraintes ou explique pourquoi il ne peut pas.
3. **Given** l'accord du joueur, **When** il construit, **Then** il pose réellement les blocs un à un et
   chaque élément terminé est vérifié.
4. **Given** une demande hors périmètre (un château, une construction géante), **When** elle est faite,
   **Then** il le dit clairement et propose la plus grande alternative réalisable.

---

### User Story 2 - Toute construction a ses éléments essentiels (Priority: P1)

Chaque bâtiment construit comprend toujours : un **sol** plein, un **toit** fermé, **au moins quatre murs**
fermant l'espace, une **porte** d'entrée accessible, des **fenêtres** (laissant passer la lumière sans laisser
entrer de monstre) et un **éclairage** intérieur et extérieur. Le compagnon ne peut pas livrer de plan qui
manque l'un de ces éléments, et le vérifie sur le bâtiment réellement construit.

**Why this priority**: c'est la définition même d'une construction valide dans la demande du propriétaire.

**Independent Test**: contrôle automatique d'un plan sans toit, sans porte ou sans fenêtre : il est
refusé ; contrôle d'un bâtiment complet : il est accepté.

**Acceptance Scenarios**:

1. **Given** un plan sans toit, sans sol, avec moins de quatre murs ou sans porte, **When** il est validé,
   **Then** il est refusé avec la liste exacte des éléments manquants.
2. **Given** un plan complet, **When** il est validé, **Then** l'intérieur est jugé étanche (aucun passage
   possible depuis l'extérieur autre que la porte) et habitable (hauteur libre suffisante).
3. **Given** un bâtiment construit, **When** il est contrôlé, **Then** les éléments essentiels sont
   constatés dans le monde réel et le résultat est rapporté.
4. **Given** des fenêtres, **When** elles sont posées, **Then** elles sont en verre ou équivalent (jamais
   des ouvertures vides qui laissent entrer les monstres).

---

### User Story 3 - Éclairage contre les mobs (Priority: P1)

Le bâtiment est assez éclairé, à l'intérieur comme sur les abords, pour qu'aucun monstre n'y apparaisse :
aucun point du sol intérieur ni des abords proches n'est sous le seuil d'éclairage qui permet l'apparition
de monstres. Le compagnon prévoit les sources de lumière dans la conception, les pose et les contrôle.

**Why this priority**: sans lumière, la maison devient dangereuse ; c'est une exigence explicite.

**Independent Test**: carte d'éclairage d'un bâtiment complet : aucune case intérieure ou extérieure proche
sous le seuil ; supprimer une torche fait échouer le contrôle.

**Acceptance Scenarios**:

1. **Given** une conception, **When** elle est validée, **Then** elle contient assez de sources de lumière
   pour couvrir toutes les pièces, les escaliers, le sous-sol et les abords de la porte.
2. **Given** un bâtiment construit, **When** il est contrôlé, **Then** chaque case de sol intérieure est
   au-dessus du seuil d'apparition ; sinon il ajoute des sources de lumière.
3. **Given** un sous-sol ou un étage, **When** la lumière est calculée, **Then** ces niveaux sont éclairés
   aussi bien que le rez-de-chaussée.

---

### User Story 4 - Étages, sous-sols et escaliers (Priority: P2)

Le compagnon sait concevoir et bâtir plusieurs niveaux : étages au-dessus du rez-de-chaussée, sous-sol
creusé sous le niveau du sol, et **escaliers** qui les relient (montée et descente praticables, avec la
hauteur libre nécessaire et sans trou dangereux). Chaque niveau a son sol, son plafond, ses murs et sa
lumière.

**Why this priority**: demandé explicitement, mais dépend d'un rez-de-chaussée fiable (stories 1-3).

**Independent Test**: demander « une maison à deux étages avec sous-sol » ; un chemin continu existe entre
le sous-sol, le rez-de-chaussée et l'étage, vérifié par parcours.

**Acceptance Scenarios**:

1. **Given** une maison à plusieurs niveaux, **When** elle est validée, **Then** tous les niveaux sont
   reliés par au moins un escalier praticable et chaque niveau est accessible depuis la porte.
2. **Given** un sous-sol, **When** il est conçu, **Then** il est étanche, éclairé, sans accès direct à des
   cavernes, de l'eau ou de la lave.
3. **Given** un escalier, **When** il est contrôlé, **Then** la marche est franchissable et la tête ne
   heurte aucun plafond.

---

### User Story 5 - Matériaux de construction appropriés, récoltés puis posés (Priority: P2)

Le compagnon utilise uniquement des matériaux de construction usuels : planches et bois, pierre et ses
variantes, briques, verre, etc. ; **jamais** de terre, de boue, de sable, de gravier ou d'autres blocs
instables ou peu dignes d'un bâtiment. Il calcule la liste exacte de matériaux, récolte et fabrique ce qui
manque (via la capacité 001), puis construit.

**Why this priority**: évite les maisons de terre et rend la construction autonome ; dépend de 001.

**Independent Test**: plan contenant de la terre ou de la boue : refusé avec l'explication ; plan en
planches : coût exact calculé, ressources collectées puis construction faite.

**Acceptance Scenarios**:

1. **Given** un plan avec un matériau interdit, **When** il est validé, **Then** il est refusé et un
   matériau approprié équivalent est proposé.
2. **Given** un manque de matériaux, **When** il prépare le chantier, **Then** il collecte et fabrique ce
   qui manque avant ou pendant la construction, et rapporte l'avancement.
3. **Given** des ressources épuisées avant la fin, **When** le chantier continue, **Then** il reprend la
   collecte et poursuit sans repartir de zéro.

---

### User Story 6 - Un chantier sûr, vérifié et reprenable (Priority: P2)

Le chantier se déroule sans danger : choix d'un emplacement adapté (terrain stable, hors zones protégées),
préparation du terrain, réflexes de survie actifs, pas de blocs posés au mauvais endroit. Le compagnon peut
être interrompu (« stop », nuit, combat) et **reprend** là où il en était. À la fin, il vérifie l'ouvrage
réel et signale tout écart.

**Why this priority**: sans reprise et vérification, les constructions longues échouent ou laissent des
chantiers cassés.

**Independent Test**: interrompre un chantier au milieu puis le relancer : la maison est terminée sans
bloc en double ni oubli.

**Acceptance Scenarios**:

1. **Given** un chantier interrompu, **When** il reprend, **Then** il identifie ce qui est déjà posé et
   continue sans refaire ni détruire.
2. **Given** un bloc mal placé ou manquant, **When** la vérification finale est faite, **Then** il le
   corrige ou signale l'écart.
3. **Given** une menace pendant le chantier, **When** un réflexe de survie se déclenche, **Then** le
   chantier est mis en pause et reprend ensuite.

---

### Edge Cases

- Terrain en pente, eau, arbres ou grotte sous l'emprise : terrassement, déplacement de l'emplacement ou
  refus expliqué.
- Emplacement chevauchant une construction existante, un coffre, un lit ou la zone de base : refus ou
  choix d'un autre emplacement ; jamais de destruction d'éléments protégés.
- Bâtiment demandé trop petit pour être habitable (moins de 2 blocs de hauteur libre, surface minuscule) :
  refusé avec la taille minimale.
- Matériaux introuvables dans la zone : repli sur une alternative équivalente de la liste autorisée.
- Nuit ou orage pendant le chantier : la sécurité prime, le chantier reprend ensuite.
- Le joueur change d'avis (taille, matériau) en cours de route : le plan est recalculé sans perdre ce qui
  est déjà posé quand c'est compatible.
- Toit ou plafonds : aucun trou laissant tomber du gravier, de l'eau ou des monstres dans l'intérieur.
- Verre manquant (nécessite du sable et un four) : alternative temporaire protégée, jamais de fenêtre vide.
- Porte bloquée ou orientée vers un mur : contrôle d'accessibilité avant la fin du chantier.
- Escalier mal orienté ou trop raide : rejeté à la validation, pas découvert à la fin.
- Chantier abandonné par le compagnon (échecs répétés) : il le déclare et laisse un état sûr, jamais un
  bâtiment ouvert sur des précipices.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST comprendre une demande de construction en langage naturel et la traduire
  en cahier des charges explicite (type de bâtiment, taille, matériau principal, nombre de niveaux,
  sous-sol), en proposant des valeurs par défaut sensées quand le joueur est vague.
- **FR-002**: Le compagnon MUST annoncer sa conception (dimensions, matériaux, coût) et obtenir l'accord du
  joueur avant de commencer à poser des blocs.
- **FR-003**: Tout bâtiment livré MUST comporter : sol plein, toit fermé, au moins quatre murs fermant
  l'espace, une porte d'entrée accessible, des fenêtres vitrées et un éclairage. Un plan qui en manque un
  MUST être refusé avec la liste exacte des manques.
- **FR-004**: Le compagnon MUST vérifier que l'intérieur est **étanche** (aucun passage autre que la porte)
  et **habitable** (hauteur libre d'au moins deux blocs, surface minimale, accès à la porte).
- **FR-005**: Le compagnon MUST garantir un éclairage tel qu'aucune case de sol intérieure ni des abords de
  la porte ne soit sous le seuil d'apparition des monstres, à tous les niveaux.
- **FR-006**: Le compagnon MUST pouvoir concevoir des étages et un sous-sol reliés par des escaliers
  praticables, et vérifier qu'un chemin continu relie tous les niveaux à l'entrée.
- **FR-007**: Le compagnon MUST utiliser uniquement des matériaux de construction d'une liste fermée
  (bois et planches, pierres et variantes, briques, verre et équivalents), à l'exclusion de la terre, la
  boue, le sable, le gravier et autres blocs instables ou inappropriés.
- **FR-008**: Il MUST calculer la liste exacte de matériaux d'une conception et, s'il en manque, les
  récolter et fabriquer via la capacité 001 avant ou pendant le chantier.
- **FR-009**: Il MUST construire **bloc par bloc** en conditions de survie (pose réelle depuis
  l'inventaire, sans commande de génération ni de don de blocs), sauf mode rapide explicitement activé par
  le propriétaire et déclaré.
- **FR-010**: Il MUST vérifier chaque étape et l'ouvrage final par l'état réel du monde (blocs
  effectivement posés) et rapporter les écarts ; il ne MUST JAMAIS annoncer une construction terminée sans
  preuve.
- **FR-011**: Il MUST choisir ou valider un emplacement adapté (terrain stable, hors zones protégées et
  constructions existantes), préparer le terrain et refuser ou déplacer le chantier sinon.
- **FR-012**: Il MUST pouvoir interrompre le chantier (ordre du joueur, danger) et le **reprendre** sans
  duplication ni destruction, à partir de l'état réel de la zone.
- **FR-013**: Il MUST respecter les zones et objets protégés (coffres, fours, lits, établis, base) :
  jamais détruits par un chantier.
- **FR-014**: Il MUST borner le chantier (nombre de blocs, taille maximale, durée, nombre d'essais) et
  déclarer clairement ce qui dépasse le périmètre (châteaux, très grandes structures).
- **FR-015**: Les réflexes de survie MUST garder la priorité sur le chantier ; le chantier reprend
  ensuite.
- **FR-016**: Le compagnon MUST rendre compte à la fin : ce qui est construit, matériaux utilisés,
  éléments essentiels contrôlés, éclairage, écarts éventuels.
- **FR-017**: Les règles de validation (éléments essentiels, étanchéité, habitabilité, éclairage,
  matériaux autorisés, escaliers, coût) MUST être vérifiables automatiquement sans serveur Minecraft ni
  appel au modèle ; le modèle propose, le code valide ; les comportements en jeu non vérifiés MUST être
  listés avec un scénario de test manuel.
- **FR-018**: Le nombre d'appels au modèle pour une construction MUST rester borné et mesurable ; la
  validation et l'exécution MUST être déterministes.

### Key Entities

- **Cahier des charges** : ce qui est demandé (type, taille, matériau, niveaux, sous-sol, contraintes).
- **Plan de bâtiment** : description complète validée (niveaux, murs, sols, toits, ouvertures, escaliers,
  lumières) avant toute pose.
- **Niveau** : un étage ou le sous-sol, avec sol, murs, plafond, accès et éclairage.
- **Élément essentiel** : sol, toit, murs, porte, fenêtres, éclairage, escalier, vérifiables un par un.
- **Liste de matériaux** : quantités exactes par bloc, comparées à l'inventaire.
- **Chantier** : exécution du plan (étapes faites ou restantes, emplacement, état d'avancement), reprenable.
- **Rapport de construction** : résultat contrôlé du bâtiment (éléments, éclairage, écarts).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % des plans livrés par la validation contiennent sol, toit, au moins quatre murs, porte,
  fenêtres vitrées et éclairage (test sur un lot de plans valides et invalides).
- **SC-002**: 100 % des plans comportant un matériau interdit (terre, boue, sable, gravier…) sont refusés.
- **SC-003**: Pour 20 conceptions de test (1 à 3 niveaux, avec ou sans sous-sol), la vérification
  d'étanchéité, d'habitabilité, d'éclairage et de chemin entre niveaux donne le bon verdict dans 100 % des
  cas.
- **SC-004**: Une maison simple d'un niveau est construite entièrement, vérifiée et habitable dans au moins
  8 essais sur 10 en jeu, en moins de 20 minutes de jeu une fois les matériaux réunis.
- **SC-005**: Une maison à deux niveaux avec sous-sol est construite et vérifiée dans au moins 6 essais sur
  10 en jeu.
- **SC-006**: Aucun monstre n'apparaît à l'intérieur d'un bâtiment livré ni à moins de 3 blocs de sa
  porte pendant une nuit complète de test.
- **SC-007**: Un chantier interrompu puis repris est terminé sans bloc en double, sans oubli, ni
  destruction d'élément protégé, dans au moins 9 essais sur 10.
- **SC-008**: 0 déclaration de construction terminée sans que l'ouvrage réel ne remplisse les critères
  essentiels.
- **SC-009**: Une construction ordinaire consomme au plus 20 requêtes au modèle de langage (mesurées via
  les traces).

## Assumptions

- Monde survie 1.21.4, Overworld, serveur local ; les châteaux, remparts et grandes structures sont un
  jalon ultérieur (les bornes de taille actuelles restent le cadre).
- Cette spec **remplace le mode « tout par commandes »** de l'outil de construction existant par une pose
  bloc par bloc en conditions de survie, tout en **réutilisant** ce qui existe déjà : langage de plan,
  validation (listes fermées, bornes, coût), vérification d'habitabilité, gabarits prêts à l'emploi. Le mode
  instantané reste disponible seulement si le propriétaire l'active explicitement.
- La liste actuelle de blocs autorisés contient de la terre et des briques de boue : elle doit être
  resserrée pour respecter FR-007. Les **briques de boue** (matériau crafté) sont considérées comme
  autorisées ; la terre, la boue brute, le sable et le gravier sont exclus. À ajuster si le propriétaire le
  souhaite.
- Les matériaux se récoltent et se fabriquent avec la capacité 001, la nourriture avec la 002, la défense
  pendant le chantier avec la 003, le choix du moment de construire avec la 004. Cette spec les utilise
  sans les redéfinir.
- Le seuil d'apparition des monstres est celui du jeu pour la version utilisée ; la marge de sécurité est
  une valeur de départ à calibrer en jeu.
- Les fermes d'animaux, fermes de cultures et pièges à mobs relèvent de la capacité 006, la redstone de la
  007, le rangement et le stockage de la 008 ; la décoration poussée est hors périmètre.
- Les constructions sont validées avant exécution et soumises à l'accord du joueur, conformément à la
  constitution (principe II).
- Les comportements dépendant du monde réel (pose de blocs, escaliers, pathfinding en chantier) sont
  déclarés « non vérifiés en jeu » jusqu'à test manuel.
