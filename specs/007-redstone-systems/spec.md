# Feature Specification: Systèmes redstone (comprendre, fabriquer, construire, faire tourner)

**Feature Branch**: `007-redstone-systems` (pas de branche dédiée ; travail sur `main` à la demande du propriétaire)

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Redstone : le bot doit pouvoir crafter et donc savoir de quels matériaux il a besoin pour fabriquer un système de redstone : une simple porte, un éclairage qui s'active à la tombée du jour, une ferme 100 % automatique de la récolte au relancement de la production… Il doit pouvoir lister et comprendre chaque bloc de redstone (répéteur, observateur, piston…) et faire tourner un système en autonomie." Capacité 007 de `specs/ROADMAP.md`.

**Décisions du propriétaire (questions de cadrage)** :
- Conception : **bibliothèque de montages validés** (paramétrables), pas de conception libre de circuits.
- Montages du premier jalon : **porte automatique et mécanismes simples, éclairage jour/nuit, ferme de cultures automatique, ferme d'élevage ou de monstres automatique**.
- Autonomie : **il construit, teste, surveille et répare** le système.

## Vocabulaire

- **Composant redstone** : bloc ou objet qui produit, transmet, détecte ou utilise un signal (poussière, torche,
  répéteur, comparateur, levier, bouton, plaque de pression, capteur de lumière, observateur, piston, entonnoir,
  dispensateur, lampe, etc.).
- **Montage** : assemblage de composants qui remplit une fonction (porte automatique, éclairage jour/nuit,
  récolte automatique…).
- **Bibliothèque de montages** : catalogue de montages connus et validés, avec leurs paramètres (taille,
  orientation, nombre d'éléments).
- **Test d'activation** : manipulation du montage dans le monde réel qui prouve qu'il réagit comme prévu.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connaître et expliquer chaque composant redstone (Priority: P1)

Le compagnon dispose d'un **catalogue complet des composants redstone** : pour chacun, son rôle (source,
transmission, détection, action, stockage), son comportement (portée du signal, délai, orientation, ce qui
l'active), ses recettes et les matériaux qu'elles demandent. Il peut lister, expliquer, comparer ces
composants et dire de quoi il a besoin pour en fabriquer.

**Why this priority**: sans compréhension des composants, aucun montage n'est ni fabriqué, ni construit, ni
réparé correctement ; c'est la base demandée par le propriétaire.

**Independent Test**: demander « à quoi sert un observateur et que faut-il pour en faire un ? » ; la réponse
donne rôle, fonctionnement, recette et matériaux exacts, vérifiés contre la référence du jeu.

**Acceptance Scenarios**:

1. **Given** un nom de composant (répéteur, comparateur, observateur, piston, piston collant, entonnoir,
   dispensateur, lanceur, capteur de lumière, lampe, plaque de pression, levier…), **When** le joueur
   le demande, **Then** le compagnon donne son rôle, son comportement et sa recette.
2. **Given** un composant inconnu ou inventé, **When** il est demandé, **Then** le compagnon le dit au lieu
   d'inventer.
3. **Given** un montage voulu, **When** le joueur demande la liste de matériaux, **Then** elle est exacte
   (quantités par matériau) et distingue ce qui est déjà possédé de ce qui manque.
4. **Given** un inventaire donné, **When** le compagnon planifie, **Then** il sait quels composants il peut
   fabriquer immédiatement et lesquels exigent une ressource rare.

---

### User Story 2 - Porte automatique et mécanismes simples (Priority: P1)

Le compagnon construit une **porte automatique** (plaque de pression ou bouton, porte, piston, ou porte
cachée) et des mécanismes simples, les teste et les laisse fonctionner. Il place chaque composant dans le bon
sens et au bon endroit.

**Why this priority**: c'est le montage le plus simple et le plus utile ; il sert aussi de test de toute la
chaîne (matériaux → fabrication → pose → test d'activation).

**Independent Test**: demander une porte automatique à l'entrée de la maison ; elle s'ouvre quand on s'en
approche et se referme, vérifié par le test d'activation.

**Acceptance Scenarios**:

1. **Given** une entrée de bâtiment, **When** il construit la porte automatique, **Then** le montage
   fonctionne dans les deux sens (ouverture et fermeture) et laisse passer le joueur et le compagnon.
2. **Given** un composant mal orienté (piston vers un mur, répéteur à l'envers), **When** le montage est
   contrôlé, **Then** l'erreur est détectée avant le test d'activation.
3. **Given** un montage qui ne répond pas au test, **When** il diagnostique, **Then** il identifie le
   composant ou la liaison fautive.

---

### User Story 3 - Éclairage qui s'active à la tombée du jour (Priority: P1)

Le compagnon construit un système d'éclairage qui **s'allume à la tombée du jour** et s'éteint au matin
(capteur de lumière du jour inversé, lampes), sur une zone donnée (base, entrée, allée, ferme). Il en profite
pour sécuriser la zone contre l'apparition de monstres.

**Why this priority**: demandé explicitement ; relie la redstone à la sécurité de la base (capacités 003 et
005).

**Independent Test**: en accélérant le temps, les lampes sont éteintes de jour et allumées de nuit.

**Acceptance Scenarios**:

1. **Given** un capteur de lumière et des lampes, **When** le soir tombe, **Then** les lampes s'allument sans
   intervention du joueur.
2. **Given** le matin, **When** le jour se lève, **Then** les lampes s'éteignent.
3. **Given** une zone éclairée, **When** la nuit est complète, **Then** aucune case de la zone n'est sous
   le seuil d'apparition des monstres.
4. **Given** du quartz du Nether manquant pour le capteur, **When** il prévoit le montage, **Then** il le dit,
   propose une solution de repli (voir Edge Cases) et ne bloque pas le reste.

---

### User Story 4 - Ferme de cultures 100 % automatique (Priority: P2)

Le compagnon bâtit une ferme de cultures où la **récolte, la collecte et la relance de la production** se
font sans lui (détection de maturité, récolte par pistons ou eau, collecte par entonnoirs vers un coffre,
replantation automatique ou semi-automatique), en complément de la capacité 006.

**Why this priority**: c'est l'objectif ambitieux du propriétaire ; il dépend des fermes simples (006), de
la construction (005) et de la fiabilité du test d'activation.

**Independent Test**: sur un champ de test, après maturité, les plants sont récoltés et les produits arrivent
dans le coffre sans que le compagnon ne touche à rien, puis la production repart.

**Acceptance Scenarios**:

1. **Given** une ferme automatique construite, **When** les plants sont mûrs, **Then** la récolte se déclenche
   et les produits arrivent dans le coffre de collecte.
2. **Given** une récolte terminée, **When** le cycle suivant commence, **Then** la production redémarre
   (replantation, sans intervention humaine ou avec une intervention minime, déclarée).
3. **Given** un coffre plein, **When** la récolte arrive, **Then** le système ne déborde pas de façon
   dangereuse (objets au sol en excès) et le compagnon est alerté.
4. **Given** une panne (composant détruit, plant manquant), **When** le compagnon passe, **Then** il la
   détecte et la répare.

---

### User Story 5 - Ferme d'élevage ou de monstres automatique (Priority: P2)

Le compagnon bâtit des dispositifs de collecte et de tri pour un **enclos d'animaux** (collecte automatique
de la viande et des objets, mise à mort contrôlée du surplus) et pour un **piège à monstres** (regroupement
des monstres, mise à mort automatique, collecte du loot et de l'expérience), en complément de la capacité 006.

**Why this priority**: forte valeur en loot (viande, cuir, os, fil, poudre), mais plus complexe et risqué.

**Independent Test**: sur un enclos de test, le surplus est abattu et collecté sans intervention, en
conservant la paire reproductrice ; sur le piège, le loot arrive au coffre.

**Acceptance Scenarios**:

1. **Given** un enclos avec surplus d'animaux, **When** le système tourne, **Then** le surplus est abattu et
   collecté, tandis que la paire reproductrice est préservée.
2. **Given** un piège à monstres, **When** la nuit arrive, **Then** les monstres sont éliminés
   automatiquement et leur loot arrive au coffre.
3. **Given** un défaut de conception (zone d'apparition non éclairée à l'extérieur, passage vers la base),
   **When** le montage est validé, **Then** il est refusé.

---

### User Story 6 - Faire tourner, surveiller et réparer en autonomie (Priority: P2)

Après construction, le compagnon **vérifie** chaque montage par un test d'activation, le **surveille** lors de
ses passages (états des composants, production, coffres), détecte les pannes (composant manquant, dégât,
signal coupé, coffre plein) et les **répare** ou le signale. Il tient un registre des systèmes.

**Why this priority**: sans surveillance, un système automatique tombe en panne sans qu'on le sache ; c'est
l'autonomie voulue.

**Independent Test**: casser volontairement un composant d'un montage ; au prochain passage le compagnon
détecte la panne, la répare et refait le test d'activation avec succès.

**Acceptance Scenarios**:

1. **Given** un montage construit, **When** le compagnon le teste, **Then** le résultat est constaté dans
   le monde (états des blocs, production) et rapporté.
2. **Given** un montage tombé en panne, **When** il le contrôle, **Then** il diagnostique la cause et le
   répare ou prévient le joueur.
3. **Given** plusieurs systèmes, **When** il organise ses tournées, **Then** il visite en priorité ceux
   en panne ou à stock plein.

---

### Edge Cases

- **Quartz du Nether** : le capteur de lumière, l'observateur et le comparateur exigent du quartz du Nether.
  Tant que le Nether n'est pas accessible (palier avancé de la capacité 004, seulement en présence du propriétaire), le
  compagnon ne peut pas les fabriquer seul : il utilise des montages de repli (levier manuel, minuteur
  simple, montage sans observateur) ou demande au joueur de fournir du quartz, et le dit clairement.
- Composant pouvant brûler ou exploser (TNT, lave, bloc de feu à proximité) : jamais utilisé ; les
  matériaux inflammables autour des montages sont proscrits.
- Redstone en zone non chargée : les montages ne tournent que si la zone est chargée (joueur proche) ;
  le rendement annoncé en tient compte.
- Montage trop gros (nombre de composants, hauteur) : refusé avec la taille maximale.
- Lag : trop d'horloges ou d'objets au sol ; les montages à horloge rapide sont proscrits.
- Composant qui change de comportement selon la version du jeu : la référence est celle de la version
  utilisée (1.21.4), pas des connaissances générales ; en cas de doute, test d'activation.
- Joueur ou mob qui actionne le système par erreur (plaque de pression piégée) : prise en compte dans la
  conception (porte, clôture).
- Pistons, entonnoirs et lanceurs sensibles à l'orientation et au support : vérifier la face et le bloc
  adjacent avant pose, par une règle déterministe.
- Alimentation d'une zone sans bloc d'appui, signal trop long : répéteurs ajoutés selon la portée.
- Montage qui réagit mal à la pluie, au sommeil ou au cycle jour/nuit : conception adaptée, test à chaque
  condition quand possible.
- Pas assez de redstone (poussière), de fer ou de pierre : récolte via 001 ; si la ressource est introuvable,
  le dire.
- Montage détruit par un joueur ou un monstre : détecté et réparé ou signalé.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le compagnon MUST disposer d'un **catalogue de composants redstone** couvrant au minimum :
  poussière, torche, bloc de redstone, levier, bouton, plaque de pression, répéteur, comparateur, capteur
  de lumière, observateur, piston, piston collant, entonnoir, dispensateur, lanceur, lampe, rail
  alimenté, porte, trappe, bloc de slime/miel, cible ; avec rôle, comportement, orientation, portée, délai
  et recette.
- **FR-002**: Le compagnon MUST pouvoir lister, expliquer et comparer ces composants sur demande, et dire
  qu'un composant est inconnu plutôt que de l'inventer. Les données MUST correspondre à la version de jeu
  utilisée.
- **FR-003**: Pour tout montage, il MUST calculer la **liste exacte de matériaux** (composants fabriqués,
  matières premières, outils nécessaires) en distinguant possédé et manquant, et planifier les récoltes
  et fabrications via la capacité 001.
- **FR-004**: Il MUST construire uniquement des montages d'une **bibliothèque validée**, paramétrables
  (taille, orientation, nombre d'éléments), couvrant au moins : porte automatique et mécanismes simples,
  éclairage jour/nuit, ferme de cultures automatique, collecte et abattage automatiques d'un enclos,
  piège à monstres automatique.
- **FR-005**: Chaque montage de la bibliothèque MUST décrire : fonction, composants, plan, orientations,
  conditions d'installation, test d'activation attendu et pannes courantes.
- **FR-006**: Avant pose, le compagnon MUST valider le montage par des règles déterministes : composants
  autorisés, orientation et support corrects, portée du signal respectée, absence de risque (feu, explosion),
  bornes de taille et de coût. Un montage invalide MUST être refusé avec la liste des défauts.
- **FR-007**: Il MUST poser les composants **bloc par bloc** en conditions de survie, avec la bonne
  orientation, et vérifier chaque pose par l'état réel du monde.
- **FR-008**: Après construction, il MUST exécuter le **test d'activation** du montage et rapporter le
  résultat constaté (états des blocs, production), jamais une réussite non constatée.
- **FR-009**: Il MUST surveiller les systèmes construits lors de ses tournées, détecter les pannes
  (composant manquant ou détruit, signal coupé, coffre plein, production arrêtée) et les réparer ou les
  signaler.
- **FR-010**: Il MUST tenir un **registre des systèmes** durable (montage, emplacement, composants, état,
  dernier test, dernière panne), qui survit au redémarrage et se vérifie à l'arrivée.
- **FR-011**: Il MUST respecter les zones protégées et les constructions existantes, et obtenir
  l'accord du joueur avant de construire un système, sauf joueur déconnecté et initiative autorisée par la
  capacité 004.
- **FR-012**: Il MUST signaler quand un montage dépend d'une ressource rare ou lointaine (quartz du Nether)
  et proposer un repli ou une demande au joueur, sans bloquer le reste du travail.
- **FR-013**: Il MUST proscrire les montages dangereux : TNT, lave exposée, horloges rapides, structures
  capables de détruire la base ou de surcharger le serveur.
- **FR-014**: Il MUST borner chaque construction et chaque réparation (nombre de composants, essais,
  durée) et rendre la main en cas d'échec répété, avec un compte rendu précis.
- **FR-015**: Les réflexes de survie MUST garder la priorité sur toute construction ou réparation ; le
  joueur MUST pouvoir interrompre un chantier (`stop`) en quelques secondes.
- **FR-016**: Il MUST s'appuyer sur les capacités existantes sans les redéfinir : ressources et fabrication
  (001), combat (003), progression (004), construction bloc par bloc (005), fermes simples (006), stockage
  (008).
- **FR-017**: Les règles de catalogue, de calcul de matériaux, de validation de montage (orientation,
  portée, support, sécurité) et de diagnostic de panne MUST être vérifiables automatiquement sans serveur
  Minecraft ni appel au modèle, pour **chaque** composant et chaque montage de la bibliothèque ; les
  comportements en jeu non vérifiés MUST être listés avec un scénario de test manuel.
- **FR-018**: Le modèle de langage choisit et adapte un montage ; le code valide, construit et vérifie ; le
  nombre d'appels au modèle pour une construction ou une tournée MUST rester borné et mesurable.

### Key Entities

- **Composant redstone** : rôle, comportement, orientation, portée, délai, recette, matériaux.
- **Catalogue** : ensemble des composants connus de la version de jeu, source unique pour expliquer, calculer
  et valider.
- **Montage (bibliothèque)** : fonction, composants, plan paramétrable, test d'activation, pannes courantes.
- **Instance de système** : un montage construit à un emplacement, avec ses paramètres et son état.
- **Liste de matériaux** : quantités par matière, composant et outil, comparées à l'inventaire.
- **Test d'activation** : séquence de manipulations et résultats attendus pour un montage.
- **Panne** : défaut détecté (cause probable, composant concerné, réparation proposée).
- **Registre des systèmes** : liste durable des systèmes construits, avec états et historiques.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pour 100 % des composants du catalogue, rôle, orientation et recette donnés sont conformes
  à la référence du jeu (test automatique composant par composant).
- **SC-002**: La liste de matériaux d'un montage de la bibliothèque est exacte (aucun manque, aucun
  excès) dans 100 % des cas de test automatiques.
- **SC-003**: 100 % des montages invalides d'un lot de test (mauvaise orientation, support absent,
  portée dépassée, TNT, lave) sont refusés avec les bons défauts.
- **SC-004**: Une porte automatique est construite et passe son test d'activation dans au moins 8 essais
  sur 10 en jeu.
- **SC-005**: Un éclairage jour/nuit passe son test (éteint de jour, allumé de nuit) dans au moins 8
  essais sur 10 en jeu, quartz fourni.
- **SC-006**: Une ferme de cultures automatique récolte et collecte au moins 90 % des plants mûrs sans
  intervention sur trois cycles, dans au moins 6 essais sur 10 en jeu.
- **SC-007**: Un dispositif de collecte et d'abattage de surplus conserve la paire reproductrice (0 cas
  contraire) dans tous les essais.
- **SC-008**: Après une panne provoquée, le compagnon la détecte au passage suivant et la répare avec un
  test réussi dans au moins 7 essais sur 10.
- **SC-009**: 0 annonce de succès sans test d'activation constaté sur l'ensemble des essais.
- **SC-010**: Une construction de montage ordinaire consomme au plus 20 requêtes au modèle de langage
  (mesurées via les traces).

## Assumptions

- Monde survie 1.21.4 sur serveur local ; Overworld uniquement ; la référence des composants est celle de
  cette version (comportement Java).
- **Conception limitée à la bibliothèque** : le compagnon ne conçoit pas de circuits inédits ; il choisit,
  paramètre et adapte des montages validés. La conception libre est une évolution future qui exigera un
  simulateur de redstone.
- **Quartz du Nether** : tant que le Nether n'est pas accessible au compagnon seul, les montages qui
  exigent du quartz (capteur de lumière, observateur, comparateur) dépendent d'un apport du joueur ou d'un
  échange avec un villageois ; des montages de repli sans quartz existent dans la bibliothèque.
- L'ordre d'ambition du premier jalon suit les priorités des histoires : composants et porte automatique,
  éclairage jour/nuit, ferme de cultures, puis enclos et piège à monstres automatiques.
- Les fermes automatiques complètent la capacité 006 (fermes simples) : elles réutilisent leurs emplacements
  et leur registre ; le rangement trié de la 008 reste hors périmètre.
- Les montages se posent bloc par bloc (capacité 005) ; aucun montage n'est généré par commande, sauf mode
  rapide explicitement activé par le propriétaire.
- Les tests d'activation observent l'état réel du monde (portes ouvertes, lampes allumées, objets dans les
  coffres) ; la simulation de redstone hors jeu est hors périmètre de cette spec.
- La capacité de calcul et le coût en requêtes sont bornés ; tout comportement dépendant du monde réel
  (signaux, pistons, apparition de monstres) est déclaré « non vérifié en jeu » jusqu'à test manuel.
- Les seuils (taille maximale, nombre de composants, essais, durées) sont des valeurs de départ à
  calibrer avec les traces et les essais en jeu.
