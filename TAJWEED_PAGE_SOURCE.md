# Coran Tajweed : sources, droits et limites techniques

Le mode `tajweedPages` — présenté sous le nom **Coran Tajweed** — affiche la page
du Moushaf telle qu'elle est imprimée. Chaque mot est dessiné par la **police
couleur QCF V4** de Quran Foundation : la mise en page et les couleurs des règles
de Tajweed sont donc celles de la page, et l'emplacement des versets suit
l'édition, sans recomposition.

Les deux autres présentations restent distinctes. Le mode `tajweed`, appelé
**Lecture simplifiée**, est un rendu verset par verset à partir des annotations
cpfair. Le **Moushaf de Médine** affiche les pages Hafs 1405.

## Ce qui est demandé, et à qui

Les identifiants de production du compte Quran Foundation « Apprendre le Coran »
sont stockés **uniquement** dans les secrets des fonctions Supabase. Aucun
identifiant, aucune page et aucune police ne sont recopiés dans le dépôt public.

La fonction `qcf-v4-page` obtient un jeton OAuth2 en `client_credentials`, puis
demande une page à la fois :

```
https://apis.quran.foundation/content/api/v4/verses/by_page/{page}
  ?mushaf=19&words=true&word_fields=code_v2,text_qpc_hafs&per_page=50
```

Elle exige une session Supabase valide et ne renvoie que les champs utiles :
référence du verset, position, page, ligne, type de caractère, `code_v2` et
`text_qpc_hafs`.

### La seconde route, quand le serveur du projet ne porte pas la fonction

Mesuré le 26 septembre 2026 : la fonction `qcf-v4-page` est déployée sur
l'ancien projet Supabase — qui répond **401**, donc présente mais refusant la
session — et **absente du projet courant**, qui répond **404**
`{"code":"NOT_FOUND","message":"Requested function was not found"}`. Le mode
affichait donc « la page Tajweed n'est pas installée sur ce serveur » sur un
téléphone réel. La fonction ne peut pas être déployée depuis l'application.

Le même service expose une **API publique** qui sert la même édition sans aucun
identifiant :

```
https://api.quran.com/api/v4/verses/by_page/{page}
  ?mushaf=19&words=true&word_fields=code_v2,text_qpc_hafs&per_page=50
```

Elle répond **HTTP 200 sans en-tête d'authentification**. La fonction Edge
interroge `apis.quran.foundation` avec exactement les mêmes paramètres et
recopie exactement les mêmes champs : les deux charges utiles sont
structurellement identiques. L'application essaie donc d'abord la route privée,
puis bascule sur l'API publique dès que celle-ci ne peut pas servir la page.
L'absence de la fonction (404) est retenue pour la session, afin de ne pas payer
une requête perdue à chaque page ; une panne passagère (502, 503) ne l'est pas,
sinon un incident d'une seconde condamnerait la route privée pour toute la
session.

Le repli reste **provisoire** : il ne remplace pas le déploiement de la fonction,
qui est la route prévue et celle qui portera les identifiants Quran Foundation.

La police est chargée depuis le domaine de Quran Foundation dans une WebView :

```
https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/p{page}.woff2
```

Mesuré le 26 septembre 2026 : la page 3 renvoie 98 904 octets et la page 604
34 636 octets, en-tête `wOF2`. La police de la page 3 couvre 149 points de code,
**tous dans les formes arabes de présentation (U+FB50 à U+FCCE) et aucun dans la
zone à usage privé** ; celle de la page 604 en couvre 80, jusqu'à U+FC89. Les
références `code_v2` reçues sont donc bien celles que la police dessine, et non
des points de code d'une autre convention.

## Ce que l'application vérifie avant d'afficher

La réponse est refusée plutôt que devinée. Sont exigés : une page entière
(`total_pages` valant 1), des références de verset bien formées, des versets
contigus et dans l'ordre, des positions de mots strictement croissantes, une
ligne entre 1 et 16, un glyphe présent pour chaque mot, et une place libre pour
chaque bandeau de sourate inséré. Une place non vérifiée fait échouer la page
plutôt que de comprimer une ligne artificiellement.

Le lecteur compare ensuite le premier et le dernier verset reçu avec les limites
de page de l'édition locale. En cas de différence, il n'affiche pas la page.

### Deux règles corrigées après confrontation aux 604 pages réelles

Passer le parseur sur les 604 pages, et non sur quelques-unes, a fait apparaître
deux refus — **vingt-sept pages** au total, que la fonction Edge aurait refusées
exactement de la même façon, puisqu'elle renvoie les mêmes champs :

- **Vingt-quatre pages** (77, 208, 332, 342, 350, 367, 377, 415, 418, 446, 453,
  499, 507, 526, 549, 556, 558, et d'autres) étaient refusées parce que le
  bandeau de la sourate était cherché une ligne au-dessus du papier. Mesure
  faite sur les 114 sourates : **dix-huit sourates à basmala ont leur premier mot
  en ligne 2**, et pour chacune la page précédente s'arrête en **ligne 14**. Le
  bandeau tient donc la ligne 15 de la page *précédente* ; la page qui commence
  ne porte que la basmala. Al-Fatiha et At-Tawbah, sans basmala, gardent bien
  leur bandeau en ligne 1.
- **Trois pages** (585, 587, 591) étaient refusées parce que la réponse annonce
  des versets qui sont dessinés ailleurs : page 585 annonce 80:41 et 80:42, dont
  **tous les mots portent la page 586**. Le contrôle d'ordre exigeait d'eux une
  continuité et fabriquait un trou inexistant. La contiguïté n'est désormais
  exigée qu'entre les versets qui dessinent réellement quelque chose sur la page.

Après correction : **604 pages acceptées, 0 refusée**, 83 304 mots lus. Le
contrôle d'ordre mord toujours — un trou réel entre deux versets dessinés reste
refusé, et les deux règles sont couvertes par des tests hors ligne dont on a
vérifié qu'ils échouent sur la version antérieure du parseur.

### La table des 604 pages était celle de Tanzil, pas celle du Moushaf imprimé

C'est la confrontation à la **page imprimée** qui a tranché, après que trois
hypothèses eurent été écartées par la mesure.

La table locale `src/data/pages.json` venait de l'application de référence et
portait la division de Tanzil, qui **n'est pas** celle du Moushaf imprimé. Le
`page_number` de chaque mot, lui, donne le placement imprimé : sur les 604 pages
il forme un pavage exact — 604 pages, 6 236 versets, **0 trou, 0 recouvrement**.
Les deux divisions diffèrent sur **36 pages**, et 56 versets n'étaient dessinés
nulle part (5:77, 5:90, 6:131, 55:17, 80:41, 80:42, 83:5, …, 100:9), soit
361 mots perdus.

Quatre sources en ligne donnaient la division de la table locale : Quran.com,
surahquran, islam.wiki, alquran.cloud et Tanzil rendent tous le même jeu de
données. Le **livre** a donc été lu directement :

- le PDF vectoriel de la page 585 (King Fahd Complex, Moushaf Madani) s'arrête au
  médaillon **٤٠** ;
- le scan `https://quran.ksu.edu.sa/png_big/585.png` (Moushaf de Médine, cartouche
  de page ٥٨٥) s'arrête lui aussi à **٤٠** ;
- le haut du scan 586 porte `تَرْهَقُهَا قَتَرَةٌ ٤١` puis
  `أُولَٰئِكَ هُمُ ٱلْكَفَرَةُ ٱلْفَجَرَةُ ٤٢` sur la ligne 1, `سُورَةُ التَّكْوِيرِ`
  en ligne 2, la basmala en ligne 3, `إِذَا ٱلشَّمْسُ كُوِّرَتْ ١` en ligne 4 ;
- le compte des points de code de la police confirme : celle de la page 585
  référence 167 codes = 127 mots + 40 médaillons, exactement le placement de
  l'API ; celle de la page 586 en référence 141 contre 133 éléments attribués,
  soit les 6 mots et 2 médaillons de 80:41 et 80:42.

**Le livre s'arrête donc à 80:40, et c'était la table locale qui était fausse.**
`pages.json` a été régénéré depuis le placement imprimé par
`scripts/regenerer-pages.mjs`, qui refuse d'écrire si le pavage n'est pas exact :
604 pages, 6 236 versets couverts, **0 problème de pavage**, 26 151 octets. Les
36 pages corrigées commencent par `585 : 80:1..80:42 → 80:1..80:40` et
`586 : 81:1..81:29 → 80:41..81:29`.

Comme une réponse de page **annonce** les versets de sa page et non ceux dont les
mots sont dessinés ailleurs, le service réunit la réponse de la page et celle de
la voisine désignée — 25 pages sur 604 en ont besoin, toujours d'un seul côté, et
chaque manque est effectivement annoncé par cette voisine.

### Où le livre pose chaque ligne

Mesure faite en lisant l'étendue de l'encre de chaque ligne sur les pages
imprimées 7, 528, 586 et 604 (`_inspect/pages-imprimees/etendue-lignes.py`) :

- **le livre remplit ses lignes d'un bord à l'autre** : 100 % de la colonne sur
  les quinze lignes de la page 7, et sur les lignes 3, 7, 8, 12, 13 de la page
  604 ;
- **une ligne qui termine une sourate reste courte et se pose contre le bord
  droit** : 62,6 % sur la page 528, 59,3 % et 54,1 % sur la page 604 ;
- **la page 1 fait exception** : Al-Fatiha y est centrée dans son médaillon.

Le lecteur pose donc chaque ligne selon sa largeur mesurée : justifiée si elle
occupe au moins 80 % de la ligne la plus large de la page, posée au bord droit
sinon, et centrée sur la page 1. Le seuil de 80 % sépare nettement les deux
populations mesurées — une ligne pleine occupe au moins 93 % de la colonne, une
ligne courte au plus 73 % — et il attrape le cas de la page 604 dont la ligne 14
porte 114:5 seule, courte à 72,7 % sans terminer de sourate, pour garder le
dernier verset du Coran sur sa propre ligne.

Une ligne est reconnue comme fin de sourate quand elle porte le **médaillon** du
dernier verset d'une sourate. Le médaillon et non le dernier mot : un verset peut
tenir sur deux lignes, et compter les versets dont le dernier mot tombe sur la
ligne en désignait **216 au lieu de 114** — la page 604 marquait sa ligne 14, qui
porte 114:5, comme une fin de sourate. Mesure faite sur les 604 pages : les
**114 médaillons** de fin de sourate sont sur la même ligne que le dernier mot de
leur verset, aucun désaccord.

Pendant la recherche de la taille, les lignes sont reposées à leur largeur
**naturelle** : une ligne justifiée remplit toujours sa rangée et ne dirait donc
plus rien de la place que le texte demande.

### La taille du texte, mesurée et non choisie

Les avances réelles des 604 polices ont été décodées hors ligne
(`_inspect/tajweed2/`). La ligne la plus large demande, selon la page, de
**16,8 px** (page 414) à **28,2 px** (page 1, ligne 5) sur un écran de 390 px, et
**13,8 px** au minimum sur un écran de 320 px.

L'ancien plancher valait `max(19, 88 % du plafond)` = **25 px** : **602 pages sur
604 ne pouvaient pas tenir**, et affichaient « la ligne X ne tient pas » à la
place de la page. Le plancher est maintenant une taille de lecture fixe de
**12 px**, et le plafond suit la largeur de l'écran :
`min(32, ⌈largeur × 0,074⌉, hauteur de rangée / 1,45)`. Le coefficient 0,074 est
mesuré : le pire cas demande `0,958 / 13,244 em = 0,07233` fois la largeur, soit
**2,3 % de marge**, et aucune page n'est refusée de 320 à 430 px de large.


Chaque mot porte l'identifiant du verset Hafs : le surlignage pendant l'audio et
l'appui long portent sur les vrais mots, y compris quand un verset traverse
plusieurs lignes ou deux pages.

## En cas d'échec

Il n'y a **pas d'image de repli**. La lecture dessine la page avec la police
officielle, demandée page par page. L'application essaie la route privée puis
l'API publique ; si les deux échouent, elle affiche la cause la plus précise —
fonction absente, identifiants manquants, session refusée, ou service
momentanément indisponible — et propose de choisir une autre présentation. Rien
d'approximatif n'est affiché à la place, et aucun faux surlignage n'est possible.

Les 604 images EasyQuran / Dar Al Maarifah qui servaient auparavant de repli ont
été retirées au commit `cb20ec4` : leur licence n'était pas établie dans le
dépôt, et ce mode n'en a plus besoin.

## Ce qui reste à établir

- **La fonction `qcf-v4-page` n'est pas déployée** sur le projet Supabase courant.
  Tant qu'elle ne l'est pas, l'application dépend de l'API publique. La déployer
  demande les secrets `QF_PRODUCTION_CLIENT_ID` et `QF_PRODUCTION_CLIENT_SECRET`,
  que seul le propriétaire du compte Quran Foundation peut fournir.
- **Aucun essai sur appareil réel** n'a été fait. La taille des lignes, le
  cadrage des glyphes et les gestes doivent être contrôlés sur un iPhone et un
  Android après compilation.
- **Les conditions développeur de Quran Foundation** régissent l'usage de ces
  contenus dans une application tierce. L'accès Content en production existe pour
  le compte du projet ; la conformité de cette application précise n'est pas
  établie dans le dépôt et reste à confirmer. L'API publique, elle, est servie
  sans identifiant ; les conditions qui l'encadrent n'ont pas été relues ici.
- La page QCF est une **composition de glyphes** et de métadonnées, pas une
  photographie de l'édition Dar Al Maarifah.


## Comment retirer ce mode

Voir [retirer-coran-tajweed.md](retirer-coran-tajweed.md) : une valeur à changer
pour le désactiver, sept fichiers et cinq retouches pour l'effacer.

## Recherche des données de positionnement, pour mémoire

Ces recherches concernaient le repli par images, aujourd'hui retiré. Elles sont
conservées parce qu'elles expliquent pourquoi ce repli n'a jamais reçu de
surlignage de verset.

- [Quran Foundation, page layout](https://api-docs.quran.foundation/docs/tutorials/fonts/page-layout/)
  distingue les éditions Tajweed 11 et QCF Tajweed V4 19, mais ne donne pas les
  coordonnées en pixels des images EasyQuran.
- [QuranHub, quran-images-utils](https://github.com/QuranHub/quran-images-utils)
  contient un détecteur de médaillons d'ayah, qui aurait exigé un gabarit adapté
  à ces pages et une vérification des 6 236 repères.
- [Quran.ws, Elements + Tajweed](https://quran.ws/docs/concepts/text-vs-visual/)
  offre une autre voie, fondée sur ses propres pages et géométries Hafs, mais
  produit une édition visuelle différente de celle qui avait été choisie.
- [Quran Foundation, QCF V4 Tajweed](https://api-docs.quran.foundation/docs/tutorials/fonts/font-rendering/)
  fournit la police couleur et les données par mot utilisées aujourd'hui.
- [NedaaDevs, Quran Image Generator](https://github.com/NedaaDevs/quran-image-generator)
  peut produire des pages V4, mais son auteur avertit que le résultat n'a pas été
  relu contre un Moushaf imprimé.
