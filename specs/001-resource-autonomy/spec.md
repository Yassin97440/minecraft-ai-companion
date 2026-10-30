# Feature Specification: Autonomie en ressources (besoin → récolte → fabrication)

**Feature Branch**: `001-resource-autonomy` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Le compagnon doit être autonome : crafter, comprendre qu'il a besoin de telles ou telles ressources, aller les farmer… Cadrage global dans `specs/ROADMAP.md` ; cette spec est la capacité 001."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - « Fabrique-moi X » sans que je détaille les matériaux (Priority: P1)

Le joueur demande un objet (« fais-toi une pioche en fer », « il me faut une épée en pierre »). Le compagnon
détermine seul tout ce qui manque (bois, pierre, charbon, minerai, établi, four…), dans le bon ordre, va le
chercher, fabrique les intermédiaires, puis l'objet final, et rend compte de ce qu'il a réellement obtenu.

**Why this priority**: c'est le cœur de l'autonomie ; toutes les autres capacités (nourriture, armes,
construction) reposent sur « savoir ce qu'il faut et l'obtenir ».

**Independent Test**: dans un monde neuf, inventaire vide, demander « fabrique une pioche en pierre » ;
l'objet est dans l'inventaire sans autre intervention.

**Acceptance Scenarios**:

1. **Given** un inventaire vide et des arbres à proximité, **When** le joueur demande une pioche en bois,
   **Then** le compagnon récolte le bois nécessaire, fabrique planches, bâtons, établi puis la pioche, et
   annonce l'inventaire réel obtenu.
2. **Given** une pioche en bois en main et de la pierre accessible, **When** le joueur demande une épée en
   pierre, **Then** le compagnon récolte la pierre manquante et fabrique l'épée.
3. **Given** un objet demandé qui n'existe pas ou n'est pas fabricable (nom inconnu), **When** la demande est
   faite, **Then** le compagnon le dit clairement sans agir au hasard.

---

### User Story 2 - Savoir ce qui manque et le dire (Priority: P1)

À tout moment, le compagnon sait exprimer son **besoin** pour un objectif : la liste des ressources
manquantes, ce qu'il a déjà, et la chaîne d'étapes prévue. Il l'explique au joueur avant (ou pendant) l'effort.

**Why this priority**: sans cette compréhension explicite, le comportement redevient du tâtonnement du
modèle ; c'est aussi ce qui rend l'agent vérifiable et pédagogique.

**Independent Test**: demander « de quoi as-tu besoin pour une pioche en fer ? » avec un inventaire donné ;
la réponse liste exactement les manques (ex. 3 lingots de fer, 2 bâtons, établi à portée, four).

**Acceptance Scenarios**:

1. **Given** un inventaire partiel, **When** le joueur demande ce qu'il manque pour un objet, **Then** la
   réponse distingue ce qui est déjà possédé de ce qui manque, en quantités exactes.
2. **Given** un objectif multi-étapes, **When** le compagnon planifie, **Then** l'ordre respecte les
   dépendances (outil minimal requis avant de miner un minerai, combustible avant de fondre).

---

### User Story 3 - Récolter les ressources de base à la demande (Priority: P2)

Le joueur demande des ressources brutes (« ramène 20 charbon », « 64 pierre », « 10 fer ») ; le compagnon les
trouve, choisit le bon outil, les récolte en sécurité et revient avec la quantité demandée ou explique
pourquoi il n'y arrive pas.

**Why this priority**: c'est la brique de récolte réutilisée par la fabrication, mais utile seule.

**Independent Test**: demander 16 bûches ; l'inventaire gagne au moins 16 bûches, ou un message d'échec
motivé est donné.

**Acceptance Scenarios**:

1. **Given** une ressource connue à proximité ou en mémoire, **When** elle est demandée en quantité,
   **Then** le compagnon la collecte jusqu'à la quantité ou jusqu'à une limite déclarée.
2. **Given** une ressource introuvable dans la zone explorée, **When** il la cherche, **Then** il explore de
   façon bornée, puis rapporte l'échec avec ce qu'il a essayé.
3. **Given** un minerai nécessitant un outil qu'il n'a pas, **When** il veut le récolter, **Then** il
   fabrique ou obtient d'abord l'outil minimal requis.

---

### User Story 4 - Gérer les intermédiaires et les transformations (Priority: P2)

Certaines ressources demandent une transformation : minerai → lingot (four + combustible), bûche → planches
→ bâtons, sable → verre, pierre → pierre lisse. Le compagnon met en place l'équipement nécessaire (four,
établi), choisit un combustible, attend la fin de la cuisson et récupère le résultat.

**Why this priority**: indispensable pour le fer et au-delà, mais s'appuie sur les stories 1-3.

**Independent Test**: avec 3 minerais de fer et du charbon, demander 3 lingots ; les lingots arrivent dans
l'inventaire.

**Acceptance Scenarios**:

1. **Given** du minerai brut et un combustible, **When** une fonte est requise, **Then** le compagnon pose un
   four si besoin, le charge, attend, et récupère les lingots.
2. **Given** aucun combustible disponible, **When** une fonte est requise, **Then** il en cherche (charbon,
   bois) avant de continuer.

---

### User Story 5 - Persévérer sans se bloquer ni se mettre en danger (Priority: P2)

Quand une étape échoue ou que la situation devient dangereuse (nuit, faible vie, lave, monstres), le
compagnon adapte son plan, demande de l'aide au joueur si nécessaire, ou s'arrête proprement, sans boucler.

**Why this priority**: l'autonomie n'a de valeur que si elle est sûre et bornée (constitution V).

**Independent Test**: demander une ressource impossible à atteindre ; l'agent s'arrête dans la limite fixée
avec un compte rendu, et obéit à « stop » immédiatement.

**Acceptance Scenarios**:

1. **Given** plusieurs échecs consécutifs sur une même étape, **When** la limite est atteinte, **Then**
   l'objectif est abandonné ou replanifié et le joueur est informé de la cause.
2. **Given** un objectif en cours, **When** le joueur dit « stop », **Then** l'agent s'interrompt vite et
   conserve en mémoire où il en était.
3. **Given** une menace vitale détectée, **When** un objectif est en cours, **Then** les réflexes de survie
   priment et l'objectif reprend ensuite si c'est encore pertinent.

---

### User Story 6 - Retenir où sont les ressources (Priority: P3)

Le compagnon se souvient des gisements, forêts et points d'eau rencontrés et les réutilise pour les demandes
suivantes plutôt que de chercher à nouveau.

**Why this priority**: gain d'efficacité et de cohérence, pas indispensable au premier jalon.

**Independent Test**: après avoir trouvé du fer, redemander du fer plus tard ; il y retourne directement.

**Acceptance Scenarios**:

1. **Given** un gisement mémorisé, **When** la ressource est redemandée, **Then** le compagnon s'y rend en
   premier.
2. **Given** un gisement mémorisé épuisé ou détruit, **When** il arrive sur place, **Then** il le constate,
   met à jour sa mémoire et cherche ailleurs.

---

### Edge Cases

- Ressource demandée dans une quantité absurde (par ex. 10 000) : plafond par demande, avec explication.
- Inventaire plein en cours de récolte : stocker dans un coffre connu, déposer à la base, ou prévenir.
- Objet ayant plusieurs recettes possibles (planches de n'importe quel bois) : réutiliser ce qui est déjà
  possédé avant de récolter autre chose.
- Matériau uniquement dans une autre dimension ou nécessitant un outil introuvable : annoncer
  explicitement que c'est hors périmètre actuel.
- Récolte dans une zone protégée (base, coffres, lits, établis) : refus, jamais de destruction.
- Nuit ou orage pendant une récolte en surface : la sécurité prime sur l'avancement.
- Joueur qui change l'objectif en cours de route : nouvelle demande remplace l'ancienne, mémoire à jour.
- Objet déjà possédé en quantité suffisante : le dire et ne rien faire.
- Perte de l'équipement (mort) en cours de chaîne : l'objectif repart de l'état réel de l'inventaire.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST transformer une demande d'objet ou de ressource en **besoin explicite** :
  liste des ressources manquantes en quantités exactes, déduite de l'inventaire réel et des recettes du jeu.
- **FR-002**: Le compagnon MUST ordonner les étapes selon leurs dépendances (outil minimal avant minerai,
  combustible avant fonte, établi avant recette nécessitant un établi).
- **FR-003**: Le compagnon MUST pouvoir énoncer ce dont il a besoin et ce qu'il prévoit avant d'agir, sur
  demande du joueur ou de lui-même pour tout objectif de plus de deux étapes.
- **FR-004**: Le compagnon MUST récolter les ressources de base (bois, pierre, charbon, fer, sable, argile,
  cuivre, laine, cuir, ainsi que les matières de transformation) avec l'outil approprié.
- **FR-005**: Le compagnon MUST fabriquer les objets intermédiaires et finaux, en posant ou réutilisant un
  établi et un four lorsque nécessaire.
- **FR-006**: Le compagnon MUST confirmer chaque résultat par l'état réel du monde (inventaire avant/après)
  et ne jamais déclarer un succès non constaté.
- **FR-007**: Le compagnon MUST fixer des bornes à toute recherche ou récolte (distance, durée, nombre
  d'essais, quantité maximale par demande) et rapporter ce qu'il a tenté en cas d'échec.
- **FR-008**: Le compagnon MUST respecter les zones et objets protégés (coffres, fours, lits, établis, zone
  de base) lors de toute récolte.
- **FR-009**: Le compagnon MUST s'interrompre rapidement sur demande du joueur et conserver l'état de
  l'objectif pour une reprise éventuelle.
- **FR-010**: En cas de danger vital, le compagnon MUST laisser la priorité aux réflexes de survie, puis
  décider de reprendre, replanifier ou abandonner l'objectif.
- **FR-011**: Le compagnon MUST mémoriser les emplacements de ressources utiles et les exploiter en priorité
  lors des demandes suivantes, en vérifiant qu'ils existent toujours.
- **FR-012**: Le compagnon MUST gérer un inventaire plein (stockage dans un coffre connu, dépôt, ou avertissement)
  sans perdre les objets récoltés.
- **FR-013**: Le compagnon MUST refuser clairement, avec explication, toute demande portant sur un objet
  inconnu, non fabricable, ou hors périmètre (autre dimension).
- **FR-014**: Le nombre d'appels au modèle de langage pour un objectif MUST rester borné et mesurable ;
  la partie « calcul du besoin » MUST être déterministe plutôt que laissée à l'improvisation du modèle.
- **FR-015**: Toute règle de calcul de besoin, d'ordonnancement et de refus MUST être vérifiable
  automatiquement sans serveur Minecraft ni appel au modèle ; les comportements en jeu non vérifiés
  MUST être listés avec un scénario de test manuel.
- **FR-016**: Le compagnon MUST ne PAS tricher (pas de commande de don d'objets, pas de génération
  magique) pour obtenir des ressources, hors outils de test explicitement déclarés par le propriétaire.

### Key Entities

- **Objectif de fabrication** : l'objet ou la ressource visé, la quantité, l'origine de la demande
  (joueur ou initiative), l'état (en cours, bloqué, terminé, abandonné).
- **Besoin** : ressources manquantes en quantités, équipements requis (établi, four, outil minimal),
  combustible, pour un objectif donné.
- **Plan de ressources** : suite ordonnée d'étapes (récolter, transformer, fabriquer) avec leurs
  dépendances et leur coût estimé en actions.
- **Recette** : relation entrée → sortie connue du jeu, avec alternatives et station requise.
- **Gisement** : lieu connu où se trouve une ressource, avec date de dernière vérification.
- **Compte rendu** : bilan en langage naturel de ce qui a été obtenu, ce qui a échoué et pourquoi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dans un monde neuf avec inventaire vide, le compagnon obtient seul une pioche en pierre
  (récolte du bois, fabrication de l'établi et des outils, récolte de la pierre) dans au moins 9 essais sur
  10, sans intervention du joueur.
- **SC-002**: Dans le même contexte, il obtient seul une pioche en fer (fonte comprise) dans au moins 7 essais
  sur 10, en moins de 20 minutes de jeu.
- **SC-003**: Le besoin annoncé pour 20 objets de référence est exact (aucune ressource manquante ni
  superflue) dans 100 % des cas de test automatiques.
- **SC-004**: Aucun succès faussement annoncé : sur l'ensemble des essais, 0 message de réussite sans
  augmentation réelle de l'inventaire correspondant.
- **SC-005**: En cas d'objectif irréalisable, l'agent s'arrête et rend un compte rendu en moins de
  3 minutes de jeu, sans boucle.
- **SC-006**: Après un « stop » du joueur, l'agent cesse toute action en moins de 5 secondes.
- **SC-007**: Un objectif de fabrication moyen (pioche en pierre) consomme au plus 15 requêtes au modèle de
  langage ; la valeur réelle est relevée via les traces.
- **SC-008**: Un joueur peut comprendre, à la lecture du seul compte rendu, ce qui a été fait, obtenu et
  ce qui manque, dans 100 % des essais évalués.

## Assumptions

- Monde survie 1.21.4 sur serveur local, Overworld uniquement ; Nether et End hors périmètre.
- Les recettes de référence sont celles du jeu (données officielles de la version) ; pas de mods.
- L'établi et le four sont fabriqués ou posés par le compagnon, ils ne sont pas supposés présents.
- Les outils existants (déplacement, récolte, fabrication, coffres, mémoire, missions, réflexes de survie)
  sont réutilisés ; cette spec ajoute la compréhension du besoin et l'enchaînement, pas une refonte.
- Le propriétaire (`OWNER_USERNAME`) est le seul à donner des ordres ; les objectifs pris sur initiative
  propre relèvent de la capacité 004 et sont hors périmètre ici.
- Alimentation, combat approfondi, construction et redstone sont couverts par d'autres capacités
  (voir `specs/ROADMAP.md`) ; ici, seuls les besoins de survie immédiats (réflexes) restent actifs.
- Les comportements dépendant du monde réel (pathfinding, détection de minerai, fonte) ne sont pas
  vérifiables sans serveur : ils sont déclarés « non vérifiés en jeu » jusqu'à test manuel.
