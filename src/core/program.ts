import { expand, hizbs, juzs, normalizeRanges, pageOf, pageRange, quarters, halves, Range, surahAt, surahs, totalVolume, volume, weights } from './quran';
import { verifiedToumouns } from './toumoun';

export type Mastery = 'perfect' | 'review' | 'learning';
export type Pace = 'verse1' | 'verse2' | 'verse3' | 'verse4' | 'verse5' | 'halfPage' | 'page' | 'page2' | 'toumoun' | 'quarter' | 'halfHizb' | 'hizb';
export type PacePreset = 'beginner' | 'intermediate' | 'intensive';
export type SessionStatus = 'todo' | 'done' | 'postponed';
export type Session = { id: string; date: string; start: number; end: number; unit: Pace; status: SessionStatus; completedAt?: string; completedDate?: string };
export type Revision = { id: string; start: number; end: number; due: string; interval: number; streak: number; lastGrade?: 'perfect'|'hesitant'|'errors'|'relearn'; completedCount: number };
export type LearningDirection = 'fromStart' | 'fromNas';
export type Goal = { label: string; ranges: Range[]; direction?: LearningDirection };
export type GoalPreset = 'lastTen' | 'sabbih' | 'amma' | 'toYasin' | 'half' | 'all';
export type PersonalProfile = { sex: 'Homme' | 'Femme'; firstName: string };
export type AppTheme = 'classic' | 'feminine' | 'lilac' | 'night';
export type NotificationPreferences = { messages: boolean; learning: boolean; friendRequests?: boolean; sharedProgress?: boolean; revision?: boolean; corrections?: boolean; adminMessages?: boolean; messagePreview?: boolean; permissionExplained?: boolean };
// `tajweed` is kept as the stored key so existing preferences continue to work.
// Le mode `tajweedPages` (Moushaf Tajweed) a ete retire ; App.tsx ramene toute
// valeur stockee a `traditional`, pour ne pas perdre une preference existante.
export type ReaderPreferences = { mushaf:'traditional'|'tajweed'; followAudio:boolean };
export type ReviewSettings = { enabled:boolean; cycleDays:7|14|21|30; resumedAt?:string };
export type ReviewGrade = 'perfect'|'hesitant'|'rework';
export type ReviewEvent = { id:string; date:string; start:number; end:number; category:'recent'|'habitual'|'priority'; grade:ReviewGrade };
export type DifficultyMarker = { user?:{createdAt:string}; admin?:{createdAt:string;comment?:string} };
export type DifficultyEvent = {verseId:number;date:string;origin:'user'|'admin';action:'marked'|'resolved';comment?:string};
export type AppState = { schema: 1; onboardingDone: boolean; knowledge: Record<string, Mastery>; goal: Goal; pace: Pace; learningDays: number[]; sessions: Session[]; revisions: Revision[]; updatedAt: string; userId?: string; profile?: PersonalProfile; theme?: AppTheme; notifications?: NotificationPreferences; reader?:ReaderPreferences; lastRead?:{page:number;verseId:number;readAt:string}; memorizedAt?:Record<string,string>; reviewSettings?:ReviewSettings; reviewHistory?:ReviewEvent[]; reviewDue?:Record<string,string>; difficultyMarkers?:Record<string,DifficultyMarker>; difficultyHistory?:DifficultyEvent[] };

export const paceLabels: Record<Pace,string> = { verse1:'1 verset',verse2:'2 versets',verse3:'3 versets',verse4:'4 versets',verse5:'5 versets',halfPage:'½ page',page:'1 page',page2:'2 pages',toumoun:'1 toumoun',quarter:'1 rub‘',halfHizb:'1 nisf',hizb:'1 hizb' };
export const pacePresets: Record<PacePreset,{label:string;pace:Pace;description:string}> = {
  beginner:{label:'Débutant',pace:'verse1',description:'1 à 5 versets par séance'},
  intermediate:{label:'Intermédiaire',pace:'halfPage',description:'Une demi-page par séance'},
  intensive:{label:'Intensif',pace:'page',description:'1 page, 2 pages ou 1 rub‘ par séance'},
};
export const beginnerPaces: Pace[] = ['verse1','verse2','verse3','verse4','verse5'];
export const intensivePaces: Pace[] = ['page','page2','quarter'];
export const availablePaces = (Object.keys(paceLabels) as Pace[]).filter(p => p !== 'toumoun' || verifiedToumouns !== null);
export const weekdays = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const goalPresetLabels: Record<GoalPreset,string> = {
  lastTen:'Les 10 dernières sourates',sabbih:'Hizb Sabbih',amma:'Juz’ ‘Amma',toYasin:'Jusqu’à la sourate Ya-Sîn',half:'La moitié du Coran',all:'Tout le Coran',
};
export function goalFromPreset(preset:GoalPreset,direction:LearningDirection='fromNas'):Goal {
  const ranges:Record<GoalPreset,Range[]> = {
    lastTen:[{start:surahs[104].start,end:surahs[113].end}],
    sabbih:[hizbs[59]],
    amma:[juzs[29]],
    toYasin:[{start:surahs[35].start,end:surahs[113].end}],
    half:[{start:juzs[15].start,end:juzs[29].end}],
    all:[{start:1,end:6236}],
  };
  return {label:goalPresetLabels[preset],ranges:ranges[preset],direction};
}
export const defaultState = (): AppState => ({schema:1,onboardingDone:false,knowledge:{},goal:{label:'Juz’ ‘Amma',ranges:[{start:5673,end:6236}]},pace:'verse3',learningDays:[1,2,3,4,5],sessions:[],revisions:[],memorizedAt:{},reviewSettings:{enabled:true,cycleDays:7},reviewHistory:[],reviewDue:{},difficultyMarkers:{},difficultyHistory:[],theme:'lilac',notifications:{messages:true,learning:false},reader:{mushaf:'traditional',followAudio:true},updatedAt:'1970-01-01T00:00:00.000Z'});
export function reconcileState(local:AppState,remote:AppState|null):{state:AppState;shouldPush:boolean}{
  if(!remote)return {state:local,shouldPush:true};
  if(remote.updatedAt<=local.updatedAt&&!(remote.onboardingDone&&!local.onboardingDone))return {state:local,shouldPush:true};
  const profile=remote.profile??local.profile,theme=remote.theme??local.theme,notifications=remote.notifications??local.notifications,reader=remote.reader??local.reader,lastRead=remote.lastRead??local.lastRead;
  const memorizedAt=remote.memorizedAt??local.memorizedAt,reviewSettings=remote.reviewSettings??local.reviewSettings,reviewHistory=remote.reviewHistory??local.reviewHistory,reviewDue=remote.reviewDue??local.reviewDue,difficultyMarkers=remote.difficultyMarkers??local.difficultyMarkers,difficultyHistory=remote.difficultyHistory??local.difficultyHistory;
  if(profile===remote.profile&&theme===remote.theme&&notifications===remote.notifications&&reader===remote.reader&&lastRead===remote.lastRead&&memorizedAt===remote.memorizedAt&&reviewSettings===remote.reviewSettings&&reviewHistory===remote.reviewHistory&&reviewDue===remote.reviewDue&&difficultyMarkers===remote.difficultyMarkers&&difficultyHistory===remote.difficultyHistory)return {state:remote,shouldPush:false};
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(remote.updatedAt)+1,Date.parse(local.updatedAt)+1)).toISOString();
  return {state:{...remote,profile,theme,notifications,reader,lastRead,memorizedAt,reviewSettings,reviewHistory,reviewDue,difficultyMarkers,difficultyHistory,updatedAt},shouldPush:true};
}
export function accountState(userId:string,cached:AppState|null,remote:AppState|null):{state:AppState;shouldPush:boolean}{
  const local=cached?.userId===userId?cached:defaultState();
  const safeRemote=remote?.userId&&remote.userId!==userId?null:remote;
  const result=reconcileState(local,safeRemote);
  const owned={...result.state,userId};
  return {state:owned,shouldPush:result.shouldPush||result.state.userId!==userId};
}
export const resetAllProgress = (previous?: AppState): AppState => {
  const now = Date.now();
  const previousTime = previous ? Date.parse(previous.updatedAt) : 0;
  return {...defaultState(),userId:previous?.userId,profile:previous?.profile,theme:previous?.theme??'lilac',notifications:previous?.notifications??{messages:true,learning:true},reader:previous?.reader??{mushaf:'traditional',followAudio:true},reviewSettings:previous?.reviewSettings??{enabled:true,cycleDays:7},updatedAt:new Date(Math.max(now,previousTime+1)).toISOString()};
};
export const todayLocal = (): string => dateKey(new Date());
export function dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function addDays(key: string, days: number): string { const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+days);return dateKey(d); }
export function dayOf(key: string): number { return new Date(`${key}T12:00:00`).getDay(); }
export function touch(state: AppState): AppState {return {...state,updatedAt:new Date().toISOString()};}

export function markKnowledge(state: AppState, range: Range, mastery: Mastery): AppState {
  const knowledge={...state.knowledge},memorizedAt={...state.memorizedAt},reviewDue={...state.reviewDue};
  for(let id=range.start;id<=range.end;id++){
    knowledge[id]=mastery;
    if(mastery==='learning'){delete memorizedAt[id];delete reviewDue[id];}
  }
  return touch({...state,knowledge,memorizedAt,reviewDue});
}
export function isRangeKnown(state:AppState,range:Range):boolean {
  for(let id=range.start;id<=range.end;id++)if(state.knowledge[id]!=='perfect'&&state.knowledge[id]!=='review')return false;
  return true;
}
export function goalIsAlreadyKnown(state:AppState,preset:GoalPreset):boolean{return goalFromPreset(preset).ranges.every(range=>isRangeKnown(state,range));}
export function toggleKnownRange(state:AppState,range:Range):AppState {
  return markKnowledge(state,range,isRangeKnown(state,range)?'learning':'perfect');
}
export function partialKnownRanges(state:AppState):Range[] {
  const ids=memorizedIds(state).sort((a,b)=>a-b);
  const ranges:Range[]=[];
  for(const id of ids){
    const previous=ranges[ranges.length-1];
    if(previous&&id===previous.end+1&&surahAt(id).number===surahAt(previous.start).number)previous.end=id;
    else ranges.push({start:id,end:id});
  }
  return ranges.filter(range=>{
    const surah=surahAt(range.start);
    return range.start!==surah.start||range.end!==surah.end;
  });
}
export function goalIds(state: AppState): number[] {return expand(state.goal.ranges);}
export function learningOrderIds(state: AppState): number[] {
  const ids=goalIds(state);
  return state.goal.direction==='fromNas'
    ? ids.sort((a,b)=>surahAt(b).number-surahAt(a).number||a-b)
    : ids;
}
export function memorizedIds(state: AppState): number[] {return Object.keys(state.knowledge).map(Number).filter(id=>state.knowledge[id]==='perfect'||state.knowledge[id]==='review');}
export function progress(state: AppState) {
  const known = new Set(memorizedIds(state));
  const all=Array.from(known);
  const target=goalIds(state);
  const goalTotal=volume(target);
  const goalKnown=volume(target.filter(id=>known.has(id)));
  return {quran:totalVolume?volume(all)/totalVolume:0,goal:goalTotal?goalKnown/goalTotal:0,goalKnown,goalTotal};
}
export function validGoal(ranges: Range[]): boolean {
  const ids=expand(ranges), selected=new Set(ids);
  if(hizbs.some(h=>Array.from({length:h.end-h.start+1},(_,i)=>h.start+i).every(id=>selected.has(id)))) return true;
  return volume(ids)>=totalVolume/60;
}

function nextChunk(remaining: number[], pace: Pace): number[] {
  if(!remaining.length)return [];
  if(pace.startsWith('verse')) return remaining.slice(0,Number(pace.slice(5)));
  const first=remaining[0];
  if(pace==='page2') {
    const selectedPages=new Set<number>(),out:number[]=[];
    for(const id of remaining){
      const page=pageOf(id);
      if(!selectedPages.has(page)&&selectedPages.size===2)break;
      selectedPages.add(page);out.push(id);
    }
    return out;
  }
  if(pace==='halfPage'||pace==='page') {
    const pr=pageRange(pageOf(first));
    const within=takePrefix(remaining,id=>id>=pr.start&&id<=pr.end);
    if(pace==='page')return within;
    const target=volume(Array.from({length:pr.end-pr.start+1},(_,i)=>pr.start+i))/2;
    let sum=0;const out:number[]=[];
    for(const id of within){out.push(id);sum+=weights[id-1];if(sum>=target)break;}
    return out;
  }
  if(pace==='toumoun'&&!verifiedToumouns)throw new Error('Les limites Hafs des toumoun ne sont pas vérifiées.');
  const divisions=pace==='toumoun'?verifiedToumouns!:pace==='quarter'?quarters:pace==='halfHizb'?halves:hizbs;
  const boundary=divisions.find(d=>first>=d.start&&first<=d.end)!;
  return takePrefix(remaining,id=>id>=boundary.start&&id<=boundary.end);
}
function takePrefix(ids:number[],includes:(id:number)=>boolean):number[] {
  const out:number[]=[];
  for(const id of ids){if(!includes(id))break;out.push(id);}
  return out;
}
function splitContiguous(ids: number[]): Range[] {
  const result: Range[]=[];
  for(const id of ids){const last=result[result.length-1];if(last&&id===last.end+1&&surahAt(id).number===surahAt(last.start).number)last.end=id;else result.push({start:id,end:id});}
  return result;
}
export function generateProgram(state: AppState, from=todayLocal(), days=20000): AppState {
  const old=state.sessions.filter(s=>s.status!=='todo'||s.date<from).map(s=>s.status==='todo'?{...s,status:'postponed' as SessionStatus}:s);
  const scheduled=new Set(old.filter(s=>s.status==='done').flatMap(s=>Array.from({length:s.end-s.start+1},(_,i)=>s.start+i)));
  const known=new Set(memorizedIds(state));
  let remaining=learningOrderIds(state).filter(id=>!known.has(id)&&!scheduled.has(id));
  const sessions: Session[]=[];
  let serial=0;
  for(let offset=0;offset<days&&remaining.length;offset++){
    const date=addDays(from,offset);
    if(!state.learningDays.includes(dayOf(date)))continue;
    const chunk=nextChunk(remaining,state.pace);
    remaining=remaining.slice(chunk.length);
    for(const range of splitContiguous(chunk))sessions.push({id:`${date}-${range.start}-${serial++}`,date,...range,unit:state.pace,status:'todo'});
  }
  return touch({...state,sessions:[...old,...sessions].sort((a,b)=>a.date.localeCompare(b.date))});
}
export function seedInitialRevisions(state:AppState,from=todayLocal()):AppState {
  const covered=new Set(state.revisions.flatMap(r=>Array.from({length:r.end-r.start+1},(_,i)=>r.start+i)));
  const known=memorizedIds(state).filter(id=>!covered.has(id)).sort((a,b)=>a-b);
  const groups=splitContiguous(known);
  const revisions=[...state.revisions,...groups.map(r=>({id:`r-initial-${r.start}-${r.end}`,start:r.start,end:r.end,due:addDays(from,1),interval:1,streak:0,completedCount:0}))];
  return touch({...state,revisions});
}
export function postponeSession(state: AppState,id:string,from=todayLocal()):AppState {
  const sessions=state.sessions.map(s=>s.id===id?{...s,status:'postponed' as SessionStatus}:s);
  return generateProgram({...state,sessions},from);
}
export function completeSession(state: AppState,id:string,memorized:boolean,from=todayLocal()):AppState {
  const session=state.sessions.find(s=>s.id===id);
  if(!session)return state;
  if(!memorized)return postponeSession(state,id,from);
  const memorizedAt={...state.memorizedAt};
  for(let verse=session.start;verse<=session.end;verse++)if(state.knowledge[verse]!=='perfect'&&state.knowledge[verse]!=='review'&&!memorizedAt[verse])memorizedAt[verse]=from;
  const updated=markKnowledge({...state,memorizedAt},session,'perfect');
  const revisions=updated.revisions.filter(r=>r.end<session.start||r.start>session.end);
  revisions.push({id:`r-${session.start}-${session.end}`,start:session.start,end:session.end,due:addDays(from,1),interval:1,streak:0,completedCount:0});
  const sessions=updated.sessions.map(s=>s.id===id?{...s,status:'done' as SessionStatus,completedAt:new Date().toISOString(),completedDate:from}:s);
  return generateProgram({...updated,sessions,revisions},from);
}
export function gradeRevision(state:AppState,id:string,grade:'perfect'|'hesitant'|'errors'|'relearn',from=todayLocal()):AppState {
  const revisions=state.revisions.map(r=>{
    if(r.id!==id)return r;
    const interval=grade==='perfect'?Math.min(90,Math.max(3,r.interval*2)):grade==='hesitant'?3:grade==='errors'?1:1;
    return {...r,interval,streak:grade==='perfect'?r.streak+1:0,due:addDays(from,interval),lastGrade:grade,completedCount:r.completedCount+1};
  });
  const target=state.revisions.find(r=>r.id===id);
  if(!target)return state;
  let updated={...state,revisions};
  if(grade==='relearn')updated=markKnowledge(updated,target,'learning');
  else if(grade==='perfect')updated=markKnowledge(updated,target,'perfect');
  else updated=markKnowledge(updated,target,'review');
  return touch(updated);
}
export function completedHizbs(state:AppState):number {const known=new Set(memorizedIds(state));return hizbs.filter(h=>{for(let id=h.start;id<=h.end;id++)if(!known.has(id))return false;return true;}).length;}
export function stats(state:AppState,at=todayLocal()) {
  const done=state.sessions.filter(s=>s.status==='done'&&s.completedAt);
  const date=new Date(`${at}T12:00:00`);const weekStart=addDays(at,-((date.getDay()+6)%7));const monthStart=`${at.slice(0,7)}-01`;
  const dateOf=(s:Session)=>s.completedDate??s.completedAt!.slice(0,10);
  const count=(start:string)=>done.filter(s=>dateOf(s)>=start&&dateOf(s)<=at).reduce((n,s)=>n+s.end-s.start+1,0);
  return {today:count(at),week:count(weekStart),month:count(monthStart),days:new Set(done.map(dateOf)).size,revisions:state.revisions.reduce((n,r)=>n+r.completedCount,0),hizbs:completedHizbs(state),weeklySessions:done.filter(s=>dateOf(s)>=weekStart).length};
}
