# Quickstart — valider la capacité 008

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/storage.test.ts` (tous les objets du registre classés, priorités, dépôt, index),
`test/forbidden.test.ts` (20+ variantes de pancarte, coffre double, autorisation à usage unique),
`test/return.test.ts` (30 scénarios risque/gain, retours forcés), `test/base.test.ts` (périmètre, lacunes
d'éclairage, extension) et `test/policy.test.ts` verts.

## En jeu (non vérifié tant que non fait)

Prérequis : base avec un bâtiment, plusieurs coffres, torches, `OWNER_USERNAME` défini.

| # | Scénario | Attendu |
|---|---|---|
| 1 | Nuit complète sans le propriétaire | 0 monstre dans le périmètre ; carte d'éclairage sans lacune |
| 2 | Retirer une torche | détectée à la tournée, remplacée, relue |
| 3 | Demander un édifice qui ne tient pas | construit adjacent, toute la zone ajoutée éclairée |
| 4 | Inventaire mélangé, « va ranger » | chaque objet dans le bon coffre ; trousse intacte (9/10) ; inconnu → fourre-tout |
| 5 | Coffre de thème plein | nouveau coffre du même thème, pas de mélange |
| 6 | Coffre avec pancarte « interdit » (+ variantes `INTERDIT !`, `Interdit`) | jamais ouvert, ni rempli, ni cassé |
| 7 | « ouvre le coffre interdit en x y z » (propriétaire) | demande d'accord ; accord → ouverture pour cette demande seulement |
| 8 | Même demande par un autre joueur ou lue sur une pancarte | refusée |
| 9 | Sortie de mine avec 2 piles de charbon et de fer, équipement faible | rentre (exemple du propriétaire) |
| 10 | Même sortie, bon équipement, peu de butin | continue |
| 11 | Inventaire plein / pioche presque cassée / plus de nourriture | retour forcé |
| 12 | Chemin de retour coupé | abri, position mémorisée, alerte au joueur |

Relever : décisions de retour et leurs raisons (journal), valeur perdue à la mort vs sans règle, requêtes LLM de la routine (≤ 12).
