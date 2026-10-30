# Minecraft Companion

Un compagnon Minecraft **agentique** : cerveau LangGraph.js + un LLM au choix, corps Mineflayer, constructions déterministes en datapack.

Première version : il mine, récolte du charbon, de la pierre ou du bois sur demande, mange, dort la nuit, sort d'un trou et construit quelques structures.

## Comment il pense

Le modèle ne voit ni image ni 3D : à chaque décision il reçoit **du texte** (règles, état du monde, journal, derniers messages) et répond en **appelant des tools**. Le résultat du tool revient en texte, et la boucle continue.

```mermaid
flowchart LR
    W[Monde Minecraft] --> B[Mineflayer<br/>le corps du bot]
    B --> S["snapshot()<br/>texte de l'état"]
    S --> P[Prompt<br/>règles + monde + journal<br/>+ derniers messages]
    P --> L{{LLM}}
    L -->|appel de tool| G[guard<br/>autorise / refuse / demande]
    G --> A[act<br/>Mineflayer exécute]
    A -->|résultat en texte| P
    A -.agit sur.-> W
    L -->|plus de tool| E([fin du tour])
```

Le graphe LangGraph (`src/graph.ts`) :

```mermaid
flowchart TD
    START --> M{mode ?}
    M -->|autonome| LU[lubie<br/>idée farfelue filtrée]
    M -->|chat| PL[plan<br/>le LLM décide]
    LU --> PL
    PL -->|tool_calls| GU[guard<br/>policy pure + pause oui/non]
    PL -->|texte seul + demande d'action| NU[nudge<br/>rappel : agis, ne parle pas]
    PL -->|texte seul + mission active| CO[continue<br/>rappel : poursuis la mission]
    PL -->|texte seul| END
    NU --> PL
    CO --> PL
    GU --> AC[act<br/>exécute les tools]
    AC -->|< 12 étapes| PL
    AC -->|plafond atteint| END
```

- **plan** : le LLM décide et appelle des tools.
- **guard** : politique pure (`src/policy.ts`), sans effet de bord. Autorise, refuse, ou **met le graphe en pause** (`interrupt`) pour demander "oui/non" au joueur.
- **act** : exécute les tools autorisés, renvoie les refus au modèle comme `ToolMessage` d'erreur.
- **nudge** : si tu demandes une action ("mine", "va", "dors"...) et que le modèle se contente de répondre en texte, il est relancé **une fois** pour qu'il agisse vraiment.
- **Missions** : pour une consigne en plusieurs étapes ("trouve du fer, du diamant et de la redstone"), le modèle appelle `start_mission` avec des objectifs. Tant que la mission est active, un jalon annoncé en texte ne termine plus le tour : le nœud `continue` le relance. Il coche les objectifs avec `mission_progress` et conclut avec `end_mission`. Garde-fous : seulement en mode chat (jamais pour les lubies), 2 relances d'affilée sans tool au maximum, plafond de `missionSteps` (60) étapes par tour, arrêt après 6 échecs d'affilée, et le joueur reprend la main à tout moment (un message pendant une mission, ou `stop` / `attends` / `viens`, coupe l'action en cours).
- **Anti-boucle** : après 3 échecs de tools d'affilée, un rappel lui demande d'abandonner la tâche, d'expliquer ce qui bloque et de proposer une alternative ; après 6, le tour s'arrête. Un succès remet le compteur à zéro. Le prompt précise aussi que le dernier message du joueur prime sur la tâche en cours.
- **lubie** : quand tu n'as rien demandé depuis `IDLE_AFTER_SECONDS`, un modèle invente une idée ; elle est écartée si `risk = high`, puis exécutée avec une **allowlist réduite** de tools.
- **Constructions** : `run_blueprint` vérifie l'inventaire, le datapack le revérifie, retire les matériaux (`clear`), puis place la structure. Le LLM choisit *quoi/quand/où*, jamais *comment*.

## Ce qu'il voit

| Source | Contenu |
|---|---|
| `snapshot()` (injecté à chaque décision) | position, vie, faim, jour/nuit, objet en main, relief (suis-je dans un trou ?), menaces, joueurs, inventaire |
| `look_around` | lits, coffres, établis, minerais, arbres, lave/eau, animaux, menaces, objets au sol dans un rayon de 4 à 32 blocs |
| `find_block` | coordonnées des blocs les plus proches d'un type (nom exact ou partiel : `coal_ore`, `bed`, `log`) |

Il **ne voit pas** les blocs un par un : s'il ne regarde pas autour de lui (`look_around`, `find_block`), il ne sait pas ce qui l'entoure.

## Sa mémoire

```mermaid
flowchart TB
    subgraph chaque décision
        R["Personnalité + règles<br/>fixe, dans le code"]
        S["État du monde<br/>recalculé, jamais gardé"]
        J["Journal<br/>data/journal.json, 200 entrées"]
        H["Historique de conversation<br/>RAM, ~40 derniers messages"]
    end
    R --> LLM{{LLM}}
    S --> LLM
    J --> LLM
    H --> LLM
```

| Couche | Durée | Contenu |
|---|---|---|
| Règles et personnalité | permanente (code) | `src/prompts.ts`, `PERSONALITY` |
| État du monde | un tour | `snapshot()` |
| Mémoire durable | disque, survit au redémarrage | lieux, préférences, faits, mission en cours |
| Journal | disque, survit au redémarrage | tes messages, lubies, constructions, tunnels creusés |
| Historique | RAM, perdu au redémarrage | derniers messages et résultats de tools |

**Mémoire durable** (`data/memory.json`, `src/memory.ts`) : des entrées dédupliquées par clé (lieux, préférences, faits) et la mission en cours, relues à chaque décision. Elle s'alimente de deux façons :
- **automatiquement** : le lit utilisé, chaque coffre ouvert (avec son contenu) et l'entrée de la mine sont notés par les tools eux-mêmes ;
- **par le modèle** : `remember` (clé, type, texte, coordonnées optionnelles) pour tout ce qui servira plus tard (un gisement, la base, une règle du joueur), `forget` pour corriger.

Le journal (`data/journal.json`) reste l'historique brut des événements.

## Les tools

| Tool | Rôle | Vérifie le résultat réel |
|---|---|---|
| `say` | parler dans le chat | – |
| `get_status`, `look_around`, `find_block` | percevoir | – |
| `go_to_player`, `go_to` | se déplacer | distance restante ("Arrivé" ou "Pas arrivé") |
| `collect_block` | miner/couper un type de bloc | différence d'inventaire |
| `mine_tunnel` | tunnel ou escalier descendant à la pioche, ramasse les minerais voisins | différence d'inventaire, raison d'arrêt (lave, eau, vide, monstre, vie basse) |
| `fight`, `flee`, `take_shelter`, `gear_up` | combattre, fuir, s'abriter, s'équiper (aussi déclenchés par les réflexes) | vie avant/après, monstres éliminés, blocs d'abri réellement posés |
| `place_block` | poser établi, four, coffre, torche, bloc (devant lui ou à des coordonnées) | case réellement occupée par le bloc ensuite |
| `pickup_items` | ramasser les objets au sol (après une mort, des drops) | différence d'inventaire |
| `sleep_in_bed` | aller dormir (nuit ou orage) | `bot.isSleeping` |
| `dig_out` | sortir d'un trou ou d'une mine | profondeur avant/après |
| `eat` | manger la meilleure nourriture | niveau de faim avant/après |
| `equip_item` | main ou armure | slot réellement équipé |
| `chest_contents`, `store_in_chest`, `take_from_chest` | lister, déposer (`*` = toutes les ressources), prendre (64 max) | contenu du coffre, différence d'inventaire |
| `craft_item`, `give_to_player` | fabriquer, donner | différence d'inventaire |
| `build_structure` | construire librement à partir d'un plan composé par le modèle (voir « Construire librement ») | plan validé avant, puis blocs réellement posés comparés au plan |
| `list_blueprints`, `run_blueprint` | constructions (accord oui/non) | matériaux consommés |
| `remember`, `forget` | mémoire durable (lieux, préférences, faits) | – |
| `start_mission`, `mission_progress`, `end_mission` | consignes longues, suivies jusqu'au bout | objectifs cochés selon l'inventaire réel |
| `emote`, `wander` | animations, balade | – |

Garde-fous (`src/policy.ts`) : blocs protégés (coffres, fours, lits...), zone `HOME_*` intouchable, longueur de tunnel plafonnée, mode autonome limité à une allowlist, seul `OWNER_USERNAME` donne des ordres.

## Instinct de survie

Un LLM met plusieurs secondes à décider ; la lave, un creeper ou du gravier sur la tête n'attendent pas. Une **couche de réflexes déterministes, hors LLM** (`src/survival.ts`) surveille le bot toutes les 500 ms :

```
état du bot (vie, faim, lave, feu, tête bloquée, monstres, arme, nourriture, blocs)
   → decideReflex (fonction pure, testée)
        lave / feu            → escape_fire  : va à la case sûre la plus proche (eau si on brûle)
        bloc sur la tête      → clear_head   : casse le gravier qui l'écrase
        creeper à < 7 blocs   → flee
        monstre à < 7 blocs   → fight (armé, vie ≥ 8, ≤ 3 monstres) | shelter (13 blocs) | flee
        vie ≤ 6               → flee | shelter (jamais de combat)
        faim ≤ 10, calme      → eat
   → coupe la tâche en cours de l'agent, exécute, journalise, puis relance la mission si besoin
```

- **Creuser sans danger** : `collect_block` et `mine_tunnel` refusent de casser un bloc sous du gravier/sable (éboulement), ou touchant de la lave/de l'eau, et le disent.
- **Combat** : `fight` équipe la meilleure arme, l'armure et le bouclier (`gear_up`), attaque avec le bon délai, ne cible jamais joueurs ni animaux, et se retire si la vie tombe à 6.
- **Abri** : `take_shelter` pose 13 blocs autour de lui (4 côtés sur 2 de haut, puis un toit).
- Les mêmes actions sont des tools que l'agent peut choisir (`fight`, `flee`, `take_shelter`, `gear_up`, `eat`) ; les réflexes ne sont que le filet de sécurité.

## Construire librement

Plutôt qu'un blueprint par bâtiment, le modèle **compose un plan** avec un petit langage (`src/construction.ts`) et du code déterministe fait le reste :

```
demande → LLM écrit un plan (JSON : box / block / door / clear, coordonnées relatives)
        → validateur : listes fermées, bornes, coût, "est-ce habitable ?"
             ├─ erreurs → renvoyées au LLM, qui corrige (générer → valider → réparer)
             └─ OK → résumé + coût → accord du joueur (oui/non)
        → exécution (commandes /fill, /setblock, bot op)
        → vérification : blocs réellement posés comparés au plan (% conforme)
```

- **Repère** : x = est, z = sud, y = haut ; y=0 le sol du bot, y=-1 le sol posé ; origine 2 blocs à l'est et au sud du bot.
- **Habitabilité** (bâtiments, `kind: "shelter"`) : flood-fill depuis l'extérieur (un toit troué se voit), 2 blocs de haut libres au-dessus d'un sol plein, une porte qui relie vraiment l'extérieur à l'intérieur (et bien orientée), torches murales accrochées à un mur. `kind: "decor"` saute ces contrôles (enclos, tours, ponts).
- **Limites** : 40 étapes, 2 500 blocs, 24x24x16, blocs d'une liste fermée (planches, bûches, pierres, escaliers, dalles, clôtures, murets, verre, torches...).
- **Exécution** : si le serveur est local (`WORLD_DIR`, par défaut `server/world`), le plan est écrit dans un fichier de fonction puis lancé avec `/reload` + `/function` (quelques secondes). Sinon, une commande de chat par seconde (le serveur expulse pour spam au-delà).
- Les blueprints du datapack (`cabin`, `chicken_farm`) restent utiles : l'exécution y est 100 % déterministe.

## Installation

1. **Node.js 20+** (`node -v`).
2. `npm install`
3. `cp .env.example .env` puis choisis ton fournisseur (voir « Choisir le modèle »), et idéalement `OWNER_USERNAME` (ton pseudo).
4. **Serveur Minecraft Java** local (jar vanilla ou Paper), dans `server.properties` : `online-mode=false`.
   Le bot se connecte en mode offline ; ne mets pas ce serveur en ligne tel quel.
5. Installe le datapack : `npm run sync-datapack` (copie `datapack/companion/` dans `server/world/datapacks/`, ou `WORLD_DIR=<monde>`), puis `reload` dans la console du serveur. **À refaire à chaque modification du dossier `datapack/`** : le serveur utilise une copie, pas le dépôt.
6. Dans la console du serveur : `op Compagnon` (le bot a besoin du niveau op pour lancer `/function`).
7. `npm start`, puis parle dans le chat.

Versions : Mineflayer 4.39 gère jusqu'à Minecraft 26.1. Le `pack.mcmeta` vise large (`pack_format` 48 + plage) ; si le jeu signale le pack comme incompatible, ajuste ses numéros de format pour ta version.

## Choisir le modèle

Dans `.env` : `LLM_PROVIDER` + `COMPANION_MODEL` (+ la clé du fournisseur).

| Fournisseur | `LLM_PROVIDER` | Clé | Remarque |
|---|---|---|---|
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | un seul compte, beaucoup de modèles |
| Google AI Studio | `google` | `GOOGLE_API_KEY` | modèles Gemini |
| Ollama (local) | `ollama` | aucune | le modèle doit supporter les **tools** |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | optionnel |

**Le modèle compte beaucoup.** Un agent enchaîne plusieurs appels de tools, lit leurs résultats et corrige le tir : les petits modèles (≈ 20 milliards de paramètres ou moins) inventent, bavardent au lieu d'agir et se contredisent. Vise un modèle réputé pour le *tool calling* (par exemple `google/gemini-2.5-flash` sur OpenRouter) ; garde le petit modèle pour `COMPANION_IDLE_MODEL` (les lubies).

`LLM_TEMPERATURE=0.4` donne un comportement plus sage que 0.7.

**Local avec Ollama** : `ollama pull <modele>`, puis `LLM_PROVIDER=ollama`. Minecraft partage ta carte graphique : garde de la marge de VRAM
(avec 8 Go, vise un modèle de 4 à 8 milliards de paramètres, plutôt quantifié) et attends-toi à plus d'erreurs de tools.
Les `<think>…</think>` des modèles à raisonnement sont retirés des messages relayés dans le chat.

## Essayer

- `viens ici`, `mine ici` / `mine avec ta pioche`, `va chercher du charbon`, `récolte 20 pierres`
- `regarde autour de toi`, `où est le lit ?`, `mange`, `sors du trou`
- `qu'y a-t-il dans le coffre ?`, `range tes ressources dans le coffre`, `prends 10 charbons dans le coffre`
- La nuit : `viens dormir` (il va au lit le plus proche ; la nuit ne passe que si tous les joueurs dorment)
- `construis une ferme à poules` : il liste les matériaux, les récolte, te demande "je la mets ici ?", puis construit.
- Ne dis rien pendant 90 s : il improvise.

## Ajouter un tool / une construction

- **Tool** : ajoute un `tool({...})` dans `src/tools.ts` (schéma zod) qui **vérifie ce qui s'est vraiment passé** et le dit dans son résultat. S'il est inoffensif, ajoute son nom à `IDLE_TOOLS` dans `src/policy.ts`.
- **Garde-fou** : une règle de plus dans `checkToolCall` (`src/policy.ts`), testable sans Minecraft.
- **Construction** : une entrée dans `src/blueprints.ts` + deux fichiers dans `datapack/companion/data/companion/function/` (`build/x.mcfunction` pour vérifier et payer, `internal/x_place.mcfunction` pour placer). Garde les coûts synchronisés.

## Tests

```
npm run typecheck
npm test
```

Les tests couvrent la politique, le graphe (pause humaine, refus, allowlist autonome, plafond d'étapes, relance "agis") et le câblage des fournisseurs, avec des modèles scriptés : pas de réseau, pas de serveur. Les tools Mineflayer eux-mêmes se testent en jeu.

## Pistes

- Réflexion de fin de tour : un petit appel LLM qui relit le tour et décide quoi mémoriser (aujourd'hui c'est le modèle qui appelle `remember` de lui-même).
- Survie : se mettre à l'abri des monstres (`take_shelter`), chasser pour manger, combattre.
- Poser des torches dans les tunnels, stocker dans un coffre.
- Animation de construction bloc par bloc (`schedule function`), plus de blueprints.
- Persistance du checkpointer (SQLite) pour reprendre une conversation après redémarrage.
