import {parseQcfV4Page,QcfV4Page} from '../core/qcfV4';
import {supabase} from './sync';

const cache=new Map<number,{page:QcfV4Page;until:number}>();
const sixHours=6*60*60*1000;

/** QF production credentials and OAuth tokens exist only inside the Edge Function. */
export async function loadQcfV4Page(number:number):Promise<QcfV4Page>{
  const saved=cache.get(number);
  if(saved&&saved.until>Date.now())return saved.page;
  if(!supabase)throw new Error('Connexion au Moushaf Tajweed indisponible.');
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('Connecte-toi pour charger cette édition Tajweed.');
  const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Connexion au Moushaf Tajweed indisponible.');
  const response=await fetch(`${url}/functions/v1/qcf-v4-page?page=${number}`,{
    headers:{authorization:`Bearer ${session.access_token}`,apikey:key},
  });
  if(!response.ok)throw new Error(response.status===401?'Reconnecte-toi pour charger cette édition Tajweed.':'Page Tajweed indisponible.');
  const parsed=parseQcfV4Page(number,await response.json());
  cache.set(number,{page:parsed,until:Date.now()+sixHours});
  return parsed;
}
