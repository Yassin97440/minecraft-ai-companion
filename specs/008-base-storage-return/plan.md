# Implementation Plan: Base, stockage thématique et retour à la base

**Branch**: `008-base-storage-return` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-base-storage-return/spec.md`

## Summary

Quatre modules purs et un point d'application unique :

1. **Base = zone** (`src/base.ts`, pur) : périmètre calculé à partir des bâtiments + marge, état d'éclairage
   mesuré (échantillonnage de la lumière de bloc), plan d'ajout de lumières (réutilise `lighting.ts` de la 005),
   choix du site d'extension adjacent. Persistée dans `data/base.json`, amorcée par `HOME_*` de `.env`.
2. **Stockage thématique** (`src/storage.ts`, pur) : `themeOf(item)` par listes fermées + règle de priorité
   (testée sur **tous** les objets du registre), `planDeposit(inventory, kit)` qui sépare trousse de survie et
   dépôts par thème, **index** du contenu des coffres (`findResource`).
3. **Coffre « interdit »** (`src/forbidden.ts`, pur + une garde au point d'entrée) : reconnaissance tolérante du texte
   des pancartes, détection des coffres doubles et contenants équivalents, **autorisation** requise du
   propriétaire. La garde est appliquée dans `withChest` de `tools.ts` (point par lequel passent `chest_contents`,
   `store_in_chest`, `take_from_chest`) *et* dans le casseur de blocs (`collect_block`), pas dans le jugement du
   modèle (défense en profondeur avec `checkToolCall`).
4. **Retour risque/gain** (`src/return.ts`, pur) : `decideReturn(state, config)` compare la valeur du chargement
   (table `ITEM_VALUE`) au risque (fragilité du moment) avec des seuils réglables et des **retours forcés**
   (inventaire plein, outil presque cassé, plus de nourriture/torches, nuit + équipement faible).
5. **Exécution** : `return_to_base` suit la **piste** (points de passage enregistrés pendant la sortie) avec repli
   (abri + repère + alerte), puis `base_routine` : dépôt, soin, trousse, éclairage, décision de repartir.

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`bot.blockAt(...).light`, `block.getSignText()` pour les pancartes,
`bot.openContainer`), mineflayer-pathfinder, `minecraft-data` 1.21.4, Zod 4

**Storage**: `data/base.json` (nouveau : base, index du stockage, autorisations, piste) ; `data/memory.json` inchangé

**Testing**: vitest, **sans Minecraft ni LLM** ; `minecraft-data` pour classer tous les objets ; faux monde pour
l'éclairage et la garde de coffre

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: décision de retour < 5 ms ; contrôle d'éclairage d'une base 40×40 < 3 s de jeu ; retrouver
une ressource en < 3 ouvertures de coffre (SC-008) ; routine de retour ≤ 12 requêtes LLM (SC-009)

**Constraints**: aucune ouverture/dépôt/retrait/destruction d'un coffre « interdit » sans autorisation du
propriétaire (règle inconditionnelle) ; boucles bornées (rangement ≤ 40 dépôts, retour ≤ 3 min de repli) ;
zones protégées ; réflexes de survie prioritaires

**Scale/Scope**: 9 thèmes + fourre-tout ; ~1 200 objets du registre classés ; base jusqu'à ~64×64 ; piste ≤ 200 points

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Dépôt/retrait = différence d'inventaire **et** contenu relu du coffre ; éclairage = lumière lue après pose ; retour = position atteinte ; échecs en mots reconnus |
| II. Garde-fous déterministes | ✅ | `isForbiddenContainer` pur et testé, appliqué au point d'entrée des coffres ; `authorize_chest` passe par l'**accord humain** (`interrupt`) et ne vaut que pour la demande en cours ; seul `OWNER_USERNAME` ; `base_status`/`find_in_storage` en lecture dans `IDLE_TOOLS`, actions de rangement hors idle |
| III. Déterminisme / improvisation | ✅ | Classement, décision de retour, périmètre : code pur ; le LLM déclenche la routine |
| IV. Testable sans Minecraft | ✅ | Tous les modules décisionnels purs ; classement testé sur tout le registre ; 20+ variantes de pancarte ; 30 scénarios risque/gain |
| V. Boucles bornées | ✅ | Rangement et retour bornés, repli défini, `stop` < 5 s, coût LLM annoncé |
| VI. Mémoire honnête | ✅ | L'index est **revérifié à l'ouverture** ; l'état d'une pancarte est lu dans le monde à chaque fois |
| VII. Simplicité pédagogique | ✅ | Pattern : *règle de sécurité appliquée à l'unique point d'entrée + scoring risque/gain réglable* |

Gate : aucune violation. Re-check après Phase 1 : inchangé.

## Project Structure

### Documentation (this feature)

```text
specs/008-base-storage-return/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── base.ts          # NOUVEAU — périmètre, carte d'éclairage de la base, extension (pur)
├── storage.ts       # NOUVEAU — THEMES, themeOf, planDeposit, SURVIVAL_KIT, index, findResource (pur)
├── forbidden.ts     # NOUVEAU — normalisation des pancartes, isForbiddenContainer, autorisations (pur)
├── return.ts        # NOUVEAU — ITEM_VALUE, fragility, decideReturn, forcedReturn (pur)
├── base-store.ts    # NOUVEAU — persistance data/base.json (fichier injectable)
├── actions.ts       # MODIFIÉ — readSigns(chestPos), sampleLight, followTrail, shelterAndMark
├── tools.ts         # MODIFIÉ — withChest : garde « interdit » + index ; base_status, store_items, find_in_storage, return_to_base, base_routine, authorize_chest, check_base_lighting, extend_base
├── policy.ts        # MODIFIÉ — authorize_chest en approve ; base_status/find_in_storage dans IDLE_TOOLS ; inHome via la base
├── world.ts         # MODIFIÉ — snapshot : base, trousse, décision de retour courante
├── config.ts        # MODIFIÉ — marge du périmètre, trousse, seuils de retour, valeurs d'objets
└── prompts.ts       # MODIFIÉ — « jamais ouvrir un coffre interdit ; rentre quand la valeur à risque dépasse le seuil »

test/
├── base.test.ts       # NOUVEAU — périmètre, lacunes d'éclairage, extension
├── storage.test.ts    # NOUVEAU — chaque objet classé, priorité, dépôt, index
├── forbidden.test.ts  # NOUVEAU — 20+ variantes de pancarte, coffre double, autorisation
├── return.test.ts     # NOUVEAU — 30 scénarios, retours forcés
└── policy.test.ts     # MODIFIÉ — authorize_chest en approve, outils de lecture en idle
```

**Structure Decision**: mono-projet existant ; quatre modules purs, une garde unique côté coffre, et de
l'exécution mince.

## Complexity Tracking

Aucune violation à justifier.
