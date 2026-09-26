import {supabase} from './sync';
import {audioFileName,audioMime,DailyCategory,DailyCategoryInput,DailyContent,DailyContentInput,DailyFavorite,DailyKind} from '../core/daily';

// Rappels et invocations : la couche qui parle a la base. Le contenu du jour est
// choisi par la base (planification, sinon rotation), l'application ne fait que
// l'afficher. Aucune notion de score, de niveau ni de progression : on lit, on
// ecoute, on comprend, on met en favori, on partage.
//
// Le vocabulaire et les regles pures vivent dans `core/daily`, ou ils sont
// eprouvables sans base ni interface. Ils sont reexportes ici pour que les
// ecrans n'aient qu'un seul point d'entree.

export type {DailyCategory,DailyCategoryInput,DailyContent,DailyContentInput,DailyFavorite,DailyKind};
export {audioMime,audioFileName,audioPickerTypes,dailyKinds,dailyKindLabel,dailyKindTab,dailyKindHeading,dailyKindEmpty,dailyKindCategoryLabel,dailyShareText,MAX_AUDIO_BYTES,NOTIFICATION_MIN_LENGTH,NOTIFICATION_TITLE_MAX,NOTIFICATION_BODY_MAX,notificationDuJour,notificationEnvoyable} from '../core/daily';

function client(){
  if(!supabase)throw new Error('Connexion Supabase requise.');
  return supabase;
}

async function signedIn(){
  const {data:{session}}=await client().auth.getSession();
  if(!session)throw new Error('Connecte-toi pour continuer.');
  return session.user.id;
}

type ContentRow={
  id:string;kind:DailyKind;category_id:string|null;title:string;arabic_text:string|null;
  phonetic:string|null;translation:string|null;explanation:string|null;source:string|null;
  audio_path:string|null;position:number;active:boolean;
};
const fromRow=(row:ContentRow):DailyContent=>({
  id:row.id,kind:row.kind,categoryId:row.category_id,category:null,title:row.title,
  arabicText:row.arabic_text,phonetic:row.phonetic,translation:row.translation,
  explanation:row.explanation,source:row.source,audioPath:row.audio_path,
  position:row.position,active:row.active,planned:false,
});

type DateRow={
  id:string;kind:DailyKind;category:string|null;title:string;arabic_text:string|null;
  phonetic:string|null;translation:string|null;explanation:string|null;source:string|null;
  audio_path:string|null;planned:boolean;
};

// ------------------------------------------------------------------ lecture ----

/**
 * Le contenu d'une journee, en un seul appel : ce qui a ete planifie, sinon le
 * repli. Une ligne par type au maximum.
 */
export async function dailyForDate(date:string):Promise<DailyContent[]>{
  if(!supabase)return [];
  const {data,error}=await supabase.rpc('daily_content_for_date',{p_date:date});
  if(error)throw error;
  return ((data??[]) as DateRow[]).map(row=>({
    id:row.id,kind:row.kind,categoryId:null,category:row.category,title:row.title,
    arabicText:row.arabic_text,phonetic:row.phonetic,translation:row.translation,
    explanation:row.explanation,source:row.source,audioPath:row.audio_path,
    position:0,active:true,planned:row.planned,
  }));
}

/**
 * Meme chose, gardee en memoire pour la journee.
 *
 * L'ecran d'accueil et la page complete demandent le meme contenu : sans ce
 * cache, ouvrir la page relancerait la requete. La cle est la date, donc le
 * passage a minuit suffit a renouveler ; une modification administrateur
 * appelle `invalidateDailyCache()`.
 */
let cacheJour:{date:string;rows:DailyContent[]}|null=null;
export function invalidateDailyCache(){cacheJour=null;}
export async function dailyForDateCached(date:string):Promise<DailyContent[]>{
  if(cacheJour?.date===date)return cacheJour.rows;
  const rows=await dailyForDate(date);
  cacheJour={date,rows};
  return rows;
}

/** Les categories actives. Un administrateur voit aussi les desactivees. */
export async function listCategories(kind?:DailyKind):Promise<DailyCategory[]>{
  if(!supabase)return [];
  let query=supabase.from('daily_content_categories').select('id,kind,name,icon,position,active').order('position').order('name');
  if(kind)query=query.eq('kind',kind);
  const {data,error}=await query;
  if(error)throw error;
  return (data??[]) as DailyCategory[];
}

/** Les contenus. RLS cache les desactives a tout le monde sauf a l'administrateur. */
export async function listContents(kind?:DailyKind):Promise<DailyContent[]>{
  if(!supabase)return [];
  let query=supabase
    .from('daily_contents')
    .select('id,kind,category_id,title,arabic_text,phonetic,translation,explanation,source,audio_path,position,active')
    .order('position')
    .order('created_at');
  if(kind)query=query.eq('kind',kind);
  const {data,error}=await query;
  if(error)throw error;
  return ((data??[]) as ContentRow[]).map(fromRow);
}

export async function listFavorites():Promise<DailyFavorite[]>{
  if(!supabase)return [];
  const {data,error}=await supabase.rpc('my_daily_favorites');
  if(error)throw error;
  return ((data??[]) as (Omit<DateRow,'planned'>&{created_at:string})[]).map(row=>({
    id:row.id,kind:row.kind,category:row.category,title:row.title,arabicText:row.arabic_text,
    phonetic:row.phonetic,translation:row.translation,explanation:row.explanation,
    source:row.source,audioPath:row.audio_path,favoritedAt:row.created_at,
  }));
}

export async function addFavorite(contentId:string):Promise<void>{
  const userId=await signedIn();
  const {error}=await client().from('daily_content_favorites').insert({user_id:userId,content_id:contentId});
  if(error&&!/duplicate|unique/i.test(error.message))throw error;
}

export async function removeFavorite(contentId:string):Promise<void>{
  const userId=await signedIn();
  const {error}=await client().from('daily_content_favorites').delete().eq('user_id',userId).eq('content_id',contentId);
  if(error)throw error;
}

// -------------------------------------------------------------------- audio ----

/**
 * Adresse signee du fichier audio. Une heure : le bucket est prive, et une
 * adresse permanente ne doit pas circuler.
 */
export async function signedDailyAudioUrl(path:string):Promise<string>{
  if(!supabase)throw new Error('Connexion Supabase requise.');
  const {data,error}=await supabase.storage.from('daily-content-audio').createSignedUrl(path,3600);
  if(error||!data)throw error??new Error('Audio indisponible.');
  return data.signedUrl;
}

/**
 * Envoi du fichier audio, avec une progression reelle.
 *
 * Le client Supabase enverrait la meme chose, mais sans dire ou il en est : il
 * n'expose aucun evenement. On reprend donc exactement la forme qu'il envoie —
 * un FormData, le fichier dans un champ vide — et on l'emet par XMLHttpRequest,
 * qui, lui, rapporte l'avancement.
 */
export async function uploadDailyAudio(
  uri:string,
  kind:DailyKind,
  onProgress:(ratio:number)=>void,
):Promise<string>{
  const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Connexion Supabase requise.');
  const {data:{session}}=await client().auth.getSession();
  const token=session?.access_token;
  if(!token)throw new Error('Connecte-toi pour envoyer un fichier audio.');
  const fileName=audioFileName(uri,kind);
  const mime=audioMime(fileName);
  const path=`${kind}/${Date.now().toString(36)}-${fileName}`;
  const corps=new FormData();
  corps.append('cacheControl','3600');
  // Nom de champ vide et non « file » : c'est ce que le client officiel envoie,
  // donc la forme que le service accepte. Un nom different marcherait peut-etre,
  // un nom identique est sur.
  corps.append('',{uri,name:fileName,type:mime} as unknown as Blob);
  await new Promise<void>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',`${url}/storage/v1/object/daily-content-audio/${encodeURIComponent(path)}`);
    xhr.setRequestHeader('Authorization',`Bearer ${token}`);
    xhr.setRequestHeader('apikey',key);
    xhr.setRequestHeader('x-upsert','false');
    xhr.upload.onprogress=event=>{if(event.lengthComputable&&event.total>0)onProgress(event.loaded/event.total);};
    xhr.onload=()=>{
      if(xhr.status>=200&&xhr.status<300){onProgress(1);resolve();return;}
      if(xhr.status===400||xhr.status===413)reject(new Error('Fichier refuse : il dépasse 5 Mo ou son format n’est pas accepté.'));
      else if(xhr.status===401||xhr.status===403)reject(new Error('Envoi refusé. Vérifie que tu es bien administrateur.'));
      else reject(new Error(`L’envoi a échoué (code ${xhr.status}). Réessaie dans un instant.`));
    };
    xhr.onerror=()=>reject(new Error('Envoi interrompu. Vérifie ta connexion, puis réessaie.'));
    xhr.send(corps);
  });
  return path;
}

export async function deleteDailyAudio(path:string):Promise<void>{
  if(!supabase)return;
  const {error}=await supabase.storage.from('daily-content-audio').remove([path]);
  if(error)throw error;
}

// ------------------------------------------------------------------- ecriture --

export async function saveContent(input:DailyContentInput,id?:string):Promise<void>{
  const userId=await signedIn();
  const values={
    kind:input.kind,category_id:input.categoryId,title:input.title.trim(),
    arabic_text:input.arabicText.trim()||null,phonetic:input.phonetic.trim()||null,
    translation:input.translation.trim()||null,explanation:input.explanation.trim()||null,
    source:input.source.trim()||null,
    audio_path:input.audioPath,position:input.position,active:input.active,
  };
  if(!values.title)throw new Error('Le titre est obligatoire.');
  const {error}=id
    ?await client().from('daily_contents').update(values).eq('id',id)
    :await client().from('daily_contents').insert({...values,created_by:userId});
  if(error)throw error;
  invalidateDailyCache();
}

export async function deleteContent(id:string):Promise<void>{
  const {error}=await client().from('daily_contents').delete().eq('id',id);
  if(error)throw error;
  invalidateDailyCache();
}

export async function setContentActive(id:string,active:boolean):Promise<void>{
  const {error}=await client().from('daily_contents').update({active}).eq('id',id);
  if(error)throw error;
  invalidateDailyCache();
}

/** Ce qui est planifie pour une date : au plus un contenu par type. */
export async function scheduledFor(date:string):Promise<Record<DailyKind,string|null>>{
  const planifie:Record<DailyKind,string|null>={rappel:null,invocation:null};
  if(!supabase)return planifie;
  const {data,error}=await supabase.from('daily_content_schedule').select('content_id,kind').eq('scheduled_date',date);
  if(error)throw error;
  for(const row of (data??[]) as {content_id:string;kind:DailyKind}[])planifie[row.kind]=row.content_id;
  return planifie;
}

/** Planifie, ou remplace, le contenu d'un type pour une date. */
export async function scheduleContent(date:string,kind:DailyKind,contentId:string):Promise<void>{
  const {error}=await client().from('daily_content_schedule').upsert(
    {content_id:contentId,kind,scheduled_date:date},
    {onConflict:'scheduled_date,kind'},
  );
  if(error)throw error;
  invalidateDailyCache();
}

export async function clearSchedule(date:string,kind:DailyKind):Promise<void>{
  const {error}=await client().from('daily_content_schedule').delete().eq('scheduled_date',date).eq('kind',kind);
  if(error)throw error;
  invalidateDailyCache();
}

export async function saveCategory(input:DailyCategoryInput,id?:string):Promise<void>{
  const values={kind:input.kind,name:input.name.trim(),icon:input.icon.trim()||'✦',position:input.position,active:input.active};
  if(!values.name)throw new Error('Le nom de la catégorie est obligatoire.');
  const {error}=id
    ?await client().from('daily_content_categories').update(values).eq('id',id)
    :await client().from('daily_content_categories').insert(values);
  if(error)throw error;
}

export async function deleteCategory(id:string):Promise<void>{
  const {error}=await client().from('daily_content_categories').delete().eq('id',id);
  if(error)throw error;
}

export async function setCategoryActive(id:string,active:boolean):Promise<void>{
  const {error}=await client().from('daily_content_categories').update({active}).eq('id',id);
  if(error)throw error;
}

/**
 * Reordonne une categorie en echangeant sa place avec sa voisine.
 *
 * Un echange, pas un deplacement : ecrire la position de la voisine sur la
 * categorie laisserait deux lignes a la meme position, et l'ordre affiche
 * deviendrait celui que la base veut bien rendre. Les deux ecritures sont donc
 * faites, dans cet ordre, et la seconde echec remonte.
 */
export async function moveCategory(ordered:DailyCategory[],category:DailyCategory,direction:-1|1):Promise<void>{
  const index=ordered.findIndex(row=>row.id===category.id);
  const voisine=ordered[index+direction];
  if(index<0||!voisine)return;
  const {error:premier}=await client().from('daily_content_categories').update({position:voisine.position}).eq('id',category.id);
  if(premier)throw premier;
  const {error:second}=await client().from('daily_content_categories').update({position:category.position}).eq('id',voisine.id);
  if(second)throw second;
}
