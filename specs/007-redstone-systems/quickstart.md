# Quickstart — valider la capacité 007

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/redstone.test.ts` (chaque composant : rôle, recette, matériaux exacts), `test/circuits.test.ts`
(tous les montages valides ; lot de montages invalides refusés), `test/circuit-orient.test.ts`,
`test/systems-monitor.test.ts` (pannes diagnostiquées) et `test/policy.test.ts` verts.

## En jeu (non vérifié tant que non fait)

Prérequis : chantier de la 005 opérationnel, matériaux et **quartz** fournis (`/give` autorisé pour préparer le test).

| # | Scénario | Attendu |
|---|---|---|
| 1 | « à quoi sert un observateur ? » | rôle, recette, matériaux exacts, quartz requis |
| 2 | « de quoi as-tu besoin pour des lampes jour/nuit ? » | liste exacte + repli sans quartz |
| 3 | `auto_door` à l'entrée | s'ouvre en se tenant sur la plaque, se referme (8/10) |
| 4 | `daylight_lamps` | capteur couvert → lampes allumées, découvert → éteintes (8/10) |
| 5 | Même montage sans quartz | propose `lever_lamps`, le construit, test OK |
| 6 | `melon_pumpkin_farm` | récolte + collecte ≥ 90 % sur 3 cycles (6/10) |
| 7 | `mob_trap_auto` loin de la base | butin au coffre sans intervention |
| 8 | `animal_farm_auto` (expérimental) | surplus de petits éliminé, adultes conservés |
| 9 | Casser un piston, puis `check_systems` | panne détectée, réparée, test OK (7/10) |
| 10 | Plan avec TNT / lave | refusé |

Relever : durée, états lus, requêtes LLM (≤ 20 par construction), nombre de réparations, rendement observé.
