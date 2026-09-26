import {verseId} from './quran';

export type QcfV4Word = {
  verseId:number;
  verseKey:string;
  position:number;
  line:number;
  kind:string;
  glyph:string;
  unicode:string;
};

export type QcfV4Decoration={line:number;kind:'surahHeader'|'basmala';surah:number};
export type QcfV4Page = {page:number;lines:{number:number;words:QcfV4Word[]}[];decorations:QcfV4Decoration[];rowCount:number;firstVerseId:number;lastVerseId:number};

type ApiWord = {position?:unknown;page_number?:unknown;line_number?:unknown;char_type_name?:unknown;code_v2?:unknown;text_qpc_hafs?:unknown};
type ApiVerse = {verse_key?:unknown;words?:unknown};
type ApiPage = {verses?:unknown;pagination?:{total_pages?:unknown}};

/** Reject incomplete or mixed-edition API responses before they reach the reader. */
export function parseQcfV4Page(page:number,input:unknown):QcfV4Page {
  if(!Number.isInteger(page)||page<1||page>604)throw new Error('Numéro de page QCF V4 invalide.');
  const response=input as ApiPage|null;
  if(!response||!Array.isArray(response.verses)||response.verses.length===0||response.pagination?.total_pages!==1)
    throw new Error('Réponse QCF V4 incomplète : la page entière est nécessaire.');
  const lines=new Map<number,QcfV4Word[]>();
  const surahStarts=new Map<number,number>();
  let firstVerseId=0,lastVerseId=0;
  for(const verse of response.verses as ApiVerse[]){
    if(typeof verse.verse_key!=='string'||!/^\d{1,3}:\d{1,3}$/.test(verse.verse_key)||!Array.isArray(verse.words)||verse.words.length===0)
      throw new Error('Référence de verset QCF V4 invalide.');
    const [surah,ayah]=verse.verse_key.split(':').map(Number);
    const id=verseId(surah,ayah);
    if(id===null||lastVerseId&&id!==lastVerseId+1)throw new Error('Versets QCF V4 manquants ou hors ordre.');
    let lastPosition=0;
    for(const word of verse.words as ApiWord[]){
      if(!Number.isInteger(word.position)||Number(word.position)<=lastPosition)
        throw new Error('Ordre des mots QCF V4 invalide.');
      lastPosition=Number(word.position);
      // A verse may begin on the preceding page or finish on the next one.
      if(word.page_number!==page)continue;
      if(!Number.isInteger(word.line_number)||Number(word.line_number)<1||Number(word.line_number)>16)
        throw new Error('Ligne QCF V4 invalide.');
      const kind=typeof word.char_type_name==='string'?word.char_type_name:'word';
      if(kind==='word'&&(!word.code_v2||typeof word.code_v2!=='string'))throw new Error('Glyphe Tajweed QCF V4 manquant.');
      const line=Number(word.line_number);
      const mapped:QcfV4Word={verseId:id,verseKey:verse.verse_key,position:Number(word.position),line,kind,glyph:typeof word.code_v2==='string'?word.code_v2:'',unicode:typeof word.text_qpc_hafs==='string'?word.text_qpc_hafs:''};
      if(ayah===1&&kind==='word'&&Number(word.position)===1)surahStarts.set(surah,line);
      if(!lines.has(line))lines.set(line,[]);
      lines.get(line)!.push(mapped);
      if(!firstVerseId)firstVerseId=id;
      lastVerseId=id;
    }
  }
  if(!firstVerseId)throw new Error('Aucun mot sur cette page QCF V4.');
  const rowCount=Math.max(15,...lines.keys());
  const decorations:QcfV4Decoration[]=[];
  const occupied=new Set(lines.keys());
  for(const [surah,firstLine] of surahStarts){
    // QCF V4 reserves one line for the chapter title, then one for Basmala,
    // except Al-Fatiha (its Basmala is ayah 1) and At-Tawbah (no Basmala).
    const hasBasmala=surah!==1&&surah!==9;
    const headerLine=firstLine-(hasBasmala?2:1);
    if(headerLine<1||occupied.has(headerLine)||hasBasmala&&(occupied.has(firstLine-1)||firstLine-1<1))
      throw new Error(`Emplacement du bandeau de la sourate ${surah} non vérifié sur cette page QCF V4.`);
    decorations.push({line:headerLine,kind:'surahHeader',surah});
    occupied.add(headerLine);
    if(hasBasmala){decorations.push({line:firstLine-1,kind:'basmala',surah});occupied.add(firstLine-1);}
  }
  const ordered=[...lines].sort((a,b)=>a[0]-b[0]).map(([number,words])=>({number,words}));
  return {page,lines:ordered,decorations:decorations.sort((a,b)=>a.line-b.line),rowCount,firstVerseId,lastVerseId};
}
