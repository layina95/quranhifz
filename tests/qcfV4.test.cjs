const test=require('node:test');
const assert=require('node:assert/strict');
const {fonctionAbsenteDuServeur,messageApiPublique,messageDeRefus,ouvertureDeSourate,parseQcfV4Page,reunirReponses,urlApiPublique}=require('./build/core/qcfV4.js');
const {pageRange,verseId}=require('./build/core/quran.js');
const {qcfV4Html}=require('./build/core/qcfV4Html.js');
const {ayahMarkerHtml,easternArabicNumber}=require('./build/core/ayahMarker.js');

const page={pagination:{total_pages:1},verses:[
  {verse_key:'2:6',words:[{position:1,page_number:3,line_number:1,char_type_name:'word',code_v2:'ﱁ',text_qpc_hafs:'إِنَّ'},{position:2,page_number:3,line_number:2,char_type_name:'end',text_qpc_hafs:'٦'}]},
  {verse_key:'2:7',words:[{position:1,page_number:3,line_number:2,char_type_name:'word',code_v2:'ﱂ',text_qpc_hafs:'خَتَمَ'}]},
]};

test('le rendu QCF V4 conserve les versets distincts sur une même ligne',()=>{
  const parsed=parseQcfV4Page(3,page);
  assert.equal(parsed.firstVerseId,verseId(2,6));
  assert.equal(parsed.lastVerseId,verseId(2,7));
  assert.deepEqual(parsed.lines[1].words.map(word=>word.verseKey),['2:6','2:7']);
  const html=qcfV4Html(parsed,verseId(2,7),[verseId(2,6)],0,0);
  assert.ok(html.includes(`data-verse="${verseId(2,7)}"`));
  assert.match(html,/class="word playing"/);
  assert.match(html,/class="word difficult"/);
  assert.match(html,/data-verse-key="2:6"><svg class="ayah-ornament"/);
  assert.match(html,/>٦<\/text><\/svg>/);
  assert.match(html,/\.end\.playing,\.end\.difficult\{background:transparent/);
});

test('le médaillon utilise le numéro réel du verset avec un, deux ou trois chiffres',()=>{
  assert.equal(easternArabicNumber(1),'١');
  assert.equal(easternArabicNumber(10),'١٠');
  assert.equal(easternArabicNumber(255),'٢٥٥');
  assert.match(ayahMarkerHtml('2:255'),/>٢٥٥<\/text>/);
  assert.throws(()=>ayahMarkerHtml('2:<script>'),/invalide/);
});

test('une réponse paginée ou issue d’une autre édition est rejetée',()=>{
  assert.throws(()=>parseQcfV4Page(3,{...page,pagination:{total_pages:2}}),/incomplète/);
  assert.throws(()=>parseQcfV4Page(4,page),/Aucun mot/);
  assert.throws(()=>parseQcfV4Page(3,{...page,verses:[page.verses[0],{...page.verses[1],verse_key:'2:8'}]}),/manquants/);
});

test('un verset à cheval sur deux pages ne transporte pas ses mots sur la mauvaise page',()=>{
  const split={pagination:{total_pages:1},verses:[{verse_key:'2:6',words:[
    {position:1,page_number:2,line_number:15,char_type_name:'word',code_v2:'ﱁ'},
    {position:2,page_number:3,line_number:1,char_type_name:'word',code_v2:'ﱂ'},
  ]}]};
  const parsed=parseQcfV4Page(3,split);
  assert.equal(parsed.lines[0].words.length,1);
  assert.equal(parsed.lines[0].words[0].position,2);
});

test('la page 603 réserve trois bandeaux et trois Basmala aux changements de sourate',()=>{
  const layout=[
    [109,[3,3,4,4,5,5]],
    [110,[8,9,10]],
    [111,[13,13,14,14,15]],
  ];
  const fixture={pagination:{total_pages:1},verses:layout.flatMap(([surah,lineNumbers])=>lineNumbers.map((line,index)=>({
    verse_key:`${surah}:${index+1}`,
    words:[
      {position:1,page_number:603,line_number:line,char_type_name:'word',code_v2:'ﱁ'},
      {position:2,page_number:603,line_number:line,char_type_name:'end',text_qpc_hafs:String(index+1)},
    ],
  })))};
  const parsed=parseQcfV4Page(603,fixture);
  assert.deepEqual(parsed.decorations.map(item=>[item.line,item.kind,item.surah]),[
    [1,'surahHeader',109],[2,'basmala',109],
    [6,'surahHeader',110],[7,'basmala',110],
    [11,'surahHeader',111],[12,'basmala',111],
  ]);
  const html=qcfV4Html(parsed,verseId(110,2),[],0,0);
  assert.match(html,/grid-template-rows:repeat\(15,minmax\(0,1fr\)\)/);
  assert.match(html,/class="mushaf-row surah-header" data-line="6" data-surah="110" style="grid-row:6"/);
  assert.match(html,/class="mushaf-row basmala" data-line="7" data-surah="110" style="grid-row:7"/);
  assert.match(html,/class="mushaf-row line" data-line="8" data-fin="0" style="grid-row:8;justify-content:space-between"/);
  // La ligne 10 porte 110:3, dernier verset de sa sourate : c'est la seule de ce
  // groupe a rester courte, et le livre la pose contre le bord droit.
  assert.match(html,/class="mushaf-row line" data-line="10" data-fin="1" style="grid-row:10;justify-content:flex-start"/);
  assert.equal((html.match(/class="mushaf-row basmala"/g)||[]).length,3);
  assert.equal((html.match(/class="word end/g)||[]).length,14);
});

test('Al-Fatiha et At-Tawbah ne reçoivent aucune Basmala décorative supplémentaire',()=>{
  for(const [surah,pageNumber] of [[1,1],[9,187]]){
    const fixture={pagination:{total_pages:1},verses:[{verse_key:`${surah}:1`,words:[
      {position:1,page_number:pageNumber,line_number:2,char_type_name:'word',code_v2:'ﱁ'},
    ]}]};
    const parsed=parseQcfV4Page(pageNumber,fixture);
    assert.deepEqual(parsed.decorations,[{line:1,kind:'surahHeader',surah}]);
    assert.doesNotMatch(qcfV4Html(parsed,null,[],0,0),/class="mushaf-row basmala"/);
  }
});

test('une place de bandeau non vérifiée n’entraîne pas une ligne artificiellement comprimée',()=>{
  const fixture={pagination:{total_pages:1},verses:[{verse_key:'109:1',words:[
    {position:1,page_number:603,line_number:1,char_type_name:'word',code_v2:'ﱁ'},
  ]}]};
  assert.throws(()=>parseQcfV4Page(603,fixture),/non vérifié/);
});

// La reponse reelle transmet les glyphes en reference numerique, pas en caractere.
// Sans ces deux controles, la page pourrait s'afficher vide sur le telephone alors
// que tous les tests precedents restent verts.

const pageAvecGlyphe=code=>qcfV4Html(parseQcfV4Page(3,{pagination:{total_pages:1},verses:[{verse_key:'2:6',words:[
  {position:1,page_number:3,line_number:1,char_type_name:'word',code_v2:code},
]}]}),null,[],0,0);

test('un glyphe transmis en reference numerique est decode avant le rendu',()=>{
  for(const [forme,code] of [['hexadecimale','&#xFC41;'],['decimale','&#64577;']]){
    const html=pageAvecGlyphe(code);
    assert.ok(html.includes('\uFC41'),`forme ${forme} : le point de code U+FC41 doit apparaitre dans la page`);
    assert.ok(!html.includes('&amp;'),`forme ${forme} : la reference ne doit pas rester litterale`);
  }
});

test('une reference numerique hors du domaine Unicode ne produit aucun caractere',()=>{
  for(const code of ['&#x110000;','&#0;']){
    const html=pageAvecGlyphe(code);
    assert.ok(!html.includes('&amp;'),`${code} ne doit pas apparaitre tel quel`);
    assert.ok(html.includes('class="word"'),`${code} doit laisser un mot vide plutot que de casser la page`);
  }
});

// Les codes de refus ne se confondent pas : une fonction absente et des
// identifiants manquants demandent deux gestes differents. Mesure faite sur le
// projet : la fonction absente repond 404, les identifiants manquants 503.
test('chaque refus du serveur annonce sa propre cause',()=>{
  assert.match(messageDeRefus(401),/Reconnecte-toi/);
  assert.match(messageDeRefus(404),/pas installée/);
  assert.match(messageDeRefus(503),/identifiants Quran Foundation/);
  assert.match(messageDeRefus(502),/indisponible/);
});

test('deux causes differentes ne peuvent pas donner le meme message',()=>{
  const messages=[401,404,502,503].map(messageDeRefus);
  assert.equal(new Set(messages).size,4,'un message partage rendrait le diagnostic aveugle');
});

// Deux defauts trouves en passant le parseur sur les 604 pages reelles de
// l'edition, et non sur quelques-unes : vingt-quatre pages refusees pour un
// bandeau cherche une ligne au-dessus du papier, trois pour un verset annonce
// mais dessine ailleurs. Les deux fixtures ci-dessous sont la forme exacte des
// reponses de la page 77 et de la page 585.

test('un verset annonce par la page mais dessine sur la voisine ne cree pas de trou',()=>{
  // Page 585 : la reponse annonce 80:41 et 80:42, dont tous les mots portent la
  // page 586. Le controle d'ordre exigeait d'eux une continuite et fabriquait un
  // trou inexistant, alors que les versets reellement dessines se suivent.
  const fixture={pagination:{total_pages:1},verses:[
    {verse_key:'80:40',words:[
      {position:1,page_number:585,line_number:15,char_type_name:'word',code_v2:'ﱁ'},
      {position:2,page_number:585,line_number:15,char_type_name:'end',text_qpc_hafs:'40'},
    ]},
    {verse_key:'80:41',words:[
      {position:1,page_number:586,line_number:1,char_type_name:'word',code_v2:'ﱂ'},
      {position:2,page_number:586,line_number:1,char_type_name:'end',text_qpc_hafs:'41'},
    ]},
    {verse_key:'80:42',words:[
      {position:1,page_number:586,line_number:1,char_type_name:'word',code_v2:'ﱃ'},
      {position:2,page_number:586,line_number:1,char_type_name:'end',text_qpc_hafs:'42'},
    ]},
  ]};
  const parsed=parseQcfV4Page(585,fixture);
  assert.equal(parsed.firstVerseId,verseId(80,40));
  assert.equal(parsed.lastVerseId,verseId(80,40),'la page s arrete au dernier verset reellement dessine');
  assert.equal(parsed.lines.length,1);
  assert.equal(parsed.lines[0].words.length,2);
});

test('un trou reel entre deux versets dessines reste refuse',()=>{
  // Le controle doit encore mordre : sans cette fixture, le test precedent
  // pourrait passer en supprimant purement le controle d'ordre.
  const fixture={pagination:{total_pages:1},verses:[
    {verse_key:'80:40',words:[{position:1,page_number:585,line_number:15,char_type_name:'word',code_v2:'ﱁ'}]},
    {verse_key:'80:42',words:[{position:1,page_number:585,line_number:15,char_type_name:'word',code_v2:'ﱂ'}]},
  ]};
  assert.throws(()=>parseQcfV4Page(585,fixture),/manquants ou hors ordre/);
});

test('une sourate qui commence en haut de page porte sa basmala sans bandeau',()=>{
  // Page 77 : 4:1 commence ligne 2. Mesure faite sur les 114 sourates, les
  // dix-huit sourates a basmala qui commencent en haut de page ont la page
  // precedente qui s'arrete ligne 14 : le bandeau tient cette ligne 15, et non
  // une ligne 0 qui n'existe pas.
  const fixture={pagination:{total_pages:1},verses:[
    {verse_key:'4:1',words:[
      {position:1,page_number:77,line_number:2,char_type_name:'word',code_v2:'ﱁ'},
      {position:2,page_number:77,line_number:2,char_type_name:'end',text_qpc_hafs:'1'},
    ]},
    {verse_key:'4:2',words:[
      {position:1,page_number:77,line_number:3,char_type_name:'word',code_v2:'ﱂ'},
    ]},
  ]};
  const parsed=parseQcfV4Page(77,fixture);
  assert.deepEqual(parsed.decorations,[{line:1,kind:'basmala',surah:4}]);
  assert.equal(parsed.firstVerseId,verseId(4,1));
  const html=qcfV4Html(parsed,null,[],0,0);
  assert.match(html,/class="mushaf-row basmala" data-line="1" data-surah="4"/);
  assert.doesNotMatch(html,/class="mushaf-row surah-header"/);
});

test('Al-Fatiha et At-Tawbah gardent leur bandeau en haut de page',()=>{
  // Meme ligne 2, mais sans basmala : le bandeau occupe bien la ligne 1. Sans ce
  // controle, la correction precedente aurait supprime le bandeau de deux
  // sourates qui n'ont jamais eu de basmala a cacher.
  for(const [surah,pageNumber] of [[1,1],[9,187]]){
    const fixture={pagination:{total_pages:1},verses:[{verse_key:`${surah}:1`,words:[
      {position:1,page_number:pageNumber,line_number:2,char_type_name:'word',code_v2:'ﱁ'},
    ]}]};
    const parsed=parseQcfV4Page(pageNumber,fixture);
    assert.deepEqual(parsed.decorations,[{line:1,kind:'surahHeader',surah}]);
  }
});

// Le repli vers l'API publique n'est acceptable que s'il demande la MEME
// edition : une autre mise en page rendrait d'autres glyphes, et l'absence de
// word_fields retirerait code_v2, donc tout glyphe.

test('l adresse de repli demande l edition et les champs dont le parseur depend',()=>{
  const url=urlApiPublique(3);
  assert.match(url,/\/verses\/by_page\/3\?/);
  assert.match(url,/mushaf=19/);
  assert.match(url,/word_fields=code_v2,text_qpc_hafs/);
  assert.match(url,/words=true/);
});

test('seule une fonction absente est retenue comme durable',()=>{
  assert.equal(fonctionAbsenteDuServeur(404),true);
  for(const statut of [0,401,403,500,502,503,429])
    assert.equal(fonctionAbsenteDuServeur(statut),false,`un ${statut} passager ne doit pas condamner la route privee pour la session`);
});

test('un echec de l API publique ne se confond pas avec un refus du serveur',()=>{
  const messages=[429,500,404].map(messageApiPublique);
  assert.match(messages[0],/Trop de pages/);
  assert.match(messages[1],/momentanément/);
  assert.equal(new Set(messages).size,3);
});

// Une reponse de page annonce les versets de SA page, pas ceux dont les mots sont
// dessines ailleurs. Les deux fixtures ci-dessous sont la forme exacte des
// reponses des pages 585 et 586 : la 585 annonce 80:41 et 80:42, dont tous les
// mots portent la page 586, ou ils tiennent la ligne 1 ; la 586 annonce 81:1 en
// ligne 4, parce que les lignes 1 a 3 portent 80:41, 80:42 et le bandeau de la
// sourate 81. Sans la reunion des deux reponses, 80:41 et 80:42 n'etaient
// dessines nulle part.

const mot=(position,page,ligne,code)=>code===undefined
  ?{position,page_number:page,line_number:ligne,char_type_name:'end',text_qpc_hafs:String(position)}
  :{position,page_number:page,line_number:ligne,char_type_name:'word',code_v2:code};

const reponse585={pagination:{total_pages:1},verses:[
  {verse_key:'80:40',words:[mot(1,585,15,'\uFC41'),mot(2,585,15,'\uFC42'),mot(3,585,15,'\uFC43'),mot(4,585,15,'\uFC44'),mot(5,585,15)]},
  {verse_key:'80:41',words:[mot(1,586,1,'\uFC45'),mot(2,586,1,'\uFC46'),mot(3,586,1)]},
  {verse_key:'80:42',words:[mot(1,586,1,'\uFC47'),mot(2,586,1,'\uFC48'),mot(3,586,1,'\uFC49'),mot(4,586,1,'\uFC4A'),mot(5,586,1)]},
]};
const reponse586={pagination:{total_pages:1},verses:[
  {verse_key:'81:1',words:[mot(1,586,4,'\uFC4B'),mot(2,586,4,'\uFC4C'),mot(3,586,4,'\uFC4D'),mot(4,586,4)]},
]};

test('une page se reconstitue avec la reponse de sa voisine',()=>{
  const page=parseQcfV4Page(586,reunirReponses(586,[reponse585,reponse586]));
  assert.equal(page.firstVerseId,verseId(80,41));
  assert.equal(page.lastVerseId,verseId(81,1));
  assert.deepEqual(page.lines.map(ligne=>ligne.number),[1,4]);
  assert.deepEqual(page.lines[0].words.map(word=>word.verseKey),['80:41','80:41','80:41','80:42','80:42','80:42','80:42','80:42']);
  // Le bandeau et la basmala de la sourate 81 tiennent les lignes 2 et 3 : la
  // ligne 1 est prise par la fin de la sourate precedente.
  assert.deepEqual(page.decorations.map(item=>[item.line,item.kind,item.surah]),[[2,'surahHeader',81],[3,'basmala',81]]);
  const html=qcfV4Html(page,null,[],0,0);
  assert.match(html,/class="mushaf-row surah-header" data-line="2" data-surah="81"/);
  assert.match(html,/class="mushaf-row basmala" data-line="3" data-surah="81"/);
});

test('la reponse de la page seule ne suffit pas quand un verset est dessine chez la voisine',()=>{
  // Ce controle est ce qui reliait le defaut a la table des pages : sans la
  // voisine, la page commence a 81:1 alors que le Moushaf imprime y met 80:41.
  const seule=parseQcfV4Page(586,reunirReponses(586,[reponse586]));
  assert.equal(seule.firstVerseId,verseId(81,1));
  assert.notEqual(seule.firstVerseId,pageRange(586).start);
  assert.equal(parseQcfV4Page(586,reunirReponses(586,[reponse585,reponse586])).firstVerseId,pageRange(586).start);
});

test('un verset annonce par une page mais dessine ailleurs ne se dessine pas ici',()=>{
  const page=parseQcfV4Page(585,reunirReponses(585,[reponse585]));
  assert.equal(page.lastVerseId,verseId(80,40));
  assert.equal(page.firstVerseId,verseId(80,40));
  assert.equal(page.lines.length,1);
  assert.equal(page.lines[0].words.length,5);
  assert.deepEqual(page.decorations,[]);
});

test('l ordre des reponses reunies ne change pas la page',()=>{
  const avant=parseQcfV4Page(586,reunirReponses(586,[reponse585,reponse586]));
  const apres=parseQcfV4Page(586,reunirReponses(586,[reponse586,reponse585]));
  assert.deepEqual(apres.lines.map(l=>l.words.map(w=>w.verseKey)),avant.lines.map(l=>l.words.map(w=>w.verseKey)));
  assert.equal(apres.firstVerseId,avant.firstVerseId);
});

test('une reponse voisine tronquee est refusee',()=>{
  assert.throws(()=>reunirReponses(586,[{...reponse585,pagination:{total_pages:2}},reponse586]),/incomplète/);
  assert.throws(()=>reunirReponses(586,[{verses:[]}]),/incomplète/);
  assert.throws(()=>reunirReponses(586,[null]),/incomplète/);
});

test('l ouverture d une sourate se lit dans la reponse de la page suivante',()=>{
  assert.deepEqual(ouvertureDeSourate(reponse586),{surah:81,ligne:4});
  const sansOuverture={pagination:{total_pages:1},verses:[
    {verse_key:'81:2',words:[mot(1,586,1,'\uFC41')]},
  ]};
  assert.equal(ouvertureDeSourate(sansOuverture),null);
  assert.equal(ouvertureDeSourate(null),null);
});

// Le bandeau d'une sourate qui ouvre la page suivante tient la derniere ligne de
// la page PRECEDENTE. Mesure faite sur les 114 sourates : vingt ont leur premier
// mot en ligne 2, dont dix-huit a basmala, et pour chacune la page precedente
// s'arrete en ligne 14. Le premier mot de cette sourate est dessine sur la page
// suivante, donc absent de cette reponse : sans ce contexte, dix-huit bandeaux
// n'existaient nulle part et la derniere ligne restait vide.

const page584={pagination:{total_pages:1},verses:[
  {verse_key:'79:46',words:[mot(1,584,14,'\uFC41')]},
]};

test('le bandeau d une sourate qui ouvre la page suivante tient la derniere ligne',()=>{
  const page=parseQcfV4Page(584,page584,{sourateSuivante:{surah:80,ligne:2}});
  assert.deepEqual(page.decorations,[{line:15,kind:'surahHeader',surah:80}]);
  assert.match(qcfV4Html(page,null,[],0,0),/class="mushaf-row surah-header" data-line="15" data-surah="80" style="grid-row:15"/);
});

test('une sourate qui ouvre la page suivante en ligne 3 garde son bandeau chez elle',()=>{
  // Ligne 3 : la page suivante porte son bandeau en ligne 1 et sa basmala en
  // ligne 2. Rien ne doit etre ajoute ici.
  assert.deepEqual(parseQcfV4Page(584,page584,{sourateSuivante:{surah:80,ligne:3}}).decorations,[]);
});

test('un bandeau sans ligne libre est refuse plutot que superpose',()=>{
  const occupee={pagination:{total_pages:1},verses:[
    {verse_key:'79:46',words:[mot(1,584,15,'\uFC41')]},
  ]};
  assert.throws(()=>parseQcfV4Page(584,occupee,{sourateSuivante:{surah:80,ligne:2}}),/non vérifié/);
});

// La taille du texte est choisie par mesure, pas a l'oeil. Sonde
// _inspect/tajweed2/lignes-604.mjs, avances reelles des 604 polices : chaque page
// a sa propre echelle, donc c'est la ligne la plus large DE LA PAGE qui donne sa
// taille. Sur 390 px elle demande 28,00 px pour la page 1 (13,3456 em, ligne 4)
// et 16,77 px pour la page 414, ligne 3 (22,2856 em, la plus large du livre) ;
// sur 320 px, 13,76 px au minimum. La page la plus etroite demande
// 0,958/13,3456 = 0,07178 fois la largeur de l'ecran, et le code retient 0,074,
// soit 3,09 % de marge.

test('le plancher de taille laisse tenir la page la plus dense',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  const plancher=Number(/const PLANCHER=(\d+)/.exec(html)?.[1]);
  assert.ok(Number.isFinite(plancher),'le plancher doit etre une constante lisible');
  assert.ok(plancher<=13.8,`un plancher de ${plancher} px refuserait la page 414, qui demande 13,8 px sur un ecran de 320 px`);
  // Le plafond ne doit pas se deduire du plancher : a 88 % du plafond le plancher
  // valait 25 px, et 602 pages sur 604 ne pouvaient pas tenir.
  assert.doesNotMatch(html,/Math\.max\(19/);
});

test('le plafond de taille laisse la page la plus large remplir la largeur',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  const plafond=/Math\.min\((\d+),Math\.ceil\(innerWidth\*([\d.]+)\)/.exec(html);
  assert.ok(plafond,'le plafond doit suivre la largeur de l ecran');
  assert.ok(Number(plafond[2])>=0.074,`un plafond de ${plafond[2]} fois la largeur ne laisserait pas la page 1 remplir ses lignes`);
});

test('le repli de taille ne deborde pas avant le calcul de mise en page',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  const repli=Number(/--word-size:(\d+)px/.exec(html)?.[1]);
  assert.ok(Number.isFinite(repli));
  // Mediane mesuree : 22,0 px sur 390 px de large. Au-dela, une page s'affiche
  // debordante pendant le chargement de la police.
  assert.ok(repli<=22,`un repli de ${repli} px deborderait avant le calcul`);
});

// --- La pose des lignes dans la largeur -------------------------------------
//
// Mesure faite sur les pages imprimees 7, 528, 586 et 604, en lisant l'etendue de
// l'encre de chaque ligne (sonde _inspect/pages-imprimees/etendue-lignes.py) :
// le livre remplit ses lignes d'un bord a l'autre -- 100 % de la colonne sur les
// quinze lignes de la page 7 -- et ne laisse courtes que celles qui terminent une
// sourate, posees contre le bord DROIT : 62,6 % sur la page 528, 59,3 % et 54,1 %
// sur la page 604.

const ligneDe=(surah,verset,pageNumber,line)=>qcfV4Html(
  parseQcfV4Page(pageNumber,{pagination:{total_pages:1},verses:[{verse_key:`${surah}:${verset}`,words:[
    {position:1,page_number:pageNumber,line_number:line,char_type_name:'word',code_v2:'\uFC41'},
    {position:2,page_number:pageNumber,line_number:line,char_type_name:'end',text_qpc_hafs:String(verset)},
  ]}]}),null,[],0,0);

test('une ligne qui n ouvre ni ne ferme de sourate est justifiee',()=>{
  // 2:45 : la sourate 2 compte 286 versets, la ligne est pleine dans le livre.
  const html=ligneDe(2,45,7,11);
  assert.match(html,/data-line="11" data-fin="0" style="grid-row:11;justify-content:space-between"/);
});

test('une ligne qui ferme une sourate reste courte, posee au bord droit',()=>{
  // 53:62 est le dernier verset de la sourate 53 : le livre laisse cette ligne a
  // 62,6 % de la colonne, contre le bord droit.
  const html=ligneDe(53,62,528,9);
  assert.match(html,/data-line="9" data-fin="1" style="grid-row:9;justify-content:flex-start"/);
});

test('la page d Al-Fatiha est centree et garde son alignement',()=>{
  // 1:1 n'est pas le dernier verset de sa sourate : la ligne est donc marquee
  // pleine, et c'est la seule page ou cela ne suffit pas a decider -- le livre y
  // centre Al-Fatiha dans son medaillon.
  const html=ligneDe(1,1,1,2);
  assert.match(html,/data-line="2" data-fin="0" data-fixe="1" style="grid-row:2;justify-content:center"/);
});

test('la justification ne s applique pas pendant la recherche de la taille',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  // Sans cette pose forcee, une ligne justifiee remplirait toujours sa rangee :
  // la recherche de taille perdrait sa contrainte de LARGEUR et ne garderait que
  // la hauteur, donc la page s'afficherait trop grande.
  assert.match(html,/#page\.mesure \.line\{justify-content:flex-start!important\}/);
  assert.match(html,/page\.classList\.add\('mesure'\)/);
  assert.match(html,/page\.classList\.remove\('mesure'\)/);
});

test('un verset de fin de sourate tenu sur deux lignes ne marque que la seconde',()=>{
  // Mesure faite sur les 604 pages : les 114 medaillons de fin de sourate sont
  // sur la meme ligne que le dernier mot de leur verset. Compter les versets dont
  // le dernier mot est sur la ligne en designait 216 au lieu de 114.
  const fixture={pagination:{total_pages:1},verses:[
    {verse_key:'114:5',words:[
      {position:1,page_number:604,line_number:14,char_type_name:'word',code_v2:'\uFC41'},
      {position:2,page_number:604,line_number:14,char_type_name:'end',text_qpc_hafs:'5'},
    ]},
    {verse_key:'114:6',words:[
      {position:1,page_number:604,line_number:14,char_type_name:'word',code_v2:'\uFC42'},
      {position:2,page_number:604,line_number:15,char_type_name:'word',code_v2:'\uFC43'},
      {position:3,page_number:604,line_number:15,char_type_name:'end',text_qpc_hafs:'6'},
    ]},
  ]};
  const html=qcfV4Html(parseQcfV4Page(604,fixture),null,[],0,0);
  assert.match(html,/data-line="14" data-fin="0"/);
  assert.match(html,/data-line="15" data-fin="1"/);
});

test('une ligne courte sans fin de sourate est reconnue par sa largeur mesuree',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  // La page 604 donne ce cas : sa ligne 14 porte 114:5 seule, a 72,7 % de la
  // colonne, pour garder le dernier verset du Coran sur sa propre ligne.
  assert.match(html,/line\.dataset\.fin==='1'\|\|largeurs\[index\]<colonne\*0\.8/);
  assert.match(html,/line\.dataset\.fixe/);
});
