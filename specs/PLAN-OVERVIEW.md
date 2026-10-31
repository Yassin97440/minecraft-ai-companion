# Vue d'ensemble des plans (001 à 008)

**Créé** : 2026-11-07 · Complète [ROADMAP.md](ROADMAP.md). Chaque capacité a son `plan.md`, `research.md`,
`data-model.md`, `contracts/` et `quickstart.md` dans son dossier ; cette page sert à **ordonner** et à **éviter les
collisions** entre elles.

## Patron commun (appliqué partout)

Même découpage dans les huit plans, pour des raisons pédagogiques et de testabilité (constitution IV et VII) :

1. un module **pur** qui décide (planificateur, classification, validation, scoring) ;
2. un **exécuteur borné** à `Actions` injectées (budget, échecs d'affilée, interruption) ;
3. une **adaptation Mineflayer** mince dans `actions.ts` / `tools.ts` ;
4. un **registre durable** en JSON quand il y a un état à retenir ;
5. des tests sans Minecraft ni LLM ; les comportements en jeu restent « non vérifiés » jusqu'au scénario manuel.

## Modules partagés (à construire une seule fois)

| Module | Créé par | Réutilisé par |
|---|---|---|
| `needs.ts`, `sources.ts`, `obtain.ts` (plan + exécution de fabrication) | 001 | 002 (cuisson), 003 (armement), 004, 005 (matériaux), 006, 007, 008 (trousse) |
| `food.ts` (stock, classification) | 002 | 004 (`isEquipped`), 006, 008 (trousse) |
| `combat.ts` (`defenseStatus`, `gearScore`) | 003 | 004, 008 (`fragility`) |
| `lighting.ts`, `construction.ts` (validation), `builder.ts` (pose bloc par bloc, reprise) | 005 | 006, 007, 008 (extension, éclairage) |
| `storage.ts` (index, thèmes), `forbidden.ts` (coffres « interdit ») | 008 | 001/002 (`find_in_storage`), 006, 007 (vider les coffres) |
| `return.ts` (risque/gain), `return_to_base` | 008 | 004 (exploration) |
| `progression.ts`, `autonomy.ts` (exécuteur autonome) | 004 | — (consomme tout le reste) |

## Ordre d'implémentation recommandé

| # | Étape | Pourquoi dans cet ordre |
|---|---|---|
| 1 | **001** ressources | Fondation ; tous les autres appellent `obtain_item` |
| 2 | **002** alimentation | Petit, corrige un défaut constaté ; touche `survival.ts` avant la 003 |
| 3 | **003** combat | Tests de caractérisation de `decideReflex` puis refactor ; nécessaire à la fragilité (008) |
| 4 | **008, partie 1** : `forbidden.ts`, `storage.ts`, index | Règle de sécurité des coffres à poser **avant** que le compagnon agisse seul |
| 5 | **005** construction | Chantier légitime, lumière ; prérequis des fermes, du redstone et de l'extension de base |
| 6 | **008, partie 2** : `return.ts`, base, extension | Dépend de 003 (fragilité) et 005 (chantier) |
| 7 | **004** progression | Orchestre 001, 002, 003, 008 ; introduit le mode autonome et son budget |
| 8 | **006** fermes | S'appuie sur 005 et 002 |
| 9 | **007** redstone | Dernier : dépend de 005/006 et exige du quartz (Nether, 004) pour les montages avancés |

## Fichiers à fort risque de collision

| Fichier | Touché par | Précaution |
|---|---|---|
| `src/tools.ts` (≈ 1 060 lignes) | toutes | extraire d'abord `collectBlocks`/`craftOne` (001), ajouter les nouveaux tools dans des fichiers dédiés (`tools-*.ts`) plutôt que dans ce monolithe |
| `src/survival.ts` | 002 (`eatBest`), 003 (`gearUp`, `fight`, `decideReflex`) | tests de caractérisation avant tout refactor ; 002 avant 003 |
| `src/policy.ts` | toutes (`IDLE_TOOLS`, nouvelles règles) | une règle + un test à chaque ajout |
| `src/construction.ts` | 005, 006 (`kind "farm"`), 007 (`kind "redstone"`) | 005 stabilise l'interface `Plan` avant 006/007 |
| `src/prompts.ts` | toutes | garder le prompt court : n'exposer que les tools utiles au contexte (chantier « modèles et coûts ») |

## Données persistées (nouveaux fichiers sous `data/`)

`progress.json` (004) · `builds.json` (005) · `farms.json` (006) · `systems.json` (007) · `base.json` (008).
Aucun ne contient de secret (`.env` reste ignoré par git, principe VI) ; tous prennent le chemin du fichier en
paramètre pour les tests.

## Points ouverts découverts en planifiant (à décider avant de coder)

1. **Outils au nombre croissant** : ≈ 25 tools aujourd'hui, ≈ 20 de plus. Envoyer tous les schémas à chaque requête
   coûte cher (problème connu de `CLAUDE.md`). À traiter par un **routeur de tools par contexte** avant la 004 ou
   en parallèle.
2. **Quartz du Nether** : bloque le capteur de lumière, l'observateur et le comparateur (007) tant que le palier
   Nether n'est pas atteint avec le propriétaire ; les montages de repli (levier, plaque) sont prévus.
3. **Exécution par commandes** : la 005 la remplace par la pose réelle ; `BUILD_MODE=fast` reste un réglage du
   propriétaire pour les tests.
4. **Piège à monstres** : la hauteur de chute ≥ 24 dépasse la hauteur maximale de plan actuelle (16) : prévue dans
   `kind "farm"` (006).
5. **Blé / carottes / pommes de terre « 100 % automatiques »** : exigent un villageois ; la 007 livre melon,
   citrouille et canne à sucre en automatique complet, le blé en récolte automatique + replantation par le bot.
6. **Seuils** : tous les chiffres (budgets, marges, valeurs d'objets, seuils de retour) sont des valeurs de départ
   à calibrer avec `npm run trace-report`.

## Prochaine commande

`/speckit-tasks` pour la 001 (`.specify/feature.json` pointe vers `specs/001-resource-autonomy` ;
le repointer avec le dossier voulu avant chaque commande).
