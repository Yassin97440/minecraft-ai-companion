# Implementation Plan: Combat et défense

**Branch**: `003-combat-defense` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-combat-defense/spec.md`

## Summary

Extraire des réflexes actuels (`src/survival.ts`) un module **pur** `src/combat.ts` qui porte toute la
logique de décision qui dépend de l'équipement et des monstres :

- **notation d'équipement** (`gearScore`) : matériau, type, usure, enchantements ; comparaison hache / épée par
  dégâts réels ;
- **tenue optimale** (`bestLoadout`) : meilleure pièce par emplacement (casque, plastron, jambières, bottes,
  bouclier, arme) et liste des changements à faire ;
- **profils de monstres** (`MOB_PROFILES`) : combattre, éviter ou fuir, distance à tenir, point faible ;
- **décision** (`decideEngagement`) : étend `decideReflex` avec les profils et le nombre d'adversaires ;
- **plan d'armement** (`armorPlan`) : quoi fabriquer en premier selon le fer disponible.

Côté exécution : `gearUp` utilise `bestLoadout` et se **déclenche tout seul** (ramassage, fabrication, don, mort,
casse) quand la zone est calme ; `fight` applique le profil (reculer face aux squelettes, ne pas rester près d'un
creeper) ; une réaction aux **dégâts de source inconnue** est ajoutée ; un tool `defense_status` rend l'état de
défense ; la préparation d'une sortie lointaine appelle `obtain_item` (capacité 001) pour s'armer.

Le fonctionnement actuel (`gearUp`, `fight`, `decideReflex`) n'est pas vérifié en jeu : le plan ajoute les tests
avant de refactorer, pour ne pas changer le comportement par accident.

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`bot.equip`, `bot.attack`, événements `entityHurt`, `health`,
`playerCollect`), mineflayer-pathfinder, `minecraft-data` 1.21.4 (noms d'objets, durabilité), Zod 4

**Storage**: `data/memory.json` (clé `defense:dernier-bilan`, optionnelle) ; aucun nouveau fichier

**Testing**: vitest, **sans Minecraft ni LLM** ; `minecraft-data` pour tester **chaque** pièce d'armure, arme et
bouclier

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: décision < 5 ms ; équipement complet en < 10 s (SC-001) ; arrêt d'un combat < 3 s (SC-008)

**Constraints**: aucun appel LLM pendant un combat (FR-015) ; combat ≤ 25 s par engagement, retrait sous 6 de vie
(valeurs de départ) ; jamais de joueur, villageois, animal apprivoisé ou nommé ciblé

**Scale/Scope**: ~30 pièces d'armure (cuir à netherite + tortue), ~12 armes, 1 bouclier, ~18 profils de monstres

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | L'équipement est confirmé par la lecture des emplacements réels (`bot.inventory.slots[...]`) ; le bilan de combat compare la vie avant/après ; un équipement non porté après tentative = `Échec` |
| II. Garde-fous déterministes | ✅ | Ciblage validé par fonction pure `isValidTarget` (jamais joueur, villageois, apprivoisé, nommé, neutre non provoqué) + test ; `defense_status` en lecture seule dans `IDLE_TOOLS` ; `gear_up`, `flee`, `eat` y sont déjà |
| III. Déterminisme / improvisation | ✅ | Tout le combat reste hors LLM ; le modèle ne décide que « préparer la sortie / s'armer » |
| IV. Testable sans Minecraft | ✅ | `combat.ts` pur ; tests pour chaque pièce, chaque profil, chaque cas de décision ; tests de caractérisation de `decideReflex` avant refactor |
| V. Boucles bornées | ✅ | Durée de combat, retrait par seuil de vie, cooldown des réflexes, interruption `stop` ; l'auto-équipement est anti-rebond (≤ 1 déclenchement / 5 s) |
| VI. Mémoire honnête | ✅ | Seul le bilan constaté est mémorisé ; aucune clé API concernée |
| VII. Simplicité pédagogique | ✅ | Pattern : *fonction de décision pure + profils en données + exécuteur mince* |

Gate : aucune violation. Re-check après Phase 1 : inchangé (le seuil « équipé » de la 004/008 consomme
`defenseStatus`, il ne l'étend pas).

## Project Structure

### Documentation (this feature)

```text
specs/003-combat-defense/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── combat.ts       # NOUVEAU — gearScore, bestLoadout, chooseWeapon, MOB_PROFILES, decideEngagement, armorPlan, isValidTarget (pur)
├── survival.ts     # MODIFIÉ — gearUp via bestLoadout ; fight via profils ; decideReflex délègue à decideEngagement ; auto-équipement
├── actions.ts      # MODIFIÉ — bestTool délègue à gearScore (hache vs épée)
├── tools.ts        # MODIFIÉ — gear_up({weapon?}), defense_status, prepare_for_trip
├── world.ts        # MODIFIÉ — ligne « Défense: armure X/20, arme Y » dans snapshot()
├── index.ts        # MODIFIÉ — écoute de l'inventaire et des dégâts (auto-équipement, source inconnue)
├── policy.ts       # MODIFIÉ — defense_status dans IDLE_TOOLS ; règle de cible interdite
└── prompts.ts      # MODIFIÉ — « équipe-toi avant de sortir ; ne combats pas sans arme »

test/
├── combat.test.ts    # NOUVEAU — chaque pièce, comparaisons, profils, décisions, cibles interdites
├── survival.test.ts  # MODIFIÉ — caractérisation de decideReflex avant refactor puis nouveaux cas
└── policy.test.ts    # MODIFIÉ — cible interdite refusée, defense_status autorisé en idle
```

**Structure Decision**: mono-projet existant ; `combat.ts` pur, exécution mince dans `survival.ts`. Ordre :
après la capacité 002, car les deux modifient `survival.ts` (repas / combat) ; les tests de caractérisation
protègent les deux.

## Complexity Tracking

Aucune violation à justifier.
