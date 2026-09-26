import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Pressable,ScrollView,View} from 'react-native';
import {createAudioPlayer,setAudioModeAsync} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import {Button,Card,Choice,colors,Field,Label,Title} from './ui/theme';
import {addDays,todayLocal} from './core/program';
import {DailyContentCard,dailyErrorText} from './DailyContent';
import {audioPickerTypes,clearSchedule,dailyForDate,DailyCategory,DailyCategoryInput,DailyContent,DailyContentInput,DailyKind,dailyKindEmpty,dailyKindLabel,dailyKinds,deleteCategory,deleteContent,deleteDailyAudio,listCategories,listContents,MAX_AUDIO_BYTES,moveCategory,notificationDuJour,notificationEnvoyable,saveCategory,saveContent,scheduleContent,scheduledFor,setCategoryActive,setContentActive,signedDailyAudioUrl,uploadDailyAudio} from './services/dailyContent';
import {AdminNotificationHistory,listAdminNotificationHistory,listAdminNotificationRecipients,sendAdminNotification} from './services/adminNotifications';
import {isSocialAdmin} from './services/social';

// Administration de Rappels & Invocations. L'apercu n'est pas une maquette : il
// emploie le composant que la personne verra, avec ses donnees. La base refuse
// de toute facon l'ecriture a qui n'est pas administrateur ; ce controle-ci
// evite seulement d'afficher des formulaires qui echoueraient.

type Mode='liste'|'contenu'|'categories'|'programmation'|'envoi';

/** Un identifiant de demande : la base refuse deux envois identiques. */
const demandeId=()=>`daily-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const brouillonVide=(kind:DailyKind):DailyContentInput=>({
  kind,categoryId:null,title:'',arabicText:'',phonetic:'',translation:'',
  explanation:'',source:'',audioPath:null,position:0,active:true,
});

const categorieVide=(kind:DailyKind,position:number):DailyCategoryInput=>({kind,name:'',icon:'✦',position,active:true});

/** Le brouillon, vu comme un contenu, pour l'apercu. */
function commeContenu(brouillon:DailyContentInput,categorie:DailyCategory|null):DailyContent{
  return {
    id:'apercu',kind:brouillon.kind,categoryId:brouillon.categoryId,category:categorie?.name??null,
    title:brouillon.title.trim()||'Titre du contenu',arabicText:brouillon.arabicText.trim()||null,
    phonetic:brouillon.phonetic.trim()||null,translation:brouillon.translation.trim()||null,
    explanation:brouillon.explanation.trim()||null,source:brouillon.source.trim()||null,
    audioPath:brouillon.audioPath,position:brouillon.position,active:brouillon.active,planned:false,
  };
}

/** Un lecteur pour l'apercu : fichier local en attente, ou adresse signee. */
function usePreviewAudio(uri:string|null){
  const [player]=useState(()=>createAudioPlayer(null,{updateInterval:250}));
  const [playing,setPlaying]=useState(false);
  useEffect(()=>()=>{player.release();},[player]);
  const toggle=async()=>{
    if(!uri)return;
    if(playing){player.pause();setPlaying(false);return;}
    try{player.replace(uri);await setAudioModeAsync({playsInSilentMode:true});player.play();setPlaying(true);}catch{}
  };
  return {playing,toggle};
}

const octets=(valeur:number)=>`${(valeur/1048576).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo`;

export function AdminDailyContent({onClose}:{onClose:()=>void}){
  const [mode,setMode]=useState<Mode>('liste');
  const [kind,setKind]=useState<DailyKind>('rappel');
  const [contents,setContents]=useState<DailyContent[]>([]);
  const [categories,setCategories]=useState<DailyCategory[]>([]);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [brouillon,setBrouillon]=useState<DailyContentInput>(brouillonVide('rappel'));
  const [edition,setEdition]=useState<string|null>(null);
  const [fichier,setFichier]=useState<{uri:string;name:string;size:number|null}|null>(null);
  const [ratio,setRatio]=useState<number|null>(null);
  const [apercuUri,setApercuUri]=useState<string|null>(null);
  const [categorie,setCategorie]=useState<DailyCategoryInput>(categorieVide('rappel',0));
  const [categorieEdition,setCategorieEdition]=useState<string|null>(null);
  const [date,setDate]=useState(todayLocal());
  const [planifie,setPlanifie]=useState<Record<DailyKind,string|null>>({rappel:null,invocation:null});
  // L'envoi manuel aux familles : rien n'est programme, c'est un geste.
  const [jour,setJour]=useState<DailyContent[]|null>(null);
  const [envoiEnCours,setEnvoiEnCours]=useState<string|null>(null);
  const [envoiNotice,setEnvoiNotice]=useState('');
  const [destinataires,setDestinataires]=useState(0);
  const [historique,setHistorique]=useState<AdminNotificationHistory[]>([]);
  const apercu=usePreviewAudio(apercuUri);

  const load=async()=>{
    if(!await isSocialAdmin())throw new Error('Accès administrateur refusé.');
    const [liste,cats]=await Promise.all([listContents(),listCategories()]);
    setContents(liste);setCategories(cats);
  };
  useEffect(()=>{load().catch(e=>setNotice(dailyErrorText(e)));},[]);

  // L'apercu ecoute ce qui existe deja, ou le fichier choisi mais pas encore envoye.
  useEffect(()=>{
    let vivant=true;
    if(fichier){setApercuUri(fichier.uri);return()=>{vivant=false;};}
    if(!brouillon.audioPath){setApercuUri(null);return()=>{vivant=false;};}
    signedDailyAudioUrl(brouillon.audioPath).then(uri=>{if(vivant)setApercuUri(uri);}).catch(()=>{if(vivant)setApercuUri(null);});
    return()=>{vivant=false;};
  },[fichier,brouillon.audioPath]);

  useEffect(()=>{
    if(mode!=='programmation')return;
    let vivant=true;
    scheduledFor(date).then(rows=>{if(vivant)setPlanifie(rows);}).catch(e=>{if(vivant)setNotice(dailyErrorText(e));});
    return()=>{vivant=false;};
  },[mode,date,contents]);

  useEffect(()=>{
    if(mode!=='envoi')return;
    let vivant=true;
    setEnvoiNotice('');
    Promise.all([dailyForDate(todayLocal()),listAdminNotificationRecipients(),listAdminNotificationHistory()])
      .then(([contenus,gens,envois])=>{if(!vivant)return;setJour(contenus);setDestinataires(gens.length);setHistorique(envois);})
      .catch(e=>{if(vivant)setEnvoiNotice(dailyErrorText(e));});
    return()=>{vivant=false;};
  },[mode]);

  // Rien n'est programme : c'est le geste d'envoyer qui decide. La base refuse un
  // envoi deux fois pour la meme demande, d'ou l'identifiant neuf a chaque fois.
  const lancerEnvoi=async(message:{title:string;body:string})=>{
    setEnvoiEnCours(message.title);setEnvoiNotice('');
    try{
      const resultat=await sendAdminNotification(null,message.title,message.body,demandeId());
      setEnvoiNotice(`Envoi lancé pour ${resultat.recipient_count} personne(s) sur ${resultat.device_count} appareil(s).`);
      setHistorique(await listAdminNotificationHistory());
    }catch(e){setEnvoiNotice(dailyErrorText(e));}
    finally{setEnvoiEnCours(null);}
  };

  const envoyer=(contenu:DailyContent)=>{
    const message=notificationDuJour(contenu);
    if(!notificationEnvoyable(message)){setEnvoiNotice('Ce contenu n’a pas assez de texte à envoyer. Ajoute une traduction, une prononciation ou un texte arabe.');return;}
    Alert.alert('Envoyer aux familles ?',`${destinataires} personne(s) ayant accepté les notifications.\n\n${message.title}\n${message.body}`,[
      {text:'Annuler',style:'cancel'},
      {text:'Envoyer',onPress:()=>{lancerEnvoi(message).catch(()=>{});}},
    ]);
  };

  const act=async(fn:()=>Promise<unknown>,message='Enregistré.')=>{
    setBusy(true);setNotice('');
    try{await fn();setNotice(message);await load();}
    catch(e){setNotice(dailyErrorText(e));}
    finally{setBusy(false);}
  };

  const choisirAudio=async()=>{
    try{
      const resultat=await DocumentPicker.getDocumentAsync({type:audioPickerTypes,copyToCacheDirectory:true});
      if(resultat.canceled||!resultat.assets.length)return;
      const asset=resultat.assets[0];
      if(asset.size&&asset.size>MAX_AUDIO_BYTES){setNotice(`Ce fichier fait ${octets(asset.size)} : la limite est de 5 Mo.`);return;}
      setFichier({uri:asset.uri,name:asset.name,size:asset.size??null});
      setNotice('Fichier choisi. Il sera envoyé à l’enregistrement.');
    }catch(e){setNotice(dailyErrorText(e));}
  };

  const enregistrer=async()=>{
    setBusy(true);setNotice('');setRatio(null);
    try{
      let audioPath=brouillon.audioPath;
      if(fichier){
        audioPath=await uploadDailyAudio(fichier.uri,brouillon.kind,setRatio);
        // L'ancien fichier n'a plus de raison d'occuper le stockage.
        if(brouillon.audioPath&&brouillon.audioPath!==audioPath)await deleteDailyAudio(brouillon.audioPath).catch(()=>{});
      }
      await saveContent({...brouillon,audioPath},edition??undefined);
      setFichier(null);setRatio(null);setEdition(null);setBrouillon(brouillonVide(kind));setMode('liste');
      setNotice('Contenu enregistré.');
      await load();
    }catch(e){setNotice(dailyErrorText(e));}
    finally{setBusy(false);setRatio(null);}
  };

  const supprimerContenu=(contenu:DailyContent)=>Alert.alert('Supprimer ce contenu ?',`« ${contenu.title} » disparaîtra de l’application, ainsi que ses dates de programmation et les favoris qui le visent.`, [{text:'Annuler',style:'cancel'},{text:'Supprimer',style:'destructive',onPress:()=>{
    act(async()=>{
      await deleteContent(contenu.id);
      if(contenu.audioPath)await deleteDailyAudio(contenu.audioPath).catch(()=>{});
      if(edition===contenu.id){setEdition(null);setBrouillon(brouillonVide(kind));setMode('liste');}
    },'Contenu supprimé.');
  }}]);

  const supprimerCategorie=(item:DailyCategory)=>Alert.alert('Supprimer cette catégorie ?',`Les contenus de « ${item.name} » sont conservés : ils n’auront simplement plus de catégorie.`, [{text:'Annuler',style:'cancel'},{text:'Supprimer',style:'destructive',onPress:()=>{act(()=>deleteCategory(item.id),'Catégorie supprimée.');}}]);

  const rail=categories.filter(row=>row.kind===kind);
  const listes=useMemo(()=>contents.filter(row=>row.kind===kind),[contents,kind]);
  const ordonnees=useMemo(()=>[...rail].sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name,'fr-FR')),[rail]);
  const contenuApercu=commeContenu(brouillon,categories.find(row=>row.id===brouillon.categoryId)??null);

  if(mode==='contenu')return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}} keyboardShouldPersistTaps="handled">
    <Button secondary onPress={()=>{setMode('liste');setEdition(null);setFichier(null);setBrouillon(brouillonVide(kind));}}>← Rappels &amp; Invocations</Button>
    <Title>{edition?'Modifier le contenu':'Nouveau contenu'}</Title>
    {notice?<Card><Label style={{fontSize:13}}>{notice}</Label></Card>:null}
    <Card><Label style={{fontWeight:'700'}}>Type</Label>
      <View style={{flexDirection:'row',gap:8,marginTop:6}}>{dailyKinds.map(value=><View key={value} style={{flex:1}}><Button small secondary={brouillon.kind!==value} disabled={!!edition} onPress={()=>setBrouillon({...brouillon,kind:value,categoryId:null})}>{dailyKindLabel[value]}</Button></View>)}</View>
      {edition?<Label style={{fontSize:12,color:colors.muted,marginTop:6}}>Le type d’un contenu ne se change plus après création : une date déjà programmée le vise.</Label>:null}
      <Label style={{fontWeight:'700',marginTop:12}}>Catégorie</Label>
      <Choice label="Sans catégorie" selected={brouillon.categoryId===null} onPress={()=>setBrouillon({...brouillon,categoryId:null})} />
      {categories.filter(row=>row.kind===brouillon.kind).map(row=><Choice key={row.id} label={`${row.icon} ${row.name}`} subtitle={row.active?undefined:'Désactivée'} selected={brouillon.categoryId===row.id} onPress={()=>setBrouillon({...brouillon,categoryId:row.id})} />)}
    </Card>
    <Card><Label style={{fontWeight:'700'}}>Texte</Label>
      <Field value={brouillon.title} onChangeText={value=>setBrouillon({...brouillon,title:value})} placeholder="Titre (obligatoire)" maxLength={120} />
      <Field value={brouillon.arabicText} onChangeText={value=>setBrouillon({...brouillon,arabicText:value})} placeholder="Texte arabe" multiline />
      <Field value={brouillon.phonetic} onChangeText={value=>setBrouillon({...brouillon,phonetic:value})} placeholder="Prononciation (facultatif)" multiline />
      <Field value={brouillon.translation} onChangeText={value=>setBrouillon({...brouillon,translation:value})} placeholder="Traduction française" multiline />
      <Field value={brouillon.explanation} onChangeText={value=>setBrouillon({...brouillon,explanation:value})} placeholder="Explication courte (facultatif)" multiline />
      <Field value={brouillon.source} onChangeText={value=>setBrouillon({...brouillon,source:value})} placeholder="Source (Coran 2:255, hadith…)" maxLength={160} />
    </Card>
    <Card><Label style={{fontWeight:'700'}}>Enregistrement audio</Label>
      <Label style={{fontSize:12,color:colors.muted,marginTop:5}}>MP3, M4A, AAC ou 3GP · 5 Mo au maximum.</Label>
      {fichier?<Label style={{marginTop:9}}>Fichier choisi : {fichier.name}{fichier.size?` · ${octets(fichier.size)}`:''}</Label>:brouillon.audioPath?<Label style={{marginTop:9}}>Un enregistrement est déjà en place.</Label>:<Label style={{color:colors.muted,marginTop:9}}>Aucun enregistrement.</Label>}
      {ratio!==null?<View style={{marginTop:10}}><View style={{height:7,backgroundColor:colors.soft,borderRadius:8,overflow:'hidden'}}><View style={{width:`${Math.round(ratio*100)} %` as any,height:7,backgroundColor:colors.green2,borderRadius:8}} /></View><Label style={{fontSize:12,color:colors.green,marginTop:5}}>Envoi : {Math.round(ratio*100)} %</Label></View>:null}
      <Button small secondary disabled={busy} onPress={()=>{choisirAudio().catch(()=>{});}}>{fichier?'Choisir un autre fichier':'Choisir un fichier audio'}</Button>
      {fichier?<Button small secondary disabled={busy} onPress={()=>setFichier(null)}>Retirer le fichier choisi</Button>:null}
      {!fichier&&brouillon.audioPath?<Button small secondary disabled={busy} onPress={()=>{act(async()=>{await deleteDailyAudio(brouillon.audioPath!);setBrouillon({...brouillon,audioPath:null});},'Enregistrement supprimé.');}}>Supprimer l’enregistrement</Button>:null}
    </Card>
    <Card><Label style={{fontWeight:'700'}}>Affichage</Label>
      <Field value={String(brouillon.position)} onChangeText={value=>setBrouillon({...brouillon,position:Number(value.replace(/[^0-9-]/g,''))||0})} placeholder="Ordre d’affichage (0 en premier)" keyboardType="number-pad" />
      <Choice label="Visible dans l’application" subtitle="Décoche pour préparer un contenu sans le publier." selected={brouillon.active} onPress={()=>setBrouillon({...brouillon,active:!brouillon.active})} />
    </Card>
    <Label style={{fontWeight:'700',fontSize:18,color:colors.green,marginTop:6,marginBottom:8}}>Aperçu</Label>
    <Label style={{fontSize:12,color:colors.muted,marginBottom:8}}>Exactement ce que la personne verra dans l’application.</Label>
    <DailyContentCard content={contenuApercu} audio={{playingId:apercu.playing&&apercuUri?'apercu':null,busyId:null,error:'',toggle:()=>{apercu.toggle().catch(()=>{});}}} badge={brouillon.active?undefined:'Masqué'} />
    {notice?<Card><Label style={{fontSize:13}}>{notice}</Label></Card>:null}
    <Button disabled={busy||!brouillon.title.trim()||!!fichier&&ratio!==null} onPress={()=>{enregistrer().catch(()=>{});}}>{busy?(ratio!==null?`Envoi ${Math.round(ratio*100)} %`:'Enregistrement…'):edition?'Enregistrer les modifications':'Ajouter ce contenu'}</Button>
    <Button secondary disabled={busy} onPress={()=>{setMode('liste');setEdition(null);setFichier(null);setBrouillon(brouillonVide(kind));}}>Annuler</Button>
  </ScrollView>;

  if(mode==='categories')return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}} keyboardShouldPersistTaps="handled">
    <Button secondary onPress={()=>setMode('liste')}>← Rappels &amp; Invocations</Button>
    <Title>Catégories</Title>
    <Label style={{color:colors.muted,marginBottom:12}}>Elles organisent le rail de la page Rappels &amp; Invocations. L’ordre se règle avec les flèches.</Label>
    {notice?<Card><Label style={{fontSize:13}}>{notice}</Label></Card>:null}
    <View style={{flexDirection:'row',gap:8}}>{dailyKinds.map(value=><View key={value} style={{flex:1}}><Button small secondary={kind!==value} onPress={()=>setKind(value)}>{dailyKindLabel[value]}</Button></View>)}</View>
    <Card style={{marginTop:10}}><Label style={{fontWeight:'700'}}>{categorieEdition?'Modifier la catégorie':'Nouvelle catégorie'}</Label>
      <View style={{flexDirection:'row',gap:8}}>
        <View style={{width:74}}><Field value={categorie.icon} onChangeText={value=>setCategorie({...categorie,icon:value})} placeholder="Icône" maxLength={4} /></View>
        <View style={{flex:1}}><Field value={categorie.name} onChangeText={value=>setCategorie({...categorie,name:value})} placeholder="Nom de la catégorie" maxLength={60} /></View>
      </View>
      <View style={{flexDirection:'row',gap:8}}>{dailyKinds.map(value=><View key={value} style={{flex:1}}><Button small secondary={categorie.kind!==value} disabled={!!categorieEdition} onPress={()=>setCategorie({...categorie,kind:value})}>{dailyKindLabel[value]}</Button></View>)}</View>
      <Choice label="Catégorie active" subtitle="Une catégorie inactive disparaît du rail." selected={categorie.active} onPress={()=>setCategorie({...categorie,active:!categorie.active})} />
      <Button disabled={busy||categorie.name.trim().length<2} onPress={()=>{act(async()=>{await saveCategory(categorie,categorieEdition??undefined);setCategorie(categorieVide(kind,ordonnees.length));setCategorieEdition(null);},categorieEdition?'Catégorie modifiée.':'Catégorie ajoutée.');}}>{categorieEdition?'Enregistrer':'Ajouter la catégorie'}</Button>
      {categorieEdition?<Button secondary onPress={()=>{setCategorieEdition(null);setCategorie(categorieVide(kind,ordonnees.length));}}>Annuler la modification</Button>:null}
    </Card>
    {ordonnees.map((item,index)=><Card key={item.id}>
      <Label style={{fontWeight:'700'}}>{item.icon} {item.name}</Label>
      <Label style={{fontSize:12,color:colors.muted}}>{item.active?'Active':'Désactivée'} · {contents.filter(row=>row.categoryId===item.id).length} contenu(s)</Label>
      <View style={{flexDirection:'row',gap:7,marginTop:9}}>
        <View style={{flex:1}}><Button small secondary disabled={busy||index===0} onPress={()=>{act(()=>moveCategory(ordonnees,item,-1),'Ordre enregistré.');}}>↑</Button></View>
        <View style={{flex:1}}><Button small secondary disabled={busy||index===ordonnees.length-1} onPress={()=>{act(()=>moveCategory(ordonnees,item,1),'Ordre enregistré.');}}>↓</Button></View>
      </View>
      <Button small secondary disabled={busy} onPress={()=>{setCategorieEdition(item.id);setCategorie({kind:item.kind,name:item.name,icon:item.icon,position:item.position,active:item.active});}}>Modifier</Button>
      <Button small secondary disabled={busy} onPress={()=>{act(()=>setCategoryActive(item.id,!item.active),item.active?'Catégorie désactivée.':'Catégorie activée.');}}>{item.active?'Désactiver':'Activer'}</Button>
      <Button small secondary disabled={busy} onPress={()=>{supprimerCategorie(item);}}>Supprimer</Button>
    </Card>)}
    {!ordonnees.length&&<Card><Label style={{color:colors.muted}}>Aucune catégorie pour {dailyKindLabel[kind].toLowerCase()}.</Label></Card>}
  </ScrollView>;

  if(mode==='programmation')return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}} keyboardShouldPersistTaps="handled">
    <Button secondary onPress={()=>setMode('liste')}>← Rappels &amp; Invocations</Button>
    <Title>Programmer une date</Title>
    <Label style={{color:colors.muted,marginBottom:12}}>Choisis ce qui s’affichera ce jour-là. Sans programmation, la base fait tourner le contenu toute seule — jamais deux fois de suite le même.</Label>
    {notice?<Card><Label style={{fontSize:13}}>{notice}</Label></Card>:null}
    <Card><Label style={{fontWeight:'700'}}>Date</Label>
      <Field value={date} onChangeText={setDate} placeholder="AAAA-MM-JJ" />
      <View style={{flexDirection:'row',gap:7}}>
        <View style={{flex:1}}><Button small secondary onPress={()=>setDate(todayLocal())}>Aujourd’hui</Button></View>
        <View style={{flex:1}}><Button small secondary onPress={()=>setDate(addDays(todayLocal(),1))}>Demain</Button></View>
        <View style={{flex:1}}><Button small secondary onPress={()=>setDate(addDays(todayLocal(),7))}>Dans 7 jours</Button></View>
      </View>
      {!/^\d{4}-\d{2}-\d{2}$/.test(date)?<Label style={{color:colors.red,fontSize:12}}>Entre une date au format AAAA-MM-JJ.</Label>:null}
    </Card>
    {dailyKinds.map(value=><Card key={value}><Label style={{fontWeight:'700'}}>{dailyKindLabel[value]}</Label>
      <Choice label="Aucune programmation (rotation automatique)" selected={planifie[value]===null} onPress={()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){setNotice('Vérifie d’abord la date.');return;}act(()=>clearSchedule(date,value),'Programmation retirée.');}} />
      {contents.filter(row=>row.kind===value&&row.active).map(row=><Choice key={row.id} label={row.title} subtitle={row.category??undefined} selected={planifie[value]===row.id} onPress={()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){setNotice('Vérifie d’abord la date.');return;}act(()=>scheduleContent(date,value,row.id),'Programmation enregistrée.');}} />)}
      {!contents.some(row=>row.kind===value&&row.active)?<Label style={{color:colors.muted,fontSize:12,marginTop:6}}>Aucun contenu actif pour ce type : la carte restera vide ce jour-là.</Label>:null}
    </Card>)}
  </ScrollView>;

  if(mode==='envoi')return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}}>
    <Button secondary onPress={()=>setMode('liste')}>← Rappels &amp; Invocations</Button>
    <Title>Envoyer aux familles</Title>
    <Label style={{color:colors.muted,marginBottom:12}}>Le rappel et l’invocation du jour, envoyés maintenant comme notification. Rien n’est programmé : c’est toi qui décides, et tu peux ne rien envoyer.</Label>
    {envoiNotice?<Card><Label style={{fontSize:13}}>{envoiNotice}</Label></Card>:null}
    {!destinataires&&jour!==null?<Card><Label style={{color:colors.muted}}>Personne n’a encore accepté les notifications. Un envoi ne toucherait aucun appareil.</Label></Card>:null}
    {jour===null?<Card><Label style={{color:colors.muted}}>Lecture du jour…</Label></Card>:
      dailyKinds.map(value=>{
        const contenu=jour.find(row=>row.kind===value)??null;
        const message=contenu?notificationDuJour(contenu):null;
        const pret=!!message&&notificationEnvoyable(message);
        return <Card key={value}>
          <Label style={{fontWeight:'700'}}>{dailyKindLabel[value]}</Label>
          {contenu&&message?<>
            <Label style={{fontSize:12,color:colors.muted,marginTop:4}}>{contenu.title}{contenu.planned?' · programmé':' · rotation automatique'}</Label>
            <View style={{padding:12,borderRadius:12,backgroundColor:colors.soft,marginVertical:8}}><Label style={{fontWeight:'700'}}>{message.title}</Label><Label>{message.body}</Label></View>
            <Button disabled={!!envoiEnCours||!destinataires||!pret} onPress={()=>envoyer(contenu)}>{envoiEnCours===message.title?'Envoi en cours…':'Envoyer maintenant'}</Button>
          </>:<Label style={{color:colors.muted,fontSize:13,marginTop:6}}>{dailyKindEmpty[value]}</Label>}
        </Card>;
      })}
    <Label style={{fontWeight:'700',marginTop:14}}>Derniers envois</Label>
    {historique.map(item=><Card key={item.id}>
      <Label style={{fontWeight:'700'}}>{item.title}</Label>
      <Label>{item.body}</Label>
      <Label style={{fontSize:12,color:colors.muted}}>{new Date(item.created_at).toLocaleString('fr-FR')} · {item.recipient_count} personne(s), {item.device_count} appareil(s)</Label>
    </Card>)}
    {!historique.length?<Card><Label style={{color:colors.muted}}>Aucun envoi pour l’instant.</Label></Card>:null}
  </ScrollView>;

  return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}}>
    <Button secondary onPress={onClose}>← Modération</Button>
    <Title>Rappels &amp; Invocations</Title>
    <Label style={{color:colors.muted,marginBottom:12}}>Le rappel et l’invocation du jour, choisis par la base. Tu écris, tu écoutes, tu publies.</Label>
    {notice?<Card><Label style={{fontSize:13}}>{notice}</Label></Card>:null}
    <Button onPress={()=>{setBrouillon(brouillonVide(kind));setEdition(null);setFichier(null);setNotice('');setMode('contenu');}}>+ Ajouter</Button>
    <View style={{flexDirection:'row',gap:8}}>
      <View style={{flex:1}}><Button secondary onPress={()=>setMode('categories')}>Catégories</Button></View>
      <View style={{flex:1}}><Button secondary onPress={()=>setMode('programmation')}>Programmer</Button></View>
    </View>
    <Button secondary onPress={()=>setMode('envoi')}>Envoyer aux familles</Button>
    <Button secondary onPress={()=>load().catch(e=>setNotice(dailyErrorText(e)))}>Actualiser</Button>
    <View style={{flexDirection:'row',gap:8,marginTop:12,marginBottom:4}}>{dailyKinds.map(value=><View key={value} style={{flex:1}}><Button small secondary={kind!==value} onPress={()=>setKind(value)}>{dailyKindLabel[value]}</Button></View>)}</View>
    {listes.map(row=><Card key={row.id}>
      <Label style={{fontWeight:'700'}}>{row.title}</Label>
      <Label style={{fontSize:12,color:colors.muted,marginTop:4}}>{row.category??'Sans catégorie'} · ordre {row.position} · {row.active?'Visible':'Masqué'}{row.audioPath?' · audio':''}</Label>
      {row.arabicText?<Label style={{fontSize:19,lineHeight:34,textAlign:'right',writingDirection:'rtl',marginTop:7}} numberOfLines={2}>{row.arabicText}</Label>:null}
      {row.translation?<Label style={{fontSize:13,color:colors.muted,marginTop:5}} numberOfLines={2}>{row.translation}</Label>:null}
      <Button small secondary disabled={busy} onPress={()=>{setEdition(row.id);setFichier(null);setNotice('');setBrouillon({kind:row.kind,categoryId:row.categoryId,title:row.title,arabicText:row.arabicText??'',phonetic:row.phonetic??'',translation:row.translation??'',explanation:row.explanation??'',source:row.source??'',audioPath:row.audioPath,position:row.position,active:row.active});setMode('contenu');}}>Modifier</Button>
      <Button small secondary disabled={busy} onPress={()=>{act(()=>setContentActive(row.id,!row.active),row.active?'Contenu masqué.':'Contenu publié.');}}>{row.active?'Masquer':'Publier'}</Button>
      <Button small secondary disabled={busy} onPress={()=>{supprimerContenu(row);}}>Supprimer</Button>
    </Card>)}
    {!listes.length?<Card><Label style={{color:colors.muted}}>Aucun contenu pour {dailyKindLabel[kind].toLowerCase()}.</Label></Card>:null}
  </ScrollView>;
}
