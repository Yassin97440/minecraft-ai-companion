# Quickstart — valider la capacité 001

## Prérequis

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\npm.cmd' install
```

## 1. Automatique (sans Minecraft, sans LLM)

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' test
```

Attendu : tests verts, dont `test/needs.test.ts` (20 objets de référence, refus, alternatives, outil minimal),
`test/obtain.test.ts` (faux monde : succès, échec, budget, interruption, vérification d'inventaire) et
`test/policy.test.ts` (`obtain_item` refusé en idle, `plan_needs` autorisé).

## 2. En jeu (non vérifié tant que non fait)

Prérequis : serveur 1.21.4 lancé (`server\start.cmd`), bot op, monde neuf avec arbres et pierre proches.

| # | Scénario | Commande de chat | Résultat attendu |
|---|---|---|---|
| 1 | Besoin annoncé | « de quoi as-tu besoin pour une pioche en fer ? » | Liste exacte des manques, sans action |
| 2 | Pioche en bois (inventaire vide) | « fabrique une pioche en bois » | Bois récolté, établi posé, pioche dans l'inventaire |
| 3 | Pioche en pierre | « fabrique une pioche en pierre » | Idem + pierre récoltée avec la pioche en bois |
| 4 | Pioche en fer | « fabrique une pioche en fer » | Fer récolté, four posé, lingots, pioche (≤ 20 min) |
| 5 | Déjà possédé | redemander la pioche en pierre | « rien à faire » |
| 6 | Objet inconnu / hors périmètre | « fabrique un blaze rod » | Refus motivé, aucune action |
| 7 | Stop | « stop » pendant le scénario 4 | Arrêt < 5 s, compte rendu |
| 8 | Irréalisable | île sans pierre | Arrêt < 3 min, compte rendu |

Relever pour chaque essai : réussite, durée, nombre de requêtes LLM (`npm run trace-report`), et reporter le
résultat dans `CLAUDE.md` (« vérifié / non vérifié en jeu »).
