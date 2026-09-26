// Rappels et invocations : le vocabulaire et les regles pures, sans base ni
// interface. Ce fichier ne doit rien importer : c'est ce qui le rend eprouvable
// seul, et ce qui permet de tenir l'accord entre la limite annoncee ici et
// celle que le stockage applique reellement.

export type DailyKind='rappel'|'invocation';
export const dailyKinds:DailyKind[]=['rappel','invocation'];
export const dailyKindLabel:Record<DailyKind,string>={rappel:'Rappel',invocation:'Invocation'};
export const dailyKindTab:Record<DailyKind,string>={rappel:'☀️ Rappel',invocation:'🌙 Invocation'};
export const dailyKindHeading:Record<DailyKind,string>={rappel:'Rappel du jour',invocation:'Invocation du jour'};
export const dailyKindEmpty:Record<DailyKind,string>={
  rappel:'Aucun rappel disponible aujourd’hui.',
  invocation:'Aucune invocation disponible aujourd’hui.',
};
export const dailyKindCategoryLabel:Record<DailyKind,string>={rappel:'Rappels',invocation:'Invocations'};

export type DailyCategory={id:string;kind:DailyKind;name:string;icon:string;position:number;active:boolean};
export type DailyContent={
  id:string;kind:DailyKind;categoryId:string|null;category:string|null;
  title:string;arabicText:string|null;phonetic:string|null;translation:string|null;
  explanation:string|null;source:string|null;audioPath:string|null;position:number;active:boolean;planned:boolean;
};
export type DailyFavorite={
  id:string;kind:DailyKind;category:string|null;title:string;
  arabicText:string|null;phonetic:string|null;translation:string|null;
  explanation:string|null;source:string|null;audioPath:string|null;favoritedAt:string;
};
export type DailyContentInput={
  kind:DailyKind;categoryId:string|null;title:string;arabicText:string;
  phonetic:string;translation:string;explanation:string;source:string;
  audioPath:string|null;position:number;active:boolean;
};
export type DailyCategoryInput={kind:DailyKind;name:string;icon:string;position:number;active:boolean};

/**
 * La limite du bucket `daily-content-audio`, recopiee ici pour refuser tot.
 *
 * Elle doit valoir exactement le `file_size_limit` de la migration : un fichier
 * accepte par l'interface puis refuse par le stockage serait incompréhensible
 * pour qui vient de choisir son enregistrement.
 */
export const MAX_AUDIO_BYTES=5242880;

const AUDIO_MIME:Record<string,string>={mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/mp4',mp4:'audio/mp4','3gp':'audio/3gpp'};

/** Type MIME d'un fichier audio, d'apres son extension. Refuse le reste. */
export function audioMime(name:string):string{
  const extension=(name.split('.').pop()??'').toLowerCase();
  const mime=AUDIO_MIME[extension];
  if(!mime)throw new Error('Format audio non reconnu. Utilise un fichier MP3, M4A, AAC ou 3GP.');
  return mime;
}

/** Les types proposes au selecteur de fichiers. */
export const audioPickerTypes=['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/3gpp'];

/**
 * Nom de fichier lisible, pour l'envoi : jamais de chemin, jamais d'espace.
 *
 * Un selecteur de fichiers ne garantit pas l'extension (nom tronque, fichier
 * sans suffixe). On ne refuse donc pas pour cela : on retombe sur M4A, qui est
 * le format que le service accepte et celui que l'enregistreur de l'application
 * produit deja.
 */
export function audioFileName(uri:string,kind:DailyKind):string{
  const brut=(uri.split(/[\\/]/).pop()??'').split('?')[0];
  const suffixe=(brut.split('.').pop()??'').toLowerCase();
  const extension=AUDIO_MIME[suffixe]?suffixe:'m4a';
  const base=brut.slice(0,Math.max(0,brut.length-extension.length-1)).replace(/[^A-Za-z0-9._-]+/g,'-').slice(0,40)||kind;
  return `${base}.${extension}`;
}

/**
 * Le texte partage : la traduction d'abord, puis la source.
 *
 * Ni la prononciation ni l'explication : elles aident a comprendre ici, mais
 * envoyees seules dans une conversation elles perdent leur sens.
 */
export function dailyShareText(content:Pick<DailyContent,'title'|'arabicText'|'translation'|'source'>):string{
  const lignes=[content.title];
  if(content.arabicText)lignes.push('',content.arabicText);
  if(content.translation)lignes.push('',content.translation);
  if(content.source)lignes.push('',`— ${content.source}`);
  return lignes.join('\n');
}

// --- L'envoi manuel aux familles ---------------------------------------------
//
// Ces bornes sont celles que la base impose a `send_admin_notification`
// (admin-notifications.sql : « char_length(p_title) not between 3 and 80 or
// char_length(p_body) not between 3 and 500 »). Les ecrire ici, c'est pouvoir les
// verifier par un test qui les compare aux deux endroits a la fois.

export const NOTIFICATION_MIN_LENGTH=3;
export const NOTIFICATION_TITLE_MAX=80;
export const NOTIFICATION_BODY_MAX=500;

/**
 * Ce qu'on envoie pour un contenu du jour : le titre tel quel, et le texte le
 * plus utile a lire sur un ecran de telephone.
 *
 * La traduction d'abord, parce qu'elle se lit sans savoir l'arabe ; la
 * prononciation ensuite, pour qui recite ; l'arabe en dernier recours, quand il
 * n'y a rien d'autre. Le texte est ramene sur une ligne : une notification qui
 * porte des sauts de ligne s'affiche mal.
 */
export function notificationDuJour(content:Pick<DailyContent,'title'|'translation'|'phonetic'|'arabicText'>):{title:string;body:string}{
  const replie=(valeur:string|null|undefined)=>(valeur??'').replace(/\s+/g,' ').trim();
  const titre=replie(content.title).slice(0,NOTIFICATION_TITLE_MAX);
  const matiere=replie(content.translation)||replie(content.phonetic)||replie(content.arabicText)||titre;
  return {title:titre,body:matiere.slice(0,NOTIFICATION_BODY_MAX)};
}

/**
 * La base refusera tout ce qui sort de ses bornes. Le dire ici evite d'envoyer
 * une requete pour rien, et surtout d'annoncer un envoi qui n'a pas eu lieu.
 */
export function notificationEnvoyable(message:{title:string;body:string}):boolean{
  return message.title.length>=NOTIFICATION_MIN_LENGTH&&message.title.length<=NOTIFICATION_TITLE_MAX
    &&message.body.length>=NOTIFICATION_MIN_LENGTH&&message.body.length<=NOTIFICATION_BODY_MAX;
}
