# Quickstart — valider la capacité 004

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : `test/progression.test.ts` (paliers, 30 situations de priorité, `isEquipped`, `summarize`),
`test/autonomy.test.ts` (enchaînement, budget, morts, interruption), `test/policy.test.ts`
(`canStartAutonomy` : propriétaire connecté refusé, absent accepté) et `test/progress-store.test.ts` verts.

## En jeu (non vérifié tant que non fait)

Prérequis : `OWNER_USERNAME` défini, `PROGRESSION_ENABLED=true`, monde neuf. **Le propriétaire doit être déconnecté**
pendant les essais (se connecter avec un autre compte ou se déconnecter après avoir lancé le bot).

| # | Scénario | Attendu |
|---|---|---|
| 1 | Propriétaire connecté, bot inactif | aucune progression (0 action autonome) |
| 2 | Propriétaire déconnecté, inventaire vide | enchaîne bois → pierre ; outils en bois remplacés (SC-001) |
| 3 | Idem jusqu'au fer | palier fer en < 45 min dans 6/10 essais (SC-002) |
| 4 | Se reconnecter en plein travail | arrêt < 10 s, résumé exact dans le chat |
| 5 | « pause la progression », « priorité au diamant », « ne descends pas » | réglages appliqués, mémorisés |
| 6 | Provoquer 3 morts | arrêt avec message |
| 7 | Palier Nether prêt, propriétaire absent | préparation seule, pas de portail |
| 8 | Équipement faible, nuit | pas d'exploration lointaine |

Relever : requêtes LLM par session (`npm run trace-report`), durée, morts, résumé affiché vs journal.
