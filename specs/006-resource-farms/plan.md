# Implementation Plan: Fermes à ressources

**Branch**: `006-resource-farms` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-resource-farms/spec.md`

## Summary

Une ferme = une **conception paramétrée** (comme les maisons de la 005) + un **registre durable** + un **cycle
d'entretien borné**. Aucun circuit redstone : eau, enclos, entonnoirs et coffres seulement.

1. **Générateurs de fermes** (`src/farms.ts`, pur) : `generateFarm(kind, params) → Plan` pour `crop`, `animal`,
   `wood`, `mobtrap`. Le plan passe par la validation de la 005 (`validatePlan`, `lighting.ts`) avec un nouveau
   `kind: "farm"` et sa liste de blocs (terre labourable, eau, clôtures, portillons, entonnoirs, coffres). Des
   **validateurs spécifiques** vérifient hydratation, clôture fermée, lumière (extérieure pour le piège,
   intérieure sombre), bornes.
2. **Règles de gestion pures** : `herdActions(counts, target)` (reproduire / prélever / tondre, toujours une
   paire reproductrice), `cropActions`, `forestActions`, `estimateYield(kind, params)`, `proposeFarm(needs,
   registry)`.
3. **Registre** (`src/farm-registry.ts`) : `data/farms.json` (type, emplacement, effectif, dernière visite,
   rendement observé, problèmes), vérifié à l'arrivée (le monde fait foi).
4. **Cycle** (`src/farm-cycle.ts`) : exécuteur à `Actions` injectées (récolter, replanter, reproduire, tondre,
   abattre, abattre un arbre, ramasser, vider le coffre) avec budget, vérification d'inventaire avant/après et
   interruption ; la construction passe par le chantier de la 005, les matériaux par `obtain_item` (001), la
   chasse/le combat par la 003, le stockage par la 008.

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`bot.activateBlock`, `bot.useOn`, `bot.dig`, `bot.attack`, `bot.entities`),
mineflayer-pathfinder, `minecraft-data` 1.21.4 (cultures, animaux), Zod 4

**Storage**: `data/farms.json` (nouveau) ; `data/memory.json` (lieux)

**Testing**: vitest, **sans Minecraft ni LLM** ; faux monde pour `farm-cycle.ts`

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: validation d'une conception < 100 ms ; cycle de champ de 9×9 en < 3 min de jeu ; ≤ 10 requêtes LLM par cycle (SC-009)

**Constraints**: plafonds anti-lag : ≤ 12 animaux par enclos, ≤ 3 enclos, ≤ 300 objets au sol, ≤ 4 fermes ;
budget de cycle 5 min, 3 échecs d'affilée ; jamais d'animal apprivoisé/nommé/d'un autre joueur ; zones protégées

**Scale/Scope**: 4 types de fermes ; ~8 cultures (blé, carotte, pomme de terre, betterave, melon, citrouille,
canne à sucre, verrues exclues) ; 6 espèces d'élevage ; 8 espèces d'arbres

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Gain de cycle = différence d'inventaire/coffre ; recensement des animaux par comptage ; rendement annoncé comparé au constaté |
| II. Garde-fous déterministes | ✅ | Conception validée par le code ; accord du joueur ; `build_farm`/`tend_farms` hors `IDLE_TOOLS` (étendus par 004) ; filtre pur des animaux protégés (réutilise 002) ; plafonds anti-lag |
| III. Déterminisme / improvisation | ✅ | Le LLM propose une ferme et ses paramètres ; effectifs, cycles et validations sont du code |
| IV. Testable sans Minecraft | ✅ | `farms.ts`, `farm-registry.ts` purs ; `farm-cycle.ts` à faux monde ; scénarios en jeu dans `quickstart.md` |
| V. Boucles bornées | ✅ | Budget de cycle, plafonds d'effectif, arrêt `stop` < 5 s, coût LLM annoncé |
| VI. Mémoire honnête | ✅ | Registre revérifié à l'arrivée ; rendements observés, jamais supposés |
| VII. Simplicité pédagogique | ✅ | Pattern : *conception paramétrée + registre + cycle à dépendances injectées* |

Gate : aucune violation. Re-check après Phase 1 : inchangé.

## Project Structure

### Documentation (this feature)

```text
specs/006-resource-farms/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── farms.ts          # NOUVEAU — generateFarm, validateFarm, herdActions, cropActions, forestActions, estimateYield, proposeFarm (pur)
├── farm-registry.ts  # NOUVEAU — registre durable (fichier injectable)
├── farm-cycle.ts     # NOUVEAU — exécuteur de cycle (Actions injectées)
├── construction.ts   # MODIFIÉ — PlanSchema.kind += "farm", liste FARM_BLOCKS, hauteur max 40 pour kind "farm" (puits du piège ≥ 24) ; ops till/plant au chantier
├── builder.ts        # MODIFIÉ (005) — Actions.till / Actions.plant
├── actions.ts        # MODIFIÉ — harvestCrop, plantSeed, breedPair, shearSheep, fellTree, plantSapling
├── tools.ts          # MODIFIÉ — farm_status, build_farm, tend_farms
├── policy.ts         # MODIFIÉ — farm_status dans IDLE_TOOLS ; build_farm/tend_farms hors idle
└── prompts.ts        # MODIFIÉ — « besoin récurrent ? propose une ferme (farm_status), construis après accord »

test/
├── farms.test.ts          # NOUVEAU — conceptions valides, clôtures, eau, lumière, plafonds
├── farm-registry.test.ts  # NOUVEAU — persistance, vérification
└── farm-cycle.test.ts     # NOUVEAU — faux monde : replantation, effectif, paire reproductrice, budget
```

**Structure Decision**: mono-projet existant ; s'appuie sur le chantier de la 005 pour poser, sur la 001 pour
les matériaux, sur les 002/003 pour récolter et combattre.

## Complexity Tracking

Aucune violation à justifier.
