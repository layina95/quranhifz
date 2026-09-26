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

Mesure faite en lisant l'étendue de l'encre de chaque bande sur les **20 pages
imprimées de page entière** dont on dispose, **sans rogner la page**
(`_inspect/pages-imprimees/largeur-du-texte.py` et
`distribution-des-bandes.py`) : 291 bandes, dont **91,4 % entre 470 et 493 px**,
soit **97,7-102,5 %** de la colonne de 481,3 px, et 8,6 % sous 265 px, soit moins
de 56 %. La zone 55-98 % est **entièrement vide** — 0,4 % des bandes : le livre ne
laisse jamais une ligne entre les deux.

> La sonde antérieure (`poser-les-lignes-courtes.py`) restreignait son examen à
> `x = 0,14..0,86` de la largeur, puis annonçait « colonne x=87..533 = 447 px » :
> elle lisait les bords de **sa propre fenêtre**, et toute ligne plus large était
> rognée à 447 px et comptée « pleine à 100 % ». C'est de là que venait la
> colonne trop étroite du moteur, et donc l'écrasement du texte signalé.

- **les lignes courtes sont CENTRÉES** : **0 au bord droit, 0 au bord gauche** ;
- **une fin de sourate n'est pas courte pour autant** : la page 350 n'a qu'une
  bande centrée, la basmala, et ses lignes 7, 10, 13 et 15 — à 96,5 %, 92,7 %,
  98,7 % et 93,2 % de l'ancienne colonne — sont imprimées pleines ;
- **la page 1 fait exception** : Al-Fatiha y est centrée dans son médaillon.

Le lecteur pose donc chaque ligne selon sa largeur mesurée : **remplie** si elle
occupe au moins 80 % de la colonne, **centrée à sa largeur naturelle** sinon, et
centrée d'emblée sur la page 1. Le seuil de 80 % tombe dans la zone vide mesurée
— la plus courte ligne pleine du corpus fait 80,4 % de la colonne, la plus longue
ligne courte 79,5 %, et l'imprimé n'a rien entre 55 % et 98 % — donc aucune ligne
réelle n'approche la frontière.

La pose ne dépend **que de la largeur** : la règle est une fonction pure qui ne
reçoit que des nombres, embarquée dans la page par `poseDeLigne.toString()`, si
bien que le téléphone et le banc d'essai font tourner le même texte. Une fin de
sourate ne peut donc plus décider d'une pose — c'est ce qui produisait la
différence signalée sur la page 599.

### Comment le livre remplit une ligne

Il la **met à l'échelle d'un seul tenant** ; il ne joue pas sur les espaces. Les
deux modèles se départagent sur la ligne 3 de la page 414, la plus comprimée du
livre (22,2856 em pour une colonne de 16,15 em, facteur 0,7247), en prenant le mot
de 3,8116 em à la position 24 :

| modèle | avance imprimée prédite | imprimé |
|---|---|---|
| mise à l'échelle uniforme : `3,8116 × 29,8 × 0,7247` | **82,3 px** | **78 px** |
| espaces resserrés : `3,8116 × 29,8` | 113,6 px | 78 px |

L'écart qui reste (82,3 contre 78, soit 5,2 %) est celui des approches latérales :
l'avance d'un mot est plus large que son encre. Le resserrement des espaces, lui,
se trompe de 46 %. C'est ce qui décide du rendu :
`transform: scaleX(colonne / largeur naturelle)`, origine au bord droit. Sur les **8 820 lignes de mots** des 604 pages, **3 828
(43,4 %)** demandent plus que la colonne et sont condensées, 4 969 (56,3 %) sont
légèrement étirées, et 23 (0,3 %) seulement restent courtes et centrées. Le
facteur moyen vaut **1,0008** : la police QCF V4 est dessinée pour la page qu'elle
habille, le livre n'a donc que de petites retouches à faire.

La plus forte compression réelle du livre est la ligne 3 de la page 414 :
**22,2856 em pour 16,15 em, soit 0,7247**. Le lecteur signale une ligne au-delà de
**0,70**, soit 3,4 % sous ce minimum : une page du livre ne peut pas déclencher
l'alerte, une ligne réellement mal composée le peut.

### La taille du texte : la proportion du livre

Le livre ne change pas de taille d'une page à l'autre. **La colonne vaut 16,15 em**,
et c'est cette proportion-là, non la largeur de l'écran, qui décide de la lettre :
`0,77374 / 16,15 = 0,047910` fois la largeur de la page — exactement
`29,8 / 622 = 0,047910` mesuré sur le scan. Sur une page de 390 px : lettre de
**18,69 px/em**, colonne de **301,7 px = 16,15 em**, pas des rangées de 1,81 em,
marges latérales 0,11313 et verticales 0,0884, page au format 622 × 917.

La colonne de 16,15 em est établie par quatre voies indépendantes, qui tombent
toutes à 1,5 % près :

- un **ajustement aux moindres carrés** de l'encre imprimée sur le modèle « mise à
  l'échelle uniforme », sur les 256 lignes justifiées des 20 pages
  (`_inspect/tajweed2/ajuster-la-colonne.py`) : **473,8 px = 15,91 em** ;
- la **médiane des largeurs naturelles** du corpus, point où le livre n'aurait ni
  à étirer ni à comprimer : **16,14 em** ;
- le **facteur moyen de mise à l'échelle**, qui doit valoir 1 si la police est
  dessinée pour la page : il vaut **1,0008** à 16,15 em, contre 0,9298 à
  l'ancienne colonne de 15,0 em ;
- la **superposition au scan** (`_inspect/tajweed2/dessiner-page-599.py`), qui
  dessine la page avec les contours réels de la police : à 481,3 px le bord droit
  de l'encre tombe à 2 px de l'imprimé et c'est le bord gauche qui manque — il
  faudrait 487 px, soit **16,34 em**.

Les 29,8 px/em sont établis par trois voies indépendantes :

- le **médaillon**, ornement isolé dont la boîte en police est `0,8656 × 1,1336 em`
  et qui mesure `26 × 34 px` dans le scan ;
- les **quatre lignes courtes de la page 604**, libres de toute compression, qui
  donnent 29,74 à 29,88 : leur encre imprimée colle à la somme des avances —
  8,8988 em = 265,2 px contre 265 px imprimés, 10,8964 em = 324,7 contre 325,
  8,1000 em = 241,4 contre 242 ;
- les **hauteurs de bandes** comparées aux boîtes d'encre des mêmes lignes dans la
  police (médiane 29,2 sur la page 414, 30,3 sur la page 604), robustes au seuil
  d'encre : les hauteurs ne bougent pas de plus de 2 px entre les seuils 80 et 200.

L'ancienne loi cherchait, page par page, la taille qui fasse tenir la ligne la plus
large — `min(32, ⌈largeur × 0,074⌉, hauteur de rangée / 1,45)`, plancher 12 px,
colonne de 0,958 de l'écran. Elle était fausse en principe, et c'est elle qui
produisait les deux messages signalés : « cette page ne correspond pas encore aux
limites du moushaf existant » et « la ligne X ne tient pas sans réduire le texte ».
Elle rendait le texte **plus grand que le livre** sur la plupart des pages — sur un
écran de 390 px, 28,00 px/em pour la page 1, 21,55 pour la page 599, contre 18,69
pour la proportion du livre — ce qui est la « police trop grande » signalée.


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
