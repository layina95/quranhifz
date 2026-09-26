import {QcfV4Page} from './qcfV4';
import {ayahMarkerHtml} from './ayahMarker';
import {surahs,verses} from './quran';

function escapeHtml(text:string){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function glyph(code:string){return code.replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi,(_,hex:string,decimal:string)=>{
  const number=parseInt(hex??decimal,hex?16:10);
  return number>0&&number<=0x10ffff?String.fromCodePoint(number):'';
});}

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
  const lines=data.lines.map(line=>`<div class="mushaf-row line" data-line="${line.number}" style="grid-row:${line.number}">${line.words.map(word=>{
    const classes=['word',word.kind==='end'?'end':'',word.verseId===playingVerseId?'playing':'',difficultyIds.includes(word.verseId)?'difficult':'',word.verseId>=sessionStart&&word.verseId<=sessionEnd?'session':''].filter(Boolean).join(' ');
    const content=word.kind==='end'?ayahMarkerHtml(word.verseKey):escapeHtml(glyph(word.glyph));
    return `<span class="${classes}" data-verse="${word.verseId}" data-verse-key="${escapeHtml(word.verseKey)}">${content}</span>`;
  }).join('')}</div>`).join('');
  const decorations=data.decorations.map(item=>{
    if(item.kind==='basmala')return `<div class="mushaf-row basmala" data-line="${item.line}" data-surah="${item.surah}" style="grid-row:${item.line}">${escapeHtml(verses[0].text)}</div>`;
    const name=surahs[item.surah-1]?.arabic;
    if(!name)throw new Error('Nom de sourate introuvable.');
    return `<div class="mushaf-row surah-header" data-line="${item.line}" data-surah="${item.surah}" style="grid-row:${item.line}"><span class="header-flourish" aria-hidden="true">✦</span><span class="header-name">سُورَةُ ${escapeHtml(name)}</span><span class="header-flourish" aria-hidden="true">✦</span></div>`;
  }).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta charset="utf-8"><style>
@font-face{font-family:qcf;src:url('${font}') format('woff2');font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fffdf7;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#page{height:100%;width:100%;padding:2.2% 2.1%;display:grid;grid-template-rows:repeat(${data.rowCount},minmax(0,1fr));align-items:center;overflow:hidden;--word-size:26px}
.mushaf-row{grid-column:1;min-width:0;min-height:0;max-width:100%;width:100%;align-self:stretch}
.line{display:flex;justify-content:center;align-items:center;white-space:nowrap;direction:rtl;gap:0;font-family:qcf;font-size:var(--word-size);line-height:1.45;overflow:visible}
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
  const slotHeight=page.clientHeight/${data.rowCount};
  const base=Math.floor(Math.min(31,innerWidth*.072,slotHeight/1.45));
  const minimum=Math.max(19,Math.ceil(base*.88));
  for(let size=base;size>=minimum;size--){
    page.style.setProperty('--word-size',size+'px');
    const bad=rows.find(row=>row.scrollWidth>row.clientWidth+2||row.scrollHeight>row.clientHeight+3);
    const outside=lines.find(line=>[...line.children].some(word=>{const w=word.getBoundingClientRect(),r=line.getBoundingClientRect();return w.left<r.left-2||w.right>r.right+2||w.top<r.top-2||w.bottom>r.bottom+2}));
    if(!bad&&!outside&&document.documentElement.scrollHeight<=innerHeight+2)return true;
  }
  const bad=rows.find(row=>row.scrollWidth>row.clientWidth+2||row.scrollHeight>row.clientHeight+3);
  console.warn('QCF V4 : page ${data.page} dépasse la zone de lecture, ligne '+(bad?.dataset.line??'?'));
  emit({type:'layout-error',line:Number(bad?.dataset.line??0)});
  return false;
}
document.fonts.load('24px qcf').then(()=>{requestAnimationFrame(()=>{if(fitPage())emit({type:'ready'})})}).catch(()=>emit({type:'font-error'}));
window.addEventListener('resize',()=>requestAnimationFrame(fitPage));
</script></body></html>`;
}
