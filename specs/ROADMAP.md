# Périmètre global du compagnon autonome — découpage en spécifications

**Créé** : 2026-10-30 · **Statut** : Brouillon de cadrage

Ce document découpe « tout ce que doit savoir faire le compagnon » en capacités indépendantes. Chaque
capacité aura sa propre spec (`/speckit-specify`), puis son plan, ses tâches et son implémentation. Il décrit
le QUOI et l'ORDRE, pas le comment.

## Vision

Un joueur-compagnon qui, laissé seul dans un monde survie, **se débrouille de bout en bout** : il comprend
ce dont il a besoin, va le chercher, le fabrique, se nourrit, se défend, s'abrite, puis bâtit et automatise.
Il reste surprenant (personnalité, lubies) mais jamais dangereux ni bloqué, et le joueur peut reprendre la
main à tout instant (constitution, principes III et V).

## Les capacités (une spec chacune)

| # | Capacité | Ce que ça apporte | Dépend de | Statut |
|---|----------|-------------------|-----------|--------|
| 001 | **Autonomie en ressources** : comprendre un besoin, en déduire les ressources manquantes, les récolter, les fabriquer | Fondation de tout le reste : « je veux une pioche en fer » devient un plan exécutable | existant (tools de base) | **Spécifiée + planifiée** : `001-resource-autonomy` |
| 002 | **Alimentation** : chasse, élevage, culture, cuisson, gestion du stock de nourriture | Survivre durablement sans intervention humaine | 001 | **Spécifiée + planifiée** : `002-food-autonomy` |
| 003 | **Combat et défense** : armes/armures, tactiques par type de monstre, projectiles, nuit, abri, soins | Survivre aux menaces au lieu de seulement les fuir | 001 (équipement) | **Spécifiée + planifiée** : `003-combat-defense` |
| 004 | **Objectifs de progression** : générateur d'objectifs (arbre technologique), priorités, budget | Le compagnon s'occupe seul quand rien n'est demandé | 001, 002, 003 | **Spécifiée + planifiée** : `004-progression-goals` |
| 005 | **Construction** : maisons, châteaux, fortifications, extérieurs, décoration, par plans validés | Habiter et marquer le monde ; étend `build_structure` | 001, 004 | **Spécifiée + planifiée** : `005-building-construction` |
| 006 | **Fermes à ressources vivantes** : enclos d'animaux, fermes de cultures, pièges à mobs | Ressources renouvelables sans aller les chercher | 001, 002, 005 | **Spécifiée + planifiée** : `006-resource-farms` |
| 007 | **Infrastructures redstone** : portes, pièges, fermes automatiques, trieurs, transport d'objets | Automatisation poussée de la ferme et de la base | 005, 006 | **Spécifiée + planifiée** : `007-redstone-systems` |
| 008 | **Base, stockage et organisation** : coffres triés, retour à la base, réapprovisionnement | Cohérence à long terme, rangement, ne rien perdre | 001, 005 | **Spécifiée + planifiée** : `008-base-storage-return` |

Transverses (traités dans chaque spec, pas à part) : mémoire du monde, coût en requêtes LLM, évaluation
rejouable, sécurité (zones protégées), reprise de main par le joueur.

## Ordre recommandé

1. **001** d'abord : sans « savoir ce qu'il faut et le fabriquer », rien d'autre n'est autonome.
2. **002 + 003** ensuite (survie pure), en parallèle car peu couplées.
3. **004** pour que l'enchaînement devienne spontané (le compagnon choisit seul quoi faire).
4. **005 → 006 → 007** : de la cabane à la ferme automatique, du plus simple au plus risqué.
5. **008** peut s'insérer dès qu'une base existe.

## Limites assumées pour toutes les capacités

- Serveur local Minecraft Java 1.21.4, mode survie, bot opérateur ; pas de triche non déclarée : toute
  facilité (commandes, datapack) doit être explicitement justifiée dans la spec concernée.
- Un seul compagnon par monde ; un seul joueur propriétaire donne des ordres.
- Dimensions : Overworld d'abord. Le Nether et l'End font partie de l'ambition (palier avancé de 004) mais chaque dimension exige sa propre sous-spec.
- Redstone : circuits **prédéfinis et validés** d'abord (bibliothèque de montages) ; conception libre de
  circuits hors périmètre tant que 007 n'a pas prouvé les montages simples.
