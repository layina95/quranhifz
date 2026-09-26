import {QcfV4Page,QcfV4Word} from './qcfV4';
import {ayahMarkerHtml} from './ayahMarker';
import {surahs,verses} from './quran';

function escapeHtml(text:string){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function glyph(code:string){return code.replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi,(_,hex:string,decimal:string)=>{
  const number=parseInt(hex??decimal,hex?16:10);
  return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';
});}

/**
 * La ligne porte-t-elle le médaillon du dernier verset d'une sourate ?
 *
 * Mesure faite sur les pages imprimees 7, 528, 586 et 604, en lisant l'etendue de
 * l'encre de chaque ligne (sonde _inspect/pages-imprimees/etendue-lignes.py) : le
 * livre REMPLIT ses lignes d'un bord a l'autre -- 100 % de la colonne sur les
 * quinze lignes de la page 7 -- et laisse courtes celles qui terminent une
 * sourate, posees contre le bord DROIT : 62,6 % sur la page 528, 59,3 % et 54,1 %
 * sur la page 604.
 *
 * Le medaillon, et non le dernier mot, parce qu'un verset peut tenir sur deux
 * lignes : compter les versets dont le dernier mot est sur la ligne en designait
 * 216 au lieu de 114, et la page 604 marquait sa ligne 14 -- qui porte 114:5 --
 * comme une fin de sourate. Mesure faite sur les 604 pages : les 114 medaillons
 * de fin de sourate sont sur la meme ligne que le dernier mot de leur verset,
 * donc les deux regles s'accordent quand elles sont justes, et seule celle-ci ne
 * se trompe jamais.
 */
export function estFinDeSourate(mots:QcfV4Word[]):boolean{
  return mots.some(mot=>{
    if(mot.kind!=='end')return false;
    const [sourate,verset]=mot.verseKey.split(':').map(Number);
    return surahs[sourate-1]?.count===verset;
  });
}

/**
 * Ou poser une ligne dans la largeur de la page, avant que la mise en page ne
 * mesure les largeurs reelles. La page 1 fait exception : Al-Fatiha y est
 * centree dans son medaillon.
 *
 * Ce n'est qu'une premiere pose : fitPage() reprend l'alignement de chaque ligne
 * sur sa largeur mesuree, parce qu'une ligne peut rester courte sans terminer de
 * sourate -- la page 604 en donne le cas, sa ligne 14 porte 114:5 seule a 72,7 %
 * de la colonne pour garder le dernier verset du Coran sur sa propre ligne.
 */
export function alignementDeLigne(page:number,mots:QcfV4Word[]):string{
  if(page===1)return 'center';
  return estFinDeSourate(mots)?'flex-start':'space-between';
}

/**
 * Preserve the edition's numbered lines and insert only verified, reserved
 * decoration slots.
 *
 * La page est dessinee nue, sans cadre : c'est ainsi que la lecture de reference
 * la presente, et un cadre ne retrecissait la zone de texte sans rien apporter
 * que la page imprimee ne porte pas deja.
 */
export function qcfV4Html(data:QcfV4Page,playingVerseId:number|null,difficultyIds:number[],sessionStart:number,sessionEnd:number){
  const font=`https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/p${data.page}.woff2`;
  const lines=data.lines.map(line=>{
    const fin=estFinDeSourate(line.words);
    const fixe=data.page===1;
    return `<div class="mushaf-row line" data-line="${line.number}" data-fin="${fin?1:0}"${fixe?' data-fixe="1"':''} style="grid-row:${line.number};justify-content:${alignementDeLigne(data.page,line.words)}">${line.words.map(word=>{
      const classes=['word',word.kind==='end'?'end':'',word.verseId===playingVerseId?'playing':'',difficultyIds.includes(word.verseId)?'difficult':'',word.verseId>=sessionStart&&word.verseId<=sessionEnd?'session':''].filter(Boolean).join(' ');
      const content=word.kind==='end'?ayahMarkerHtml(word.verseKey):escapeHtml(glyph(word.glyph));
      return `<span class="${classes}" data-verse="${word.verseId}" data-verse-key="${escapeHtml(word.verseKey)}">${content}</span>`;
    }).join('')}</div>`;
  }).join('');
  const decorations=data.decorations.map(item=>{
    if(item.kind==='basmala')return `<div class="mushaf-row basmala" data-line="${item.line}" data-surah="${item.surah}" style="grid-row:${item.line}">${escapeHtml(verses[0].text)}</div>`;
    const name=surahs[item.surah-1]?.arabic;
    if(!name)throw new Error('Nom de sourate introuvable.');
    return `<div class="mushaf-row surah-header" data-line="${item.line}" data-surah="${item.surah}" style="grid-row:${item.line}"><span class="header-flourish" aria-hidden="true">✦</span><span class="header-name">سُورَةُ ${escapeHtml(name)}</span><span class="header-flourish" aria-hidden="true">✦</span></div>`;
  }).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta charset="utf-8"><style>
@font-face{font-family:qcf;src:url('${font}') format('woff2');font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fffdf7;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#page{height:100%;width:100%;padding:2.2% 2.1%;display:grid;grid-template-rows:repeat(${data.rowCount},minmax(0,1fr));align-items:center;overflow:hidden;--word-size:18px}
.mushaf-row{grid-column:1;min-width:0;min-height:0;max-width:100%;width:100%;align-self:stretch}
.line{display:flex;align-items:center;white-space:nowrap;direction:rtl;gap:0;font-family:qcf;font-size:var(--word-size);line-height:1.45;overflow:visible}
#page.mesure .line{justify-content:flex-start!important}
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
</style></head><body><main id="page">${lines}${decorations}</main><script>
const bridge=window.ReactNativeWebView;let timer=null,startX=0,startY=0,held=false;
function emit(value){bridge&&bridge.postMessage(JSON.stringify(value))}
document.addEventListener('touchstart',e=>{const point=e.touches[0];startX=point.clientX;startY=point.clientY;held=false;const word=e.target.closest('[data-verse]');if(word)timer=setTimeout(()=>{held=true;emit({type:'verse',id:Number(word.dataset.verse)})},500)}, {passive:true});
document.addEventListener('touchmove',e=>{const p=e.touches[0];if(Math.abs(p.clientX-startX)>12||Math.abs(p.clientY-startY)>12)clearTimeout(timer)},{passive:true});
document.addEventListener('touchend',()=>{clearTimeout(timer);if(!held)emit({type:'tap'})},{passive:true});
document.addEventListener('contextmenu',e=>e.preventDefault());
function setPlaying(id){document.querySelectorAll('.playing').forEach(w=>w.classList.remove('playing'));if(id!==null)document.querySelectorAll('[data-verse="'+id+'"]').forEach(w=>w.classList.add('playing'))}
function fitPage(){
  const page=document.getElementById('page'),rows=[...document.querySelectorAll('.mushaf-row')],lines=[...document.querySelectorAll('.line')];
  // La hauteur utile se compte hors des marges : le style donne a #page une
  // marge verticale de 2,2 % de la largeur, qui n'est pas de la place de texte.
  const marge=innerWidth*0.022;
  const slotHeight=(page.clientHeight-2*marge)/${data.rowCount};
  // Mesure des 604 pages, avances reelles de chaque police (sonde
  // _inspect/tajweed2/analyser-mesures.mjs) : chaque page a sa propre echelle --
  // les lignes de la page 7 font 16,2 a 17,4 em, celles de la page 549 15,1 --
  // donc c'est la ligne la plus large DE LA PAGE qui donne sa taille. Sur 390 px,
  // elle demande 28,00 px pour la page 1 (13,3456 em, ligne 4) et 16,77 px pour
  // la page 414, ligne 3 (22,2856 em, la plus large du livre) ; sur 320 px,
  // 13,76 px au minimum. Le plafond suit donc la largeur -- 0,074 laisse 3,09 %
  // au-dessus du 0,07178 qu'exige la page la plus etroite -- et le plancher est
  // une taille de lecture fixe, surtout pas un pourcentage du plafond : a 88 %
  // du plafond il valait 25 px, et 602 pages sur 604 ne pouvaient pas tenir, ce
  // qui affichait « la ligne X ne tient pas » a la place de la page.
  const plafond=Math.floor(Math.min(32,Math.ceil(innerWidth*.074),slotHeight/1.45));
  const PLANCHER=12;
  // Pendant la recherche, chaque ligne est posee a sa largeur NATURELLE : une
  // ligne justifiee remplit toujours sa rangee, donc elle ne dirait plus rien de
  // la place que le texte demande, et la taille cherchee deviendrait celle qui
  // fait tenir la hauteur, sans limite de largeur.
  page.classList.add('mesure');
  let taille=0;
  for(let size=plafond;size>=PLANCHER;size--){
    page.style.setProperty('--word-size',size+'px');
    const bad=rows.find(row=>row.scrollWidth>row.clientWidth+2||row.scrollHeight>row.clientHeight+3);
    const outside=lines.find(line=>[...line.children].some(word=>{const w=word.getBoundingClientRect(),r=line.getBoundingClientRect();return w.left<r.left-2||w.right>r.right+2||w.top<r.top-2||w.bottom>r.bottom+2}));
    if(!bad&&!outside&&document.documentElement.scrollHeight<=innerHeight+2){taille=size;break;}
  }
  if(taille){
    // L'alignement se pose maintenant, sur les largeurs REELLES : la ligne la
    // plus large donne la largeur de la colonne du livre. Mesure faite sur les
    // pages imprimees 7, 528, 586 et 604, une ligne pleine occupe au moins 93 %
    // de la colonne et une ligne courte au plus 73 %. Le seuil de 80 % separe les
    // deux, et il attrape la ligne 14 de la page 604, courte a 72,7 % sans
    // terminer de sourate.
    const largeurs=lines.map(line=>line.scrollWidth);
    const colonne=Math.max(1,...largeurs);
    lines.forEach((line,index)=>{
      if(line.dataset.fixe)return;
      line.style.justifyContent=line.dataset.fin==='1'||largeurs[index]<colonne*0.8?'flex-start':'space-between';
    });
    page.classList.remove('mesure');
    return true;
  }
  page.classList.remove('mesure');
  const bad=rows.find(row=>row.scrollWidth>row.clientWidth+2||row.scrollHeight>row.clientHeight+3);
  console.warn('QCF V4 : page ${data.page} dépasse la zone de lecture même a '+PLANCHER+' px, ligne '+(bad?.dataset.line??'?'));
  emit({type:'layout-error',line:Number(bad?.dataset.line??0)});
  return false;
}
document.fonts.load('24px qcf').then(()=>{requestAnimationFrame(()=>{if(fitPage())emit({type:'ready'})})}).catch(()=>emit({type:'font-error'}));
window.addEventListener('resize',()=>requestAnimationFrame(fitPage));
</script></body></html>`;
}
