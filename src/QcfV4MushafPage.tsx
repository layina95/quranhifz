import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {WebView,WebViewMessageEvent} from 'react-native-webview';
import {TailleMushaf,zoomDeTaille} from './core/coranTestMode';
import {QcfV4Page} from './core/qcfV4';
import {qcfV4Html} from './core/qcfV4Html';
import {juzs,pageRange,surahAt} from './core/quran';
import {loadQcfV4Page} from './services/qcfV4';
import {colors,Label} from './ui/theme';

type Props={page:number;width:number;height:number;taille:TailleMushaf;playingVerseId:number|null;difficultyIds:number[];sessionStart:number;sessionEnd:number;onVerseLongPress:(id:number)=>void;onTap:()=>void;onRetourAuMoushaf:()=>void};

/**
 * Le bandeau de tete reprend celui de l'application de reference : le juz' a
 * gauche, le nom de la sourate en latin puis en arabe a droite. La sourate est
 * celle du premier verset de la page, comme sur la page imprimee.
 */
function enteteDePage(firstVerseId:number){
  const juz=juzs.find(item=>firstVerseId>=item.start&&firstVerseId<=item.end);
  const surah=surahAt(firstVerseId);
  return {juz:juz?`Juz' ${juz.number}`:'',latin:surah.name.toUpperCase().replace(/ /g,'-'),arabe:surah.arabic};
}

/**
 * Lecture « Coran Test » : la page est dessinee par la police QCF V4, donc mise
 * en page et couleurs de Tajweed sont celles du Moushaf, et le verset recite s'y
 * surligne pendant l'audio. Rien n'est stocke dans l'application : sans reponse
 * du serveur, on l'annonce et on propose une autre presentation plutot que
 * d'afficher une page approximative.
 *
 * `taille` est la seule personnalisation : elle agrandit la page sans changer
 * ses proportions, donc l'emplacement imprime des versets reste le meme.
 */
export function QcfV4MushafPage({page,width,height,taille,playingVerseId,difficultyIds,sessionStart,sessionEnd,onVerseLongPress,onTap,onRetourAuMoushaf}:Props){
  const zoom=zoomDeTaille(taille);
  const [data,setData]=useState<QcfV4Page|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [fontReady,setFontReady]=useState(false);
  // The package's generic declaration intersects Android, iOS and Windows props.
  // Native resolution still chooses the platform-specific implementation.
  const NativeWebView=WebView as unknown as React.ComponentType<any>;
  const web=useRef<{injectJavaScript:(source:string)=>void}|null>(null);
  useEffect(()=>{
    let active=true;
    setData(null);setError(null);setFontReady(false);
    loadQcfV4Page(page).then(result=>{
      if(!active)return;
      // La page reconstituee doit couvrir exactement les versets que la table
      // lui attribue : c'est le controle qui garantit que chaque verset occupe
      // la place du Moushaf imprime, et qu'aucun n'est perdu ni compte deux fois.
      const expected=pageRange(page);
      if(result.firstVerseId!==expected.start||result.lastVerseId!==expected.end){
        setError('Cette page est incomplète : un verset de son début ou de sa fin manque.');return;
      }
      setData(result);
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Page Tajweed indisponible.');});
    return()=>{active=false;};
  },[page]);
  useEffect(()=>{
    if(data&&fontReady)web.current?.injectJavaScript(`setPlaying(${playingVerseId??'null'});true;`);
  },[data,fontReady,playingVerseId]);
  const html=useMemo(()=>data?qcfV4Html(data,playingVerseId,difficultyIds,sessionStart,sessionEnd,zoom):'',
    [data,difficultyIds.join(','),sessionStart,sessionEnd,zoom]);
  const onMessage=(event:WebViewMessageEvent)=>{
    try{
      const message=JSON.parse(event.nativeEvent.data);
      if(message.type==='ready')setFontReady(true);
      if(message.type==='font-error')setError('La police Tajweed ne s’est pas chargée.');
      // Le livre comprime ses lignes, et la plus forte compression des 604 pages
      // vaut 0,7180 (page 414, ligne 3). Ce message n'est donc atteignable que
      // par une page mal composée, jamais par une page du Moushaf.
      if(message.type==='layout-error')setError(`La ligne ${message.line||'concernée'} dépasse la page.`);
      if(message.type==='verse'&&data&&Number.isInteger(message.id)&&message.id>=data.firstVerseId&&message.id<=data.lastVerseId)onVerseLongPress(message.id);
      if(message.type==='tap')onTap();
    }catch{/* Ignore messages unrelated to the reader. */}
  };
  if(!data||error)return <View style={{width,minHeight:height,backgroundColor:colors.paper,borderWidth:2,borderColor:colors.beige,borderRadius:9,padding:22,alignItems:'center',justifyContent:'center'}}>
    <Label style={{fontWeight:'700'}}>Coran Test</Label>
    <Label style={{color:colors.muted,fontSize:13,textAlign:'center',marginTop:9}}>{error??'Chargement de la page…'}</Label>
    <Label style={{color:colors.muted,fontSize:12,textAlign:'center',marginTop:9}}>Cette lecture dessine la page avec la police officielle, demandée page par page : elle a besoin d’une connexion.</Label>
    <Pressable accessibilityLabel="Choisir une autre présentation" onPress={onRetourAuMoushaf} style={{marginTop:16,paddingVertical:11,paddingHorizontal:16,borderRadius:14,backgroundColor:colors.soft,borderWidth:1,borderColor:colors.softBorder}}><Label style={{color:colors.green,fontWeight:'700',fontSize:14}}>Choisir une autre présentation</Label></Pressable>
  </View>;
  const entete=enteteDePage(data.firstVerseId);
  return <View style={{width,height,backgroundColor:colors.paper}}>
    <View style={{height:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:6}}>
      <Label style={{fontSize:13,color:colors.muted}}>{entete.juz}</Label>
      <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
        <Label style={{fontSize:13,color:colors.muted,letterSpacing:1.1}}>{entete.latin}</Label>
        <Label style={{fontSize:16,color:colors.text}}>{entete.arabe}</Label>
      </View>
    </View>
    <NativeWebView ref={web} source={{html,baseUrl:'https://verses.quran.foundation'}} originWhitelist={['https://*']} scrollEnabled={zoom>1} javaScriptEnabled onMessage={onMessage} onError={()=>setError('Le Coran Test ne s’est pas chargé.')} style={{flex:1,backgroundColor:colors.paper}} />
  </View>;
}
