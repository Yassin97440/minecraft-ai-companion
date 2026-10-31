# Contrats des tools — 004

Échecs : `Échec`, `Impossible`, `Aucun`, `Pas arrivé`, `Matériaux manquants`.

## `progress_status` (nouveau) — lecture seule, dans `IDLE_TOOLS`

Retour : `Palier: pierre (suivant: fer). Objectif: obtenir iron_pickaxe. Équipé: non (manque: armure, torches). Session: 14 min, 2 morts max restantes, 31/60 requêtes.`

## `set_progression` (nouveau) — chat uniquement (propriétaire), absent de `PROGRESS_TOOLS`

```text
schema : {
  action: "enable" | "disable" | "pause" | "resume" | "set_priority" | "forbid" | "allow",
  value?: string   # set_priority: "diamond" ; forbid/allow: "descendre" | "explorer" | "combattre"…
}
```

Retour : `Progression suspendue.` | `Priorité: diamant.` | `Interdit: descendre (jusqu'à nouvel ordre).`
Échec : `Impossible : "xyz" n'est pas une priorité connue (bois, pierre, fer, diamant, nether).`

## `explore` (nouveau) — **hors** `IDLE_TOOLS`, dans `PROGRESS_TOOLS`

```text
schema : { direction?: "north"|"south"|"east"|"west", legBlocks?: integer (défaut 64, max 128) }
```

Retour : `Exploré 64 blocs vers l'est : village repéré en (x,y,z) (mémorisé).` /
`Échec : conditions dégradées (nuit, nourriture 4/20), exploration arrêtée à 31 blocs.`

## Sorties non-tool (chat, sans LLM)

- À la reconnexion du propriétaire : `Pendant ton absence (1 h 12) : palier fer atteint ; 14 stacks de pierre ; village trouvé en (…) ; 1 mort (creeper). Budget : 41/60 requêtes.`
- À l'arrêt par budget : `Je m'arrête : budget de 3 morts atteint. Dernier objectif : …`

## Politique

| Règle | Effet |
|---|---|
| `canStartAutonomy` faux | aucune étape de progression |
| tool hors `PROGRESS_TOOLS` en mode `progress` | deny |
| objectif `tier ≥ nether` hors présence du propriétaire | préparation seule |
| `set_progression` | allow seulement en mode `chat` |
