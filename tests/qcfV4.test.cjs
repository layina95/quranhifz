const test=require('node:test');
const assert=require('node:assert/strict');
const {parseQcfV4Page}=require('./build/core/qcfV4.js');
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
