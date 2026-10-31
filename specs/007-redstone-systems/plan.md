# Implementation Plan: Systèmes redstone

**Branch**: `007-redstone-systems` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-redstone-systems/spec.md`

## Summary

Le compagnon connaît les composants, choisit un **montage de bibliothèque**, le fait valider par le code, le
construit avec le chantier de la 005, le **teste en jeu** (test d'activation) puis le surveille et le répare.
Cinq briques :

1. **Catalogue des composants** (`src/redstone.ts`, pur) : rôle, comportement, orientation, portée, délai pour
   ~30 composants ; les **recettes viennent de `minecraft-data`** (déjà vérifié : toutes présentes sauf le
   capteur de sculk), donc les listes de matériaux sont exactes sans table à la main. Test de complétude : tout
   composant de la liste existe dans le registre.
2. **Bibliothèque de montages** (`src/circuits.ts`, pur) : gabarits paramétrables (`auto_door`, `daylight_lamps`,
   `lever_lamps` (repli sans quartz), `melon_pumpkin_farm`, `sugar_cane_farm`, `wheat_flush_farm`, `mob_trap_auto`,
   `animal_farm_auto`) → `Blueprint` (blocs avec états + test d'activation). Chaque gabarit déclare son besoin
   en quartz et son statut (`validated` / `experimental`).
3. **Validation** (`validateCircuit`, pur) : composants autorisés, orientation, appui, portée du signal (répéteurs),
   interdits (TNT, lave, horloge rapide), bornes de taille.
4. **Pose orientée** (`src/circuit-orient.ts` pur + extension du chantier 005) : calcule d'où se placer et
   vers quelle face viser pour qu'un observateur, piston ou répéteur prenne la bonne orientation.
5. **Test, surveillance, réparation** (`src/systems-monitor.ts` pur + `src/systems-registry.ts`) : test
   d'activation observé dans le monde, `diagnose()` des pannes, registre durable `data/systems.json`.

Ordre de livraison conseillé (risque croissant) : catalogue → porte → éclairage jour/nuit (+ repli levier) →
ferme melon/citrouille et canne à sucre → piège à monstres automatique → ferme d'élevage automatique
(`experimental`).

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`bot.placeBlock`, `bot.activateBlock`, `bot.blockAt` pour états :
`powered`, `open`, `lit`), mineflayer-pathfinder, `minecraft-data` 1.21.4 (recettes, états de blocs), Zod 4

**Storage**: `data/systems.json` (nouveau : registre des systèmes) ; chantier `data/builds.json` (005)

**Testing**: vitest, **sans Minecraft ni LLM** ; faux monde de blocs avec états pour le diagnostic ; le comportement
du signal lui-même n'est vérifiable qu'en jeu (déclaré)

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: validation d'un montage < 100 ms ; test d'activation en < 30 s de jeu ; ≤ 20 requêtes LLM par
construction (SC-010)

**Constraints**: ≤ 150 composants par montage ; pas d'horloge plus rapide qu'1 Hz ; aucun TNT/lave ; zones protégées ;
accord du joueur ; chantier bloc par bloc ; quartz : repli ou apport du joueur

**Scale/Scope**: ~30 composants ; 8 montages ; 5 pannes types (composant manquant, mauvaise orientation, signal
coupé, coffre plein, production arrêtée)

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Chaque pose lue dans le monde (bloc + état) ; **test d'activation observé** (porte ouverte, lampe allumée, objets au coffre) ; aucun succès annoncé sans test |
| II. Garde-fous déterministes | ✅ | Montages de bibliothèque validés par le code ; valeurs du modèle (id, paramètres) vérifiées par schéma fermé ; accord du joueur ; `build_circuit`/`check_systems` hors `IDLE_TOOLS` ; `redstone_info` lecture seule dans `IDLE_TOOLS` ; TNT/lave interdits |
| III. Déterminisme / improvisation | ✅ | Le LLM choisit un montage et ses paramètres ; le code instancie, valide, pose, teste |
| IV. Testable sans Minecraft | ✅ | Catalogue, gabarits, validation, orientation, diagnostic : purs et testés pour chaque composant et chaque montage ; le signal est déclaré « non vérifié en jeu » avec scénarios de test |
| V. Boucles bornées | ✅ | Budget de chantier, d'essais de réparation (≤ 3), de tests ; interruption ; coût LLM annoncé |
| VI. Mémoire honnête | ✅ | Registre mis à jour d'après le test réel ; état « dégradé » constaté, pas supposé |
| VII. Simplicité pédagogique | ✅ | Pattern : *bibliothèque de plans validés + test d'activation + diagnostic* |

Gate : aucune violation. Re-check après Phase 1 : inchangé. Risque assumé et tracé : la simulation de redstone
hors jeu est hors périmètre ; le test d'activation en jeu est la preuve (voir R6).

## Project Structure

### Documentation (this feature)

```text
specs/007-redstone-systems/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── redstone.ts           # NOUVEAU — catalogue des composants, explain(), materialsFor() (pur)
├── circuits.ts           # NOUVEAU — gabarits, instantiate(), validateCircuit(), quartzNeeds() (pur)
├── circuit-orient.ts     # NOUVEAU — orientationPlan(item, facing) → où se tenir, quelle face viser (pur)
├── systems-monitor.ts    # NOUVEAU — activationTest(), diagnose() → pannes + réparations (pur)
├── systems-registry.ts   # NOUVEAU — registre durable (fichier injectable)
├── builder.ts            # MODIFIÉ (005) — pose orientée, ordre appui → composants → poussière
├── construction.ts       # MODIFIÉ (005) — kind "redstone", REDSTONE_BLOCKS
├── tools.ts              # MODIFIÉ — redstone_info, redstone_materials, build_circuit, test_system, check_systems
├── policy.ts             # MODIFIÉ — redstone_info/redstone_materials dans IDLE_TOOLS ; build_circuit, check_systems hors idle
└── prompts.ts            # MODIFIÉ — « redstone : montage de la bibliothèque, jamais de circuit inventé »

test/
├── redstone.test.ts        # NOUVEAU — chaque composant : rôle, recette, matériaux exacts
├── circuits.test.ts        # NOUVEAU — chaque montage valide ; lot de montages invalides refusés
├── circuit-orient.test.ts  # NOUVEAU — orientations pour piston, observateur, répéteur, comparateur
├── systems-monitor.test.ts # NOUVEAU — diagnostic de pannes sur faux monde
└── policy.test.ts          # MODIFIÉ — redstone_info autorisé en idle, build_circuit refusé
```

**Structure Decision**: mono-projet existant ; quatre modules purs, le reste est de l'adaptation au chantier de la
005 et à l'observation des états de blocs.

## Complexity Tracking

Aucune violation à justifier.
