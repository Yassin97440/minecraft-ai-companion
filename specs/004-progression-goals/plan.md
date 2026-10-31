# Implementation Plan: Objectifs et progression

**Branch**: `004-progression-goals` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-progression-goals/spec.md`

## Summary

La progression est un **moteur déterministe** qui orchestre les capacités 001 (ressources), 002 (alimentation),
003 (combat) et 008 (retour), sans passer par le LLM pour chaque étape :

1. **Échelle de paliers** (`src/progression.ts`, pur) : bois → pierre → fer → diamant → Nether → Ender, chaque
   palier défini par des prérequis et un **prédicat de réussite sur l'inventaire réel** (ex. « pioche et épée en
   pierre ») ; `currentTier()` le calcule à partir de l'état, pas de la mémoire.
2. **Choix d'objectif** (`chooseGoal`, pur) : priorité fixe sécurité/besoins vitaux > équipement > progression >
   exploration, avec raison textuelle ; `isEquipped()` (seuils réglables) autorise l'exploration lointaine.
3. **Autorisation d'initiative** (`canStartAutonomy`, pur, dans `policy.ts`) : seulement si *inactif* **et**
   *propriétaire déconnecté* **et** progression non suspendue **et** budget restant. Les paliers Nether/Ender :
   préparation seule hors présence du propriétaire.
4. **Exécuteur** (`src/autonomy.ts`) : boucle bornée à dépendances injectées qui appelle `obtain_item`,
   `resupply_food`, `prepare_for_trip`, `explore`, `return_to_base`. Budget : requêtes LLM, morts, temps, essais.
   Interruption < 10 s dès que le propriétaire se connecte ou écrit.
5. **Journal de progression** durable (`src/progress-store.ts`) + résumé fidèle à la reconnexion
   (`summarize()` pur) et commandes du joueur (`set_progression` : pause, reprise, désactivation, priorité,
   interdiction).

Le LLM n'est plus dans la boucle : il sert à parler (résumé, commentaires) et à interpréter les consignes du
joueur. Le coût en requêtes est donc quasi nul (SC-007).

## Technical Context

**Language/Version**: TypeScript ESM, Node 20+, `tsx`

**Primary Dependencies**: mineflayer 4.39 (`playerJoined`/`playerLeft`, `death`, `bot.players`), LangGraph.js v1
(inchangé : le graphe sert les modes `chat` et `idle`), Zod 4

**Storage**: `data/progress.json` (nouveau : paliers, journal, réglages, budget courant) ; `data/memory.json` inchangé

**Testing**: vitest, **sans Minecraft ni LLM** ; faux monde et faux horloge injectés pour l'exécuteur

**Target Platform**: Windows 11 / PowerShell, serveur local 1.21.4

**Project Type**: agent CLI mono-projet

**Performance Goals**: décision d'objectif < 10 ms ; arrêt < 10 s après reconnexion (SC-005) ; palier pierre en
< 15 min de jeu (SC-001)

**Constraints**: budget par session autonome : 60 requêtes LLM, 3 morts, 90 minutes, 5 échecs d'affilée ;
aucune action destructrice sur la base ou les autres joueurs ; aucune initiative si le propriétaire est connecté

**Scale/Scope**: 6 paliers ; ~12 types d'objectifs ; dépend de 001, 002, 003 (et 008 pour le retour)

## Constitution Check

| Principe | Verdict | Justification |
|---|---|---|
| I. Vérifier les effets | ✅ | Le palier se déduit de l'inventaire réel ; le journal n'enregistre un palier qu'après vérification ; le résumé est calculé depuis ce journal, jamais rédigé par le modèle |
| II. Garde-fous déterministes | ⚠️ → justifié | Extension de l'allowlist autonome : voir Complexity Tracking. `canStartAutonomy` est une fonction pure testée ; les appels passent par `checkToolCall(…, "progress")` |
| III. Déterminisme / improvisation | ✅ | Le choix et l'enchaînement sont déterministes ; l'improvisation reste dans les lubies (mode idle quand le propriétaire est là) |
| IV. Testable sans Minecraft | ✅ | `progression.ts`, `autonomy.ts` à dépendances injectées ; table de 30 situations pour `chooseGoal` ; scénarios en jeu dans `quickstart.md` |
| V. Boucles bornées | ✅ | Budget explicite (requêtes, morts, temps, échecs), arrêt immédiat à l'interruption ; coût LLM annoncé : ≈ 0 par étape, ≤ 60 par session |
| VI. Mémoire honnête | ✅ | Journal = faits constatés ; résumé issu du journal ; `data/progress.json` ne contient aucun secret |
| VII. Simplicité pédagogique | ✅ | Pattern : *machine à états pilotée par des règles pures + garde-fou d'autorisation + budget* |

## Project Structure

### Documentation (this feature)

```text
specs/004-progression-goals/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/tools.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── progression.ts     # NOUVEAU — paliers, currentTier, chooseGoal, isEquipped, summarize (pur)
├── autonomy.ts        # NOUVEAU — exécuteur borné (Deps injectées : obtain, resupply, prepare, explore, return)
├── progress-store.ts  # NOUVEAU — journal + réglages durables (fichier injectable pour les tests)
├── policy.ts          # MODIFIÉ — Mode "progress", PROGRESS_TOOLS, canStartAutonomy, règles Nether/Ender
├── index.ts           # MODIFIÉ — présence du propriétaire, ticker de progression (remplace les lubies si propriétaire absent), interruption, résumé à la reconnexion
├── tools.ts           # MODIFIÉ — set_progression, progress_status, explore, (return_to_base : voir 008)
├── prompts.ts         # MODIFIÉ — consigne pour interpréter « pause / priorité / ne descends pas »
├── config.ts          # MODIFIÉ — PROGRESSION_ENABLED, budgets, seuils « équipé »
└── world.ts           # MODIFIÉ — snapshot : palier courant et objectif

test/
├── progression.test.ts  # NOUVEAU — paliers, 30 situations de priorité, isEquipped, summarize
├── autonomy.test.ts     # NOUVEAU — faux monde : enchaînement, budget, morts, interruption
├── policy.test.ts       # MODIFIÉ — canStartAutonomy (propriétaire connecté/déconnecté), PROGRESS_TOOLS
└── progress-store.test.ts # NOUVEAU — persistance, redémarrage
```

**Structure Decision**: mono-projet existant. Le graphe LangGraph n'est pas modifié : la progression est un
exécuteur à part, qui réutilise les tools via la politique. Cela évite d'alourdir le graphe et rend le coût
LLM prévisible.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principe II : extension de l'allowlist du mode autonome (nouveau mode `progress` avec `PROGRESS_TOOLS` = `IDLE_TOOLS` + `obtain_item`, `resupply_food`, `prepare_for_trip`, `explore`, `return_to_base`) | La progression sans surveillance exige fabrication, récolte, combat et exploration | Rester sur `IDLE_TOOLS` interdirait toute progression. Atténuation : (1) initiative seulement propriétaire déconnecté (`canStartAutonomy`, pur, testé) ; (2) budget requêtes/morts/temps ; (3) arrêt < 10 s à la reconnexion ; (4) aucune destruction de zones protégées ni de coffres « interdit » ; (5) Nether/Ender hors présence = préparation seule |
