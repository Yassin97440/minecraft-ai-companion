# Research — 004 Progression

## R1. Faut-il passer par le graphe LangGraph ou par un exécuteur à part ?

- **Decision**: exécuteur déterministe à part (`autonomy.ts`) ; le graphe garde `chat` et `idle`.
- **Rationale**: le graphe actuel fait 1 requête LLM par tool ; une progression d'une heure coûterait des
  centaines de requêtes et dériverait (petits modèles). Un enchaînement paliers/objectifs est fait de règles.
  Le coût est borné (SC-007) et testable (principe IV).
- **Alternatives considered**: nœud « planificateur » LLM + sous-graphe (rejeté pour le premier jalon : plus
  cher, moins testable ; réexaminable en sous-spec Nether/Ender où le jugement compte).

## R2. Détecter la présence du propriétaire

- **Decision**: `bot.players[OWNER_USERNAME]` (insensible à la casse) ; événements `playerJoined`/`playerLeft`
  pour réagir sans attendre un tick ; si `OWNER_USERNAME` n'est pas défini, **aucune** progression autonome.
- **Rationale**: FR-006 ; règle pure `canStartAutonomy({ ownerOnline, busy, enabled, budgetLeft })`.
- **Alternatives considered**: considérer « absent » après N minutes sans message (rejeté : la décision du
  propriétaire est « déconnecté »).

## R3. Définition des paliers

- **Decision**: chaque palier = prédicat sur l'inventaire/équipement :
  - bois : établi posé ou en main, pioche et hache en bois ;
  - pierre : pioche, hache, pelle et épée en pierre, four ;
  - fer : outils + épée en fer, armure en fer (≥ plastron + casque), bouclier ;
  - diamant : pioche en diamant + épée ; 
  - Nether : obsidienne ≥ 10, briquet, seau d'eau, armure ≥ fer, nourriture ≥ stock ×2 (préparation) ;
  - Ender : ressources de la sous-spec (perles, blaze) — cadre seulement.
  `currentTier()` renvoie le plus haut palier dont tous les prédicats inférieurs sont vrais.
- **Rationale**: FR-001/002 : état réel, pas mémoire.

## R4. Priorité des objectifs

- **Decision**: ordre fixe, première règle vraie gagne :
  1. survie immédiate (réflexes, hors moteur) ; 2. abri si nuit et équipement faible ; 3. soin/repas si faim ou
  vie basses ; 4. stock de nourriture sous le seuil → `resupply_food` ; 5. arme/armure manquantes →
  `prepare_for_trip` ; 6. prochain objectif du palier → `obtain_item` ; 7. exploration si `isEquipped()` ;
  8. attente (rien d'utile).
  Chaque décision porte une `reason` journalisée.
- **Rationale**: FR-003, SC-003.

## R5. Définition de « équipé » (exploration illimitée)

- **Decision**: `isEquipped` vrai si : arme, armure ≥ 10/20, vie ≥ 16, stock de nourriture ≥ 40 pts, torches ≥ 16,
  blocs d'abri ≥ 13, outil de travail, pas de nuit. Réglable dans `config.ts`.
- **Rationale**: FR-010, SC-008 ; réutilise `defenseStatus` (003) et `foodStock` (002).

## R6. Budget et arrêts

- **Decision**: `Budget { maxLlmRequests: 60, maxDeaths: 3, maxMs: 5_400_000, maxFailStreak: 5 }` ; le compteur de
  requêtes vient du `Tracer` existant. Arrêt propre et journalisé à l'épuisement.
- **Rationale**: FR-014, SC-007, SC-009.

## R7. Résumé à la reconnexion

- **Decision**: `summarize(log, since)` pur : paliers franchis, objets/lieux trouvés, incidents, morts, budget
  consommé ; le bot l'envoie dans le chat sans appel LLM.
- **Rationale**: FR-016, SC-006 (exact, pas inventé).

## R8. Exploration

- **Decision**: tool `explore({ direction?, legBlocks })` par tronçons de 64 blocs avec ré-évaluation
  (équipé ? nuit ? nourriture ?) entre chaque tronçon et mémorisation des structures vues (village, mine,
  donjon) ; retour piloté par la capacité 008 (`decideReturn`).
- **Rationale**: FR-013 ; sans limite de distance mais jamais sans condition.

## R9. Nether / Ender

- **Decision**: les prédicats de préparation sont codés ; `canStartAutonomy` ajoute `ownerOnline` pour les
  objectifs `tier >= nether`. L'exécution du franchissement est une sous-spec.
- **Rationale**: décision du propriétaire (FR-011).
