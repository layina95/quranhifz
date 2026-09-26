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
`text_qpc_hafs`. La police est chargée depuis le domaine de Quran Foundation dans
une WebView :

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

Chaque mot porte l'identifiant du verset Hafs : le surlignage pendant l'audio et
l'appui long portent sur les vrais mots, y compris quand un verset traverse
plusieurs lignes ou deux pages.

## En cas d'échec

Il n'y a **pas d'image de repli**. La lecture dessine la page avec la police
officielle, demandée page par page : sans connexion, sans session ou sans
réponse, l'écran l'annonce et propose de choisir une autre présentation. Rien
d'approximatif n'est affiché à la place, et aucun faux surlignage n'est possible.

Les 604 images EasyQuran / Dar Al Maarifah qui servaient auparavant de repli ont
été retirées au commit `cb20ec4` : leur licence n'était pas établie dans le
dépôt, et ce mode n'en a plus besoin.

## Ce qui reste à établir

- **Les 604 limites de page de cette édition n'ont pas été vérifiées** contre
  l'édition locale au-delà d'un échantillon. Le contrôle à l'exécution couvre les
  pages réellement ouvertes et refuse la page en cas d'écart ; il ne remplace pas
  une comparaison des 604 limites. Tant que cette comparaison n'est pas faite, le
  suivi automatique de page reste fondé sur les limites locales.
- **Aucun essai sur appareil réel** n'a été fait. La taille des lignes, le
  cadrage des glyphes et les gestes doivent être contrôlés sur un iPhone et un
  Android après compilation.
- **Les conditions développeur de Quran Foundation** régissent l'usage de ces
  contenus dans une application tierce. L'accès Content en production existe pour
  le compte du projet ; la conformité de cette application précise n'est pas
  établie dans le dépôt et reste à confirmer.
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
