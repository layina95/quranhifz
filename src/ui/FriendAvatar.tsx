import React,{useEffect,useState} from 'react';
import {Image,View} from 'react-native';
import {avatarUrl} from '../services/avatars';
import {colors,Label} from './theme';

// Silhouette dessinee avec deux vues : le projet n'embarque pas de bibliotheque
// d'icones. Elle sert de repli quand il n'y a ni photo ni prenom exploitable.
function Silhouette({size}:{size:number}){
  const head=size*0.28,torso=size*0.56;
  return <View style={{width:size,height:size,alignItems:'center',justifyContent:'flex-end'}}>
    <View style={{width:head,height:head,borderRadius:head/2,backgroundColor:colors.muted,marginBottom:size*0.04}} />
    <View style={{width:torso,height:size*0.34,borderTopLeftRadius:torso/2,borderTopRightRadius:torso/2,backgroundColor:colors.muted}} />
  </View>;
}

export function FriendAvatar({name,path,size=42,uri}:{name:string;path?:string|null;size?:number;uri?:string|null}){
  const [remote,setRemote]=useState<string|null>(null);
  useEffect(()=>{let active=true;setRemote(null);if(path)avatarUrl(path).then(url=>{if(active)setRemote(url);}).catch(()=>{});return()=>{active=false;};},[path]);
  const source=uri??remote;
  const initial=name.trim().charAt(0).toLocaleUpperCase('fr-FR');
  return <View style={{width:size,height:size,borderRadius:size/2,overflow:'hidden',backgroundColor:colors.soft,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.softBorder}}>
    {source?<Image source={{uri:source}} style={{width:size,height:size}} />:initial?<Label style={{fontSize:size*0.43,fontWeight:'700',color:colors.green}}>{initial}</Label>:<Silhouette size={size} />}
  </View>;
}
