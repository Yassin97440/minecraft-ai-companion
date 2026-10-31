# Research — 002 Alimentation

## R1. Cause du refus de manger steak / poulet cuit (non établie)

- **Decision**: ne pas supposer ; **reproduire d'abord** avec traces, puis corriger les trois pistes ci-dessous
  de toute façon (ce sont de vrais défauts).
- **Constats dans le code actuel** (`src/survival.ts`, `src/tools.ts`) :
  1. `eat` n'accepte aucun paramètre : le modèle ne peut pas désigner un aliment (« mange le poulet ») et
     peut conclure que son outil ne le permet pas.
  2. `eatBest` compare `bot.food` juste après `bot.consume()` : si la mise à jour du serveur arrive plus tard,
     il renvoie « Échec : ma faim n'a pas changé » à tort.
  3. Aucun `try/catch` autour de `equip`/`consume` : l'exception remonte brute au modèle.
- Le filtre `registry.foods[i.type]` laisse déjà passer steak et poulet cuits ; il exclut seulement 6 aliments.
- **Rationale**: une correction correcte exige la preuve ; les traces (`data/traces/*.jsonl`) montreront le
  retour réel de `eat`.
- **Alternatives considered**: élargir une « liste blanche » (rejeté : il n'y en a pas).

## R2. Classification : comment couvrir « tout ce qui régénère » ?

- **Decision**: partir de `registry.foods` (41 aliments) et affecter une catégorie par **liste fermée** :
  - *nuisibles* : spider_eye, poisonous_potato, pufferfish, chorus_fruit, suspicious_stew, ominous_bottle ;
  - *de secours* : rotten_flesh, beef, porkchop, chicken, mutton, rabbit, cod, salmon, tropical_fish (crus) ;
  - *précieux* : golden_apple, enchanted_golden_apple, golden_carrot (gardés pour les urgences de santé) ;
  - tout le reste = *sûr* (pain, viandes cuites, pommes, carottes, patates cuites, melon, baies, soupes, miel…).
  Un test vérifie que **chaque** aliment du registre est classé : un aliment non listé échoue au test.
- **Rationale**: FR-001, FR-002, FR-017 ; `honey_bottle` est sûr ; `ominous_bottle` donne un mauvais présage.
- **Alternatives considered**: inférer le danger depuis les effets (le registre ne les donne pas).

## R3. Règle de choix de l'aliment

- **Decision**: ordre : sûr cuit > sûr > de secours (seulement si faim ≤ 6 ou vie critique et rien d'autre) ;
  précieux jamais hors urgence de santé. Parmi les candidats : le plus petit aliment qui **comble** le déficit
  de faim (pas de gaspillage), à défaut le plus nourrissant ; départage par saturation, puis par nom.
- **Rationale**: FR-004, prévisible et testable.

## R4. Attente de la mise à jour de la faim

- **Decision**: après `consume()`, attendre jusqu'à 1,5 s que `bot.food` change (événement `health`), puis juger.
  Un seul nouvel essai avec un autre aliment (≤ 2 essais).
- **Rationale**: corrige la piste 2 (FR-005).

## R5. Sources d'approvisionnement et ordre

- **Decision**: ordre par coût estimé : (1) coffres connus avec nourriture (index de la capacité 008 quand elle
  existera ; sinon mémoire `nourriture:coffre`), (2) cultures mûres connues, (3) chasse (animaux visibles ou
  mémorisés), (4) pêche (eau proche + canne), (5) exploration bornée. Cuisson : règles de fonte de la 001.
- **Rationale**: FR-009 ; réutilise les briques existantes (`fight`, `goto`, `collect_block`).

## R6. Animaux protégés

- **Decision**: filtre pur `isProtectedAnimal(entity)` : nom personnalisé, apprivoisé (propriétaire dans les
  métadonnées), chevaux, ânes, chiens, chats, perroquets, et dernier représentant d'une espèce dans la zone
  (sauf faim ≤ 4).
- **Rationale**: FR-012, SC-007.

## R7. Seuils de départ

- Stock de sécurité : 40 points de faim restaurables (environ 5 steaks) ; approvisionnement déclenché sous
  ce seuil quand la faim ≤ 14 ou avant une sortie longue ; repas automatique inchangé (faim ≤ 10).
  **Réglables** dans `food.ts`, à calibrer avec les traces.
