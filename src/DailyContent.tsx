import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Pressable,ScrollView,Share,View} from 'react-native';
import {createAudioPlayer,setAudioModeAsync} from 'expo-audio';
import {Button,Card,colors,Label} from './ui/theme';
import {todayLocal} from './core/program';
import {addFavorite,DailyCategory,DailyContent,DailyKind,dailyKindEmpty,dailyKindTab,dailyKinds,dailyShareText,dailyForDateCached,listCategories,listContents,listFavorites,removeFavorite,signedDailyAudioUrl} from './services/dailyContent';

// Rappels & Invocations, cote lecture. Rien a memoriser, rien a noter : on lit,
// on ecoute, on met en favori, on partage. Le contenu du jour vient de la base,
// l'application ne decide de rien.

/** Une erreur quelconque, dite en francais. */
export function dailyErrorText(e:unknown):string{
  if(e instanceof Error)return e.message;
  if(e&&typeof e==='object'){
    const value=e as {message?:unknown;details?:unknown;code?:unknown};
    if(typeof value.message==='string'&&value.message.trim())return value.message;
    if(typeof value.details==='string'&&value.details.trim())return value.details;
    if(typeof value.code==='string')return `Erreur de service (${value.code}).`;
  }
  return typeof e==='string'?e:'Une erreur est survenue. Réessaie dans un instant.';
}

// -------------------------------------------------------------------- audio ----

export type DailyAudioController={playingId:string|null;busyId:string|null;error:string;toggle:(content:DailyContent)=>void};

/**
 * Un seul lecteur pour toute la page.
 *
 * Changer de contenu remplace la source du meme lecteur : deux lecteurs
 * ouverts finiraient par jouer ensemble. Le fichier est demande a la base a
 * chaque lecture, car l'adresse signee ne dure qu'une heure.
 */
export function useDailyAudio():DailyAudioController{
  const [player]=useState(()=>createAudioPlayer(null,{updateInterval:250}));
  const [playingId,setPlayingId]=useState<string|null>(null);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>()=>{player.release();},[player]);
  const toggle=useCallback(async(content:DailyContent)=>{
    setError('');
    if(playingId===content.id){player.pause();setPlayingId(null);return;}
    if(!content.audioPath){setError('Aucun enregistrement pour ce contenu.');return;}
    setBusyId(content.id);
    try{
      const uri=await signedDailyAudioUrl(content.audioPath);
      player.replace(uri);
      await setAudioModeAsync({playsInSilentMode:true});
      player.play();
      setPlayingId(content.id);
    }catch(e){setError(dailyErrorText(e));}
    finally{setBusyId(null);}
  },[player,playingId]);
  return {playingId,busyId,error,toggle};
}

// --------------------------------------------------------------------- carte ----

const arabicStyle={fontSize:25,lineHeight:46,textAlign:'right' as const,writingDirection:'rtl' as const,color:colors.text,marginTop:12};

/** Une barre grise a la place d'un texte : la page ne saute pas en arrivant. */
function Skeleton({lines=3}:{lines?:number}){
  return <View style={{marginTop:10}}>{Array.from({length:lines},(_,index)=><View key={index} style={{height:index===0?19:12,width:index===0?'62 %':index===lines-1?'48 %':'100 %',borderRadius:6,backgroundColor:colors.soft,marginTop:index===0?0:9}} />)}</View>;
}

/**
 * Le contenu, dans l'ordre voulu : arabe, phonetique, traduction, explication,
 * source, puis les actions. Le meme composant sert a la page, a l'accueil et a
 * l'apercu de l'administrateur — ce dernier montrant donc exactement ce que la
 * personne verra.
 */
export function DailyContentCard({content,audio,favourite,onToggleFavourite,onShare,badge,footer}:{
  content:DailyContent;audio?:DailyAudioController;favourite?:boolean;
  onToggleFavourite?:()=>void;onShare?:()=>void;badge?:string;footer?:React.ReactNode;
}){
  const joue=audio?.playingId===content.id,chargement=audio?.busyId===content.id;
  return <Card>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
      <View style={{flex:1}}>
        {badge?<Label style={{fontSize:11,fontWeight:'700',color:colors.green2,letterSpacing:0.6}}>{badge.toUpperCase()}</Label>:null}
        {content.category?<Label style={{fontSize:12,color:colors.muted}}>{content.category}</Label>:null}
        <Label style={{fontWeight:'800',fontSize:17,color:colors.green}}>{content.title}</Label>
      </View>
      {onToggleFavourite?<Pressable accessibilityRole="button" accessibilityLabel={favourite?'Retirer des favoris':'Ajouter aux favoris'} onPress={onToggleFavourite} style={{padding:9}}><Label style={{fontSize:22,color:favourite?colors.gold:colors.muted}}>{favourite?'★':'☆'}</Label></Pressable>:null}
    </View>
    {content.arabicText?<Label style={arabicStyle}>{content.arabicText}</Label>:null}
    {content.phonetic?<Label style={{fontSize:14,fontStyle:'italic',color:colors.green2,marginTop:10}}>{content.phonetic}</Label>:null}
    {content.translation?<Label style={{fontSize:15,marginTop:9,lineHeight:22}}>{content.translation}</Label>:null}
    {content.explanation?<Label style={{fontSize:13,color:colors.muted,marginTop:9,lineHeight:19}}>{content.explanation}</Label>:null}
    {content.source?<Label style={{fontSize:12,color:colors.muted,marginTop:9}}>— {content.source}</Label>:null}
    {audio||onShare?<View style={{flexDirection:'row',gap:8,marginTop:13}}>
      {audio?<View style={{flex:1}}><Button small secondary={!joue} disabled={chargement} onPress={()=>audio.toggle(content)}>{chargement?'Chargement…':joue?'Ⅱ Pause':'▶ Écouter'}</Button></View>:null}
      {onShare?<View style={{flex:1}}><Button small secondary onPress={onShare}>Partager</Button></View>:null}
    </View>:null}
    {footer}
  </Card>;
}

// -------------------------------------------------------------- accueil ----

/**
 * La carte « Aujourd'hui » de l'accueil.
 *
 * Elle se charge apres l'affichage : l'accueil ne doit pas attendre le reseau
 * pour s'ouvrir. Le contenu deja demande par la page complete est reutilise,
 * donc passer de l'un a l'autre ne relance rien.
 */
export function HomeDailyCard({onOpen}:{onOpen:(kind:DailyKind)=>void}){
  const [kind,setKind]=useState<DailyKind>('rappel');
  const [rows,setRows]=useState<DailyContent[]|null>(null);
  const [error,setError]=useState('');
  const audio=useDailyAudio();
  useEffect(()=>{
    let vivant=true;
    dailyForDateCached(todayLocal()).then(next=>{if(vivant)setRows(next);}).catch(e=>{if(vivant){setRows([]);setError(dailyErrorText(e));}});
    return()=>{vivant=false;};
  },[]);
  const content=rows?.find(row=>row.kind===kind)??null;
  return <>
    <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:10}}>
      <View style={{flexDirection:'row',gap:7,flex:1}}>{dailyKinds.map(value=><Pill key={value} label={dailyKindTab[value]} active={kind===value} onPress={()=>setKind(value)} />)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ouvrir Rappels et Invocations" onPress={()=>onOpen(kind)}><Label style={{fontSize:12,color:colors.green,fontWeight:'700'}}>Tout voir</Label></Pressable>
    </View>
    {/* Les pastilles sont posees a cote de la carte, pas dedans : une carte dans
        une carte donnerait un double cadre du meme ton, qui se lit comme une
        erreur d'affichage. */}
    {rows===null?<Card><Skeleton lines={4} /></Card>:content?<DailyContentCard content={content} audio={audio} badge={content.planned?'Aujourd’hui':undefined} />:<Card><Label style={{color:colors.muted}}>{dailyKindEmpty[kind]}</Label></Card>}
    {audio.error||error?<Card><Label style={{color:colors.red,fontSize:12}}>{audio.error||error}</Label></Card>:null}
  </>;
}

/** Une pastille d'onglet. Le fond vient du theme, jamais d'une couleur ecrite ici. */
function Pill({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){
  return <Pressable accessibilityRole="tab" accessibilityState={{selected:active}} onPress={onPress} style={{paddingVertical:8,paddingHorizontal:14,borderRadius:19,borderWidth:1,borderColor:active?colors.green:colors.softBorder,backgroundColor:active?colors.green:colors.soft}}><Label style={{fontSize:13,fontWeight:'700',color:active?'#FFFFFF':colors.green}}>{label}</Label></Pressable>;
}

// ------------------------------------------------------------------- page ----

/**
 * La page complete : deux onglets, un rail de categories par onglet, et la
 * liste. Les categories viennent de la base, donc l'administrateur en ajoute
 * sans qu'une ligne de code change ici.
 */
export function DailyScreen({initialKind='rappel',onClose}:{initialKind?:DailyKind;onClose:()=>void}){
  const [kind,setKind]=useState<DailyKind>(initialKind);
  const [categories,setCategories]=useState<DailyCategory[]>([]);
  const [contents,setContents]=useState<DailyContent[]|null>(null);
  const [today,setToday]=useState<DailyContent[]>([]);
  const [favorites,setFavorites]=useState<Set<string>>(new Set());
  const [favoriteRows,setFavoriteRows]=useState<DailyContent[]|null>(null);
  const [category,setCategory]=useState<string|null>(null);
  const [onlyFavorites,setOnlyFavorites]=useState(false);
  const [error,setError]=useState('');
  const audio=useDailyAudio();

  const load=useCallback(async()=>{
    setError('');
    try{
      const [cats,list,jour]=await Promise.all([listCategories(),listContents(),dailyForDateCached(todayLocal())]);
      setCategories(cats);setContents(list);setToday(jour);
      try{
        const rows=await listFavorites();
        setFavorites(new Set(rows.map(row=>row.id)));
        setFavoriteRows(rows.map(row=>({id:row.id,kind:row.kind,categoryId:null,category:row.category,title:row.title,arabicText:row.arabicText,phonetic:row.phonetic,translation:row.translation,explanation:row.explanation,source:row.source,audioPath:row.audioPath,position:0,active:true,planned:false})));
      }catch{
        // Sans compte, il n'y a pas de favoris : ce n'est pas une erreur.
        setFavorites(new Set());setFavoriteRows([]);
      }
    }catch(e){setContents([]);setError(dailyErrorText(e));}
  },[]);
  useEffect(()=>{load().catch(()=>{});},[load]);

  const basculerFavori=async(content:DailyContent)=>{
    const deja=favorites.has(content.id);
    try{
      if(deja)await removeFavorite(content.id);else await addFavorite(content.id);
      setFavorites(previous=>{const next=new Set(previous);if(deja)next.delete(content.id);else next.add(content.id);return next;});
      if(deja)setFavoriteRows(previous=>(previous??[]).filter(row=>row.id!==content.id));
      else setFavoriteRows(previous=>[...(previous??[]),content]);
    }catch(e){setError(dailyErrorText(e));}
  };
  const partager=(content:DailyContent)=>Share.share({message:dailyShareText(content)}).catch(e=>setError(dailyErrorText(e)));

  const rail=categories.filter(row=>row.kind===kind);
  const aujourdhui=new Set(today.map(row=>row.id));
  const visibles=useMemo(()=>{
    if(onlyFavorites)return (favoriteRows??[]).filter(row=>row.kind===kind);
    return (contents??[]).filter(row=>row.kind===kind&&(!category||row.categoryId===category));
  },[onlyFavorites,favoriteRows,contents,kind,category]);

  return <ScrollView contentContainerStyle={{padding:18,paddingBottom:45}}>
    <Button secondary onPress={onClose}>← Retour</Button>
    <Label style={{fontSize:30,fontWeight:'700',color:colors.green,letterSpacing:-0.5}}>Rappels &amp; Invocations</Label>
    <Label style={{color:colors.muted,marginTop:5,marginBottom:12}}>Un rappel et une invocation chaque jour. À lire, à écouter, à garder.</Label>
    <View style={{flexDirection:'row',gap:8,marginBottom:12}}>{dailyKinds.map(value=><Pill key={value} label={dailyKindTab[value]} active={kind===value} onPress={()=>{setKind(value);setCategory(null);}} />)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:4}}>
      <Pill label="Tout" active={!onlyFavorites&&!category} onPress={()=>{setOnlyFavorites(false);setCategory(null);}} />
      {rail.map(row=><Pill key={row.id} label={`${row.icon} ${row.name}`} active={!onlyFavorites&&category===row.id} onPress={()=>{setOnlyFavorites(false);setCategory(row.id);}} />)}
      <Pill label="★ Favoris" active={onlyFavorites} onPress={()=>setOnlyFavorites(true)} />
    </ScrollView>
    {error?<Card style={{marginTop:12}}><Label style={{color:colors.red}}>{error}</Label></Card>:null}
    {contents===null?<Card><Skeleton lines={5} /></Card>:visibles.length?visibles.map(row=><DailyContentCard key={row.id} content={row} audio={audio} favourite={favorites.has(row.id)} onToggleFavourite={()=>{basculerFavori(row).catch(()=>{});}} onShare={()=>{partager(row).catch(()=>{});}} badge={aujourdhui.has(row.id)?'Aujourd’hui':undefined} />):<Card><Label style={{color:colors.muted}}>{onlyFavorites?'Aucun favori pour l’instant. Touche l’étoile d’un contenu pour le garder ici.':dailyKindEmpty[kind]}</Label></Card>}
    {audio.error?<Card><Label style={{color:colors.red}}>{audio.error}</Label></Card>:null}
  </ScrollView>;
}
