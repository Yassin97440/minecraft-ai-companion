# Quickstart — valider la capacité 003

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/combat.test.ts` (chaque pièce d'armure et arme du jeu, comparaisons, profils, décisions,
cibles interdites), `test/survival.test.ts` (caractérisation + nouveaux cas), `test/policy.test.ts` verts.

## En jeu (non vérifié tant que non fait)

Prérequis : serveur 1.21.4, bot op, `/difficulty normal`, `/gamerule doMobSpawning true`.

| # | Scénario | Attendu |
|---|---|---|
| 1 | `/give` une épée en pierre puis une hache en fer | la hache est choisie 1 contre 1, l'épée contre ≥ 2 |
| 2 | Donner casque cuir, plastron fer, bouclier un par un | chaque pièce portée en < 10 s, état annoncé |
| 3 | Zombie isolé, épée en pierre | vaincu, ≥ 50 % de vie restante (9/10) |
| 4 | Trois zombies, pas d'arme | fuite ou abri, pas de mêlée |
| 5 | Creeper | jamais à moins de 3 blocs de l'explosion |
| 6 | Squelette à 15 blocs | approche à couvert ou contournement, pas d'immobilité |
| 7 | Vache nommée, villageois, chien apprivoisé près d'un combat | jamais attaqués |
| 8 | Flèche tirée par un squelette hors de vue | réaction (regarde, recule), pas d'immobilité |
| 9 | « stop » en plein combat | arrêt < 3 s |
| 10 | Inventaire sans arme, sortie de 100 blocs | `prepare_for_trip` s'arme avant de partir |

Relever : durée, vie, requêtes LLM (doit être 0 pendant le combat), `npm run trace-report`.
