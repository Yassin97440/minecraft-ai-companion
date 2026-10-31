# Contexte du projet (à lire en début de session)

## But

Un **compagnon Minecraft agentique** qui joue comme un vrai joueur (Mineflayer) et devient **quasi autonome, cohérent, capable de survivre sans aide** : miner, trouver de la nourriture, dormir, se protéger des monstres, farmer des ressources de base (charbon, pierre, fer…) sur demande, construire quelques structures.

C'est aussi un **projet d'apprentissage de l'IA agentique** pour le propriétaire du dépôt (dev depuis 6+ ans, beaucoup de Java, en formation sur l'agentique) : **LangGraph.js + LangChain en TypeScript**. Les choix doivent rester pédagogiques : préférer des patterns d'agents explicites et testables (graphe, tools, garde-fous, mémoire, évals) à de la magie. Quand on ajoute une fonctionnalité, expliquer le concept agentique derrière (voir « Concepts illustrés »).

Philosophie « entre-deux » : un LLM **improvisé et surprenant** (c'est ce qui rend le compagnon drôle), **encadré** par des garde-fous, des tools et une exécution **déterministe** pour ce qui ne doit pas être aléatoire (constructions en datapack, vérifications d'inventaire, politique de sécurité).

## Préférences de l'utilisateur

- Parle **français** (réponses, messages du bot, README, commentaires de prompts).
- Veut des **explications claires avec schémas** quand on aborde un mécanisme d'agent.
- **Coût** : éviter l'API Anthropic. OpenRouter d'abord (a aussi AI Studio), Ollama local plus tard (RTX 4060 8 Go).
- Teste lui-même en jeu et revient avec des retours concrets (logs de chat, console). Ne commite que quand il le demande.
- Windows 11 / PowerShell : voir « Lancer ».

## Stack et architecture

TypeScript ESM, Node 20+, `tsx`. Mineflayer 4.39 + mineflayer-pathfinder. LangGraph.js v1, LangChain (fournisseurs : OpenRouter via ChatOpenAI, Google, Ollama, Anthropic). Zod 4. Serveur Minecraft local 1.21.4 (offline-mode) dans `server/` (ignoré par git).

```
chat Minecraft → Mineflayer → graphe LangGraph → tools → Mineflayer → monde
START → (idle ? lubie : plan) ; plan → guard → act → plan …
                              plan ─(texte seul + demande d'action)→ nudge → plan
                              plan ─(texte seul + mission active)→ continue → plan
```

| Fichier | Rôle |
|---|---|
| `src/index.ts` | bot Mineflayer, file de messages, reprise de main (`STOP_WORDS`, `ctx.run.interrupted`), approbations oui/non, minuteur de lubies |
| `src/graph.ts` | graphe : `lubie`, `plan`, `guard`, `act`, `nudge`, `continue` ; anti-boucle (`failureStreak`), missions (`needsContinue`), plafonds d'étapes |
| `src/policy.ts` | **fonction pure** `checkToolCall` : allow / deny / approve ; allowlist du mode autonome (`IDLE_TOOLS`) ; blocs protégés ; zone `HOME_*` |
| `src/tools.ts` | tous les tools LangChain (voir README) ; chacun **vérifie le résultat réel** et le renvoie en texte |
| `src/world.ts` | `Ctx`, `snapshot()` (perception injectée à chaque décision), `lookAround`, `holeDepth`, `inventoryDiff` |
| `src/memory.ts` | `Journal` (historique brut) et `Memory` (mémoire durable par clé + mission en cours) |
| `src/prompts.ts` | prompt système (personnalité, STYLE, AGIR D'ABORD, MISSIONS, MÉMORISER, RÈGLES) |
| `src/llm.ts`, `src/config.ts` | fournisseurs/modèles, variables `.env` |
| `src/blueprints.ts`, `datapack/companion/` | constructions toutes faites (ferme à poules, cabane 10x15 avec sol en bois) |
| `src/construction.ts` | **langage de construction** : `PlanSchema`, `validatePlan` (listes fermées, bornes, coût, habitabilité par flood-fill), `planCommands`, `verifyGrid` ; tool `build_structure` (plan → validation → accord → exécution → vérification) |
| `src/trace.ts`, `src/trace-report.ts` | **observabilité** : `Tracer` enveloppe les modèles (`wrapModel`) et les tools (`wrapTools`) ; un JSONL par session dans `data/traces/` (prompt complet envoyé, réponse, tokens réels ou estimés, latence, résultat des tools, résumé par run) ; `npm run trace-report [--all]` agrège |
| `src/needs.ts`, `src/sources.ts` | **planificateur de besoins pur** (spec 001, tranche 1) : `planNeeds(item, count, inventaire, db)` -> étapes gather/craft/smelt/place_station, recettes de `minecraft-data`, tables fermées (sources, fonte, combustibles, hors périmètre), borne dure de nœuds ; tool `plan_needs` (lecture seule, dans `IDLE_TOOLS`). `src/obtain.ts` : **exécuteur borné** `obtainItem` (Actions injectées, budget 40 actions/3 échecs/8 min, vérification d'inventaire à chaque étape, interruption) ; tool `obtain_item` (hors `IDLE_TOOLS`). Fonte non implémentée (échec explicite) |
| `eval/` | **faux monde et scénarios rejouables** : `fake-world.ts` (état en mémoire), `fake-tools.ts` (mêmes noms/champs que les vrais tools, contrat testé ; tools mémoire/missions = les vrais), `scenarios.ts` + `checks.ts` (critères sur le résultat), `run.ts` (`npm run eval`, `-- --live` pour un vrai modèle) |
| `test/*.test.ts` | politique, graphe, mémoire, câblage fournisseurs — **modèles scriptés, sans réseau ni Minecraft** |

Conventions qui comptent :
- Un tool **ne dit jamais "fait" sans preuve** : il compare inventaire/position/état avant-après et le dit (`Inventaire réel: +12 cobblestone`, `Pas arrivé`). Les échecs commencent par un mot reconnu par `FAILURE` dans `graph.ts` (Échec, Impossible, Aucun, Pas arrivé…) pour alimenter l'anti-boucle : garder cette convention.
- `guard` n'a aucun effet de bord ; `act` exécute. Tout nouveau garde-fou = une règle dans `checkToolCall` + un test.
- Tout nouveau tool sans danger → l'ajouter à `IDLE_TOOLS` seulement s'il est inoffensif en mode autonome (lubies).
- Les tests injectent des modèles scriptés (`scripted(...)`) : toute logique de graphe doit être testable ainsi.
- Un nom de nœud ne doit pas égaler un canal d'état ; `resume` d'un `interrupt` ne doit pas être falsy (`{ approved }`).
- Datapack 1.21.x : dossier `function` au singulier ; le bot doit être op pour `/function`.

## Workflow par spécifications (Spec Kit)

Le projet utilise [GitHub Spec Kit](https://github.com/github/spec-kit) (CLI `specify` 1.2.5, intégration Claude, scripts PowerShell). Pour une fonctionnalité non triviale, partir d'une spec plutôt que du code :

1. `/speckit-constitution` : principes du projet (`.specify/memory/constitution.md`), à remplir une fois à partir des conventions ci-dessous.
2. `/speckit-specify` : décrire le QUOI et le POURQUOI (comportement attendu, scénarios, critères de réussite), pas le comment.
3. `/speckit-clarify` (optionnel) puis `/speckit-plan` : choix techniques (LangGraph, Mineflayer...), contrats, risques.
4. `/speckit-tasks` puis `/speckit-analyze` (optionnel) : tâches ordonnées et contrôle de cohérence.
5. `/speckit-implement` : exécution. `/speckit-converge` : comparer le code à la spec et ajouter le reste en tâches.

Fichiers : skills dans `.claude/skills/speckit-*`, modèles et scripts dans `.specify/`, specs générées dans `specs/`. Mettre à jour la CLI : `uv tool install --force specify-cli`. Si `specify` n'est pas dans le PATH : `$env:USERPROFILE\.local\bin\specify.exe`.

## État actuel (fait)

- Perception : `snapshot()` (position, vie, faim, heure, main, relief/trou, menaces, inventaire), `look_around`, `find_block`.
- Actions : déplacement, `collect_block`, `mine_tunnel` (tunnel/escalier avec arrêts de sécurité), `sleep_in_bed`, `dig_out`, `eat`, `equip_item`, craft, don, coffres (`chest_contents`, `store_in_chest`, `take_from_chest`), blueprints (accord oui/non).
- Débrouillardise : `place_block` (établi, torche, coffre...), `craft_item` pose son propre établi, `mine_tunnel` pose une torche tous les 6 pas, `pickup_items` ; à la mort, la position est mémorisée (`mort`) et l'agent est relancé pour récupérer ses affaires (< 5 min).
- Survie : `src/survival.ts` = **réflexes hors LLM** (`decideReflex` pure + superviseur 500 ms : lave/feu, gravier sur la tête, creeper, combat/fuite/abri selon l'équipement, manger) ; tools `fight`, `flee`, `take_shelter`, `gear_up` ; `collect_block`/`mine_tunnel` refusent les blocs dangereux (gravier au-dessus, lave/eau contre le bloc). Helpers partagés dans `src/actions.ts`.
- Contrôle : relance « agis, ne parle pas » (`nudge`), anti-boucle (rappel à 3 échecs d'affilée, arrêt à 6), plafonds d'étapes, 429 géré proprement.
- Mémoire : `Memory` durable (`data/memory.json`) alimentée automatiquement (lit, coffres, entrée de mine) et par `remember`/`forget` ; `Journal` brut.
- Missions : `start_mission` / `mission_progress` / `end_mission`, boucle `continue` (mode chat uniquement), reprise de main par le joueur.
- 103 tests verts (dont eval, needs, obtain), 14 scénarios `npm run eval` ; `--live` (Haiku 5.5, 4 runs) : 4/9 puis 7-8/9 après correction de critères trop stricts, résultats variables d'un run à l'autre (`npm test`), typecheck vert. Fiabilisation : entrées de mémoire épinglées (`mort`, `lit`, `mine`, `base`), mort persistée avec expiration 5 min (`Memory.pendingDeath`), mission expirée après 30 min sans progrès, file d'instructions bornée (`src/instructions.ts`), une seule relance de mission par épisode de danger.

**Non vérifié en jeu** : la plupart des tools Mineflayer (coffres, tunnel, sommeil, `dig_out`), la boucle de mission avec un vrai modèle, le comportement quand le modèle oublie `end_mission` (une mission "fantôme" relancerait le bot à chaque message).

## Problèmes connus

- **Qualité du modèle** : les petits modèles (gpt-oss-20b) hallucinent et bavardent ; un modèle plus gros avec bon tool calling change tout. Le 429 OpenRouter vient du pool partagé du fournisseur (clé BYOK Google ou provider `google` direct pour le contourner).
- **Coût en requêtes** : un tour = 1 requête LLM par tool appelé (jusqu'à 12, 60 en mission), chaque requête renvoie prompt + ~25 schémas de tools + historique (≤ 40 messages). Mesurable via `npm run trace-report` (pas encore mesuré en jeu).
- Fin de mission **dépend du modèle** (pas de filet en code).
- Les lubies (sortie structurée) échouent parfois avec les petits modèles (géré : on saute).
- L'historique du graphe est en RAM (`MemorySaver`) et tronqué à 40 messages ; seule `Memory`/`Journal` survivent au redémarrage.
- `collect_block` laisse le pathfinder creuser en ligne droite vers le minerai (peut sembler « vertical »).
- Console serveur Windows : accents/emoji mal encodés (affichage seulement).

## Feuille de route (vers l'autonomie)

Chaque étape est aussi un exercice d'agentique ; garder le même découpage : **concept → implémentation → test scripté → test en jeu**.

1. **Fiabiliser l'existant** (prochaine session probable)
   - Filet de sécurité des missions en code : `stop`/`laisse tomber`/`annule` abandonne la mission ; expiration d'une mission inactive.
   - **Observabilité** : *première version faite* (`src/trace.ts`, voir tableau) : tokens/latence/prompts par appel et par run. Reste : l'utiliser en jeu pour mesurer le coût réel d'un tour, puis éventuellement LangSmith. Mesurer avant d'optimiser.
   - Valider en jeu chaque tool et corriger ce qui casse. Commiter par petits lots.
2. **Couche de réflexes déterministes (survie)** — *première version faite, à valider en jeu*
   - Fait : superviseur 500 ms (lave/feu, gravier sur la tête, monstres → combat/fuite/abri, faim), creusage prudent, combat, abri.
   - Reste : chasse pour la nourriture, réflexe « nuit » (aller dormir/s'abriter), chute dans le vide, noyade, projectiles (squelettes : se mettre à couvert), armes à distance, retour à la base, calibrage des seuils en jeu, tests d'intégration avec un faux bot.
3. **Autonomie dirigée par objectifs**
   - Un **générateur d'objectifs** de survie (arbre technologique : bois → outils en bois → pierre → nourriture → abri → fer…) qui crée des missions seul quand le joueur ne demande rien, avec budget et garde-fous. Remplace/complète les « lubies » pour la progression ; les lubies restent la couche d'humour.
   - Planification explicite : nœud *planificateur* qui décompose, nœud *exécuteur*, éventuellement un *critique* qui vérifie l'objectif (sous-graphes LangGraph).
4. **Mémoire plus riche**
   - Réflexion de fin de tour (petit appel LLM : « qu'ai-je appris qui vaut la peine d'être gardé ? »), résumé de l'historique au lieu de la troncature, rappel sélectif plutôt que tout injecter, checkpointer persistant (SQLite) pour reprendre une conversation.
5. **Modèles et coûts**
   - Routeur de modèles (petit pour les actions simples, gros pour la planification), `withFallbacks` contre les 429, essais Ollama (qwen/llama 4–8 B quantifiés), température par rôle (basse pour l'agent, haute pour les lubies).
   - Réduire le prompt : n'exposer que les tools utiles au contexte.
6. **Évaluation** (le chaînon manquant de la plupart des projets d'agents)
   - Scénarios rejouables (transcript → comportement attendu), faux monde minimal pour tester les tools sans serveur, LLM-as-judge pour la cohérence, jeu de régression de prompts.
7. **Contenu**
   - Évolutions de `build_structure` : exécuteur « légitime » (poser les blocs un par un avec Mineflayer, sans triche), fondations/terrassement automatiques, import de schematics, boucle de critique après construction (le LLM relit le résultat et corrige).
   - Farm de ressources en boucle, stockage automatique.

## Concepts d'agentique illustrés par le projet

Graphe d'état et conditional edges ; boucle ReAct (plan → tool → observation) ; garde-fous séparés de l'exécution et human-in-the-loop (`interrupt`/`Command`) ; **vérification des effets** plutôt que confiance dans le texte du modèle ; injection de dépendances pour tester sans LLM ; mémoire à plusieurs échelles (contexte, journal, mémoire structurée) ; boucles bornées et détection de blocage ; mode autonome avec allowlist ; multi-fournisseur LLM.

## Lancer

```
# PowerShell, ex. si node/npm absents du PATH du terminal :
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' install
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' start     # le bot (serveur lancé avant : server\start.cmd)
```

- **Datapack** : le serveur lit une *copie* dans `server/world/datapacks/companion`. Après toute modification de `datapack/`, lancer `npm run sync-datapack` puis taper `reload` dans la console du serveur (sinon `run_blueprint` échoue avec "rien n'a été construit" ; la réponse du serveur est maintenant incluse dans l'erreur).
- Les scripts `.ps1` sont bloqués par la politique d'exécution : utiliser `.cmd` / `npm.cmd`.
- Ctrl-C peut échouer dans l'onglet du bot : fermer l'onglet, ou tuer le processus précis (jamais tous les `node` sans regarder).
- Serveur : `server/start.cmd` (JDK 21 portable, 1.21.4, offline). Dans la console serveur : `op Compagnon` et `op <pseudo>`.
- `.env` contient les clés : ne jamais les afficher ni les commiter (`.env` est ignoré par git ; `.env.example` sert de modèle). Joueur autorisé à donner des ordres : `OWNER_USERNAME` (insensible à la casse).
- Le client Minecraft doit être en **1.21.4** (installation dédiée dans le launcher).
