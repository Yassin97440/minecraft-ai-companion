# Implementation Plan: Construction (pose bloc par bloc, bâtiments complets)

**Branch**: `005-building-construction` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-building-construction/spec.md`

## Summary

Faire évoluer `build_structure` (aujourd'hui : plan libre du LLM → validation → accord → **commandes** `/fill`,
`/setblock` qui « paient » en vidant l'inventaire) vers une construction **légitime et garantie complète**, en
quatre briques qui se composent :

1. **Générateur de maisons** (`src/house.ts`, pur) : le LLM ne dessine plus les murs ; il choisit des
   **paramètres** (emprise, niveaux, sous-sol, matériau, toit) et le code génère un `Plan` qui contient *par
   construction* sol, toit, 4 murs, porte, fenêtres vitrées, escaliers entre niveaux et éclairage. Le
   `build_structure` libre reste pour les ouvrages `decor`.
2. **Validation renforcée** (`src/construction.ts` + `src/lighting.ts`, purs) : matériaux autorisés resserrés (plus
   de terre ni de sable/gravier), fenêtres obligatoires, chemin continu entre niveaux, **carte d'éclairage**
   (propagation de la lumière) et ajout automatique des sources manquantes.
3. **Chantier légitime** (`src/builder.ts`, exécuteur à `Actions` injectées) : transforme le plan en liste de
   poses ordonnées (du bas vers le haut, appui avant bloc), pose réellement chaque bloc depuis l'inventaire, se
   **réconcilie** avec le monde réel pour reprendre après interruption, et vérifie l'ouvrage (`verifyGrid`
   existant + carte d'éclairage mesurée).
4. **Approvisionnement et site** (`src/site.ts` pur + `obtain_item` de la 001) : choix d'un emplacement plat hors
   zones protégées, matériaux récoltés/fabriqués avant et pendant le chantier.

Le mode instantané par commandes est conservé derrière un réglage explicite (`BUILD_MODE=fast`) pour les tests du
propriétaire ; il n'est jamais le mode par défaut.

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`bot.placeBlock`, `bot.dig`, `bot.blockAt`), mineflayer-pathfinder,
`minecraft-data` 1.21.4, Zod 4

**Storage**: `data/builds.json` (nouveau : chantier en cours — plan, ancre, état) ; `data/memory.json` (bâtiments)

**Testing**: vitest, **sans Minecraft ni LLM** ; faux monde (grille de blocs en mémoire) pour `builder.ts`

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: validation < 100 ms ; maison d'un niveau en < 20 min de jeu une fois les matériaux réunis (SC-004) ;
~0,5 s de jeu par bloc posé

**Constraints**: ≤ 2500 blocs, ≤ 24×24×16 (limites existantes) ; ≤ 4 appels `obtain_item` pendant un chantier ;
≤ 3 échecs d'affilée par pose, ≤ 40 min par chantier ; zones protégées et coffres « interdit » intacts ; aucun bloc
d'échafaudage laissé (vérifié) ; accord du joueur obligatoire

**Scale/Scope**: maison 1 à 3 niveaux + sous-sol (≤ 4 blocs sous le sol) ; fenêtres, porte, escaliers, lumières

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Chaque pose lue dans le monde ; vérification finale par `verifyGrid` + éclairage mesuré ; « terminé » seulement si le ratio de blocs conformes est atteint ; échecs en `Échec/Impossible/Matériaux manquants` |
| II. Garde-fous déterministes | ✅ | Plan validé par le code (listes fermées, bornes, étanchéité, fenêtres, éclairage) ; **accord du joueur conservé** ; zones protégées et « interdit » (008) respectées ; `build_house`/`build_structure` hors `IDLE_TOOLS` ; le mode `fast` n'est activable que par configuration du propriétaire |
| III. Déterminisme / improvisation | ✅ | Le LLM choisit paramètres et style ; le code génère, valide, pose et vérifie |
| IV. Testable sans Minecraft | ✅ | `house.ts`, `lighting.ts`, `site.ts` purs ; `builder.ts` testé avec faux monde ; test exhaustif de la grille de paramètres du générateur ; scénarios en jeu dans `quickstart.md` |
| V. Boucles bornées | ✅ | Plafond de blocs, durée, échecs d'affilée ; vérification de l'interruption entre poses ; chantier reprenable ; coût LLM annoncé (≤ 20) |
| VI. Mémoire honnête | ✅ | `data/builds.json` = état réconcilié avec le monde à chaque reprise (le monde fait foi) |
| VII. Simplicité pédagogique | ✅ | Pattern : *le modèle propose des paramètres, le code garantit les invariants* |

Gate : aucune violation. Re-check après Phase 1 : inchangé.

## Project Structure

### Documentation (this feature)

```text
specs/005-building-construction/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── house.ts          # NOUVEAU — generateHouse(params) → Plan (pur, invariants garantis)
├── lighting.ts       # NOUVEAU — lightMap(grid), uncoveredCells, autoLight (pur)
├── site.ts           # NOUVEAU — chooseSite(heights, footprint, protectedZones) (pur)
├── builder.ts        # NOUVEAU — placementOrder, reconcile, runBuild (Actions injectées)
├── construction.ts   # MODIFIÉ — BUILD_BLOCKS resserré, fenêtres, chemin entre niveaux, light check en erreur
├── materials.ts      # MODIFIÉ — retirer terre/boue brute/sable/gravier des matériaux de structure
├── actions.ts        # MODIFIÉ — placeStructureBlock (orientation), scaffold pose/retrait
├── tools.ts          # MODIFIÉ — build_house ; build_structure : mode survie par défaut ; reprise
├── policy.ts         # MODIFIÉ — build_house hors IDLE_TOOLS, accord requis
└── prompts.ts        # MODIFIÉ — « pour une maison : build_house (pas de plan libre) »

test/
├── house.test.ts       # NOUVEAU — grille de paramètres, tous les plans valides
├── lighting.test.ts    # NOUVEAU — propagation, couverture, autoLight
├── builder.test.ts     # NOUVEAU — ordre, reprise, échec, interruption, échafaudage
├── site.test.ts        # NOUVEAU — terrain plat, zones protégées
└── construction.test.ts # MODIFIÉ — terre/boue/sable refusés, fenêtres, escaliers
```

**Structure Decision**: mono-projet existant ; quatre modules (trois purs, un exécuteur injecté) qui réutilisent
`validatePlan`, `verifyGrid` et le flux d'accord de `build_structure`.

## Complexity Tracking

Aucune violation à justifier.
