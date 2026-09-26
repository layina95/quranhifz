import {
  ContexteQcfV4,
  fonctionAbsenteDuServeur,
  manquesDePage,
  messageApiPublique,
  messageDeRefus,
  ouvertureDeSourate,
  ouvreUneSourate,
  parseQcfV4Page,
  reunirReponses,
  urlApiPublique,
  QcfV4Page,
} from '../core/qcfV4';
import {pageRange} from '../core/quran';
import {supabase} from './sync';

const cache=new Map<number,{page:QcfV4Page;until:number}>();
const sixHours=6*60*60*1000;

/**
 * Mesure du 26 septembre 2026 : la fonction Edge qcf-v4-page est deployee sur
 * l'ancien projet Supabase (401, donc presente mais refusant la session) et
 * ABSENTE du projet courant (404 « Requested function was not found »). Le mode
 * affichait donc « la page n'est pas installee sur ce serveur » sur un
 * telephone reel. On ne peut pas deployer cette fonction depuis l'application ;
 * en revanche l'API publique sert la meme edition sans identifiant.
 *
 * La route privee reste preferee quand elle repond : c'est celle du projet, et
 * c'est elle qui portera les identifiants Quran Foundation le jour du
 * deploiement. On ne bascule qu'apres l'avoir interrogee.
 */
let fonctionAbsente=false;

type ReponseFonction={statut:number;corps?:unknown};

async function parFonction(page:number):Promise<ReponseFonction>{
  if(!supabase)return {statut:0};
  const {data:{session}}=await supabase.auth.getSession();
  // Sans session la route privee est hors d'atteinte ; l'API publique, non.
  if(!session)return {statut:401};
  const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return {statut:0};
  const response=await fetch(`${url}/functions/v1/qcf-v4-page?page=${page}`,{
    headers:{authorization:`Bearer ${session.access_token}`,apikey:key},
  });
  if(!response.ok)return {statut:response.status};
  return {statut:response.status,corps:await response.json()};
}

async function parApiPublique(page:number):Promise<unknown>{
  const response=await fetch(urlApiPublique(page));
  if(!response.ok)throw new Error(messageApiPublique(response.status));
  return await response.json();
}

/**
 * La reponse brute d'une page : la route du projet quand elle repond, l'API
 * publique sinon. Les reponses sont gardees un moment, car la reconstitution
 * d'une page demande parfois celle de sa voisine, et la voisine est souvent la
 * page que l'on tourne juste apres.
 */
const brutes=new Map<number,unknown>();
const gardees=8;

async function chargerBrut(page:number):Promise<unknown>{
  const gardee=brutes.get(page);
  if(gardee!==undefined)return gardee;
  let corps:unknown;
  if(fonctionAbsente){
    corps=await parApiPublique(page);
  }else{
    let reponse:ReponseFonction;
    try{
      reponse=await parFonction(page);
    }catch{
      // Panne reseau sur la route privee : on ne la retient pas, elle peut
      // n'avoir dure qu'un instant.
      reponse={statut:0};
    }
    if(reponse.statut===200&&reponse.corps!==undefined){
      corps=reponse.corps;
    }else{
      if(fonctionAbsenteDuServeur(reponse.statut))fonctionAbsente=true;
      try{
        corps=await parApiPublique(page);
      }catch(e){
        // Les deux routes ont echoue : le message de la route privee est le
        // plus precis sur la cause, on le prefere a un message generique.
        const motif=e instanceof Error?e.message:String(e);
        throw new Error(reponse.statut===200?motif:`${messageDeRefus(reponse.statut)} ${motif}`);
      }
    }
  }
  if(brutes.size>=gardees)brutes.delete(brutes.keys().next().value as number);
  brutes.set(page,corps);
  return corps;
}

export async function loadQcfV4Page(number:number):Promise<QcfV4Page>{
  const saved=cache.get(number);
  if(saved&&saved.until>Date.now())return saved.page;

  const attendu=pageRange(number);
  const sienne=await chargerBrut(number);
  let page=parseQcfV4Page(number,reunirReponses(number,[sienne]));

  // Deux raisons, distinctes, d'interroger une voisine.
  //
  // 1. Les mots des premiers ou derniers versets de la page peuvent etre dessines
  //    sur la voisine : la page qui les annonce n'est alors pas celle qui les
  //    porte. Mesure faite sur les 604 pages : trente-six pages sont dans ce cas,
  //    et cinquante-six versets etaient dessines nulle part sans cela. La page 585
  //    en donne la forme exacte : elle annonce 80:41 et 80:42, dont tous les mots
  //    portent la page 586, ou ils tiennent la ligne 1.
  //
  // 2. La page suivante peut ouvrir une sourate dont le bandeau tient la derniere
  //    ligne de CELLE-CI : mesure faite sur les 114 sourates, les vingt sourates
  //    dont le premier mot est en ligne 2 ont leur bandeau sur la page
  //    precedente, et pour chacune cette page s'arrete en ligne 14. Le premier mot
  //    de cette sourate est dessine sur la page suivante : sa ligne ne se lit que
  //    dans sa reponse. On ne l'interroge que si la derniere ligne est libre,
  //    c'est-a-dire si le bandeau peut effectivement tenir ici.
  const voisines:unknown[]=[];
  let contexte:ContexteQcfV4|undefined;
  try{
    const manques=manquesDePage(page,attendu);
    if(manques.tete&&number>1)voisines.push(await chargerBrut(number-1));
    if(manques.queue&&number<604)voisines.push(await chargerBrut(number+1));
    const attendue=number<604?ouvreUneSourate(page,attendu):null;
    if(attendue!==null){
      const ouverture=ouvertureDeSourate(await chargerBrut(number+1));
      if(ouverture&&ouverture.surah===attendue)contexte={sourateSuivante:ouverture};
    }
  }catch(e){
    // Sans la voisine la page serait visiblement incomplete : une ligne vide en
    // tete ou en queue, ou un bandeau de sourate absent. Mieux vaut l'annoncer.
    throw new Error(`Cette page n’a pas pu être réunie entièrement : ${e instanceof Error?e.message:String(e)}`);
  }
  if(voisines.length||contexte)page=parseQcfV4Page(number,reunirReponses(number,[sienne,...voisines]),contexte);

  cache.set(number,{page,until:Date.now()+sixHours});
  return page;
}
