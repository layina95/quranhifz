import {QcfV4Page,QcfV4Word} from './qcfV4';
import {ayahMarkerHtml} from './ayahMarker';
import {surahs,verses} from './quran';

function escapeHtml(text:string){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function glyph(code:string){return code.replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi,(_,hex:string,decimal:string)=>{
  const number=parseInt(hex??decimal,hex?16:10);
  return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';
});}

/**
 * Les cotes de la page imprimee, mesurees sur le scan du Moushaf (622 x 917 px
 * pour une page) :
 *
 *   - la colonne de texte va de x=66 a x=556, soit 490 px, et de y=55 a y=863,
 *     soit 808 px pour quinze rangees ;
 *   - le pas des rangees vaut 54,0 px (mediane des ecarts entre bandes sur les
 *     pages 414 et 604, mesure au seuil 140 comme au seuil 80 : les hauteurs de
 *     bandes ne bougent pas de plus de 2 px entre ces deux seuils, donc ce n'est
 *     pas du flou de scan) ;
 *   - la lettre du livre vaut 29,8 px par em, etabli par trois voies
 *     independantes : le medaillon, dont la boite en police est 0,8656 x 1,1336
 *     em et qui mesure 26 x 34 px dans le scan (rapport 0,765 contre 0,764) ;
 *     les quatre lignes courtes de la page 604, qui donnent toutes 29,74 a 29,88 ;
 *     et les hauteurs de bandes comparees aux boites d'encre des memes lignes
 *     dans la police (mediane 29,2 sur la page 414, 30,3 sur la page 604).
 *
 * D'ou deux constantes qui gouvernent tout le reste : la colonne vaut 16,15 em
 * (481,3 / 29,8), et le pas vaut 1,81 em (54,0 / 29,8).
 *
 * ATTENTION -- la colonne a d'abord ete lue FAUX, et il faut savoir pourquoi,
 * parce que l'erreur se refait toute seule. La sonde d'origine
 * (poser-les-lignes-courtes.py) restreignait son examen a x = 0,14 a 0,86 de la
 * largeur, soit 87 a 535 px, puis annoncait « colonne x=87..533 = 447 px » : elle
 * lisait les bords de SA PROPRE FENETRE. Toute ligne depassant la fenetre etait
 * rognee a 447 px et comptee « pleine a 100 % ». Le moteur en a herite une colonne
 * trop etroite de 7,1 %, ce qui ecrasait presque chaque ligne, et jusqu'a 32 %
 * sur la page 414 (voir COMPRESSION_MINIMALE).
 *
 * Mesure refaite sans fenetre, sur la page entiere, le cadre decoratif etant
 * ecarte par le blanc qui le separe du texte
 * (_inspect/pages-imprimees/largeur-du-texte.py, distribution-des-bandes.py) :
 * 291 bandes sur 20 pages, 91,4 % d'entre elles entre 470 et 493 px, mediane 480,
 * et rien entre 265 et 470 px. La colonne se deduit ensuite de trois facons
 * independantes, qui tombent toutes sur 16,15 em a 1,5 % pres :
 *
 *   - ajustement aux moindres carres de l'encre imprimee sur le modele
 *     « mise a l'echelle uniforme » (_inspect/tajweed2/ajuster-la-colonne.py,
 *     256 lignes justifiees) : 473,8 px = 15,91 em ;
 *   - la mediane des largeurs NATURELLES du corpus, qui est le point ou le livre
 *     n'aurait ni a etirer ni a comprimer : 16,14 em ;
 *   - le facteur moyen de mise a l'echelle, qui doit valoir 1 si la police QCF V4
 *     est dessinee pour la page qu'elle habille : il vaut 1,0008 a 16,15 em,
 *     contre 0,9298 a l'ancienne colonne de 15,0 em.
 *
 * Une quatrieme voie, visuelle, confirme la troisieme : en dessinant la page 599
 * avec les contours reels de la police et en la superposant au scan
 * (_inspect/tajweed2/dessiner-page-599.py), le bord droit de l'encre tombe a
 * 2 px de l'imprime, et c'est le bord gauche qui manquait -- il faut 487 px pour
 * le combler, soit 16,34 em.
 *
 * La lettre, elle, n'a jamais bouge : 29,8 px/em, et les quatre lignes courtes
 * de la page 604, que le livre n'ajuste pas, sont imprimees a leur largeur
 * naturelle a 0,2 % pres (265 px mesurees contre 265,2 et 265,5 attendues).
 */
export const PAGE_RATIO = 622 / 917;
export const MARGE_LATERALE = 0.11313;
export const MARGE_VERTICALE = 0.0884;
export const COLONNE_EM = 16.15;
export const PAS_EM = 1.81;

/**
 * La largeur de la lettre, en part de la largeur de la page : la colonne vaut
 * 0,77374 de la page (1 - 2 x 0,11313) et 16,15 em, donc la lettre vaut
 * 0,77374 / 16,15 = 0,047910 -- exactement 29,8 / 622 = 0,047910, mesure sur le
 * scan. Sur une page de 390 px cela donne une lettre de 18,69 px/em et une
 * colonne de 301,7 px = 16,15 em, la proportion du livre.
 *
 * Le livre ne change pas de taille d'une page a l'autre : c'est cette
 * proportion fixe qui remplace l'ancienne recherche, page par page, d'une taille
 * qui fasse tenir la ligne la plus large. Une page dont une ligne demande plus de
 * 16,15 em n'est pas ecrite plus petit -- le livre la COMPRIME (voir
 * COMPRESSION_MINIMALE).
 */
export const TAILLE_PAGE = (1 - 2 * MARGE_LATERALE) / COLONNE_EM;

/**
 * En deca de cette part de la colonne, le livre ne remplit pas la ligne : il la
 * centre, a sa largeur naturelle. Au-dela, il la remplit.
 *
 * Mesure faite sur les 20 pages imprimees de page entiere dont on dispose
 * (sondes _inspect/pages-imprimees/distribution-des-bandes.py et
 * largeur-du-texte.py, qui ne rognent rien) : 291 bandes, dont 91,4 % tombent
 * entre 470 et 493 px, soit 97,7 a 102,5 % de la colonne de 481,3 px, et 8,6 %
 * sous 265 px, soit moins de 56 %. Entre 265 et 470 px -- de 55 % a 97,7 % -- il
 * n'y a RIEN : 0,4 % des bandes. Les courtes sont toutes CENTREES (0 au bord
 * droit, 0 au bord gauche).
 *
 * La frontiere est donc quelque part entre 55 % et 98 %, et la mesure ne la
 * serre pas davantage : 0,8 s'y place. Elle est eprouvee des deux cotes -- la
 * ligne 10 de la page 350, qui fait 92,7 % de la colonne, est imprimee a 100 %,
 * donc le livre l'ETIRE ; et la ligne 15 de la page 604, qui fait 54,0 %, est
 * imprimee a 54,1 %, donc le livre la laisse naturelle.
 */
export const PART_REMPLIE = 0.8;

/**
 * Le garde-fou contre une ligne qui ne pourrait pas tenir : la plus forte
 * compression REELLE du livre est celle de la ligne 3 de la page 414, 22,2856 em
 * pour une colonne de 16,15 em, soit 0,7247 (mesure faite sur les 8 820 lignes de
 * mots des 604 pages : c'est le minimum). Le garde-fou est pose a 0,70, soit
 * 3,4 % sous ce minimum, pour qu'aucune page legitime ne puisse declencher une
 * alerte a cause d'un ecart de mesure, tout en attrapant une ligne reellement mal
 * composee -- qui demanderait, elle, bien davantage.
 *
 * A la colonne juste, 43,4 % des lignes sont legerement comprimees et 56,3 %
 * legerement etirees, pour un facteur moyen de 1,0008 : la police QCF V4 est
 * dessinee pour la page qu'elle habille, le livre n'a donc que de petites
 * retouches a faire. A la colonne fausse de 447 px, le facteur moyen tombait a
 * 0,9298 et 97,1 % des lignes etaient comprimees -- l'application ecrasait donc
 * tout le texte, et jusqu'a 32 % sur la page 414. C'est exactement le defaut
 * signale.
 */
export const COMPRESSION_MINIMALE = 0.70;

export type PoseDeLigne={justify:'flex-start'|'center';facteur:number;depasse:boolean};

/**
 * Comment le livre pose une ligne, connaissant sa largeur NATURELLE et la
 * largeur de la colonne. C'est la seule regle de pose de tout le moteur, et elle
 * ne recoit QUE des largeurs : aucune fin de sourate, aucun numero de ligne,
 * aucune page. C'est ce qui rend impossible le retour de la regle refutee -- le
 * livre ne pose pas ses lignes courtes contre le bord droit, il les centre
 * (23 lignes courtes sur 23 pages imprimees, 23 centrees, 0 au bord).
 *
 *   - la ligne occupe au moins PART_REMPLIE de la colonne : le livre la REMPLIT,
 *     c'est-a-dire qu'il l'etire ou la condense d'un seul tenant, posee a droite
 *     (flex-start en direction rtl). Ce n'est pas un jeu d'espaces : mesure faite
 *     mot a mot, la largeur de chaque mot imprime suit la mise a l'echelle
 *     uniforme (page 414 ligne 3, mot de 3,8116 em : 76,5 px mis a l'echelle
 *     contre 78 px imprimes, alors qu'un simple resserrement des espaces en
 *     predirait 93,9 ; page 604 ligne 3, mot de 2,5180 em : 70,3 contre 71) ;
 *   - elle reste nettement plus courte : il la centre, a sa largeur naturelle
 *     (page 604 ligne 15 : 8,1000 em, soit 241,4 px a 29,8 px/em, contre 242 px
 *     imprimes) ;
 *   - si la compression necessaire depasse COMPRESSION_MINIMALE, la ligne est
 *     signalee : c'est le seul cas ou la page ne peut pas etre fidele.
 *
 * La fonction est embarquee telle quelle dans la page par poseDeLigne.toString():
 * le telephone et le banc d'essai font donc tourner le MEME texte, et non deux
 * copies qui peuvent diverger.
 */
export function poseDeLigne(naturelle:number,colonne:number,partRemplie:number,compressionMinimale:number):PoseDeLigne{
  if(naturelle<colonne*partRemplie)return {justify:'center',facteur:1,depasse:false};
  const rapport=colonne/naturelle;
  if(rapport<compressionMinimale)return {justify:'flex-start',facteur:compressionMinimale,depasse:true};
  return {justify:'flex-start',facteur:rapport,depasse:false};
}

/**
 * La ligne porte-t-elle le medaillon du dernier verset d'une sourate ?
 *
 * Mesure faite sur les 604 pages : les 114 medaillons de fin de sourate sont sur
 * la meme ligne que le dernier mot de leur verset. Ce n'est PLUS ce qui decide de
 * la pose : le livre pose ses lignes d'apres leur largeur, et la mesure l'a
 * montre -- les lignes courtes qu'il centre comprennent aussi bien des fins de
 * sourate (page 604, 114:5 a 72,7 %) que la basmala (62,6 %). La fonction reste
 * parce qu'elle dit une chose vraie du livre -- seule la sonde
 * _inspect/sonde/page-unique.mjs s'en sert encore, pour afficher la pose de
 * chaque ligne -- mais elle ne gouverne plus le rendu : poseDeLigne() ne recoit
 * que des largeurs, donc aucune fin de sourate ne peut plus decider d'une pose.
 */
export function estFinDeSourate(mots:QcfV4Word[]):boolean{
  return mots.some(mot=>{
    if(mot.kind!=='end')return false;
    const [sourate,verset]=mot.verseKey.split(':').map(Number);
    return surahs[sourate-1]?.count===verset;
  });
}

/**
 * Ou poser une ligne AVANT que la mise en page ne mesure les largeurs reelles.
 * Toutes les lignes partent justifiees, sauf la page 1, ou Al-Fatiha est centree
 * dans son medaillon. fitPage() reprend ensuite chaque ligne sur sa largeur
 * mesuree, en appliquant la regle du livre : remplie d'un seul tenant si elle
 * occupe au moins PART_REMPLIE de la colonne, centree a sa largeur naturelle
 * sinon.
 */
export function alignementDeLigne(page:number):string{
  return page===1?'center':'space-between';
}

/**
 * Preserve the edition's numbered lines and insert only verified, reserved
 * decoration slots.
 *
 * La page est dessinee nue, sans cadre : c'est ainsi que la lecture de reference
 * la presente, et un cadre ne retrecissait la zone de texte sans rien apporter
 * que la page imprimee ne porte pas deja. En revanche elle garde la FORME de la
 * page imprimee (622 x 917) et ses marges, parce que c'est ce qui place les
 * versets : la colonne du livre vaut 16,15 em, et c'est cette proportion-la, et
 * non la largeur de l'ecran, qui decide de la taille de la lettre.
 */
export function qcfV4Html(data:QcfV4Page,playingVerseId:number|null,difficultyIds:number[],sessionStart:number,sessionEnd:number){
  const font=`https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/p${data.page}.woff2`;
  const lines=data.lines.map(line=>{
    const fixe=data.page===1;
    return `<div class="mushaf-row line" data-line="${line.number}"${fixe?' data-fixe="1"':''} style="grid-row:${line.number};justify-content:${alignementDeLigne(data.page)}">${line.words.map(word=>{
      const classes=['word',word.kind==='end'?'end':'',word.verseId===playingVerseId?'playing':'',difficultyIds.includes(word.verseId)?'difficult':'',word.verseId>=sessionStart&&word.verseId<=sessionEnd?'session':''].filter(Boolean).join(' ');
      const content=word.kind==='end'?ayahMarkerHtml(word.verseKey):escapeHtml(glyph(word.glyph));
      return `<span class="${classes}" data-verse="${word.verseId}" data-verse-key="${escapeHtml(word.verseKey)}">${content}</span>`;
    }).join('')}</div>`;
  }).join('');
  const decorations=data.decorations.map(item=>{
    if(item.kind==='basmala')return `<div class="mushaf-row basmala" data-line="${item.line}" data-surah="${item.surah}" style="grid-row:${item.line}"><span class="basmala-texte">${escapeHtml(verses[0].text)}</span></div>`;
    const name=surahs[item.surah-1]?.arabic;
    if(!name)throw new Error('Nom de sourate introuvable.');
    return `<div class="mushaf-row surah-header" data-line="${item.line}" data-surah="${item.surah}" style="grid-row:${item.line}"><span class="header-flourish" aria-hidden="true">✦</span><span class="header-name">سُورَةُ ${escapeHtml(name)}</span><span class="header-flourish" aria-hidden="true">✦</span></div>`;
  }).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta charset="utf-8"><style>
@font-face{font-family:qcf;src:url('${font}') format('woff2');font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fffdf7;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
html{display:flex;align-items:center;justify-content:center}
#page{--page-w:100vw;--page-h:calc(100vw*${PAGE_RATIO.toFixed(4)});width:var(--page-w);height:var(--page-h);padding:calc(var(--page-w)*${MARGE_VERTICALE}) calc(var(--page-w)*${MARGE_LATERALE});display:grid;grid-template-rows:repeat(${data.rowCount},minmax(0,1fr));align-items:center;overflow:visible;--word-size:calc(var(--page-w)*${TAILLE_PAGE.toFixed(6)})}
.mushaf-row{grid-column:1;min-width:0;min-height:0;max-width:100%;width:100%;align-self:stretch}
.line{display:flex;align-items:center;white-space:nowrap;direction:rtl;gap:0;font-family:qcf;font-size:var(--word-size);line-height:1.45;overflow:visible;transform-origin:right center}
.word{display:inline-block;position:relative;border-radius:4px;flex-shrink:0;white-space:nowrap}
.word.playing{background:rgba(194,90,132,.20);box-shadow:inset 0 -2px 0 rgba(171,59,106,.7)}
.word.difficult{background:rgba(225,67,67,.19)}.word.session:not(.playing):not(.difficult){background:rgba(207,178,104,.07)}
.end{display:inline-flex;align-items:center;justify-content:center;margin-inline:0 1px;line-height:1;vertical-align:middle}
.ayah-ornament{display:block;width:1.08em;height:1.08em;overflow:visible}
.end.playing,.end.difficult{background:transparent;box-shadow:none}
.end.playing .ayah-ornament{filter:drop-shadow(0 0 3px rgba(171,59,106,.9))}
.surah-header{height:78%;align-self:center;display:flex;align-items:center;justify-content:space-between;padding:0 4%;border:1.5px solid #a58b54;border-radius:30px;background:linear-gradient(90deg,#ddc899,#f8f1dc 21%,#fffdf5 50%,#f8f1dc 79%,#ddc899);box-shadow:inset 0 0 0 2px #fff9e9,inset 0 0 0 3px #c9b175;color:#294d49;white-space:nowrap}
.header-name{font-family:"Noto Naskh Arabic","Geeza Pro",serif;font-size:calc(var(--word-size)*.72);font-weight:700;line-height:1.25;text-align:center}
.header-flourish{font-family:serif;font-size:calc(var(--word-size)*.55);color:#9d7840;line-height:1}
.basmala{display:flex;align-items:center;justify-content:center;direction:rtl;white-space:nowrap;font-family:"Noto Naskh Arabic","Geeza Pro",serif;font-size:calc(var(--word-size)*.84);line-height:1.45;color:#27231e}
.basmala-texte{display:inline-block;transform-origin:center center}
</style></head><body><main id="page">${lines}${decorations}</main><script>
const bridge=window.ReactNativeWebView;let timer=null,startX=0,startY=0,held=false;
function emit(value){bridge&&bridge.postMessage(JSON.stringify(value))}
document.addEventListener('touchstart',e=>{const point=e.touches[0];startX=point.clientX;startY=point.clientY;held=false;const word=e.target.closest('[data-verse]');if(word)timer=setTimeout(()=>{held=true;emit({type:'verse',id:Number(word.dataset.verse)})},500)}, {passive:true});
document.addEventListener('touchmove',e=>{const p=e.touches[0];if(Math.abs(p.clientX-startX)>12||Math.abs(p.clientY-startY)>12)clearTimeout(timer)},{passive:true});
document.addEventListener('touchend',()=>{clearTimeout(timer);if(!held)emit({type:'tap'})},{passive:true});
document.addEventListener('contextmenu',e=>e.preventDefault());
function setPlaying(id){document.querySelectorAll('.playing').forEach(w=>w.classList.remove('playing'));if(id!==null)document.querySelectorAll('[data-verse="'+id+'"]').forEach(w=>w.classList.add('playing'))}
// La regle de pose du livre, embarquee telle quelle : le telephone et le banc
// d'essai font tourner le meme texte, et non deux copies qui peuvent diverger.
const poseDeLigne=${poseDeLigne.toString()};
function fitPage(){
  const page=document.getElementById('page'),lines=[...document.querySelectorAll('.line')];
  // 1. La page prend la FORME de la page imprimee (622 x 917), au plus grand qui
  //    tient dans la vue. Tout le reste en decoule : la taille de la lettre est
  //    0,047910 fois la largeur de la page, donc la colonne fait toujours 16,15 em,
  //    comme dans le livre.
  const largeur=Math.min(innerWidth,innerHeight/${PAGE_RATIO.toFixed(6)});
  page.style.setProperty('--page-w',largeur+'px');
  page.style.setProperty('--page-h',(largeur*${PAGE_RATIO.toFixed(6)})+'px');
  const colonne=largeur*(1-2*${MARGE_LATERALE});
  // 2. On repart des poses nues : mesurer une ligne deja comprimee donnerait la
  //    largeur d'apres transformation, et deux passages de suite comprimeraient
  //    deux fois.
  lines.forEach(line=>{line.style.transform='';line.style.justifyContent=line.dataset.fixe?'center':'space-between';});
  // 3. La largeur NATURELLE de chaque ligne : la somme des mots, et non
  //    scrollWidth, qui rend la largeur de la rangee des que le contenu est plus
  //    court qu'elle.
  const largeurs=lines.map(line=>[...line.children].reduce((somme,mot)=>somme+mot.getBoundingClientRect().width,0));
  // 4. La pose de chaque ligne, comme le livre la pose : remplie d'un seul
  //    tenant si elle occupe au moins PART_REMPLIE de la colonne, centree a sa
  //    largeur naturelle sinon. Le livre REMPLIT ses lignes en les etirant ou en
  //    les condensant, et non en jouant sur les espaces : sur les 8 820 lignes de
  //    mots des 604 pages, 96,9 % demandent plus que la colonne et sont
  //    condensees, 2,9 % demandent entre 80 et 100 % et sont etirees (la ligne 10
  //    de la page 350, a 92,7 %, est imprimee a 100 %), et 0,2 % seulement
  //    restent courtes et centrees. La regle elle-meme est poseDeLigne(),
  //    embarquee ci-dessus telle quelle.
  let debordement=null;
  lines.forEach((line,index)=>{
    if(line.dataset.fixe)return;
    const pose=poseDeLigne(largeurs[index],colonne,${PART_REMPLIE},${COMPRESSION_MINIMALE});
    if(pose.depasse)debordement=line;
    line.style.transform=pose.facteur===1?'':'scaleX('+pose.facteur.toFixed(4)+')';
    line.style.justifyContent=pose.justify;
  });
  // 5. La basmala du livre est etiree par un tatouil : 62,6 % de la colonne pour
  //    1,21 em de haut. Elle est ecrite ici dans une autre police, qui ne peut
  //    pas rendre cet aspect ; on la ramene au moins a la largeur de la colonne
  //    quand elle la depasse, pour qu'elle ne sorte jamais de la page.
  const basmala=document.querySelector('.basmala-texte');
  if(basmala){basmala.style.transform='';const naturelle=basmala.getBoundingClientRect().width;if(naturelle>colonne)basmala.style.transform='scaleX('+(colonne/naturelle).toFixed(4)+')';}
  if(debordement){emit({type:'layout-error',line:Number(debordement.dataset.line??0)});return false;}
  return true;
}
document.fonts.load('24px qcf').then(()=>{requestAnimationFrame(()=>{if(fitPage())emit({type:'ready'})})}).catch(()=>emit({type:'font-error'}));
window.addEventListener('resize',()=>requestAnimationFrame(fitPage));
</script></body></html>`;
}
