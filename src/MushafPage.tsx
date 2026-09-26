import React from 'react';
import {Image,Pressable,Text,View} from 'react-native';
import {colors,Label} from './ui/theme';
import {mushafImages} from './data/mushafImages';
import boundsRaw from './data/bounds.json';
import {frenchVerse,lineHighlightRect,tajweedColor,tajweedSpans,verseAtImagePoint} from './core/readerData';
import {pageRange,Range,surahs,verseAt,verseId} from './core/quran';

type Props={page:number;width:number;height:number;mode:'traditional'|'tajweed';language:'ar'|'fr';playingVerseId:number|null;difficultyIds?:number[];sessionRange:Range;showSession:boolean;masked:boolean;revealed:number|null;onVerseLongPress:(id:number)=>void;onBlankLongPress:()=>void;onTap:()=>void};
const bounds=boundsRaw as Record<string,number[][]>;

export function MushafPage({page,width,height,mode,language,playingVerseId,difficultyIds=[],sessionRange,showSession,masked,revealed,onVerseLongPress,onBlankLongPress,onTap}:Props){
  const rows=bounds[String(page)]??[];
  const range=pageRange(page);
  const ids=Array.from({length:range.end-range.start+1},(_,index)=>range.start+index);
  const verseSelected=(id:number)=>id===playingVerseId||(showSession&&id>=sessionRange.start&&id<=sessionRange.end);
  if(masked)return <Pressable onPress={onTap} style={{width,height,backgroundColor:colors.paper,borderWidth:2,borderColor:colors.beige,borderRadius:9,padding:20,alignItems:'center',justifyContent:'center'}}><Label style={{color:colors.gold,fontSize:25}}>۞</Label><Label style={{color:colors.muted,textAlign:'center',marginTop:14}}>Récite les versets de mémoire.</Label>{revealed!==null&&ids.includes(revealed)&&<Label style={{fontSize:25,lineHeight:48,textAlign:'center',writingDirection:'rtl',marginTop:25}}>{verseAt(revealed).text} ۞</Label>}</Pressable>;
  if(language==='fr'||mode==='tajweed')return <View style={{width,minHeight:height,backgroundColor:colors.paper,borderWidth:2,borderColor:colors.beige,borderRadius:9,padding:16}}>
    <Label style={{textAlign:'center',color:colors.gold,fontSize:13,marginBottom:12}}>{language==='fr'?'Traduction française du sens des versets':`Lecture simplifiée · page ${page}`}</Label>
    {ids.map(id=>{const verse=verseAt(id),translation=frenchVerse(id),spans=language==='ar'?tajweedSpans(id):[];const difficult=difficultyIds.includes(id);return <Pressable key={id} onLongPress={()=>onVerseLongPress(id)} delayLongPress={450} onPress={onTap} style={{padding:10,marginBottom:8,borderRadius:12,backgroundColor:difficult?'#FCE8E8':verseSelected(id)?colors.highlight:colors.paper,borderWidth:difficult?1:0,borderColor:'#D97878'}}>
      <Label style={{fontSize:12,color:colors.gold,marginBottom:5}}>{surahs[verse.surah-1].name} · verset {verse.ayah}</Label>
      {language==='fr'?<><Label style={{fontSize:16,lineHeight:25}}>{translation?.translation??'Traduction indisponible.'}</Label>{translation?.footnotes?<Label style={{fontSize:12,color:colors.muted,marginTop:5}}>{translation.footnotes}</Label>:null}</>:
        <Text style={{fontSize:25,lineHeight:48,textAlign:'right',writingDirection:'rtl',color:colors.text}}>{spans.map((span,index)=><Text key={index} style={{color:span.rule?tajweedColor(span.rule):colors.text}}>{span.text}</Text>)} <Text style={{color:colors.gold}}>۞</Text></Text>}
    </Pressable>;})}
    {language==='fr'?<Label style={{fontSize:11,color:colors.muted,marginTop:8}}>Traduction du sens : Rachid Maach · QuranEnc</Label>:<Label style={{fontSize:11,color:colors.muted,marginTop:8}}>Tajweed : cpfair, CC BY 4.0 · texte Hafs Tanzil 2017</Label>}
  </View>;
  return <Pressable onPress={onTap} onLongPress={event=>{const {locationX,locationY}=event.nativeEvent;const id=verseAtImagePoint(rows,locationX-2,locationY-2,width-4,height-4);if(id===null)onBlankLongPress();else onVerseLongPress(id);}} delayLongPress={450} style={{width,height,backgroundColor:'white',borderWidth:2,borderColor:colors.beige,borderRadius:9,overflow:'hidden',shadowColor:'#000',shadowOpacity:0.12,shadowRadius:10}}>
    <Image source={mushafImages[page]} style={{width:width-4,height:height-4}} resizeMode="contain" />
    {rows.filter(row=>{const id=verseId(row[0],row[1]);return id!==null&&(verseSelected(id)||difficultyIds.includes(id));}).map((row,index)=>{const id=verseId(row[0],row[1])!,active=id===playingVerseId,difficult=difficultyIds.includes(id),box=lineHighlightRect(row,width,height);return <View key={index} pointerEvents="none" style={{position:'absolute',...box,backgroundColor:difficult?'#E85B5B':active?colors.highlight:colors.gold,opacity:difficult?0.18:active?1:0.11,borderRadius:6}} />;})}
  </Pressable>;
}
