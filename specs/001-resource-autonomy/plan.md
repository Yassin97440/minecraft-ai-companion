# Implementation Plan: Autonomie en ressources (besoin → récolte → fabrication)

**Branch**: `001-resource-autonomy` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-resource-autonomy/spec.md`

## Summary

Le compagnon doit transformer « fabrique X » en un **plan déterministe** (ressources manquantes, ordre des
étapes) puis l'exécuter de façon bornée et vérifiée. Approche en trois couches, du plus pur au plus
impur :

1. **Planificateur pur** (`src/needs.ts`) : développe récursivement les recettes de `minecraft-data` (803
   recettes, alternatives comprises) contre l'inventaire, y insère les stations (établi, four), les outils
   minimaux (`harvestTools` des blocs) et le combustible, et renvoie un plan ordonné ou un refus motivé.
2. **Tables fermées** (`src/sources.ts`) : où trouver une ressource brute (bloc source, outil minimal), recettes
   de fonte (absentes de `minecraft-data`), combustibles, ressources hors périmètre (Nether, End).
3. **Exécuteur borné** (`src/obtain.ts`) : déroule le plan via une interface `Actions` **injectée**
   (récolter, crafter, fondre, poser une station, compter) avec budget d'étapes, de temps et d'échecs,
   arrêt immédiat sur interruption. Les `Actions` réelles enveloppent le code existant de `tools.ts` ; les tests
   utilisent un faux monde.

Deux tools exposés au LLM : `plan_needs` (lecture seule, inoffensif en mode autonome) et `obtain_item`
(exécution, un seul appel pour tout un objectif). Le LLM choisit le QUOI, le code fait le COMMENT
(constitution III).

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 + mineflayer-pathfinder, `minecraft-data` (déjà présent via mineflayer,
version 1.21.4), LangGraph.js v1, LangChain, Zod 4

**Storage**: `data/memory.json` existant (clés `gisement:<ressource>`) ; aucun nouveau fichier

**Testing**: vitest (`npm test`), modèles scriptés, **sans réseau ni Minecraft** ; `minecraft-data` est une
bibliothèque locale, utilisable en test

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4 offline

**Project Type**: agent CLI mono-projet (`src/`, `test/`)

**Performance Goals**: planification < 50 ms (calcul pur) ; un objectif moyen ≤ 15 requêtes LLM (SC-007)

**Constraints**: boucles bornées (≤ 40 étapes, ≤ 3 échecs d'affilée par étape, ≤ 8 min par objectif) ;
interruption en < 5 s ; aucune commande de triche (`/give`, `/fill`) ; zones protégées respectées

**Scale/Scope**: ~20 objets de référence testés (outils, armes, armures, établi, four, torches, lingots) ;
ressources brutes : bois, pierre, charbon, fer, sable, argile, cuivre, laine, cuir

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Chaque étape compare l'inventaire avant/après (réutilise `inventoryDiff`) ; l'exécuteur ne marque une étape « faite » que si le compte a augmenté ; échecs en `Échec/Impossible/Aucun/Matériaux manquants` |
| II. Garde-fous déterministes | ✅ | Refus d'objet inconnu/hors périmètre et plafond de quantité dans le planificateur pur ; `obtain_item` **absent** de `IDLE_TOOLS` (étendu seulement par la capacité 004) ; `plan_needs` ajouté à `IDLE_TOOLS` (lecture seule) ; blocs protégés déjà refusés par `collect_block` |
| III. Déterminisme / improvisation | ✅ | Calcul du besoin, ordre, outil minimal : code pur ; le modèle ne choisit que l'objectif |
| IV. Testable sans Minecraft | ✅ | `needs.ts` et `obtain.ts` sans import de Mineflayer ; tests avec vrai `minecraft-data` et faux monde ; scénarios en jeu listés dans `quickstart.md` |
| V. Boucles bornées | ✅ | Budget explicite (étapes, temps, échecs) + vérification de `ctx.run.interrupted` entre étapes ; requêtes LLM max : 1 `plan_needs` + 1 `obtain_item` + relances ≈ 6 (≤ 15) |
| VI. Mémoire honnête | ✅ | Gisements mémorisés **uniquement** après récolte réussie, revérifiés à l'arrivée ; aucune clé API touchée |
| VII. Simplicité pédagogique | ✅ | Pattern illustré : *planificateur déterministe + exécuteur à dépendances injectées* ; deux modules purs, un module d'adaptation |

Gate : **aucune violation**, pas de Complexity Tracking.

**Re-check après Phase 1** : inchangé. La refactorisation de `tools.ts` (extraction de `collectBlocks`,
`craftOne`) est un déplacement de code sans nouvelle abstraction.

## Project Structure

### Documentation (this feature)

```text
specs/001-resource-autonomy/
├── plan.md              # Ce fichier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── tools.md         # Contrats des tools plan_needs / obtain_item
└── tasks.md             # Phase 2 (/speckit-tasks, non créé ici)
```

### Source Code (repository root)

```text
src/
├── needs.ts             # NOUVEAU — planificateur pur (recettes, stations, outils, combustible)
├── sources.ts           # NOUVEAU — tables fermées : sources brutes, fonte, combustibles, hors périmètre
├── obtain.ts            # NOUVEAU — exécuteur borné, Actions injectées
├── actions.ts           # MODIFIÉ — extraction de collectBlocks / craftOne / smeltBatch depuis tools.ts
├── tools.ts             # MODIFIÉ — tools plan_needs et obtain_item ; collect/craft délèguent à actions.ts
├── policy.ts            # MODIFIÉ — plan_needs dans IDLE_TOOLS ; règle de plafond de quantité
├── prompts.ts           # MODIFIÉ — consigne « pour un objet à fabriquer : plan_needs puis obtain_item »
└── memory.ts            # INCHANGÉ (clés gisement:*)

test/
├── needs.test.ts        # NOUVEAU — 20 objets de référence, refus, alternatives, outils minimaux
├── obtain.test.ts       # NOUVEAU — faux monde : succès, échec, budget, interruption, vérification
└── policy.test.ts       # MODIFIÉ — obtain_item refusé en idle, plan_needs autorisé
```

**Structure Decision**: mono-projet existant. Deux modules **purs** (`needs`, `sources`), un exécuteur
à dépendances injectées (`obtain`), et l'adaptation Mineflayer reste dans `actions.ts`/`tools.ts`.

## Complexity Tracking

Aucune violation de la constitution à justifier.
