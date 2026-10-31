# Quickstart — valider la capacité 005

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/house.test.ts` (toute combinaison de paramètres donne un plan valide : sol, toit, 4 murs, porte,
fenêtres, escaliers, éclairage), `test/lighting.test.ts`, `test/builder.test.ts` (ordre, reprise, échec,
interruption, retrait des échafaudages), `test/site.test.ts` et `test/construction.test.ts` (terre, boue, sable,
gravier refusés) verts.

## En jeu (non vérifié tant que non fait)

Prérequis : serveur 1.21.4, terrain plat dégagé, bot op, `BUILD_MODE=survival` (défaut), `AUTO_APPROVE_BUILDS=false`.

| # | Scénario | Attendu |
|---|---|---|
| 1 | « construis une maison » (inventaire plein de planches) | propose params + coût, attend « oui » |
| 2 | Accord | pose réelle bloc par bloc ; maison fermée, éclairée, accessible (8/10) |
| 3 | « maison 2 étages avec sous-sol en pierre » | trois niveaux reliés par escaliers (6/10) |
| 4 | Inventaire vide | matériaux récoltés via `obtain_item`, puis chantier |
| 5 | Plan avec de la terre / boue | refusé avec explication |
| 6 | « stop » au milieu, puis `resume_build` | terminé sans doublon ni oubli (9/10) |
| 7 | Emprise sur un coffre | refus |
| 8 | Nuit entière, maison livrée | aucun monstre à l'intérieur ni à 3 blocs de la porte |
| 9 | Fin de chantier | aucun bloc d'échafaudage restant |

Relever : durée, blocs posés / attendus, requêtes LLM (≤ 20), cartes d'éclairage (F3 pour confirmer le niveau de lumière).
