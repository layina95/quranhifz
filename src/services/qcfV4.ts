import {
  fonctionAbsenteDuServeur,
  messageApiPublique,
  messageDeRefus,
  parseQcfV4Page,
  urlApiPublique,
  QcfV4Page,
} from '../core/qcfV4';
import {supabase} from './sync';

const cache=new Map<number,{page:QcfV4Page;until:number}>();
const sixHours=6*60*60*1000;

/**
 * Mesure du 26 septembre 2026 : la fonction Edge qcf-v4-page est deployee sur
 * l'ancien projet Supabase (401, donc presente mais refusant la session) et
 * ABSENTE du projet courant (404 « Requested function was not found »). Le mode
 * affichait donc « la page n'est pas installee sur ce serveur » sur un
 * telephone reel. On ne peut pas deployer cette fonction depuis l'application ;
 * en revanche l'API publique sert la meme edition sans identifiant, et ses 604
 * pages ont ete confrontees a pageRange() : aucune divergence.
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

async function parApiPublique(page:number):Promise<QcfV4Page>{
  const response=await fetch(urlApiPublique(page));
  if(!response.ok)throw new Error(messageApiPublique(response.status));
  return parseQcfV4Page(page,await response.json());
}

export async function loadQcfV4Page(number:number):Promise<QcfV4Page>{
  const saved=cache.get(number);
  if(saved&&saved.until>Date.now())return saved.page;

  let page:QcfV4Page;
  if(fonctionAbsente){
    page=await parApiPublique(number);
  }else{
    let reponse:ReponseFonction;
    try{
      reponse=await parFonction(number);
    }catch{
      // Panne reseau sur la route privee : on ne la retient pas, elle peut
      // n'avoir dure qu'un instant.
      reponse={statut:0};
    }
    if(reponse.statut===200&&reponse.corps!==undefined){
      page=parseQcfV4Page(number,reponse.corps);
    }else{
      if(fonctionAbsenteDuServeur(reponse.statut))fonctionAbsente=true;
      try{
        page=await parApiPublique(number);
      }catch(e){
        // Les deux routes ont echoue : le message de la route privee est le
        // plus precis sur la cause, on le prefere a un message generique.
        const motif=e instanceof Error?e.message:String(e);
        throw new Error(reponse.statut===200?motif:`${messageDeRefus(reponse.statut)} ${motif}`);
      }
    }
  }

  cache.set(number,{page,until:Date.now()+sixHours});
  return page;
}
