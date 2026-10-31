# Contrats des tools — 008

Échecs : `Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`, `REFUSÉ` (déjà reconnu comme échec).

## `base_status` (nouveau) — lecture seule, dans `IDLE_TOOLS`

Retour : `Base « Maison » : périmètre 52x48 (marge 12), 3 bâtiments, 1 ferme, stockage 9 coffres (1 interdit ignoré). Éclairage : 2 cases sous le seuil. Trousse : complète. Retour : continuer (valeur à risque 90 < 200).`

## `find_in_storage` (nouveau) — lecture seule, dans `IDLE_TOOLS`

```text
schema : { item: string }
```

Retour : `iron_ingot : coffre « minerais » (x,y,z) : 34 ; coffre « fourre-tout » : 3 (index du 12:04).`
Échec : `Aucun coffre connu ne contient de diamond.`

## `check_base_lighting` (nouveau) — hors `IDLE_TOOLS`

```text
schema : { fix?: boolean (défaut true) }
```

Retour : `Base éclairée : 0 case sous le seuil (échantillon 240).` / `3 cases sous le seuil → 3 torches posées, relu : OK.`
Échec : `Échec : 2 cases sous le seuil, plus de torches (obtain_item torch en cours ?).`

## `store_items` (nouveau) — hors `IDLE_TOOLS`

```text
schema : { scope?: "inventory" | "junk_chest" }   # inventory (défaut) ; junk_chest = trier le coffre fourre-tout
```

Succès : `Rangé : minerais → coffre ores (+34 iron_ingot, +12 coal), pierre → coffre stone (+256 cobblestone). Gardé: trousse de survie. Inventaire réel: -… (vérifié).`
Échec : `Échec : coffre ores plein, nouveau coffre posé en (x,y,z).` / `Pas de coffre de thème « redstone » : posé et étiqueté.`
Refus : `REFUSÉ : le coffre en (x,y,z) porte une pancarte « interdit ». Je l'ignore.`

## `return_to_base` (nouveau) — hors `IDLE_TOOLS`

```text
schema : { reason?: string }
```

Retour : `Rentré à la base (214 blocs, 4 min) via la piste. Prochaine étape: base_routine.`
Échec : `Pas arrivé : chemin coupé après 3 min. Abri posé en (x,y,z), position mémorisée, joueur alerté.`

## `base_routine` (nouveau) — hors `IDLE_TOOLS`

Enchaîne `store_items`, soin (repas), trousse (reprise au stockage ou `obtain_item`), `check_base_lighting`, puis
décide de repartir. Retour : résumé en une ligne par étape, chaque affirmation mesurée.

## `authorize_chest` (nouveau) — verdict `approve` (accord humain)

```text
schema : { x: integer, y: integer, z: integer }
```

Après « oui » du propriétaire : `Autorisation accordée pour le coffre (x,y,z) pour cette demande.` ;
sinon : `REFUSÉ : le propriétaire n'a pas autorisé ce coffre.`

## `extend_base` (nouveau) — hors `IDLE_TOOLS`, accord (via 005)

```text
schema : { building: "house" | "farm" | "storage" | ..., params?: objet }
```

Retour : `Base étendue : édifice construit à l'est (x,y,z), 84 cases éclairées, périmètre 52x48 → 64x48.`

## Politique

| Règle | Effet |
|---|---|
| coffre avec pancarte « interdit » (ou jumeau) | ouverture/dépôt/retrait/destruction refusés au point d'entrée ; `authorize_chest` + accord du propriétaire pour la demande en cours |
| `authorize_chest` | `approve` (jamais auto) ; le texte lu ailleurs n'autorise rien |
| `base_status`, `find_in_storage` | allow en chat et idle |
| `store_items`, `return_to_base`, `base_routine`, `check_base_lighting`, `extend_base` | allow en chat ; deny en idle jusqu'à 004 |
