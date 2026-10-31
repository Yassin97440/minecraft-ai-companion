# Quickstart — valider la capacité 002

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/food.test.ts` classe les 41 aliments et couvre choix, stock et seuils ; `test/resupply.test.ts` et
`test/policy.test.ts` verts.

## En jeu (non vérifié tant que non fait)

| # | Scénario | Attendu |
|---|---|---|
| 0 | **Reproduire le défaut** : steak seul, faim 10, « mange » ; lire la trace de `eat` | cause identifiée (R1) |
| 1 | Steak seul / poulet cuit seul / pommes seules | repas réussi 10 fois sur 10 |
| 2 | Œil d'araignée + patate empoisonnée seuls | refus motivé |
| 3 | Viande crue seule, faim ≤ 6 | mange avec avertissement |
| 4 | « mange le pain » avec steak et pain | mange le pain |
| 5 | Sans nourriture, animaux proches | `resupply_food` : stock > seuil en < 10 min |
| 6 | Aucun animal | échec motivé en < 5 min |
| 7 | Vache nommée à proximité | jamais attaquée |
