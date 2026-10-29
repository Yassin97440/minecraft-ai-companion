# Minecraft Companion

Un compagnon Minecraft **agentique** : cerveau LangGraph.js + Claude, corps Mineflayer, constructions déterministes en datapack.

```
chat Minecraft ─► Mineflayer (bot joueur) ─► graphe LangGraph
                                               │
      START ─► [lubie]* ─► plan ─► guard ─► act ─┐   *mode autonome seulement
                            ▲                     │
                            └─────────────────────┘
                                               │ tools
                              ┌────────────────┴───────────────┐
                        Mineflayer (marcher,             /function companion:build/...
                        miner, crafter, emotes)          (datapack : exécution déterministe)
```

- **plan** : le LLM décide et appelle des tools.
- **guard** : politique pure (`src/policy.ts`), sans effet de bord. Refuse, autorise, ou **met le graphe en pause** (`interrupt`) pour demander "oui/non" au joueur.
- **act** : exécute les tools autorisés, renvoie les refus au modèle comme `ToolMessage` d'erreur.
- **lubie** : quand tu n'as rien demandé depuis `IDLE_AFTER_SECONDS`, un petit modèle invente une idée farfelue ; elle est écartée si `risk = high`, puis le compagnon l'exécute avec une **allowlist réduite** de tools.
- **Constructions** : `run_blueprint` vérifie l'inventaire (TS), le datapack le revérifie, retire les matériaux (`clear`), puis place la structure. Le LLM choisit *quoi/quand/où*, jamais *comment*.

## Installation

1. **Node.js 20+** (`node -v`).
2. `npm install`
3. `cp .env.example .env` puis choisis ton fournisseur (voir « Choisir le modèle »), et idéalement `OWNER_USERNAME` (ton pseudo).
4. **Serveur Minecraft Java** local (jar vanilla ou Paper), dans `server.properties` : `online-mode=false`.
   Le bot se connecte en mode offline ; ne mets pas ce serveur en ligne tel quel.
5. Copie `datapack/companion/` dans `<monde>/datapacks/`, puis `/reload` en jeu.
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

Le mode autonome peut utiliser un modèle plus petit via `COMPANION_IDLE_MODEL`.

**Local avec Ollama** : `ollama pull <modele>`, puis `LLM_PROVIDER=ollama`. Minecraft partage ta carte graphique : garde de la marge de VRAM
(avec 8 Go, vise un modèle de 4 à 8 milliards de paramètres, plutôt quantifié). Les petits modèles ratent plus souvent les appels de tools
et la sortie structurée des lubies : le code saute alors la lubie ou renvoie l'erreur au modèle au lieu de planter. Les `<think>…</think>`
des modèles à raisonnement sont retirés des messages relayés dans le chat.

## Essayer

- `viens ici`, `va couper 10 bûches`, `fabrique des planches`
- `construis une ferme à poules` : il liste les matériaux, les récolte/craft, te demande "je la mets ici ?", puis construit.
- Ne dis rien pendant 90 s : il improvise.

## Ajouter un tool / une construction

- **Tool** : ajoute un `tool({...})` dans `src/tools.ts` (schéma zod). S'il est inoffensif, ajoute son nom à `IDLE_TOOLS` dans `src/policy.ts`.
- **Garde-fou** : une règle de plus dans `checkToolCall` (`src/policy.ts`), testable sans Minecraft.
- **Construction** : une entrée dans `src/blueprints.ts` + deux fichiers dans `datapack/companion/data/companion/function/` (`build/x.mcfunction` pour vérifier et payer, `internal/x_place.mcfunction` pour placer). Garde les coûts synchronisés.

## Tests

```
npm run typecheck
npm test
```

Les tests couvrent la politique et le graphe (pause humaine, refus, allowlist autonome, plafond d'étapes) avec des modèles scriptés : pas de réseau, pas de serveur.

## Pistes

- Animation de construction bloc par bloc (`schedule function`).
- Plus de blueprints (ferme à mobs, ferme de blé) ; orientation selon le regard du bot.
- Persistance du checkpointer (SQLite) pour reprendre une conversation après redémarrage.
- Un outil `attack_nearest` avec approbation pour les créatures nommées ou apprivoisées.
