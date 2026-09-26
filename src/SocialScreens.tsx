import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Keyboard,KeyboardAvoidingView,PanResponder,Platform,Pressable,ScrollView,Share,TextInput,View} from 'react-native';
import {createAudioPlayer} from 'expo-audio';
import {Button,Card,CheckChoice,Choice,colors,Field,Label,Title} from './ui/theme';
import {reference} from './core/quran';
import {contactEnvoyable,normaliserPseudo,pseudoAffiche,pseudoUtilisable,raisonPseudoRefuse,textePastille} from './core/social';
import {currentUser,supabase} from './services/sync';
import * as social from './services/social';
import {setActiveConversation,updatePushPresence} from './services/notifications';
import {AdminRecitations} from './AdminRecitations';
import {AdminNotifications} from './AdminNotifications';
import {AdminDailyContent} from './AdminDailyContent';
import {signedAudioUrl} from './services/recitations';
import {FriendAvatar} from './ui/FriendAvatar';

const errorText=(e:unknown)=>{
  if(e instanceof Error)return e.message;
  if(e&&typeof e==='object'){
    const value=e as {message?:unknown;details?:unknown;code?:unknown};
    if(typeof value.message==='string'&&value.message.trim())return value.message;
    if(typeof value.details==='string'&&value.details.trim())return value.details;
    if(typeof value.code==='string')return `Erreur de service (${value.code}).`;
    return 'Une erreur est survenue. Réessaie dans un instant.';
  }
  return typeof e==='string'?e:'Une erreur est survenue. Réessaie dans un instant.';
};
const heading=(title:string)=><Label style={{fontSize:18,fontWeight:'700',color:colors.green,marginTop:18,marginBottom:8}}>{title}</Label>;

export function FriendsScreen({onClose,onUnreadChange,initialLinkId,initialCode,shareText}:{onClose:()=>void;onUnreadChange?:()=>void;initialLinkId?:string|null;initialCode?:string|null;shareText:string}){
  const [profile,setProfile]=useState<social.FriendProfile|null>(null);
  const [links,setLinks]=useState<social.FriendLink[]>([]);
  const [groups,setGroups]=useState<social.FriendGroup[]>([]);
  const [selected,setSelected]=useState<{id:string;kind:'link'|'group';name:string}|null>(null);
  const [overview,setOverview]=useState<social.FriendOverview|null>(null);
  const [messages,setMessages]=useState<social.ChatMessage[]>([]);
  const [members,setMembers]=useState<social.GroupMember[]>([]);
  const [sharedGoals,setSharedGoals]=useState<social.SharedGoal[]>([]);
  const [appointments,setAppointments]=useState<social.ReviewAppointment[]>([]);
  const [suspension,setSuspension]=useState<social.SocialSuspension|null>(null);
  const [myId,setMyId]=useState('');
  const [code,setCode]=useState(initialCode??''),[groupName,setGroupName]=useState('');
  const scrollRef=useRef<ScrollView>(null);
  const [draft,setDraft]=useState(''),[reason,setReason]=useState(''),[reportTarget,setReportTarget]=useState('');
  const [targetSessions,setTargetSessions]=useState('3'),[appointmentText,setAppointmentText]=useState('');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [summaries,setSummaries]=useState<Record<string,{body:string;createdAt:string;unread:number}>>({});
  const [friendStatuses,setFriendStatuses]=useState<Record<string,boolean>>({});
  const [audioMessageId,setAudioMessageId]=useState<string|null>(null);
  const [hasOlder,setHasOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false);
  const [otherReadAt,setOtherReadAt]=useState<string|null>(null),[otherTyping,setOtherTyping]=useState(false);
  const [showFriendTools,setShowFriendTools]=useState(false);
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  const [pseudoDraft,setPseudoDraft]=useState(''),[editingPseudo,setEditingPseudo]=useState(false);
  const [trouve,setTrouve]=useState<{id:string;display_name:string;handle:string|null;deja_lie:boolean}|null>(null);
  const [contactOpen,setContactOpen]=useState(false);
  const [contactMessages,setContactMessages]=useState<social.AdminContactMessage[]>([]);
  const [contactDraft,setContactDraft]=useState('');
  const [contactUnread,setContactUnread]=useState(0);
  const typingChannel=useRef<ReturnType<NonNullable<typeof supabase>['channel']>|null>(null);
  const typingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const outgoingTypingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const newestMessage=useRef<string|null>(null),olderExhausted=useRef(false);
  const audioPlayer=useRef<ReturnType<typeof createAudioPlayer>|null>(null);
  useEffect(()=>()=>audioPlayer.current?.release(),[]);
  useEffect(()=>{
    const shown=Keyboard.addListener('keyboardDidShow',()=>{
      setKeyboardOpen(true);
      requestAnimationFrame(()=>scrollRef.current?.scrollToEnd({animated:true}));
    });
    const hidden=Keyboard.addListener('keyboardDidHide',()=>setKeyboardOpen(false));
    return()=>{shown.remove();hidden.remove();};
  },[]);
  const backSwipe=useMemo(()=>PanResponder.create({onMoveShouldSetPanResponder:(_,gesture)=>Platform.OS==='ios'&&gesture.x0<26&&gesture.dx>22&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.4,onPanResponderRelease:(_,gesture)=>{if(gesture.dx<75)return;if(contactOpen)setContactOpen(false);else if(selected){setSelected(null);setOverview(null);}else onClose();}}),[selected,contactOpen,onClose]);
  const room=selected?.kind==='link'?{linkId:selected.id}:{groupId:selected?.id};
  // Le fil avec l'administrateur : a part de la messagerie entre amis, et
  // accessible sans aucun lien d'amitie.
  const loadContact=async()=>{
    const [fil,nonLus]=await Promise.all([social.monFilContact(),social.mesReponsesAdminNonLues()]);
    setContactMessages(fil);setContactUnread(nonLus);
    return fil;
  };
  const openContact=async()=>{
    setSelected(null);setContactOpen(true);
    try{
      const fil=await loadContact();
      if(fil.length&&myId)await social.marquerContactLu(myId);
      setContactUnread(0);
    }catch(e){setNotice(errorText(e));}
  };
  const load=async()=>{
    const user=await currentUser();setMyId(user?.id??'');
    const p=await social.ensureSocialProfile();setProfile(p);
    const [l,g,s]=await Promise.all([social.listFriendLinks(),social.listGroups(),social.mySocialSuspension()]);
    setLinks(l);setGroups(g);setSuspension(s);
    // La pastille du bouton « contacter l'administrateur » : sans elle, une
    // reponse pourrait attendre longtemps sans que personne ne le sache.
    social.mesReponsesAdminNonLues().then(setContactUnread).catch(()=>{});
    const accepted=l.filter(link=>link.status==='accepted');
    social.conversationSummaries(accepted.map(link=>link.id)).then(setSummaries).catch(()=>{});
    Promise.all(accepted.map(async link=>{const other=link.requester_id===user?.id?link.recipient_id:link.requester_id;try{return [other,(await social.friendOverview(other)).is_online] as const;}catch{return [other,false] as const;}})).then(rows=>setFriendStatuses(Object.fromEntries(rows))).catch(()=>{});
  };
  const loadRoom=async()=>{
    if(!selected)return;
    const latest=await social.listMessages(selected.kind==='link'?{linkId:selected.id}:{groupId:selected.id});
    setMessages(previous=>{const byId=new Map(previous.map(message=>[message.id,message]));for(const message of latest)byId.set(message.id,message);return [...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));});
    if(!olderExhausted.current&&latest.length===50)setHasOlder(true);
    const newest=latest[latest.length-1]?.id??null;
    if(newest&&newest!==newestMessage.current){newestMessage.current=newest;setTimeout(()=>scrollRef.current?.scrollToEnd({animated:true}),120);}
    if(selected.kind==='link'){await social.markConversationRead(selected.id);onUnreadChange?.();typingChannel.current?.send({type:'broadcast',event:'read',payload:{userId:myId,at:new Date().toISOString()}}).catch(()=>{});}
    if(selected.kind==='group')setMembers(await social.listGroupMembers(selected.id));
    else{const [goals,dates]=await Promise.all([social.listSharedGoals(selected.id),social.listAppointments(selected.id)]);setSharedGoals(goals);setAppointments(dates);
      const link=links.find(l=>l.id===selected.id);if(link){const other=link.requester_id===myId?link.recipient_id:link.requester_id;setOverview(await social.friendOverview(other));setOtherReadAt(await social.otherReadAt(selected.id,other));}}
  };
  const loadOlder=async()=>{if(!selected||!messages.length||loadingOlder)return;setLoadingOlder(true);try{const older=await social.listMessages(selected.kind==='link'?{linkId:selected.id}:{groupId:selected.id},messages[0].created_at);olderExhausted.current=older.length<50;setHasOlder(!olderExhausted.current);setMessages(previous=>{const byId=new Map([...older,...previous].map(message=>[message.id,message]));return [...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));});}catch(e){setNotice(errorText(e));}finally{setLoadingOlder(false);}};
  const act=async(fn:()=>Promise<unknown>,message='Enregistré.')=>{
    setBusy(true);try{await fn();setNotice(message);await load();if(selected)await loadRoom();}
    catch(e){setNotice(errorText(e));}finally{setBusy(false);}
  };
  useEffect(()=>{if(!selected)load().catch(e=>setNotice(errorText(e)));},[selected?.id]);
  useEffect(()=>{const client=supabase;if(selected||!client)return;const channel=client.channel('friend-inbox').on('postgres_changes',{event:'INSERT',schema:'public',table:'friend_messages'},()=>load().catch(()=>{})).on('postgres_changes',{event:'INSERT',schema:'public',table:'admin_contact_messages'},()=>{load().catch(()=>{});loadContact().catch(()=>{});}).subscribe();const timer=setInterval(()=>load().catch(()=>{}),15000);return()=>{clearInterval(timer);client.removeChannel(channel);};},[selected?.id]);
  useEffect(()=>{if(initialCode)setCode(initialCode);},[initialCode]);
  useEffect(()=>{if(!initialLinkId)return;const link=links.find(item=>item.id===initialLinkId&&item.status==='accepted');if(link&&selected?.id!==link.id)setSelected({id:link.id,kind:'link',name:link.other?.display_name??'Ami'});},[initialLinkId,links]);
  useEffect(()=>{const linkId=selected?.kind==='link'?selected.id:null;setActiveConversation(linkId);
    const timer=linkId?setInterval(()=>updatePushPresence(linkId).catch(()=>{}),20000):null;
    return()=>{if(timer)clearInterval(timer);setActiveConversation(null);};
  },[selected?.id,selected?.kind]);
  useEffect(()=>{if(!selected)return;setMessages([]);setHasOlder(false);setOtherReadAt(null);setShowFriendTools(false);newestMessage.current=null;olderExhausted.current=false;loadRoom().catch(e=>setNotice(errorText(e)));
    const filter=selected.kind==='link'?`link_id=eq.${selected.id}`:`group_id=eq.${selected.id}`;
    const channel=supabase?.channel(`friend-room-${selected.id}`,{config:{private:true}}).on('postgres_changes',{event:'INSERT',schema:'public',table:'friend_messages',filter},()=>loadRoom().catch(()=>{})).on('broadcast',{event:'typing'},({payload})=>{if(payload.userId!==myId){setOtherTyping(!!payload.active);if(typingTimer.current)clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>setOtherTyping(false),3000);}}).on('broadcast',{event:'read'},({payload})=>{if(payload.userId!==myId&&typeof payload.at==='string')setOtherReadAt(payload.at);}).subscribe();
    typingChannel.current=channel??null;
    const timer=setInterval(()=>loadRoom().catch(()=>{}),15000);return()=>{clearInterval(timer);if(typingTimer.current)clearTimeout(typingTimer.current);if(outgoingTypingTimer.current)clearTimeout(outgoingTypingTimer.current);typingChannel.current=null;if(channel)supabase?.removeChannel(channel);};
  },[selected?.id,selected?.kind]);
  const openLink=async(link:social.FriendLink)=>{
    setSelected({id:link.id,kind:'link',name:link.other?.display_name??'Ami'});
    setOverview(await social.friendOverview(link.other!.id));
  };
  const otherId=(link:social.FriendLink)=>link.requester_id===myId?link.recipient_id:link.requester_id;
  const sender=(id:string)=>id===myId?'Moi':members.find(m=>m.user_id===id)?.profile?.display_name??links.find(l=>otherId(l)===id)?.other?.display_name??'Membre';
  const send=()=>act(async()=>{await social.sendMessage(room,draft);setDraft('');typingChannel.current?.send({type:'broadcast',event:'typing',payload:{userId:myId,active:false}}).catch(()=>{});},'');
  const playSharedRecitation=async(message:social.ChatMessage)=>{if(!message.recitation){setNotice('Cet enregistrement n’est plus disponible.');return;}try{if(audioMessageId===message.id&&audioPlayer.current){audioPlayer.current.pause();setAudioMessageId(null);return;}audioPlayer.current?.release();const uri=await signedAudioUrl(message.recitation.storage_path);audioPlayer.current=createAudioPlayer({uri});audioPlayer.current.play();setAudioMessageId(message.id);}catch(error){setNotice(errorText(error));}};
  return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} {...backSwipe.panHandlers}>
    <ScrollView ref={scrollRef} style={{flex:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:18,paddingBottom:45}} onScroll={event=>{if(selected&&hasOlder&&!loadingOlder&&event.nativeEvent.contentOffset.y<24)loadOlder().catch(()=>{});}} scrollEventThrottle={200}>
    {selected&&<Button secondary onPress={()=>{audioPlayer.current?.pause();setAudioMessageId(null);setSelected(null);setOverview(null);}}>← Mes amis</Button>}
    {selected?.kind==='link'?<View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10}}><FriendAvatar name={selected.name} path={links.find(link=>link.id===selected.id)?.other?.avatar_path} /><View style={{flex:1}}><View style={{flexDirection:'row',alignItems:'center',gap:12}}><Title>{selected.name}</Title><Pressable accessibilityRole="button" accessibilityLabel={`Signaler la conversation avec ${selected.name}`} onPress={()=>{const lastReceived=[...messages].reverse().find(message=>message.sender_id!==myId&&!message.deleted_at);if(lastReceived)setReportTarget(lastReceived.id);else setNotice('Aucun message reçu à signaler dans cette conversation.');}}><Label style={{fontSize:12,color:colors.green2,fontWeight:'700'}}>Signaler</Label></Pressable></View><Label style={{fontSize:12,color:colors.muted}}>{otherTyping?'Écrit un message…':overview?.is_online?'En ligne':'Hors ligne'}</Label></View></View>:<Title>{contactOpen?'Contacter l’administrateur':selected?selected.name:'Mes amis'}</Title>}
    {notice?<Card><Label>{notice}</Label></Card>:null}
    {contactOpen?<>
      <Button secondary onPress={()=>setContactOpen(false)}>← Mes amis</Button>
      <Label style={{color:colors.muted,fontSize:13,marginBottom:10}}>Ton message arrive directement à l’administrateur, même si vous n’êtes pas amis.</Label>
      {contactMessages.length
        ?contactMessages.map(m=><Card key={m.id} style={{marginLeft:m.sender_id===myId?48:0,marginRight:m.sender_id===myId?0:48,backgroundColor:m.sender_id===myId?colors.soft:colors.paper,borderRadius:18,padding:12}}>
            <Label style={{fontSize:11,color:colors.muted}}>{m.sender_id===myId?'Moi':'Administrateur'} · {new Date(m.created_at).toLocaleString('fr-FR')}</Label>
            <Label style={{marginTop:7}}>{m.body}</Label>
          </Card>)
        :<Card><Label style={{color:colors.muted}}>Aucun message pour l’instant. Écris ci-dessous : l’administrateur recevra ton message.</Label></Card>}
      <Field value={contactDraft} onChangeText={setContactDraft} placeholder="Écris ton message à l’administrateur…" multiline maxLength={2000} />
      <Button disabled={busy||!contactEnvoyable(contactDraft)} onPress={()=>act(async()=>{await social.ecrireALAdmin(contactDraft.trim());setContactDraft('');await loadContact();},'Message envoyé à l’administrateur.')}>Envoyer à l’administrateur</Button>
    </>:!selected?<>
      {!profile?<Card><Label>Connecte-toi à ton compte pour utiliser les amis.</Label></Card>:<>
        {heading('Mes amis')}
        {links.filter(l=>l.status==='accepted').sort((a,b)=>(summaries[b.id]?.createdAt??b.created_at).localeCompare(summaries[a.id]?.createdAt??a.created_at)).map(l=><Card key={l.id} style={{padding:9}}><Pressable onPress={()=>openLink(l).catch(e=>setNotice(errorText(e)))} style={{flexDirection:'row',alignItems:'center',gap:11,padding:5}}><FriendAvatar name={l.other?.display_name??'Ami'} path={l.other?.avatar_path} size={44} /><View style={{flex:1}}><Label style={{fontWeight:'700'}}>{l.other?.display_name??'Ami'} {friendStatuses[otherId(l)]?'· En ligne':''}</Label>{l.other?.handle?<Label style={{fontSize:12,color:colors.green2}}>@{l.other.handle}</Label>:null}<Label numberOfLines={1} style={{fontSize:12,color:colors.muted}}>{summaries[l.id]?.body??'Commencer une discussion'}</Label></View><View style={{alignItems:'flex-end'}}><Label style={{fontSize:11,color:colors.muted}}>{summaries[l.id]?new Date(summaries[l.id].createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</Label>{!!summaries[l.id]?.unread&&<View style={{backgroundColor:colors.green,borderRadius:12,minWidth:20,paddingHorizontal:5,alignItems:'center'}}><Label style={{fontSize:11,color:'white'}}>{summaries[l.id].unread}</Label></View>}</View></Pressable><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Button small secondary onPress={()=>act(()=>social.removeFriend(l.id))}>Retirer</Button></View><View style={{flex:1}}><Button small secondary onPress={()=>act(()=>social.blockFriend(otherId(l)))}>Bloquer</Button></View></View></Card>)}
        <Card><Label style={{fontWeight:'700'}}>Mon code d’invitation</Label><Label style={{fontSize:23,color:colors.green,marginVertical:8}}>{profile.invite_code}</Label><Label style={{fontSize:12,color:colors.muted}}>Partage ce code uniquement avec la personne que tu souhaites inviter.</Label><Button small secondary onPress={()=>Share.share({message:`Rejoins-moi sur Apprendre le Coran : coranmemoire://friend/${profile.invite_code}`}).catch(e=>setNotice(errorText(e)))}>Partager mon lien d’invitation</Button></Card>
        <Card><Label style={{fontWeight:'700'}}>Mon pseudo</Label>
          {profile.handle&&!editingPseudo
            ?<><Label style={{fontSize:23,color:colors.green,marginVertical:8}}>@{profile.handle}</Label><Label style={{fontSize:12,color:colors.muted}}>On peut t’ajouter avec ce pseudo, sans code d’invitation.</Label><Button small secondary onPress={()=>{setPseudoDraft(profile.handle??'');setEditingPseudo(true);}}>Changer de pseudo</Button></>
            :<><Field value={pseudoDraft} onChangeText={setPseudoDraft} placeholder="Pseudo, par exemple sarah.k" maxLength={21} />
              {pseudoDraft.trim()?<Label style={{fontSize:12,color:raisonPseudoRefuse(pseudoDraft)?colors.red:colors.green,marginBottom:8}}>{raisonPseudoRefuse(pseudoDraft)??`Ton pseudo : ${pseudoAffiche(pseudoDraft)}`}</Label>:null}
              <Button disabled={busy||!pseudoUtilisable(pseudoDraft)} onPress={()=>act(async()=>{await social.choisirPseudo(normaliserPseudo(pseudoDraft));setEditingPseudo(false);},'Pseudo enregistré.')}>Enregistrer mon pseudo</Button>
              {profile.handle?<Button small secondary onPress={()=>setEditingPseudo(false)}>Annuler</Button>:null}</>}
        </Card>
        {heading('Inviter un ami')}
        <Label style={{fontSize:13,color:colors.muted}}>Entre un code d’invitation, ou le pseudo de la personne.</Label>
        <Field value={code} onChangeText={value=>{setCode(value);setTrouve(null);}} placeholder="Code d’invitation ou @pseudo" />
        <Button secondary disabled={busy||!code.trim()} onPress={()=>act(async()=>{const rows=await social.trouverParPseudo(code);if(!rows.length)throw new Error('Aucun compte ne porte ce pseudo. Vérifie l’orthographe, ou utilise un code d’invitation.');setTrouve(rows[0]);},'')}>Vérifier ce pseudo</Button>
        {trouve?<Card><Label style={{fontWeight:'700'}}>{trouve.display_name} · @{trouve.handle}</Label><Label style={{fontSize:12,color:colors.muted}}>{trouve.deja_lie?'Vous êtes déjà liés.':'Ce n’est pas encore un ami.'}</Label></Card>:null}
        <Button disabled={busy||!code.trim()} onPress={()=>act(async()=>{await social.sendFriendRequest(code);setCode('');setTrouve(null);},'Invitation envoyée.')}>Envoyer l’invitation</Button>
        {heading('Invitations reçues')}
        {links.filter(l=>l.status==='pending'&&l.recipient_id===myId).map(l=><Card key={l.id}><Label>Invitation de {l.other?.display_name??'un membre'}</Label><Button small onPress={()=>act(()=>social.acceptFriend(l.id))}>Accepter</Button><Button small secondary onPress={()=>act(()=>social.declineFriend(l.id))}>Refuser</Button></Card>)}
        {links.filter(l=>l.status==='pending'&&l.requester_id===myId).map(l=><Card key={l.id}><Label>Invitation envoyée à {l.other?.display_name??'un membre'}</Label></Card>)}
        {links.filter(l=>l.status==='blocked'&&l.blocked_by===myId).map(l=><Card key={l.id}><Label>{l.other?.display_name??'Membre'} bloqué</Label><Button small secondary onPress={()=>act(()=>social.unblockFriend(otherId(l)))}>Débloquer</Button></Card>)}
        {heading('Cercles privés · 3 à 5 personnes')}
        <Field value={groupName} onChangeText={setGroupName} placeholder="Nom du cercle" />
        <Button secondary disabled={busy||groupName.trim().length<2} onPress={()=>act(async()=>{await social.createGroup(groupName.trim());setGroupName('');})}>Créer un cercle</Button>
        {groups.map(g=><Card key={g.id}><Label style={{fontWeight:'700'}}>{g.name}</Label><Button small onPress={()=>{setSelected({id:g.id,kind:'group',name:g.name});setOverview(null);}}>Ouvrir</Button></Card>)}
        {heading('Une question, un souci ?')}
        <Label style={{fontSize:13,color:colors.muted,marginBottom:8}}>Écris à l’administrateur. Ton message lui arrive même si vous n’êtes pas amis, et sans que cela ajoute un ami à ta liste.</Label>
        <Button onPress={()=>openContact().catch(e=>setNotice(errorText(e)))}>Contacter l’administrateur{contactUnread?` · ${textePastille(contactUnread)} réponse${contactUnread>1?'s':''} à lire`:''}</Button>
      </>}
    </>:<>
      <Button small secondary onPress={()=>setShowFriendTools(!showFriendTools)}>{showFriendTools?'Masquer les options':'Profil et entraide'}</Button>
      {showFriendTools&&<>
      {overview&&<Card><Label style={{fontWeight:'700'}}>{overview.display_name} · {overview.is_online?'En ligne':'Hors ligne'}</Label>{overview.goal_label?<><Label>{overview.goal_label} · objectif atteint : {overview.goal_percent} %</Label><Label>Cette semaine : {overview.weekly_verses} versets · {overview.weekly_sessions} séances</Label></>:<Label style={{color:colors.muted}}>Progression privée</Label>}{overview.current_start&&overview.current_end?<Label>Passage actuel : {reference({start:overview.current_start,end:overview.current_end})}</Label>:null}</Card>}
      {selected.kind==='link'&&<>
        {heading('Objectif partagé')}
        <Label style={{color:colors.muted,fontSize:13}}>Fixez ensemble un nombre de séances pour cette semaine. Chacun garde son propre programme.</Label>
        <Field value={targetSessions} onChangeText={setTargetSessions} placeholder="Séances cette semaine (1 à 14)" keyboardType="number-pad" />
        <Button secondary disabled={!Number.isInteger(Number(targetSessions))||Number(targetSessions)<1||Number(targetSessions)>14} onPress={()=>{
          const monday=new Date();monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
          const week=`${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
          act(()=>social.proposeSharedGoal(selected.id,week,Number(targetSessions)));
        }}>Proposer cet objectif</Button>
        {sharedGoals.map(g=><Card key={g.id}><Label>Semaine du {g.week_start} · {g.target_sessions} séances</Label><Label style={{fontSize:12,color:colors.muted}}>{g.accepted_at?'Accepté par vous deux':'En attente d’acceptation'}</Label>{!g.accepted_at&&g.proposed_by!==myId?<Button small onPress={()=>act(()=>social.acceptSharedGoal(g.id))}>Accepter</Button>:null}</Card>)}
        {heading('Rendez-vous de révision')}
        <Field value={appointmentText} onChangeText={setAppointmentText} placeholder="AAAA-MM-JJ HH:mm" />
        <Button secondary onPress={()=>{
          const match=appointmentText.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
          const date=match?new Date(`${match[1]}T${match[2]}:00`):null;
          if(!date||Number.isNaN(date.getTime())||date<=new Date()){setNotice('Entre une date et une heure futures au format AAAA-MM-JJ HH:mm.');return;}
          act(async()=>{await social.proposeAppointment(selected.id,date.toISOString());setAppointmentText('');});
        }}>Proposer un rendez-vous</Button>
        {appointments.map(a=><Card key={a.id}><Label>{new Date(a.starts_at).toLocaleString('fr-FR')}</Label><Label style={{fontSize:12,color:colors.muted}}>{a.accepted_at?'Confirmé':'En attente'}</Label>{!a.accepted_at&&a.proposed_by!==myId?<Button small onPress={()=>act(()=>social.acceptAppointment(a.id))}>Accepter</Button>:null}<Button small secondary onPress={()=>act(()=>social.cancelAppointment(a.id))}>Annuler</Button></Card>)}
      </>}
      {selected.kind==='group'&&<><Card><Label style={{fontWeight:'700'}}>Membres ({members.filter(m=>m.accepted_at).length}/5)</Label>{members.map(m=><View key={m.user_id}><Label>{m.profile?.display_name??'Membre'} · {m.role}{!m.accepted_at?' · invitation en attente':''}</Label>{!m.accepted_at&&m.user_id===myId?<Button small onPress={()=>act(()=>social.acceptGroupInvite(selected.id))}>Rejoindre</Button>:null}{!m.accepted_at&&m.user_id===myId?<Button small secondary onPress={()=>act(()=>social.declineGroupInvite(selected.id))}>Refuser</Button>:null}{m.user_id!==myId&&m.accepted_at&&members.some(x=>x.user_id===myId&&x.role==='owner')?<Button small secondary onPress={()=>act(()=>social.setGroupModerator(selected.id,m.user_id,m.role!=='moderator'))}>{m.role==='moderator'?'Retirer la modération':'Nommer modérateur'}</Button>:null}{m.user_id!==myId&&m.role!=='owner'&&members.some(x=>x.user_id===myId&&['owner','moderator'].includes(x.role))?<Button small secondary onPress={()=>act(()=>social.removeGroupMember(selected.id,m.user_id))}>Retirer du cercle</Button>:null}</View>)}</Card>{members.some(m=>m.user_id===myId&&['owner','moderator'].includes(m.role))&&links.filter(l=>l.status==='accepted').map(l=><Button key={l.id} small secondary onPress={()=>act(()=>social.inviteGroupMember(selected.id,otherId(l)))}>Inviter {l.other?.display_name??'un ami'}</Button>)}{members.some(m=>m.user_id===myId&&m.role==='owner')?<Button secondary onPress={()=>Alert.alert('Supprimer le cercle ?','Les messages de ce cercle seront supprimés définitivement.',[{text:'Annuler',style:'cancel'},{text:'Supprimer',style:'destructive',onPress:()=>act(async()=>{await social.deleteGroup(selected.id);setSelected(null);})}])}>Supprimer le cercle</Button>:null}</>}
      </>}
      {heading('Discussion libre')}
      {hasOlder&&<Button small secondary disabled={loadingOlder} onPress={loadOlder}>{loadingOlder?'Chargement…':'Charger les messages précédents'}</Button>}
      {suspension&&(!suspension.suspended_until||new Date(suspension.suspended_until)>new Date())?<Card><Label>Messagerie suspendue : {suspension.reason}</Label></Card>:null}
      {messages.map(m=><Card key={m.id} style={{marginLeft:m.sender_id===myId?48:0,marginRight:m.sender_id===myId?0:48,backgroundColor:m.sender_id===myId?colors.soft:colors.paper,borderRadius:18,padding:12}}><Label style={{fontSize:11,color:colors.muted}}>{sender(m.sender_id)} · {new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</Label><Label style={{marginVertical:7}}>{m.body}</Label>{m.kind==='recitation'&&<View style={{padding:8,borderRadius:12,backgroundColor:colors.paper}}><Label style={{fontWeight:'700'}}>{m.recitation?reference({start:m.recitation.start_verse_id,end:m.recitation.end_verse_id}):'Enregistrement indisponible'}</Label>{m.recitation&&<Label style={{fontSize:12,color:colors.muted}}>Durée : {Math.floor(m.recitation.duration_ms/60000)}:{String(Math.floor(m.recitation.duration_ms/1000%60)).padStart(2,'0')}</Label>}<Button small disabled={!m.recitation} onPress={()=>playSharedRecitation(m)}>{audioMessageId===m.id?'Pause':'▶ Écouter la récitation'}</Button></View>}{m.sender_id===myId&&selected.kind==='link'&&<Label style={{fontSize:10,color:colors.muted,textAlign:'right'}}>{otherReadAt&&m.created_at<=otherReadAt?'Lu':'Envoyé'}</Label>}<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{!m.deleted_at&&(m.sender_id===myId||selected.kind==='group'&&members.some(x=>x.user_id===myId&&['owner','moderator'].includes(x.role)))?<Button small secondary onPress={()=>act(()=>social.deleteMessage(m.id))}>Supprimer</Button>:null}</View></Card>)}
      {reportTarget?<Card><Label>Signaler cette conversation à la modération</Label><Field value={reason} onChangeText={setReason} placeholder="Motif du signalement" /><Button small disabled={reason.trim().length<3} onPress={()=>act(async()=>{await social.reportMessage(reportTarget,reason);setReportTarget('');setReason('');},'Signalement envoyé.')}>Envoyer</Button><Button small secondary onPress={()=>setReportTarget('')}>Annuler</Button></Card>:null}
    </>}
    </ScrollView>
    {selected?<View style={{paddingHorizontal:12,paddingVertical:6,backgroundColor:colors.cream,borderTopWidth:1,borderColor:colors.line}}>
      <View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}>
        <TextInput style={{flex:1,minHeight:48,maxHeight:110,backgroundColor:colors.paper,borderWidth:1,borderColor:colors.line,borderRadius:14,padding:12,color:colors.green,textAlignVertical:'top'}} multiline maxLength={2000} value={draft} onChangeText={value=>{setDraft(value);if(outgoingTypingTimer.current)clearTimeout(outgoingTypingTimer.current);outgoingTypingTimer.current=setTimeout(()=>typingChannel.current?.send({type:'broadcast',event:'typing',payload:{userId:myId,active:!!value.trim()}}).catch(()=>{}),400);}} onFocus={()=>setTimeout(()=>scrollRef.current?.scrollToEnd({animated:true}),200)} placeholder="Écris un message à tes amis…" placeholderTextColor={colors.muted} />
        <Button small disabled={busy||!draft.trim()||!!suspension&&(!suspension.suspended_until||new Date(suspension.suspended_until)>new Date())} onPress={send}>Envoyer</Button>
      </View>
      {selected.kind==='link'&&!keyboardOpen?<Button secondary disabled={busy} small onPress={()=>act(()=>social.sendMessage(room,shareText,'progress'),'Étape partagée avec cet ami.')}>Partager volontairement mon étape</Button>:null}
    </View>:null}
  </KeyboardAvoidingView>;
}

export function AdminScreen({onClose}:{onClose:()=>void}){
  const [recitationMode,setRecitationMode]=useState(false);
  const [notificationMode,setNotificationMode]=useState(false);
  const [dailyMode,setDailyMode]=useState(false);
  const [reports,setReports]=useState<social.MessageReport[]>([]);
  const [messages,setMessages]=useState<social.ChatMessage[]>([]);
  const [suspensions,setSuspensions]=useState<social.SocialSuspension[]>([]);
  const [names,setNames]=useState<Record<string,string>>({});
  const [reason,setReason]=useState(''),[target,setTarget]=useState(''),[notice,setNotice]=useState('');
  const [duration,setDuration]=useState<'1'|'7'|'30'|'forever'>('7');
  const [contactThreads,setContactThreads]=useState<social.AdminContactThread[]>([]);
  const [openThreadId,setOpenThreadId]=useState<string|null>(null);
  const [threadMessages,setThreadMessages]=useState<social.AdminContactMessage[]>([]);
  const [replyDraft,setReplyDraft]=useState('');
  const load=async()=>{
    if(!await social.isSocialAdmin())throw new Error('Accès administrateur refusé.');
    const [r,m,s,f]=await Promise.all([social.listAdminReports(),social.listAdminMessages(),social.listSocialSuspensions(),social.filsContactAdmin()]);
    setReports(r);setMessages(m);setSuspensions(s);setContactThreads(f);
    const people=await social.adminProfiles([...m.map(x=>x.sender_id),...r.map(x=>x.reporter_id),...s.map(x=>x.user_id),...f.map(x=>x.user_id)]);
    setNames(Object.fromEntries(people.map(x=>[x.id,x.display_name])));
  };
  const openThread=async(thread:{user_id:string})=>{
    setOpenThreadId(thread.user_id);
    setThreadMessages(await social.filContactDe(thread.user_id));
    await social.marquerContactLu(thread.user_id);
    await load();
  };
  const act=async(fn:()=>Promise<unknown>)=>{try{await fn();await load();setNotice('Action enregistrée.');}catch(e){setNotice(errorText(e));}};
  useEffect(()=>{load().catch(e=>setNotice(errorText(e)));},[]);
  const suspend=async()=>{
    const until=duration==='forever'?null:new Date(Date.now()+Number(duration)*86400000).toISOString();
    await act(()=>social.suspendMember(target,reason.trim(),until));setTarget('');setReason('');
  };
  if(recitationMode)return <AdminRecitations onClose={()=>setRecitationMode(false)} />;
  if(notificationMode)return <AdminNotifications onClose={()=>setNotificationMode(false)} />;
  if(dailyMode)return <AdminDailyContent onClose={()=>setDailyMode(false)} />;
  return <ScrollView contentContainerStyle={{padding:18,paddingBottom:45}}>
    <Button secondary onPress={onClose}>← Profil</Button><Title>Modération</Title>
    <Button onPress={()=>setRecitationMode(true)}>Récitations des élèves</Button>
    <Button secondary onPress={()=>setNotificationMode(true)}>Notifications personnalisées</Button>
    <Button onPress={()=>setDailyMode(true)}>Rappels &amp; Invocations</Button>
    <Label style={{color:colors.muted}}>Signalements et discussions entre membres. Les actions sont vérifiées par Supabase.</Label>
    {notice?<Card><Label>{notice}</Label></Card>:null}
    <Button secondary onPress={()=>load().catch(e=>setNotice(errorText(e)))}>Actualiser</Button>
    {heading(`Messages des membres · ${contactThreads.reduce((n,t)=>n+t.non_lus,0)} à lire`)}
    <Label style={{fontSize:13,color:colors.muted}}>N’importe quel membre peut écrire ici, même sans être ton ami. Il ne devient pas ton ami pour autant.</Label>
    {!contactThreads.length?<Card><Label style={{color:colors.muted}}>Aucun message pour l’instant.</Label></Card>:null}
    {contactThreads.map(t=><Card key={t.user_id}>
      <Label style={{fontWeight:'700'}}>{t.display_name}{t.handle?` · @${t.handle}`:''}{t.non_lus?` · ${t.non_lus} à lire`:''}</Label>
      <Label style={{fontSize:12,color:colors.muted}}>{new Date(t.dernier_at).toLocaleString('fr-FR')}</Label>
      <Label numberOfLines={2} style={{marginTop:4}}>{t.dernier_message??''}</Label>
      <Button small onPress={()=>openThread(t).catch(e=>setNotice(errorText(e)))}>Ouvrir le fil</Button>
    </Card>)}
    {openThreadId?<Card>
      <Label style={{fontWeight:'700'}}>Fil de {names[openThreadId]??'ce membre'}</Label>
      {threadMessages.map(m=><View key={m.id} style={{marginTop:10}}>
        <Label style={{fontSize:11,color:colors.muted}}>{m.sender_id===openThreadId?(names[m.sender_id]??'Membre'):'Moi'} · {new Date(m.created_at).toLocaleString('fr-FR')}</Label>
        <Label style={{marginTop:3}}>{m.body}</Label>
      </View>)}
      <Field value={replyDraft} onChangeText={setReplyDraft} placeholder="Répondre à ce membre…" multiline maxLength={2000} />
      <Button disabled={!contactEnvoyable(replyDraft)} onPress={()=>act(async()=>{await social.repondreAuMembre(openThreadId,replyDraft.trim());setReplyDraft('');setThreadMessages(await social.filContactDe(openThreadId));})}>Envoyer la réponse</Button>
      <Button small secondary onPress={()=>{setOpenThreadId(null);setThreadMessages([]);setReplyDraft('');}}>Fermer le fil</Button>
    </Card>:null}
    {heading(`Signalements ouverts · ${reports.length}`)}
    {reports.map(r=>{const m=messages.find(x=>x.id===r.message_id);return <Card key={r.id}>
      <Label style={{fontWeight:'700'}}>{names[r.reporter_id]??'Membre'} a signalé un message</Label>
      <Label>Motif : {r.reason}</Label><Label>Message : {r.excerpt}</Label>
      <Label style={{fontSize:12,color:colors.muted}}>Auteur : {m?names[m.sender_id]??m.sender_id:'message plus ancien'} · {new Date(r.created_at).toLocaleString('fr-FR')}</Label>
      <Button small onPress={()=>act(async()=>{await social.deleteMessage(r.message_id);await social.resolveReport(r.id);})}>Supprimer le message et clôturer</Button>
      <Button small secondary onPress={()=>act(()=>social.resolveReport(r.id))}>Classer sans suppression</Button>
      {m?<Button small secondary onPress={()=>setTarget(m.sender_id)}>Suspendre l’auteur</Button>:null}
    </Card>;})}
    {target?<Card><Label style={{fontWeight:'700'}}>Suspendre {names[target]??'ce membre'} de la messagerie</Label>
      <Field value={reason} onChangeText={setReason} placeholder="Motif (obligatoire)" />
      {(['1','7','30','forever'] as const).map(d=><Choice key={d} label={d==='forever'?'Sans date de fin':`${d} jour${d==='1'?'':'s'}`} selected={duration===d} onPress={()=>setDuration(d)} />)}
      <Button disabled={reason.trim().length<3} onPress={suspend}>Confirmer la suspension</Button><Button secondary onPress={()=>setTarget('')}>Annuler</Button>
    </Card>:null}
    {heading('Suspensions actives')}
    {suspensions.filter(s=>!s.suspended_until||new Date(s.suspended_until)>new Date()).map(s=><Card key={s.user_id}>
      <Label style={{fontWeight:'700'}}>{names[s.user_id]??s.user_id}</Label><Label>{s.reason}</Label>
      <Label style={{fontSize:12,color:colors.muted}}>{s.suspended_until?`Jusqu’au ${new Date(s.suspended_until).toLocaleDateString('fr-FR')}`:'Sans date de fin'}</Label>
      <Button small secondary onPress={()=>act(()=>social.unsuspendMember(s.user_id))}>Lever la suspension</Button>
    </Card>)}
    {heading('Messages récents')}
    {messages.map(m=><Card key={m.id}><Label style={{fontSize:12,color:colors.muted}}>{names[m.sender_id]??m.sender_id} · {new Date(m.created_at).toLocaleString('fr-FR')}</Label><Label>{m.body}</Label>{!m.deleted_at?<><Button small secondary onPress={()=>act(()=>social.deleteMessage(m.id))}>Supprimer</Button><Button small secondary onPress={()=>setTarget(m.sender_id)}>Suspendre l’auteur</Button></>:null}</Card>)}
  </ScrollView>;
}
