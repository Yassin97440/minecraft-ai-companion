# Contrats des tools — 006

Échecs : `Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`.

## `farm_status` (nouveau) — lecture seule, dans `IDLE_TOOLS`

Retour : `Fermes: crop-1 (blé 9x9, mûr à 80 %, dernière visite il y a 12 min, +38 blé/cycle), animal-1 (vaches 5/6). Besoin récurrent: viande (4 fois / 24 h) → ferme d'élevage proposée (coût: …, rendement estimé: …).`
Aucune ferme : `Aucune ferme. Besoins récurrents: aucun.`

## `build_farm` (nouveau) — **hors** `IDLE_TOOLS`, accord du joueur requis

```text
schema : {
  kind: "crop" | "animal" | "wood" | "mobtrap",
  params: objet selon le type (voir data-model.md),
  near?: "base" | { x, y, z }
}
```

Avant accord : `Ferme de blé 9x9 près de la base : 98 blocs de labour, 5 eau, clôture 40, torches 6 ; coût: fence x40, wheat_seeds x64… Manque: fence x12. Rendement estimé: 30-45 blé/cycle (~10 min). J'attends ton accord.`
Succès : `Ferme crop-1 construite en (x,y,z) : 81/81 cases labourées et hydratées, clôture fermée, éclairage OK. Premier cycle de test OK.`
Échecs : `Impossible : animal x15 dépasse le plafond (12).`, `Échec : le piège serait à 18 blocs de la base (min 24).`,
`Matériaux manquants : hopper x2 (fer: 4/10).`

## `tend_farms` (nouveau) — **hors** `IDLE_TOOLS`

```text
schema : { farm?: string }   # id ; sans valeur : visite par priorité (mûres, stock bas)
```

Succès : `crop-1 : récolté 38 blé, replanté 81/81, coffre vidé (+38 blé, +9 carottes). elevage-1 : 2 vaches nées, 3 prélevées (+9 viande, +3 cuir), paire gardée.`
Échec : `Échec : crop-1 dégradée (eau manquante en x,y,z) : réparée.` / `Interrompu après crop-1 (stop).`

## Politique

| Règle | Effet |
|---|---|
| `build_farm`, `tend_farms` | chat : accord pour `build_farm` ; idle : deny jusqu'à 004 |
| animal apprivoisé / nommé / d'un autre joueur | jamais abattu (filtre pur) |
| plafonds (12 animaux/enclos, 3 enclos, 4 fermes) | refus motivé |
| piège à monstres dans le périmètre de la base | refusé |
