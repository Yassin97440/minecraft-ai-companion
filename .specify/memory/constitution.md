<!--
Sync Impact Report (scratch, à retirer avant de commiter)
- Version : (modèle vide) -> 1.0.0 (première ratification)
- Principes ajoutés : I. Vérifier les effets ; II. Garde-fous déterministes ;
  III. Déterminisme là où il le faut, improvisation ailleurs ; IV. Testable sans Minecraft ;
  V. Boucles bornées et interruptibles ; VI. Mémoire honnête et secrets protégés ;
  VII. Simplicité pédagogique
- Sections ajoutées : Contraintes techniques et de sécurité ; Workflow de développement
- Sections retirées : aucune
- TODO différés : aucun
-->
# Minecraft Companion Constitution

Un compagnon Minecraft agentique (LangGraph.js + Mineflayer) qui devient quasi autonome et capable de
survivre seul, et qui sert de terrain d'apprentissage à l'IA agentique. Ces principes gouvernent toutes
les spécifications, tous les plans et tout le code du projet.

## Core Principles

### I. Vérifier les effets, ne jamais croire le texte du modèle
Un tool qui agit sur le monde MUST mesurer ce qui s'est réellement passé (inventaire avant/après,
position atteinte, bloc effectivement posé, vie, faim) et le renvoyer en texte. Un échec MUST commencer
par un mot reconnu par la détection d'échec (`Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux
manquants`...) pour alimenter l'anti-boucle. L'agent ne MUST JAMAIS affirmer avoir fait une action sans
résultat de tool qui le prouve.
*Raison : les LLM hallucinent des succès ; seule la mesure du monde fait foi.*

### II. Des garde-fous déterministes, séparés de l'exécution
Toute décision d'autorisation (autoriser, refuser, demander l'accord du joueur) MUST vivre dans une
fonction pure et testable (`checkToolCall`), sans effet de bord. Une action irréversible, coûteuse ou
destructrice (construction, abri, combat) MUST demander l'accord du joueur ou être bornée par une règle
explicite. Toute valeur provenant du modèle qui finit dans une commande Minecraft MUST être validée par
une liste fermée ou un schéma (jamais de texte libre injecté). Le mode autonome MUST rester limité à une
allowlist de tools inoffensifs. Seul le joueur propriétaire (`OWNER_USERNAME`) donne des ordres.
*Raison : le modèle propose, le code dispose.*

### III. Déterministe là où l'aléatoire est interdit, improvisé ailleurs
Le LLM choisit le QUOI et le QUAND ; le code déterministe fait le COMMENT dès que l'erreur coûte cher
(constructions, paiement des matériaux, vérification d'habitabilité). Les réactions vitales (lave, gravier
sur la tête, monstres, faim) MUST être des réflexes hors LLM, car un appel de modèle met plusieurs
secondes. L'humour et l'imprévisible (personnalité, lubies) sont voulus mais MUST rester bornés par les
principes I et II.
*Raison : c'est le compromis « entre-deux » du projet : surprenant mais jamais dangereux.*

### IV. Testable sans Minecraft ni réseau (NON-NEGOTIABLE)
Toute logique de décision (politique, graphe, validateur, réflexes, parsing) MUST être une fonction
testable avec des modèles scriptés, sans serveur ni appel LLM. Toute nouvelle règle ou nouveau validateur
MUST arriver avec ses tests. `npm run typecheck` et `npm test` MUST être verts avant tout commit. Ce qui
ne peut être vérifié qu'en jeu MUST être déclaré « non vérifié en jeu » dans la spec ou `CLAUDE.md`,
avec un scénario de test manuel.
*Raison : une boucle de feedback rapide et honnête sur ce qui marche vraiment.*

### V. Boucles bornées et interruptibles
Toute boucle (étapes de l'agent, missions, relances, réessais, déplacements, attentes) MUST avoir une
borne explicite : plafond d'étapes, nombre d'échecs d'affilée, délai d'expiration. Le joueur MUST pouvoir
reprendre la main à tout moment (message, `stop`) et les tools longs MUST s'interrompre rapidement. Le
coût en requêtes LLM est une contrainte de conception : un tour MUST rester raisonnable en appels et en
tokens, et toute nouvelle boucle MUST dire combien de requêtes elle peut consommer au maximum.
*Raison : éviter les boucles infinies, les rate limits (429) et les factures.*

### VI. Mémoire honnête, secrets protégés
La mémoire durable (`data/memory.json`) est structurée, dédupliquée par clé et ne contient que ce qui
servira plus tard (lieux, préférences, faits, mission) ; le journal est l'historique brut. L'agent MUST
s'appuyer sur la mémoire, l'état du monde et les résultats de tools, et ne MUST PAS inventer de souvenirs.
Les clés d'API et le `.env` MUST NEVER être affichés, journalisés, mémorisés ni commités.
*Raison : un agent fiable sait ce qu'il sait ; un dépôt public ne fuit rien.*

### VII. Simplicité et valeur pédagogique
Chaque fonctionnalité MUST illustrer un pattern d'agent explicite (graphe, tool, garde-fou, mémoire,
évaluation) et être expliquée par le concept qu'elle met en œuvre. Préférer la solution la plus simple qui
fonctionne (YAGNI) ; toute complexité ajoutée MUST être justifiée (voir Governance). Tout texte destiné
au joueur (chat, README, prompts) est en français.
*Raison : le projet sert d'abord à apprendre l'agentique de façon durable.*

## Contraintes techniques et de sécurité

- **Pile** : TypeScript (ESM, Node 20+), Mineflayer + mineflayer-pathfinder, LangGraph.js v1, LangChain,
  Zod. Multi-fournisseurs LLM (OpenRouter, Google, Ollama, Anthropic) : le code MUST NOT dépendre d'un
  fournisseur unique ; l'API Anthropic est optionnelle (contrainte de coût).
- **Serveur** : Minecraft Java 1.21.4 local en `online-mode=false`, bot opérateur. Ce montage MUST NOT être
  exposé en ligne tel quel.
- **Datapack** : le serveur lit une copie ; toute modification de `datapack/` MUST être suivie de
  `npm run sync-datapack` puis `reload`. Les coûts du datapack et de `src/blueprints.ts` MUST rester
  synchronisés.
- **Zones protégées** : coffres, fours, lits, établis, spawners et la zone `HOME_*` MUST NOT être détruits
  par le bot.
- **Plateforme** : Windows / PowerShell en premier (scripts `.cmd`, `npm.cmd`) ; aucune modification de la
  politique d'exécution ou des paramètres de sécurité du système.
- **Observabilité** : les réflexes, erreurs et événements importants MUST être journalisés ; les erreurs
  fournisseur (429) MUST produire un message clair au joueur plutôt qu'un plantage.

## Workflow de développement

- Toute fonctionnalité non triviale suit le cycle Spec Kit : constitution -> `/speckit-specify` ->
  (`/speckit-clarify`) -> `/speckit-plan` -> `/speckit-tasks` -> (`/speckit-analyze`) -> `/speckit-implement`
  -> `/speckit-converge`. La spec décrit le QUOI et le POURQUOI avec des scénarios d'acceptation testables ;
  le plan contient un « Constitution Check » contre les sept principes.
- Chaque spec MUST inclure ses scénarios de test en jeu pour ce qui n'est pas testable automatiquement.
- Une fonctionnalité n'est terminée que lorsque `npm run typecheck` et `npm test` passent, que le README
  et `CLAUDE.md` sont à jour, et que l'état « vérifié / non vérifié en jeu » est écrit.
- Commits petits et ciblés, faits uniquement à la demande du propriétaire du dépôt.

## Governance

Cette constitution prime sur les autres pratiques du dépôt. Une modification passe par
`/speckit-constitution`, avec une justification, et incrémente la version : MAJOR pour la suppression ou la
redéfinition incompatible d'un principe, MINOR pour un principe ou une section ajouté ou nettement élargi,
PATCH pour une clarification. La conformité est vérifiée à chaque `/speckit-plan` (Constitution Check) et
à chaque `/speckit-analyze` ; une entorse MUST être justifiée dans la table « Complexity Tracking » du plan,
avec l'alternative plus simple écartée. `CLAUDE.md` porte le contexte et les conventions du quotidien.

**Version**: 1.0.0 | **Ratified**: 2026-10-30 | **Last Amended**: 2026-10-30
