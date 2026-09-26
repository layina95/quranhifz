// Reconstruire src/data/pages.json depuis le PLACEMENT IMPRIME.
//
// La table en place vient de l'IPA de reference : sa division est celle de
// Tanzil, et elle ne decrit pas le Moushaf imprime. Mesure faite sur le scan du
// Moushaf de Medine (quran.ksu.edu.sa/png_big/585.png) : la page 585 se termine
// au medaillon ٤٠, donc a 80:40 ; la page 586 porte 80:41 et 80:42 en ligne 1,
// le bandeau de la sourate 81 en ligne 2, la basmala en ligne 3, puis 81:1 en
// ligne 4. La table en place dit au contraire 585 = 80:1..80:42, ce qui laisse
// 80:41 et 80:42 sans page : cinquante-six versets n'etaient dessines nulle part.
//
// Le placement imprime est porte par le champ page_number de CHAQUE MOT. Il faut
// reunir les reponses des pages voisines pour l'obtenir : une reponse de page
// annonce les versets de SA page, pas ceux dont les mots sont dessines ailleurs.
//
// Usage : node scripts/regenerer-pages.mjs [--ecrire]
//         MESURES_JSON=chemin.json pour ecrire l'empreinte detaillee des pages.

import {readFileSync,writeFileSync} from 'node:fs';

const ECRIRE=process.argv.includes('--ecrire');
const URL=n=>`https://api.quran.com/api/v4/verses/by_page/${n}?mushaf=19&words=true&word_fields=code_v2,text_qpc_hafs&per_page=50`;

async function charger(n){
  for(let essai=1;essai<=4;essai++){
    try{
      const r=await fetch(URL(n));
      if(r.ok)return await r.json();
      if(essai===4)throw new Error(`HTTP ${r.status}`);
    }catch(e){
      if(essai===4)throw e;
    }
    await new Promise(x=>setTimeout(x,400*essai));
  }
}

// --- 1. une seule passe reseau, gardee en memoire --------------------------
const reponses=new Map();
for(let n=1;n<=604;n++){
  reponses.set(n,await charger(n));
  if(n%100===0)console.error(`  ${n}/604 pages lues`);
  await new Promise(x=>setTimeout(x,40));
}
console.error('  604/604 pages lues');

// --- 2. chaque mot range sous la page ou il est dessine --------------------
// Trois ensembles distincts, et c'est leur ecart qui fait tout le sujet :
//   - REUNI    : les mots groupes par leur propre page_number, toutes reponses
//                confondues. C'est le placement imprime, donc la table.
//   - SIEN     : les mots que la reponse de la page porte elle-meme, c'est-a-dire
//                ceux dont le mot est dessine ici. C'est tout ce que le lecteur
//                obtient s'il n'interroge pas les voisines.
//   - ANNONCES : les versets que la reponse de la page cite, meme si leurs mots
//                sont dessines ailleurs. C'est ce qu'une voisine peut apporter.
const numero=cle=>{const [s,a]=cle.split(':').map(Number);return {s,a};};
const versetsParPage=new Map();
const versetsSien=new Map();
const versetsAnnonces=new Map();
const pagesParVerset=new Map();
const motsReunis=new Map();
const types={};
let versets=0,mots=0;

for(const [n,reponse] of reponses){
  if(!versetsAnnonces.has(n))versetsAnnonces.set(n,new Set());
  for(const v of reponse.verses){
    versets++;
    versetsAnnonces.get(n).add(v.verse_key);
    for(const mot of v.words){
      mots++;
      const t=mot.char_type_name??'?';
      types[t]=(types[t]??0)+1;
      const p=mot.page_number;
      if(!Number.isInteger(p)||p<1||p>604)throw new Error(`${v.verse_key} : page_number ${p} invalide`);
      if(!versetsParPage.has(p))versetsParPage.set(p,new Set());
      versetsParPage.get(p).add(v.verse_key);
      if(!motsReunis.has(p))motsReunis.set(p,[]);
      motsReunis.get(p).push({ligne:mot.line_number,verse:v.verse_key,type:t,position:mot.position,code:mot.code_v2??''});
      if(p===n){
        if(!versetsSien.has(p))versetsSien.set(p,new Set());
        versetsSien.get(p).add(v.verse_key);
      }
      if(!pagesParVerset.has(v.verse_key))pagesParVerset.set(v.verse_key,new Set());
      pagesParVerset.get(v.verse_key).add(p);
    }
  }
}

console.log(`mots lus : ${mots}`);
console.log(`versets lus : ${versets}`);
console.log(`types de mot : ${Object.entries(types).map(([k,v])=>`${k}=${v}`).join(', ')}`);

// --- 3. un verset a-t-il ses mots sur deux pages ? -------------------------
const partages=[...pagesParVerset.entries()].filter(([,pages])=>pages.size>1);
console.log(`\nversets dont les mots sont sur deux pages : ${partages.length}`);
for(const [cle,pages] of partages.slice(0,10))console.log(`  ${cle} : pages ${[...pages].join(',')}`);

// --- 4. la table reconstruite ---------------------------------------------
const table=[];
const problemes=[];
for(let p=1;p<=604;p++){
  const clefs=[...versetsParPage.get(p)??[]].map(numero).sort((x,y)=>x.s-y.s||x.a-y.a);
  if(!clefs.length){problemes.push(`page ${p} : aucun verset dessine`);continue;}
  table.push({page:p,first:[clefs[0].s,clefs[0].a],last:[clefs[clefs.length-1].s,clefs[clefs.length-1].a]});
}

// --- 5. le pave : chaque page reprend exactement ou la precedente s'arrete --
// Le rang d'un verset est GLOBAL : 1:7 et 2:1 se suivent. Comparer des couples
// (sourate, verset) ferait croire a un trou a chaque changement de sourate.
const sourates=JSON.parse(readFileSync('src/data/meta.json','utf8')).surahs;
const idVerset=([s,a])=>sourates[s-1].start+a-1;
const idDeCle=cle=>{const {s,a}=numero(cle);return idVerset([s,a]);};
const cleDe=id=>{const s=sourates.find(x=>id>=x.start&&id<=x.end);return `${s.number}:${id-s.start+1}`;};
for(let i=1;i<table.length;i++){
  const precedent=table[i-1].last,suivant=table[i].first;
  if(idVerset(suivant)!==idVerset(precedent)+1)
    problemes.push(`page ${table[i].page} : commence a ${suivant.join(':')}, la page ${table[i-1].page} finit a ${precedent.join(':')}`);
}
console.log(`\ntable reconstruite : ${table.length} pages`);
console.log(`premiere page : ${table[0].first.join(':')}..${table[0].last.join(':')}`);
console.log(`derniere page : ${table[603].first.join(':')}..${table[603].last.join(':')}`);
console.log(`versets couverts : ${idVerset(table[603].last)-idVerset(table[0].first)+1} (6236 attendus)`);
console.log(`problemes de pave : ${problemes.length}`);
for(const p of problemes.slice(0,10))console.log('  '+p);

// --- 6. comparaison avec la table en place ---------------------------------
const ancienne=JSON.parse(readFileSync('src/data/pages.json','utf8'));
const changements=[];
for(let i=0;i<604;i++){
  const a=ancienne[i],b=table[i];
  if(!a||a.first[0]!==b.first[0]||a.first[1]!==b.first[1]||a.last[0]!==b.last[0]||a.last[1]!==b.last[1])
    changements.push(`page ${b.page} : ${a?a.first.join(':')+'..'+a.last.join(':') : 'absente'} -> ${b.first.join(':')}..${b.last.join(':')}`);
}
console.log(`\npages dont la division change : ${changements.length}`);
for(const c of changements)console.log('  '+c);

// --- 7. ce que la reponse d'une page ne porte pas --------------------------
// La regle que le lecteur appliquera : si la page dessine moins que ce que la
// table lui attribue, la fin manque et elle est annoncee par la page suivante ;
// si elle dessine plus, le debut est annonce par la page precedente. On verifie
// pour les 604 pages que le diagnostic est juste, et que la voisine designee
// annonce bien tout ce qui manque.
let diagnostics=0,deux=0,justes=0,infonde=[];
for(let p=1;p<=604;p++){
  const idsReunis=[...(versetsParPage.get(p)??[])].map(idDeCle);
  const idsSien=[...(versetsSien.get(p)??[])].map(idDeCle);
  if(!idsReunis.length||!idsSien.length)continue;
  const premierSien=Math.min(...idsSien),dernierSien=Math.max(...idsSien);
  const premierReuni=Math.min(...idsReunis),dernierReuni=Math.max(...idsReunis);
  const manques=[];
  if(premierSien>premierReuni)manques.push({cote:'debut',de:premierReuni,a:premierSien-1,voisine:p-1});
  if(dernierSien<dernierReuni)manques.push({cote:'fin',de:dernierSien+1,a:dernierReuni,voisine:p+1});
  if(!manques.length)continue;
  diagnostics++;
  if(manques.length>1)deux++;
  for(const m of manques){
    if(m.voisine<1||m.voisine>604){infonde.push(`page ${p} : ${m.cote} manquant mais aucune page ${m.voisine}`);continue;}
    const annonces=new Set([...(versetsAnnonces.get(m.voisine)??[])].map(idDeCle));
    let complet=true;
    for(let x=m.de;x<=m.a;x++)if(!annonces.has(x)){complet=false;break;}
    if(complet)justes++;else infonde.push(`page ${p} : la page ${m.voisine} n'annonce pas ${cleDe(m.de)}..${cleDe(m.a)}`);
  }
}
console.log(`\npages dont la propre reponse ne suffit pas : ${diagnostics} sur 604`);
console.log(`pages a qui il manque les deux cotes : ${deux}`);
console.log(`manques effectivement annonces par la voisine designee : ${justes}`);
console.log(`diagnostics infondes : ${infonde.length}`);
for(const c of infonde.slice(0,10))console.log('  '+c);

// --- 8. les bandeaux de sourate --------------------------------------------
// Une sourate porte un bandeau et une basmala avant son premier mot. Quand ce
// premier mot tient la ligne 2 de sa page, la basmala tient la ligne 1 et le
// bandeau ne peut pas tenir la ligne 0 : il tient la DERNIERE ligne de la page
// precedente. Ce deplacement ne se voit pas dans la reponse de cette page-ci --
// son premier mot est dessine ailleurs -- et c'est ce qui fait disparaitre
// dix-huit bandeaux. On mesure donc la ligne du premier mot de chaque sourate, et
// pour les cas en ligne 2, la derniere ligne occupee par la page precedente :
// c'est cette ligne qui doit etre libre pour le bandeau.
const premierMot=new Map();
for(const [n,reponse] of reponses){
  for(const v of reponse.verses){
    const {s,a}=numero(v.verse_key);
    if(a!==1)continue;
    const premier=v.words.find(m=>m.char_type_name==='word'&&Number(m.position)===1);
    if(premier&&premier.page_number===n)premierMot.set(s,{page:n,ligne:premier.line_number});
  }
}
const distribution={};
for(const [,info] of premierMot)distribution[info.ligne]=(distribution[info.ligne]??0)+1;
console.log(`\n=== bandeaux de sourate`);
console.log(`sourates dont le premier mot a ete trouve : ${premierMot.size} sur 114`);
console.log(`ligne du premier mot : ${Object.entries(distribution).sort((a,b)=>a[0]-b[0]).map(([l,n])=>`ligne ${l} : ${n}`).join(' | ')}`);
const enLigne2=[...premierMot.entries()].filter(([,i])=>i.ligne===2).map(([s,i])=>({s,...i}));
console.log(`sourates a premier mot en ligne 2 : ${enLigne2.length} (dont Al-Fatiha et At-Tawbah, sans basmala)`);
let ligneLibre=0,occupees=[];
for(const {s,page} of enLigne2){
  if(s===1||s===9)continue;
  const precedente=page-1;
  let max=0;
  for(const v of reponses.get(precedente).verses)for(const m of v.words){
    if(m.page_number!==precedente)continue;
    if(m.line_number>max)max=m.line_number;
  }
  if(max===14)ligneLibre++;else occupees.push(`sourate ${s} (page ${page}) : la page ${precedente} monte jusqu'a la ligne ${max}`);
}
console.log(`bandeaux qui doivent tenir la ligne 15 de la page precedente : ${ligneLibre}`);
console.log(`cas ou cette ligne n'est pas libre : ${occupees.length}`);
for(const c of occupees)console.log('  '+c);

// --- 9. empreinte detaillee, pour les sondes hors ligne --------------------
// Les mots sont ceux de la REUNION, groupes par page de dessin : c'est le
// placement imprime. Les annonces disent ce que la reponse de la page porte
// elle-meme, ce qui permet de verifier hors ligne la regle des voisines.
const cheminMesures=process.env.MESURES_JSON;
if(cheminMesures){
  const detail=[];
  for(let p=1;p<=604;p++){
    const mots=(motsReunis.get(p)??[]).slice().sort((a,b)=>a.ligne-b.ligne||a.position-b.position);
    const lignes=[...new Set(mots.map(m=>m.ligne))].sort((a,b)=>a-b);
    detail.push({
      page:p,
      lignes,
      mots,
      annonces:[...(versetsAnnonces.get(p)??[])],
      first:table[p-1].first,
      last:table[p-1].last,
    });
  }
  writeFileSync(cheminMesures,JSON.stringify(detail));
  console.log(`\n${cheminMesures} ecrit : ${detail.length} pages`);
}

// --- 10. ecriture ----------------------------------------------------------
if(problemes.length){
  console.log('\nAUCUNE ECRITURE : la table reconstruite ne pave pas.');
  process.exit(1);
}
if(ECRIRE){
  writeFileSync('src/data/pages.json',JSON.stringify(table));
  console.log(`\nsrc/data/pages.json ecrit : ${JSON.stringify(table).length} octets`);
}else{
  console.log('\n(rien ecrit : relancer avec --ecrire)');
}
