# Contrats des tools — 003

Échecs : `Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`.

## `gear_up` (modifié) — déjà dans `IDLE_TOOLS`

```text
schema : { weapon?: string }   # ex. "iron_axe" ; sans valeur : meilleure arme selon chooseWeapon
```

Succès : `Équipé : iron_chestplate (torse), shield (main secondaire), iron_axe (main). Armure 11/20.`

Rien à faire : `Rien de mieux à équiper (armure 11/20, iron_sword).`

Échec : `Échec : iron_helmet non porté après essai (slot occupé ?).` / `Impossible : "xyz" n'est pas une arme que je possède.`

## `defense_status` (nouveau) — lecture seule, dans `IDLE_TOOLS`

Retour : `Défense: armure 11/20 (casque cuir, plastron fer, jambières fer, bottes —), arme iron_sword (92 %), bouclier oui. Faible: bottes. Usure basse: aucune.`

## `prepare_for_trip` (nouveau) — **hors** `IDLE_TOOLS` tant que la capacité 004 n'a pas la main

```text
schema : { distance: integer ≥ 0 }   # blocs prévus
```

Vérifie le minimum selon la distance (arme ; armure si > 50 blocs ; bouclier si > 100), appelle `gear_up`, puis
`obtain_item` (capacité 001) pour combler. Retour : `Prêt : iron_sword, armure 11/20.` ou
`Échec : pas d'arme et pas de fer (limité à 30 blocs de la base).`

## `fight` / `flee` / `take_shelter` (inchangés côté schéma)

`fight` applique désormais le profil du monstre ; son retour garde le format
`Combat (…) : N monstre(s) éliminé(s), <issue>. Vie A -> B/20.`

## Politique

| Règle | Effet |
|---|---|
| Cible joueur / villageois / apprivoisé / nommé / animal | `fight` ne la cible jamais (filtre pur) |
| `defense_status` | allow (chat et idle) |
| `prepare_for_trip` | allow en chat ; deny en idle jusqu'à 004 |
