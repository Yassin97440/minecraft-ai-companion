# Contrats des tools — 007

Échecs : `Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`.

## `redstone_info` (nouveau) — lecture seule, dans `IDLE_TOOLS`

```text
schema : { component?: string }   # sans valeur : liste du catalogue
```

Succès : `observer (détection) : émet un signal court (2 ticks) quand le bloc qu'il regarde change ; sa face « visage » regarde le bloc surveillé. Recette: 6 cobblestone, 2 redstone, 1 quartz. Quartz requis: oui.`
Inconnu : `Aucun composant redstone nommé "xyz" dans mon catalogue.`

## `redstone_materials` (nouveau) — lecture seule, dans `IDLE_TOOLS`

```text
schema : { circuit: CircuitId, params?: objet }
```

Succès : `daylight_lamps (6 lampes) : daylight_detector x1, redstone_lamp x6, redstone x8, … Quartz: 3 (manque 3). Repli sans quartz: lever_lamps.`
Échec : `Impossible : montage "xyz" inconnu (disponibles: auto_door, daylight_lamps, lever_lamps, …).`

## `build_circuit` (nouveau) — **hors** `IDLE_TOOLS`, accord du joueur requis

```text
schema : { circuit: CircuitId, params?: objet, near?: "base" | { x, y, z }, facing?: "north"|"south"|"east"|"west" }
```

Avant accord : résumé (composants, coût, quartz manquant, repli, statut `validated`/`experimental`).
Succès : `Système lamps-1 construit en (x,y,z) : 42/42 blocs conformes ; test d'activation OK (capteur couvert → 6 lampes allumées ; découvert → éteintes).`
Échecs : `Échec : montage invalide (observer en [..] regarde un mur)`, `Matériaux manquants : quartz x3 (utilise lever_lamps ou apporte du quartz)`,
`Échec : test d'activation raté (porte non ouverte), réparation 2/3 en cours`.

## `test_system` (nouveau) — hors `IDLE_TOOLS`

```text
schema : { id: string }
```

Retour : `lamps-1 : test OK.` / `Échec : lamps-1 : lampe en [..] non allumée (cause probable : poussière coupée en [..]).`

## `check_systems` (nouveau) — hors `IDLE_TOOLS`

```text
schema : { repair?: boolean (défaut true) }
```

Retour : `3 systèmes : lamps-1 OK ; door-1 OK ; cane-1 dégradé (piston manquant en [..]) → réparé, test OK.`
Échec : `Interrompu après lamps-1 (stop).` / `Échec : cane-1 : 3 réparations ratées, j'alerte le joueur.`

## Politique

| Règle | Effet |
|---|---|
| `redstone_info`, `redstone_materials` | allow (chat et idle) |
| `build_circuit` | approve en chat ; deny en idle jusqu'à 004 |
| TNT, lave, feu, horloge rapide, > 150 composants | plan refusé |
| `experimental` | avertissement explicite avant accord |
