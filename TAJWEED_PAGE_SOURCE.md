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

### Les 604 limites de page

La comparaison des 604 limites de page de cette édition avec `pageRange()` de
l'édition locale **a été faite**, en lisant le `page_number` de chaque verset
(114 requêtes, 6 236 versets) : **604 accords, aucun écart**. Un témoin a été
passé en décalant l'oracle local d'une seule page, et il a relevé 603 écarts —
le comparateur mesure donc bien ce qu'il prétend mesurer.


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
