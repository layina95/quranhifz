import {verseAt,verseId} from './quran';

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

/**
 * Ce que la page porte et que sa propre reponse ne porte pas. Le premier mot
 * d'une sourate qui ouvre la page suivante est dessine la-bas : sa ligne ne se
 * lit que dans la reponse de cette page-la.
 */
export type ContexteQcfV4 = {sourateSuivante?:{surah:number;ligne:number}};

/** Reject incomplete or mixed-edition API responses before they reach the reader. */
export function parseQcfV4Page(page:number,input:unknown,contexte?:ContexteQcfV4):QcfV4Page {
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
    if(id===null)throw new Error('Verset QCF V4 hors du Coran.');
    const mots=verse.words as ApiWord[];
    // Mesure faite sur la page 585 : la reponse annonce 80:41 et 80:42 alors que
    // tous leurs mots portent la page 586. Un verset qui ne dessine rien ici ne
    // peut pas creer de trou dans la suite des versets reellement dessines.
    if(!mots.some(word=>word.page_number===page))continue;
    if(lastVerseId&&id!==lastVerseId+1)throw new Error('Versets QCF V4 manquants ou hors ordre.');
    let lastPosition=0;
    for(const word of mots){
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
    // Mesure faite sur les 114 sourates : dix-huit sourates a basmala ont leur
    // premier mot en ligne 2, et pour chacune la page precedente s'arrete en
    // ligne 14. Le bandeau tient donc la ligne 15 de la page PRECEDENTE ; cette
    // page-ci ne porte que la basmala. Chercher le bandeau en ligne 0 levait une
    // erreur et rendait vingt-quatre pages illisibles.
    if(hasBasmala&&firstLine===2){
      decorations.push({line:1,kind:'basmala',surah});
      occupied.add(1);
      continue;
    }
    const headerLine=firstLine-(hasBasmala?2:1);
    if(headerLine<1||occupied.has(headerLine)||hasBasmala&&(occupied.has(firstLine-1)||firstLine-1<1))
      throw new Error(`Emplacement du bandeau de la sourate ${surah} non vérifié sur cette page QCF V4.`);
    decorations.push({line:headerLine,kind:'surahHeader',surah});
    occupied.add(headerLine);
    if(hasBasmala){decorations.push({line:firstLine-1,kind:'basmala',surah});occupied.add(firstLine-1);}
  }
  // Le bandeau d'une sourate qui ouvre la page suivante tient la derniere ligne
  // de CELLE-CI. Mesure faite sur les 114 sourates : celles dont le premier mot
  // est en ligne 2 ont leur bandeau sur la page precedente, et pour chacune cette
  // page s'arrete en ligne 14. Le premier mot de cette sourate est dessine sur la
  // page suivante, donc absent de cette reponse : sans ce contexte, son bandeau
  // n'existait nulle part et la derniere ligne restait vide.
  const suivante=contexte?.sourateSuivante;
  if(suivante&&suivante.ligne===2){
    if(occupied.has(rowCount))
      throw new Error(`Emplacement du bandeau de la sourate ${suivante.surah} non vérifié sur cette page QCF V4.`);
    decorations.push({line:rowCount,kind:'surahHeader',surah:suivante.surah});
    occupied.add(rowCount);
  }
  const ordered=[...lines].sort((a,b)=>a[0]-b[0]).map(([number,words])=>({number,words}));
  return {page,lines:ordered,decorations:decorations.sort((a,b)=>a.line-b.line),rowCount,firstVerseId,lastVerseId};
}

/**
 * Ce qui manque a une page reconstituee de sa seule reponse : les versets de son
 * debut ou de sa fin dont les mots sont dessines sur une voisine.
 *
 * Mesure faite sur les 604 pages : vingt-cinq pages sont dans ce cas, toujours
 * d'un seul cote, et chaque manque est effectivement annonce par la voisine
 * designee. La fonction est ici, dans le coeur, pour que l'application et la
 * sonde des 604 pages ne puissent pas diverger sur cette decision.
 */
export function manquesDePage(page:QcfV4Page,attendu:{start:number;end:number}):{tete:boolean;queue:boolean}{
  return {tete:page.firstVerseId!==attendu.start,queue:page.lastVerseId!==attendu.end};
}

/**
 * La page suivante ouvre-t-elle une sourate dont le bandeau tient la DERNIERE
 * ligne de celle-ci ? Rend le numero de cette sourate, ou null.
 *
 * Mesure faite sur les 114 sourates : les vingt sourates dont le premier mot est
 * en ligne 2 ont leur bandeau sur la page precedente, et pour chacune cette page
 * s'arrete en ligne 14. Le premier mot de cette sourate est dessine sur la page
 * suivante : sa ligne ne se lit que dans la reponse de celle-la, et sans elle le
 * bandeau n'existe nulle part. On ne la demande que si la derniere ligne est
 * libre, c'est-a-dire si le bandeau peut effectivement tenir ici.
 */
export function ouvreUneSourate(page:QcfV4Page,attendu:{start:number;end:number}):number|null{
  const apres=verseAt(attendu.end+1);
  if(!apres||apres.ayah!==1||apres.surah===1||apres.surah===9)return null;
  const derniere=page.lines.length?page.lines[page.lines.length-1].number:0;
  if(derniere>=page.rowCount)return null;
  return apres.surah;
}

function rangDeVerset(verse:ApiVerse):number{
  const cle=typeof verse.verse_key==='string'?verse.verse_key:'';
  const [surah,ayah]=cle.split(':').map(Number);
  return verseId(surah,ayah)??Number.MAX_SAFE_INTEGER;
}

/**
 * Reunir les reponses des pages voisines pour reconstituer UNE page.
 *
 * Une reponse de page annonce les versets de SA page, pas ceux dont les mots sont
 * dessines ailleurs : mesure faite sur les 604 pages, trente-six pages portent des
 * versets annonces par une voisine, et cinquante-six versets n'etaient dessines
 * nulle part parce que leur annonce et leur encre ne tombaient pas sur la meme
 * page. La page 585 en donne la forme exacte : sa reponse annonce 80:41 et 80:42,
 * dont tous les mots portent la page 586, ou ils tiennent la ligne 1.
 *
 * Le tri par reference de verset est necessaire : le parseur exige que les versets
 * reellement dessines se suivent, et les voisines arrivent dans le desordre.
 */
export function reunirReponses(page:number,reponses:unknown[]):unknown{
  const vus=new Set<string>();
  const verses:ApiVerse[]=[];
  for(const reponse of reponses){
    const liste=(reponse as ApiPage|null)?.verses;
    if(!Array.isArray(liste)||(reponse as ApiPage|null)?.pagination?.total_pages!==1)
      throw new Error('Réponse QCF V4 incomplète : la page entière est nécessaire.');
    for(const verse of liste as ApiVerse[]){
      const cle=verse?.verse_key;
      if(typeof cle!=='string'||vus.has(cle))continue;
      if(!Array.isArray(verse.words)||!verse.words.some(word=>(word as ApiWord)?.page_number===page))continue;
      vus.add(cle);
      verses.push(verse);
    }
  }
  verses.sort((a,b)=>rangDeVerset(a)-rangDeVerset(b));
  return {pagination:{total_pages:1},verses};
}

/**
 * Le premier mot d'une sourate dans une reponse de page, quand cette page en
 * ouvre une : sa ligne dit ou tient le bandeau de la sourate.
 */
export function ouvertureDeSourate(input:unknown):{surah:number;ligne:number}|null{
  const liste=(input as ApiPage|null)?.verses;
  if(!Array.isArray(liste))return null;
  for(const verse of liste as ApiVerse[]){
    if(typeof verse.verse_key!=='string'||!Array.isArray(verse.words))continue;
    const [surah,ayah]=verse.verse_key.split(':').map(Number);
    if(ayah!==1)continue;
    const premier=(verse.words as ApiWord[]).find(word=>word.char_type_name==='word'&&Number(word.position)===1);
    if(!premier||!Number.isInteger(premier.line_number))return null;
    return {surah,ligne:Number(premier.line_number)};
  }
  return null;
}

/**
 * Chaque code du serveur a une cause distincte, et une cause distincte demande
 * une action distincte. Les confondre ferait chercher une panne de reseau la ou
 * il manque un deploiement. Mesure faite sur le projet : une fonction absente
 * repond 404 avec « Requested function was not found », une fonction presente
 * dont les identifiants Quran Foundation manquent repond 503, et une session
 * refusee repond 401.
 */
export function messageDeRefus(statut:number):string{
  if(statut===401)return 'Reconnecte-toi pour charger cette édition Tajweed.';
  if(statut===404)return 'La page Tajweed n’est pas installée sur ce serveur.';
  if(statut===503)return 'Ce serveur n’a pas les identifiants Quran Foundation.';
  return 'Page Tajweed indisponible.';
}

/**
 * Le meme service sert les memes pages par une seconde route, sans identifiant :
 * l'API publique api.quran.com. Mesure faite le 26 septembre 2026 : elle rend
 * pour les 604 pages le placement du Moushaf imprime -- le champ page_number de
 * chaque mot -- et le parseur accepte ses 604 reponses, 83 665 mots au total.
 * Elle n'est donc pas un pis-aller approximatif : c'est la meme edition.
 *
 * Attention : cette route annonce les versets par la page ou ils sont LISTES,
 * qui n'est pas toujours celle ou ils sont DESSINES. C'est reunirReponses() qui
 * reconstitue la page, en interrogeant aussi les voisines.
 */
export const API_PUBLIQUE='https://api.quran.com/api/v4';

/**
 * mushaf=19 designe l'edition QCF V4 : une autre edition rendrait les glyphes
 * d'une autre mise en page. word_fields doit porter code_v2, sans quoi le mot
 * n'a pas de glyphe et le parseur refuse la page.
 */
export function urlApiPublique(page:number):string{
  return `${API_PUBLIQUE}/verses/by_page/${page}?mushaf=19&words=true&word_fields=code_v2,text_qpc_hafs&per_page=50`;
}

/**
 * Seule l'absence de la fonction est durable : elle se retient, pour ne pas
 * payer une requete perdue a chaque page. Une panne passagere (502, 503) ne se
 * retient pas, sinon un incident d'une seconde condamnerait la route privee
 * pour toute la session.
 */
export function fonctionAbsenteDuServeur(statut:number):boolean{
  return statut===404;
}

export function messageApiPublique(statut:number):string{
  if(statut===429)return 'Trop de pages Tajweed demandées ; réessaie dans un instant.';
  if(statut>=500)return 'Le service des pages Tajweed est momentanément indisponible.';
  return 'La page Tajweed n’a pas pu être obtenue.';
}
