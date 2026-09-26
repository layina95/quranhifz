# Retirer la lecture « Coran Tajweed »

Cette lecture a été ajoutée pour pouvoir être retirée facilement si elle ne plaît
pas. Il y a deux niveaux : **désactiver** (une valeur à changer, rien à effacer)
et **effacer** (un retour en arrière Git, puis le nettoyage du serveur).

## 1. Désactiver

Dans `src/core/tajweedMode.ts`, une seule valeur :

```ts
export const coranTajweedActif = false;
```

Ce que cela change, et rien d'autre :

- le choix « Coran Tajweed » disparaît de la carte **Affichage du Coran** des Réglages ;
- l'entrée « Coran Tajweed » disparaît du menu **Changer le Moushaf** du lecteur ;
- une préférence déjà enregistrée sur ce mode revient au **Moushaf de Médine**,
  sans qu'il soit besoin de réécrire l'état enregistré ;
- le bandeau du lecteur ne peut plus annoncer ce mode, puisqu'il lit la même
  valeur normalisée que le rendu ;
- les deux autres présentations, la traduction, l'audio, les révisions et les
  notifications ne sont pas touchés ;
- **rien à faire côté Supabase** : ni base, ni secrets, ni fonction Edge.

C'est la garantie éprouvée par `falsifier-coran-tajweed.mjs` : le drapeau est
basculé dans une copie du module, recompilé, et le mode doit alors quitter les
menus et la préférence stockée retomber sur le Moushaf de Médine.

## 2. Effacer

### Le retour en arrière Git

Le mode a été ajouté par un seul commit, qui ne porte que lui. Pour le trouver,
puis l'annuler :

```bash
git log --oneline --grep='^Coran Tajweed'
git revert --no-edit $(git log --format=%H -1 --grep='^Coran Tajweed')
```

### À la main, si ce commit n'est pas disponible

Sept fichiers appartiennent au mode et peuvent être supprimés :

| Fichier | Rôle |
|---|---|
| `src/QcfV4MushafPage.tsx` | le composant de la page et son bandeau |
| `src/core/qcfV4.ts` | la lecture et la validation de la réponse |
| `src/core/qcfV4Html.ts` | la composition de la page à partir des glyphes |
| `src/services/qcfV4.ts` | l'appel de la fonction Edge et son cache |
| `src/core/tajweedMode.ts` | l'interrupteur, le type des modes, la normalisation |
| `tests/qcfV4.test.cjs` | les contrôles de la page |
| `tests/tajweedMode.test.cjs` | les contrôles de l'interrupteur |

Puis cinq retouches :

1. `src/core/program.ts` — `ReaderPreferences` revient à
   `mushaf:'traditional'|'tajweed'`, et l'import de `MushafMode` disparaît.
2. `src/MushafPage.tsx` — retirer les deux imports, la prop `onRetourAuMoushaf`
   (du type, de la déstructuration et de l'appel), la valeur `'tajweedPages'` du
   type des props, et la ligne qui route vers `QcfV4MushafPage`.
3. `src/App.tsx` — retirer l'import de `coranTajweedActif` et `normaliserMushaf`,
   les deux entrées commandées par `coranTajweedActif` (le `Choice` des Réglages
   et l'entrée du menu du lecteur), la ligne « Verset récité », et les deux
   déclarations `const mushaf=normaliserMushaf(state.reader?.mushaf)`. Le rendu
   reprend `mode={state.reader?.mushaf==='tajweed'?'tajweed':'traditional'}` et
   les `selected` reprennent la lecture directe de `state.reader?.mushaf`.
4. `package.json` — retirer `src/core/tajweedMode.ts`, `src/core/qcfV4.ts` et
   `src/core/qcfV4Html.ts` de la liste compilée par `npm test`.
5. `README.md` et `TAJWEED_PAGE_SOURCE.md` — retirer la mention du mode.

### Le serveur

Le mode est le seul à appeler la fonction Edge `qcf-v4-page`. Pour effacer
complètement :

- supprimer le dossier `supabase/functions/qcf-v4-page` ;
- supprimer les secrets `QF_PRODUCTION_CLIENT_ID` et `QF_PRODUCTION_CLIENT_SECRET`
  du projet Supabase ;
- supprimer la fonction déployée.

Tant que la fonction reste en place, elle ne gêne pas : plus aucun écran ne
l'appelle.

## 3. Ce qui n'est pas concerné

- La **Lecture simplifiée** (clé `tajweed`) est un autre mode, avec d'autres
  données : les annotations cpfair sur texte Tanzil 2017. Elle reste.
- Le **Moushaf de Médine** et ses pages Hafs 1405 restent.
- Les 604 images EasyQuran retirées au commit `cb20ec4` **ne reviennent pas** :
  ce mode n'en a plus besoin, puisque la page est dessinée par la police, et leur
  licence n'était pas établie dans le dépôt.
