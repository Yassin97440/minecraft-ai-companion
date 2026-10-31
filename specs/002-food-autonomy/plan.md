# Implementation Plan: Alimentation autonome

**Branch**: `002-food-autonomy` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-food-autonomy/spec.md`

## Summary

Remplacer le choix de nourriture actuel (`edibleFoods` + `BAD_FOOD` dans `src/survival.ts`) par un module **pur**
`src/food.ts` qui classe **chacun des 41 aliments** du jeu (sûr, de secours, nuisible, précieux), choisit
l'aliment à manger par une règle prévisible, calcule le **stock de nourriture** et décide de l'approvisionnement.
Le tool `eat` accepte un aliment précis, ne ment plus sur ses capacités (raisons réelles, gestion d'erreur,
attente de la mise à jour de la faim). Un tool `resupply_food` exécute l'approvisionnement borné (coffre, cultures
existantes, chasse, pêche, puis cuisson via la fonte de la capacité 001).

**Première tâche = reproduire le défaut** (steak / poulet cuit « non autorisés ») avec les traces
(`npm run trace-report`) : trois causes candidates sont corrigées de toute façon (voir research R1) et un test
de non-régression est ajouté.

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`bot.registry.foods`, `bot.consume`, `bot.fish`), mineflayer-pathfinder,
`minecraft-data` 1.21.4, LangGraph.js v1, Zod 4

**Storage**: `data/memory.json` (clés `nourriture:<source>`) ; aucun nouveau fichier

**Testing**: vitest, **sans réseau ni Minecraft** ; `minecraft-data` utilisé en test pour couvrir les 41 aliments

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: décision de repas < 10 ms (calcul pur) ; un repas ≤ 3 requêtes LLM, un approvisionnement ≤ 6 (SC-008)

**Constraints**: recherche de nourriture ≤ 5 min de jeu (SC-007), ≤ 2 essais de repas par aliment, ≤ 3 échecs d'affilée ;
réflexes de survie prioritaires ; jamais d'animal apprivoisé, nommé ou appartenant à un joueur

**Scale/Scope**: 41 aliments classés ; 4 sources (coffre, cultures, chasse, pêche) ; cuisson de viandes et poissons

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Repas : faim avant/après avec attente de la mise à jour (≤ 1,5 s) ; approvisionnement : valeur nutritive réelle gagnée (différence d'inventaire) |
| II. Garde-fous déterministes | ✅ | Classification et choix dans `food.ts` pur ; règle « jamais d'animal apprivoisé/nommé » dans `checkToolCall` + test ; `resupply_food` **hors** `IDLE_TOOLS` (étendu par 004) ; `food_status` lecture seule dans `IDLE_TOOLS` |
| III. Déterminisme / improvisation | ✅ | Le réflexe de faim existant reste hors LLM et adopte la même classification ; le LLM décide seulement de lancer `resupply_food` |
| IV. Testable sans Minecraft | ✅ | `food.ts` testé sur les 41 aliments ; `resupply.ts` à `Actions` injectées (même schéma que 001) ; scénarios en jeu dans `quickstart.md` |
| V. Boucles bornées | ✅ | Budget (5 min, 30 étapes, 3 échecs) ; interruption vérifiée entre étapes ; coût LLM annoncé |
| VI. Mémoire honnête | ✅ | Sources mémorisées après constat seulement, revérifiées à l'arrivée |
| VII. Simplicité pédagogique | ✅ | Pattern : *table de classification + règle pure + exécuteur injecté* |

Gate : aucune violation. Re-check après Phase 1 : inchangé.

## Project Structure

### Documentation (this feature)

```text
specs/002-food-autonomy/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── food.ts          # NOUVEAU — classification, choix, stock, seuils (pur)
├── resupply.ts      # NOUVEAU — exécuteur borné d'approvisionnement (Actions injectées)
├── survival.ts      # MODIFIÉ — eatBest(item?), supprime BAD_FOOD/edibleFoods, utilise food.ts
├── actions.ts       # MODIFIÉ — huntAnimals, fishFor, harvestCrop (+ filtre animaux protégés)
├── tools.ts         # MODIFIÉ — eat({item?}), food_status, resupply_food
├── world.ts         # MODIFIÉ — ligne « Nourriture: stock … » dans snapshot()
├── policy.ts        # MODIFIÉ — food_status dans IDLE_TOOLS ; règle animal protégé
└── prompts.ts       # MODIFIÉ — ne jamais prétendre ne pas pouvoir manger sans appeler eat

test/
├── food.test.ts       # NOUVEAU — 41 aliments, choix, stock, seuils
├── resupply.test.ts   # NOUVEAU — faux monde : sources, échec, budget, interruption
├── survival.test.ts   # MODIFIÉ — réflexe de faim : mêmes règles
└── policy.test.ts     # MODIFIÉ — animal apprivoisé refusé, resupply_food refusé en idle
```

**Structure Decision**: mono-projet existant ; un module pur (`food.ts`), un exécuteur injecté
(`resupply.ts`), le reste est de l'adaptation.

## Complexity Tracking

Aucune violation à justifier.
