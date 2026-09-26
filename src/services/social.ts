import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, progress, stats, todayLocal } from '../core/program';
import { currentUser, supabase } from './sync';

export type FriendProfile={id:string;display_name:string;invite_code:string;share_online:boolean;share_location:boolean;share_progress:boolean;avatar_path?:string|null;handle?:string|null};
export type FriendLink={id:string;requester_id:string;recipient_id:string;status:'pending'|'accepted'|'blocked';blocked_by:string|null;created_at:string;other?:FriendProfile};
export type FriendOverview={id:string;display_name:string;goal_label:string;weekly_verses:number;weekly_sessions:number;goal_percent:number;quran_percent:number;current_start:number|null;current_end:number|null;is_online:boolean;updated_at:string|null};
export type FriendGroup={id:string;name:string;owner_id:string;created_at:string};
export type GroupMember={group_id:string;user_id:string;role:'owner'|'moderator'|'member';accepted_at:string|null;invited_by:string|null;profile?:FriendProfile};
export type ChatMessage={id:string;link_id:string|null;group_id:string|null;sender_id:string;kind:'text'|'encouragement'|'progress'|'recitation';body:string;recitation_id:string|null;recitation?:{id:string;start_verse_id:number;end_verse_id:number;duration_ms:number;storage_path:string};created_at:string;deleted_at:string|null};
export type MessageReport={id:string;message_id:string;reason:string;reporter_id:string;excerpt:string;status:'open'|'reviewed';created_at:string};
export type SocialSuspension={user_id:string;reason:string;suspended_until:string|null;created_at:string};
export type SharedGoal={id:string;link_id:string;week_start:string;target_sessions:number;proposed_by:string;accepted_at:string|null};
export type ReviewAppointment={id:string;link_id:string;starts_at:string;proposed_by:string;accepted_at:string|null};
export type AdminContactMessage={id:string;user_id:string;sender_id:string;body:string;created_at:string;read_by_admin_at:string|null;read_by_user_at:string|null};
export type AdminContactThread={user_id:string;display_name:string;handle:string|null;dernier_message:string|null;dernier_at:string;non_lus:number};

function client(){if(!supabase)throw new Error('Connecte-toi pour utiliser les amis.');return supabase;}
function checked<T>(response:{data:T;error:any}):T{if(response.error)throw response.error;return response.data;}
async function rpc(name:string,args:Record<string,unknown>={}){return checked(await client().rpc(name,args));}

export async function ensureSocialProfile():Promise<FriendProfile>{return await rpc('ensure_social_profile') as FriendProfile;}
export async function mySocialProfile():Promise<FriendProfile>{
  const user=await currentUser();if(!user)throw new Error('Connecte-toi pour utiliser les amis.');
  return checked(await client().from('friend_profiles').select('*').eq('id',user.id).single()) as FriendProfile;
}
export async function updateSocialProfile(values:Pick<FriendProfile,'display_name'|'share_online'|'share_location'|'share_progress'>){
  const user=await currentUser();if(!user)throw new Error('Connexion requise');
  checked(await client().from('friend_profiles').update({display_name:values.display_name,share_online:values.share_online,share_location:values.share_location,share_progress:values.share_progress}).eq('id',user.id));
}
export async function listFriendLinks():Promise<FriendLink[]>{
  const user=await currentUser();if(!user)return [];
  const links=checked(await client().from('friend_links').select('*').order('created_at',{ascending:false})) as FriendLink[];
  const ids=links.map(link=>link.requester_id===user.id?link.recipient_id:link.requester_id);
  if(!ids.length)return links;
  const profiles=checked(await client().from('friend_profiles').select('*').in('id',ids)) as FriendProfile[];
  const byId=new Map(profiles.map(p=>[p.id,p]));
  return links.map(link=>({...link,other:byId.get(link.requester_id===user.id?link.recipient_id:link.requester_id)}));
}
// L'identifiant peut etre un code d'invitation ou un pseudo : c'est la meme
// fonction de base qui tranche, pour qu'un seul chemin d'invitation existe.
export async function sendFriendRequest(identifiant:string){await rpc('request_friend',{p_code:identifiant});}
export async function acceptFriend(id:string){await rpc('accept_friend',{p_link:id});}
export async function declineFriend(id:string){await rpc('decline_friend',{p_link:id});}
export async function removeFriend(id:string){await rpc('remove_friend',{p_link:id});}
export async function blockFriend(id:string){await rpc('block_friend',{p_other:id});}
export async function unblockFriend(id:string){await rpc('unblock_friend',{p_other:id});}
export async function friendOverview(id:string):Promise<FriendOverview>{
  const rows=await rpc('friend_overview',{p_other:id}) as FriendOverview[];
  if(!rows.length)throw new Error('Profil ami indisponible');
  return rows[0];
}
export async function publishSocialProgress(state:AppState){
  const summary=progress(state),weekly=stats(state,todayLocal());
  const next=state.sessions.find(s=>s.status==='todo'&&s.date>=todayLocal());
  await rpc('publish_social_progress',{
    p_goal_label:state.goal.label,p_weekly_verses:weekly.week,p_weekly_sessions:weekly.weeklySessions,
    p_goal_percent:Math.round(summary.goal*10000)/100,p_quran_percent:Math.round(summary.quran*10000)/100,
    p_current_start:next?.start??null,p_current_end:next?.end??null,
  });
}
export async function setSocialOnline(active:boolean){await rpc('set_social_online',{p_active:active});}

// --- Le pseudo --------------------------------------------------------------
//
// Le pseudo se choisit a la creation du compte. Or l'inscription ne donne pas
// toujours de session tout de suite : quand Supabase exige la confirmation du
// courriel, `signIn(...,true)` rend `null` et il n'y a personne a qui attribuer
// un pseudo. On le met donc de cote, sous la cle du courriel — le meme motif que
// la photo de profil — et on l'applique a la premiere connexion reussie.

const pseudoKey=(email:string)=>`pending-pseudo:${email.trim().toLowerCase()}`;

export async function choisirPseudo(handle:string):Promise<string>{return await rpc('choisir_pseudo',{p_handle:handle}) as string;}

export async function trouverParPseudo(handle:string):Promise<{id:string;display_name:string;handle:string|null;deja_lie:boolean}[]>{
  return await rpc('trouver_par_pseudo',{p_handle:handle}) as {id:string;display_name:string;handle:string|null;deja_lie:boolean}[];
}

export async function stagePseudo(email:string,pseudo:string){await AsyncStorage.setItem(pseudoKey(email),pseudo);}

/**
 * Applique le pseudo mis de cote, s'il y en a un. Ne jette pas : un pseudo
 * refuse (deja pris entre-temps) ne doit pas empecher la connexion d'aboutir.
 */
export async function appliquerPseudoEnAttente(email:string):Promise<string|null>{
  const key=pseudoKey(email),pseudo=await AsyncStorage.getItem(key);
  if(!pseudo)return null;
  try{
    const applique=await choisirPseudo(pseudo);
    await AsyncStorage.removeItem(key);
    return applique;
  }catch{return null;}
}

// --- Ecrire a l'administrateur ----------------------------------------------
//
// Un canal a part, et pas un lien d'amitie : ecrire a l'administrateur ne doit
// pas faire de lui un ami, ni ouvrir le partage de progression. Le fil est
// designe par `user_id` — celui du membre — et l'administrateur repond dedans.

export async function ecrireALAdmin(body:string):Promise<string>{return await rpc('ecrire_a_l_admin',{p_body:body}) as string;}
export async function repondreAuMembre(userId:string,body:string):Promise<string>{return await rpc('repondre_au_membre',{p_user:userId,p_body:body}) as string;}
export async function marquerContactLu(userId:string){await rpc('marquer_contact_lu',{p_user:userId});}
export async function mesReponsesAdminNonLues():Promise<number>{return await rpc('mes_reponses_admin_non_lues') as number;}
export async function filsContactAdmin():Promise<AdminContactThread[]>{
  return await rpc('fils_contact_admin') as AdminContactThread[];
}
/** Le fil du membre connecte. La politique de lecture le limite a son propre fil. */
export async function monFilContact():Promise<AdminContactMessage[]>{
  const user=await currentUser();if(!user)return [];
  return checked(await client().from('admin_contact_messages').select('*').eq('user_id',user.id).order('created_at')) as AdminContactMessage[];
}
/** Le fil d'un membre, vu par l'administrateur. */
export async function filContactDe(userId:string):Promise<AdminContactMessage[]>{
  return checked(await client().from('admin_contact_messages').select('*').eq('user_id',userId).order('created_at')) as AdminContactMessage[];
}

export async function listGroups():Promise<FriendGroup[]>{return checked(await client().from('friend_groups').select('*').order('created_at',{ascending:false})) as FriendGroup[];}
export async function listGroupMembers(groupId:string):Promise<GroupMember[]>{
  const members=checked(await client().from('friend_group_members').select('*').eq('group_id',groupId)) as GroupMember[];
  if(!members.length)return members;
  const profiles=checked(await client().from('friend_profiles').select('*').in('id',members.map(m=>m.user_id))) as FriendProfile[];
  const byId=new Map(profiles.map(p=>[p.id,p]));
  return members.map(m=>({...m,profile:byId.get(m.user_id)}));
}
export async function createGroup(name:string):Promise<string>{return await rpc('create_friend_group',{p_name:name}) as string;}
export async function inviteGroupMember(groupId:string,friendId:string){await rpc('invite_group_member',{p_group:groupId,p_friend:friendId});}
export async function acceptGroupInvite(groupId:string){await rpc('accept_group_invite',{p_group:groupId});}
export async function declineGroupInvite(groupId:string){await rpc('decline_group_invite',{p_group:groupId});}
export async function setGroupModerator(groupId:string,memberId:string,enabled:boolean){await rpc('set_group_moderator',{p_group:groupId,p_member:memberId,p_enabled:enabled});}
export async function removeGroupMember(groupId:string,memberId:string){await rpc('remove_group_member',{p_group:groupId,p_member:memberId});}
export async function deleteGroup(groupId:string){await rpc('delete_friend_group',{p_group:groupId});}

export async function listMessages(room:{linkId?:string;groupId?:string},before?:string):Promise<ChatMessage[]>{
  let query=client().from('friend_messages').select('*').order('created_at',{ascending:false}).limit(50);
  if(before)query=query.lt('created_at',before);
  query=room.linkId?query.eq('link_id',room.linkId):query.eq('group_id',room.groupId!);
  const messages=(checked(await query) as ChatMessage[]).reverse();
  if(!messages.length)return messages;
  const hidden=checked(await client().from('friend_message_hidden').select('message_id').in('message_id',messages.map(m=>m.id))) as {message_id:string}[];
  const hiddenIds=new Set(hidden.map(h=>h.message_id));
  const visible=messages.filter(m=>!hiddenIds.has(m.id));
  const ids=visible.filter(m=>m.kind==='recitation'&&m.recitation_id).map(m=>m.recitation_id!);
  if(ids.length){const rows=checked(await client().from('recitations').select('id,start_verse_id,end_verse_id,duration_ms,storage_path').in('id',ids)) as NonNullable<ChatMessage['recitation']>[];
    const byId=new Map(rows.map(row=>[row.id,row]));for(const message of visible)if(message.recitation_id)message.recitation=byId.get(message.recitation_id);}
  return visible;
}
export async function hideMessageForMe(messageId:string){
  const user=await currentUser();if(!user)throw new Error('Connexion requise');
  checked(await client().from('friend_message_hidden').upsert({message_id:messageId,user_id:user.id}));
}
export async function markConversationRead(linkId:string){
  const user=await currentUser();if(!user)return;
  checked(await client().from('friend_message_reads').upsert({link_id:linkId,user_id:user.id,last_read_at:new Date().toISOString()}));
}
export async function otherReadAt(linkId:string,otherId:string):Promise<string|null>{
  const row=checked(await client().from('friend_message_reads').select('last_read_at').eq('link_id',linkId).eq('user_id',otherId).maybeSingle()) as {last_read_at:string}|null;
  return row?.last_read_at??null;
}
export async function unreadMessageCount():Promise<number>{return await rpc('my_unread_messages') as number;}
export async function sendMessage(room:{linkId?:string;groupId?:string},body:string,kind:'text'|'encouragement'|'progress'='text'){
  const user=await currentUser();if(!user)throw new Error('Connexion requise');
  checked(await client().from('friend_messages').insert({link_id:room.linkId??null,group_id:room.groupId??null,sender_id:user.id,body:body.trim(),kind}));
}
export async function shareRecitation(linkId:string,recitationId:string,description:string){
  const user=await currentUser();if(!user)throw new Error('Connecte-toi pour partager ta récitation.');
  const {error}=await client().from('friend_messages').insert({link_id:linkId,group_id:null,sender_id:user.id,kind:'recitation',recitation_id:recitationId,body:description.slice(0,2000)});
  if(error)throw error;
}
export async function conversationSummaries(linkIds:string[]):Promise<Record<string,{body:string;createdAt:string;unread:number}>>{
  if(!linkIds.length)return {};
  const [messageResponse,readResponse]=await Promise.all([
    client().from('friend_messages').select('link_id,body,created_at,sender_id,deleted_at').in('link_id',linkIds).order('created_at',{ascending:false}).limit(300),
    client().from('friend_message_reads').select('link_id,user_id,last_read_at').in('link_id',linkIds),
  ]);
  const messages=checked(messageResponse) as {link_id:string;body:string;created_at:string;sender_id:string;deleted_at:string|null}[];
  const reads=checked(readResponse) as {link_id:string;user_id:string;last_read_at:string}[];
  const user=await currentUser();const readAt=new Map(reads.filter(row=>row.user_id===user?.id).map(row=>[row.link_id,row.last_read_at]));
  const result:Record<string,{body:string;createdAt:string;unread:number}>={};
  for(const row of messages)result[row.link_id]??={body:row.deleted_at?'Message supprimé':row.body,createdAt:row.created_at,unread:0};
  if(user)await Promise.all(linkIds.map(async linkId=>{
    let query=client().from('friend_messages').select('id',{count:'exact',head:true}).eq('link_id',linkId).neq('sender_id',user.id).is('deleted_at',null);
    if(readAt.has(linkId))query=query.gt('created_at',readAt.get(linkId)!);
    const {count,error}=await query;if(error)throw error;
    if((count??0)>0){result[linkId]??={body:'Nouveau message',createdAt:new Date().toISOString(),unread:0};result[linkId].unread=count??0;}
  }));
  return result;
}
export async function deleteMessage(id:string){await rpc('delete_friend_message',{p_message:id});}
export async function reportMessage(id:string,reason:string){await rpc('report_friend_message',{p_message:id,p_reason:reason});}
export async function listGroupReports(groupId:string):Promise<MessageReport[]>{
  const messages=await listMessages({groupId});
  if(!messages.length)return [];
  return checked(await client().from('friend_message_reports').select('*').in('message_id',messages.map(m=>m.id)).order('created_at',{ascending:false})) as MessageReport[];
}

export async function listSharedGoals(linkId:string):Promise<SharedGoal[]>{return checked(await client().from('friend_shared_goals').select('*').eq('link_id',linkId).order('week_start',{ascending:false}).limit(8)) as SharedGoal[];}
export async function proposeSharedGoal(linkId:string,weekStart:string,target:number){
  const user=await currentUser();if(!user)throw new Error('Connexion requise');
  checked(await client().from('friend_shared_goals').insert({link_id:linkId,week_start:weekStart,target_sessions:target,proposed_by:user.id}));
}
export async function acceptSharedGoal(id:string){await rpc('accept_shared_goal',{p_goal:id});}
export async function listAppointments(linkId:string):Promise<ReviewAppointment[]>{return checked(await client().from('friend_review_appointments').select('*').eq('link_id',linkId).gte('starts_at',new Date().toISOString()).order('starts_at').limit(20)) as ReviewAppointment[];}
export async function proposeAppointment(linkId:string,startsAt:string){
  const user=await currentUser();if(!user)throw new Error('Connexion requise');
  checked(await client().from('friend_review_appointments').insert({link_id:linkId,starts_at:startsAt,proposed_by:user.id}));
}
export async function acceptAppointment(id:string){await rpc('accept_review_appointment',{p_appointment:id});}
export async function cancelAppointment(id:string){await rpc('cancel_review_appointment',{p_appointment:id});}

export async function isSocialAdmin():Promise<boolean>{
  const user=await currentUser();if(!user)return false;
  return !!checked(await client().from('app_admins').select('user_id').eq('user_id',user.id).maybeSingle());
}
export async function mySocialSuspension():Promise<SocialSuspension|null>{
  const user=await currentUser();if(!user)return null;
  return checked(await client().from('social_suspensions').select('*').eq('user_id',user.id).maybeSingle()) as SocialSuspension|null;
}
export async function listAdminReports():Promise<MessageReport[]>{
  return checked(await client().from('friend_message_reports').select('*').eq('status','open').order('created_at',{ascending:false}).limit(100)) as MessageReport[];
}
export async function listAdminMessages():Promise<ChatMessage[]>{
  return checked(await client().from('friend_messages').select('*').order('created_at',{ascending:false}).limit(100)) as ChatMessage[];
}
export async function adminProfiles(ids:string[]):Promise<FriendProfile[]>{
  if(!ids.length)return [];
  return checked(await client().from('friend_profiles').select('*').in('id',[...new Set(ids)])) as FriendProfile[];
}
export async function listSocialSuspensions():Promise<SocialSuspension[]>{
  return checked(await client().from('social_suspensions').select('*').order('created_at',{ascending:false})) as SocialSuspension[];
}
export async function resolveReport(id:string){await rpc('resolve_friend_report',{p_report:id});}
export async function suspendMember(userId:string,reason:string,until:string|null){
  await rpc('suspend_social_member',{p_user:userId,p_reason:reason,p_until:until});
}
export async function unsuspendMember(userId:string){await rpc('unsuspend_social_member',{p_user:userId});}
