const test=require('node:test');
const assert=require('node:assert/strict');
const {fonctionAbsenteDuServeur,messageApiPublique,messageDeRefus,parseQcfV4Page,urlApiPublique}=require('./build/core/qcfV4.js');
const {verseId}=require('./build/core/quran.js');
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
  assert.match(html,/class="mushaf-row line" data-line="8" style="grid-row:8"/);
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
