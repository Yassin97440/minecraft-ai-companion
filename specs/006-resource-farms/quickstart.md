# Quickstart — valider la capacité 006

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/farms.test.ts` (conceptions valides pour toute la grille de paramètres : eau, clôture fermée, lumière,
plafonds), `test/farm-registry.test.ts` et `test/farm-cycle.test.ts` (replantation, effectif, paire
reproductrice, budget, interruption) verts.

## En jeu (non vérifié tant que non fait)

Prérequis : chantier de la 005 opérationnel, graines, houe, eau (seaux), clôtures, animaux de départ.

| # | Scénario | Attendu |
|---|---|---|
| 1 | « fais un champ de blé » | labour, eau, clôture, lumière vérifiés ; cycle de test OK |
| 2 | Récolte | tout replanté (9/10), aucun plant non mûr détruit |
| 3 | Élevage : 2 vaches + blé | naissance, effectif cible atteint (8/10), paire gardée |
| 4 | Prélèvement | viande + cuir obtenus, 0 animal nommé touché |
| 5 | Moutons | tonte, laine obtenue, moutons vivants |
| 6 | Plantation de bois | coupe + replantation ; forêt voisine intacte |
| 7 | Piège à monstres loin de la base | butin au coffre, vie ≥ 50 % (7/10), aucun spawn à l'extérieur |
| 8 | Piège dans la base | refusé |
| 9 | Besoin répété de viande | `farm_status` propose la ferme d'élevage |
| 10 | « stop » en plein cycle | arrêt < 5 s |

Relever : rendement annoncé vs observé (±25 %), requêtes LLM par cycle (≤ 10), nombre d'entités (F3) pour détecter le lag.
