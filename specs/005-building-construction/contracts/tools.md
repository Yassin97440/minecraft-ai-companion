# Contrats des tools — 005

Échecs : `Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`.

## `build_house` (nouveau) — **hors** `IDLE_TOOLS`, accord du joueur requis

```text
schema : {
  footprint: [integer 5-24, integer 5-24],
  levels: 1 | 2 | 3,
  basement: boolean,
  material: "oak" | "spruce" | "birch" | ... | "cobblestone" | "stone_bricks" | "bricks" | ...,   # liste fermée
  roof?: "flat" | "gable",
  windows?: "few" | "normal" | "many"
}
```

Étape 1 (avant accord) : renvoie le résumé : dimensions, niveaux, **coût exact**, matériaux manquants, éclairage prévu.
Exemple : `Maison 9x7, 2 niveaux + sous-sol en stone_bricks : 612 blocs (stone_bricks x300, oak_planks x120, glass_pane x14, torch x18…). Il me manque stone_bricks x40. J'attends ton accord.`

Étape 2 (après accord) : récolte les manques (`obtain_item`), choisit le site, pose bloc par bloc, retire les
échafaudages, vérifie. Succès : `Maison terminée en x,y,z : 612/612 blocs conformes, éclairage OK (0 case sous le seuil), escaliers reliant 3 niveaux. 21 min.`

Échecs : `Échec : plan invalide (fenêtre vide en [..])`, `Impossible : emprise trop grande (max 24x24)`,
`Matériaux manquants : glass x14 (aucun sable trouvé)`, `Échec : emplacement occupé (coffre en x,y,z)`,
`Interrompu : 301/612 blocs posés (reprise possible)`.

## `build_structure` (modifié)

Même schéma `PlanSchema` (ouvrages libres, `kind: "decor"` ou plan complet) ; **exécution bloc par bloc par défaut** ;
`BUILD_MODE=fast` (config) conserve l'exécution par commandes. `stair_run` ajouté aux étapes. Les erreurs de
validation listent les éléments essentiels manquants.

## `resume_build` (nouveau) — hors `IDLE_TOOLS`

```text
schema : {}   # reprend le chantier en pause ou interrompu
```

Retour : `Reprise : 301 blocs déjà posés, 311 restants.` / `Aucun chantier à reprendre.`

## `build_status` (nouveau) — lecture seule, dans `IDLE_TOOLS`

Retour : `Chantier « maison 9x7 » : 301/612 blocs, en pause (nuit).` / `Aucun chantier en cours.`

## Politique

| Règle | Effet |
|---|---|
| `build_house`, `build_structure`, `resume_build` | `approve` (accord du joueur) ; deny en idle jusqu'à 004 |
| matériau hors liste fermée (terre, boue, sable, gravier) | plan refusé |
| emprise sur bloc protégé ou coffre « interdit » | refus |
| `BUILD_MODE=fast` | seulement via configuration du propriétaire |
