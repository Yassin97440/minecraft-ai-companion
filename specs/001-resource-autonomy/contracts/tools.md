# Contrats des tools — 001

Interface exposée au LLM. Les textes de retour sont **en français** et suivent la convention de la
constitution (principe I) : un échec commence par `Échec`, `Impossible`, `Aucun`, `Pas arrivé` ou
`Matériaux manquants`.

## `plan_needs` (lecture seule — dans `IDLE_TOOLS`)

```text
schema : { item: string, count: integer ≥ 1 (défaut 1) }
```

Retour (succès) :

```text
Objectif : 1 stone_pickaxe.
Possédé : oak_planks x2, stick x0.
Manque : cobblestone x3, stick x2, crafting_table.
Plan : 1) gather oak_log x1 (main) 2) craft stick x4 (main) 3) place_station crafting_table
       4) gather cobblestone x3 (pioche en bois requise) 5) craft stone_pickaxe x1 (table)
```

Retour (refus) : `Impossible : "<item>" est inconnu.` | `Impossible : <item> est hors périmètre (Nether/End).`
| `Impossible : quantité trop grande (max N).`

Garanties : aucun effet sur le monde ; résultat identique pour (item, count, inventaire) identiques.

## `obtain_item` (exécution — **hors** `IDLE_TOOLS`)

```text
schema : { item: string, count: integer ≥ 1 }
```

Comportement : calcule le plan, puis exécute les étapes dans l'ordre avec le budget
(40 étapes, 3 échecs d'affilée, 8 min). Entre deux étapes, vérifie l'interruption du joueur.

Retour (succès) : `Obtenu 1 stone_pickaxe. Inventaire réel: +1 stone_pickaxe, -3 cobblestone, … (12 étapes).`

Retour (échec) — exemples :
- `Échec à l'étape 4/5 (gather cobblestone) : aucune pierre trouvée dans 64 blocs. Obtenu jusque-là : +2 stick.`
- `Matériaux manquants : iron_ingot x2 (aucun minerai connu).`
- `Interrompu par le joueur à l'étape 3/9. Obtenu jusque-là : …`
- `Échec : budget épuisé (40 étapes). Obtenu jusque-là : …`

Garanties :
- chaque « Obtenu … » repose sur une différence d'inventaire mesurée ;
- aucune commande de triche ; aucune destruction de bloc protégé ;
- au plus un appel à `obtain_item` par objectif utile (pas de boucle de relance interne au LLM).

## Politique (`checkToolCall`)

| Tool | Chat (propriétaire) | Idle / autonome |
|---|---|---|
| `plan_needs` | allow | allow |
| `obtain_item` | allow (plafond de quantité vérifié) | deny jusqu'à la capacité 004 |
