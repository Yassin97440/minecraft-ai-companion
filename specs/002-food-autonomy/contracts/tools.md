# Contrats des tools — 002

Échecs : mots reconnus (`Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`).

## `eat` (modifié) — déjà dans `IDLE_TOOLS`

```text
schema : { item?: string }   # sans item : meilleur choix selon la règle
```

Succès : `J'ai mangé cooked_beef : faim 9 -> 17.`

Refus (raison réelle uniquement) :
- `Je n'ai pas faim (20/20).` (sauf aliment de soin si la vie est basse)
- `Aucun aliment mangeable dans mon inventaire.`
- `Impossible : spider_eye est nuisible (poison).` / `…est un aliment précieux réservé aux urgences.`
- `Échec : ma faim n'a pas changé après 2 essais (…).`

## `food_status` (nouveau) — lecture seule, dans `IDLE_TOOLS`

Retour : `Faim 12/20. Stock: 34/40 pts (cooked_beef x3, bread x2). Réserve d'urgence: golden_apple x1. Nuisible: spider_eye x2 (ignoré).`

## `resupply_food` (nouveau) — **hors** `IDLE_TOOLS`

```text
schema : { target?: integer (points, défaut = seuil de sécurité) }
```

Succès : `Stock de nourriture 12 -> 44 pts (+3 cooked_beef, +4 bread) en 2 min.`

Échec : `Aucun animal ni culture connus dans 64 blocs. Essayé: coffre (vide), chasse (0 animal). Aide demandée.`

## Politique

| Règle | Effet |
|---|---|
| `resupply_food` en mode autonome | deny jusqu'à la capacité 004 |
| `fight` / attaque sur animal apprivoisé ou nommé | deny |
