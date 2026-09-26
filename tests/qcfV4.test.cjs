const test=require('node:test');
const assert=require('node:assert/strict');
const {fonctionAbsenteDuServeur,messageApiPublique,messageDeRefus,ouvertureDeSourate,parseQcfV4Page,reunirReponses,urlApiPublique}=require('./build/core/qcfV4.js');
const {pageRange,verseId}=require('./build/core/quran.js');
const {qcfV4Html,poseDeLigne,PART_REMPLIE,COMPRESSION_MINIMALE,TAILLE_PAGE,COLONNE_EM,MARGE_LATERALE,PAGE_RATIO}=require('./build/core/qcfV4Html.js');
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
  assert.match(html,/class="mushaf-row line" data-line="8" style="grid-row:8;justify-content:space-between"/);
  // La ligne 10 porte 110:3, dernier verset de sa sourate. Ce n'est PLUS ce qui
  // decide de sa pose : la page sort toutes ses lignes justifiees, et c'est
  // fitPage() qui les repose ensuite sur leur largeur mesuree. La ligne 10 de la
  // page 603 mesure 13,2 em pour une colonne de 16,15 em, donc 81,7 % : elle sera
  // remplie, comme le livre la remplit.
  assert.match(html,/class="mushaf-row line" data-line="10" style="grid-row:10;justify-content:space-between"/);
  assert.equal((html.match(/data-fin/g)||[]).length,0,'la fin de sourate ne doit plus marquer la ligne : la pose ne depend que des largeurs');
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

// La taille du texte n'est plus choisie page par page : elle est la PROPORTION
// du livre, et elle seule. Mesure faite sur le scan du Moushaf : la colonne de
// texte fait 481,3 px, et la lettre vaut 29,8 px/em -- etabli
// par trois voies independantes (le medaillon, 26 x 34 px pour une boite de
// 0,8656 x 1,1336 em ; les quatre lignes courtes de la page 604, 29,74 a 29,88 ;
// les hauteurs de bandes contre les boites d'encre des memes lignes, 29,2 et
// 30,3). D'ou une colonne de 481,3/29,8 = 16,15 em, et une lettre de
// 0,77374/16,15 = 0,047910 fois la largeur de la page -- exactement
// 29,8/622 = 0,047910.
//
// L'ancienne loi cherchait, page par page, la taille qui fasse tenir la ligne la
// plus large. Elle etait fausse en principe : sur les 8 820 lignes de mots des
// 604 pages, 43,4 % demandent plus que la colonne, et le livre ne les ecrit pas
// plus petit -- il les comprime.

test('la lettre est la proportion du livre, et non une taille par page',()=>{
  assert.equal(COLONNE_EM,16.15);
  assert.ok(Math.abs(TAILLE_PAGE-(1-2*MARGE_LATERALE)/COLONNE_EM)<1e-12);
  // 29,8/622 = 0,04790997, et le code retient 0,047910 : l'ecart tient dans la
  // sixieme decimale, celle que la page emet.
  assert.ok(Math.abs(TAILLE_PAGE-29.8/622)<1e-6,`la lettre vaut ${TAILLE_PAGE} de la page, le scan dit ${29.8/622}`);
  assert.ok(Math.abs(PAGE_RATIO-622/917)<1e-12);
});

test('la meme proportion est emise pour toutes les pages',()=>{
  // C'est ce qui distingue le modele du livre de l'ancien : la page 1 (la plus
  // etroite du livre, 13,3456 em sur sa ligne 4) et la page 414 (la plus large,
  // 22,2856 em sur sa ligne 3) doivent recevoir la MEME taille de lettre.
  const tailles=[1,3,414,604].map(n=>{
    const html=qcfV4Html(parseQcfV4Page(n,{pagination:{total_pages:1},verses:[{verse_key:'2:6',words:[
      {position:1,page_number:n,line_number:1,char_type_name:'word',code_v2:'\uFC41'},
    ]}]}),null,[],0,0);
    return /--word-size:calc\(var\(--page-w\)\*([\d.]+)\)/.exec(html)?.[1];
  });
  assert.deepEqual(tailles,['0.047910','0.047910','0.047910','0.047910']);
});

test('la taille est une proportion, jamais une valeur en pixels',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  // Un repli en pixels afficherait la page a la mauvaise taille pendant le
  // chargement de la police, puis la corrigerait d'un coup.
  assert.doesNotMatch(html,/--word-size:\d+px/);
  assert.match(html,/--word-size:calc\(var\(--page-w\)\*0\.047910\)/);
  // La page garde la FORME du papier (622 x 917) et ses marges, parce que c'est
  // cela qui place les versets.
  assert.match(html,/--page-h:calc\(100vw\*0\.6783\)/);
  assert.match(html,/padding:calc\(var\(--page-w\)\*0\.0884\) calc\(var\(--page-w\)\*0\.11313\)/);
});

// --- La pose des lignes dans la largeur -------------------------------------
//
// Mesure faite sur les 20 pages imprimees de page entiere dont on dispose (sondes
// _inspect/pages-imprimees/largeur-du-texte.py et distribution-des-bandes.py, qui
// ne rognent rien) : 291 bandes, dont 91,4 % entre 470 et 493 px, soit 97,7 a
// 102,5 % de la colonne de 481,3 px, et 8,6 % sous 265 px, soit moins de 56 %. La
// zone 55-98 % est entierement vide : 0,4 % des bandes. Les courtes sont toutes
// CENTREES -- 0 au bord droit, 0 au bord gauche.
//
// L'ancienne regle posait les lignes courtes contre le bord DROIT des qu'elles
// terminaient une sourate. Elle est refutee deux fois : les lignes courtes du
// livre sont centrees, et les lignes qui terminent une sourate ne sont pas
// courtes pour autant.
//
// Reste a savoir comment le livre REMPLIT une ligne. Mesure mot a mot (sonde
// _inspect/tajweed2/mot-a-mot-imprime.py) : c'est une mise a l'echelle uniforme
// de la ligne entiere, et non un jeu d'espaces. Page 414 ligne 3, mot de
// 3,8116 em : 76,5 px mis a l'echelle contre 78 px imprimes, la ou un simple
// resserrement des espaces en predirait 93,9. Page 604 ligne 3, mot de
// 2,5180 em : 70,3 contre 71.

const ligneDe=(surah,verset,pageNumber,line)=>qcfV4Html(
  parseQcfV4Page(pageNumber,{pagination:{total_pages:1},verses:[{verse_key:`${surah}:${verset}`,words:[
    {position:1,page_number:pageNumber,line_number:line,char_type_name:'word',code_v2:'\uFC41'},
    {position:2,page_number:pageNumber,line_number:line,char_type_name:'end',text_qpc_hafs:String(verset)},
  ]}]}),null,[],0,0);

test('toutes les lignes partent justifiees, sans marque de fin de sourate',()=>{
  // 2:45 n'ouvre ni ne ferme la sourate 2 ; 53:62 ferme la sourate 53. Les deux
  // doivent sortir de la meme facon : la pose est decidee apres la mesure des
  // largeurs, par fitPage(), et non a l'ecriture du HTML.
  assert.match(ligneDe(2,45,7,11),/data-line="11" style="grid-row:11;justify-content:space-between"/);
  assert.match(ligneDe(53,62,528,9),/data-line="9" style="grid-row:9;justify-content:space-between"/);
});

test('la page d Al-Fatiha est centree et garde son alignement',()=>{
  // C'est la seule page ou l'ecriture du HTML decide de la pose : Al-Fatiha est
  // centree dans son medaillon, et fitPage() ne la repose pas.
  assert.match(ligneDe(1,1,1,2),/data-line="2" data-fixe="1" style="grid-row:2;justify-content:center"/);
});

test('la regle de pose est embarquee dans la page, non recopiee',()=>{
  const html=qcfV4Html(parseQcfV4Page(3,page),null,[],0,0);
  // Le telephone doit faire tourner le MEME texte que le banc d'essai : la
  // fonction est donc embarquee par toString(), et non reecrite a la main.
  assert.match(html,/const poseDeLigne=function poseDeLigne\(naturelle, colonne, partRemplie, compressionMinimale\)/);
  assert.match(html,/poseDeLigne\(largeurs\[index\],colonne,0\.8,0\.7\)/);
  // La mesure repart des poses nues : mesurer une ligne deja transformee
  // donnerait la largeur d'apres transformation, et deux passages de suite
  // comprimeraient deux fois.
  assert.match(html,/line\.style\.transform='';line\.style\.justifyContent=/);
});

test('une ligne qui occupe la colonne est remplie d un seul tenant',()=>{
  // 3 828 des 8 820 lignes du livre demandent plus que la colonne : le livre les
  // CONDENSE. La page 599 est le cas signale : ses onze lignes demandent 96,4 a
  // 107,4 % de la colonne, et le scan les montre toutes pleines.
  const signale=poseDeLigne(16.1260*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE);
  assert.equal(signale.justify,'flex-start');
  assert.ok(Math.abs(signale.facteur-16.15/16.1260)<1e-9);
  // La plus comprimee du livre : page 414 ligne 3, 22,2856 em pour 16,15 em.
  const pire=poseDeLigne(22.2856*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE);
  assert.equal(pire.justify,'flex-start');
  assert.ok(Math.abs(pire.facteur-0.7247)<0.0001,`la page 414 ligne 3 doit sortir a 0,7247, pas a ${pire.facteur}`);
  assert.equal(pire.depasse,false,'le livre imprime cette ligne : elle ne doit pas etre signalee');
});

test('une ligne nettement plus courte est centree, a sa largeur naturelle',()=>{
  // Page 604 ligne 15, dernier verset du Coran : 8,1000 em, soit 50,2 % de la
  // colonne, et le scan la mesure a 242 px contre 241,4 attendus au naturel. Le
  // livre ne l'etire pas.
  assert.deepEqual(poseDeLigne(8.1*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE),
    {justify:'center',facteur:1,depasse:false});
  // Et la ligne 10 de la page 350, a 92,7 % de l'ancienne colonne, est imprimee
  // pleine : le livre l'ETIRE.
  const etiree=poseDeLigne(13.9028*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE);
  assert.equal(etiree.justify,'flex-start');
  assert.ok(Math.abs(etiree.facteur-16.15/13.9028)<1e-9);
});

test('une ligne impossible est signalee plutot que comprimee a l exces',()=>{
  // Garde-fou : la plus forte compression reelle du livre est 0,7247. Trois fois
  // la colonne ne peut pas etre une page du livre.
  const pose=poseDeLigne(45.0*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE);
  assert.equal(pose.depasse,true);
  assert.equal(pose.facteur,COMPRESSION_MINIMALE,'au-dela du garde-fou, la ligne est bornee plutot qu etiree a l infini');
  assert.ok(COMPRESSION_MINIMALE<0.7247,'le garde-fou doit rester SOUS la plus forte compression du livre, sinon la page 414 declencherait une fausse alerte');
});

test('la pose ne peut pas dependre d une fin de sourate',()=>{
  // La fonction ne recoit que des nombres : c'est la structure qui rend
  // impossible le retour de la regle refutee. Deux largeurs egales donnent la
  // meme pose, quoi qu'il y ait sur la ligne.
  assert.equal(poseDeLigne.length,4,'poseDeLigne ne doit recevoir que des nombres');
  assert.deepEqual(
    poseDeLigne(13.2*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE),
    poseDeLigne(13.2*29.8,COLONNE_EM*29.8,PART_REMPLIE,COMPRESSION_MINIMALE));
  // Et la page emise ne porte plus aucune marque de fin de sourate sur ses lignes.
  const html=qcfV4Html(parseQcfV4Page(604,{pagination:{total_pages:1},verses:[
    {verse_key:'114:5',words:[
      {position:1,page_number:604,line_number:14,char_type_name:'word',code_v2:'\uFC41'},
      {position:2,page_number:604,line_number:14,char_type_name:'end',text_qpc_hafs:'5'},
    ]},
    {verse_key:'114:6',words:[
      {position:1,page_number:604,line_number:15,char_type_name:'word',code_v2:'\uFC42'},
      {position:2,page_number:604,line_number:15,char_type_name:'end',text_qpc_hafs:'6'},
    ]},
  ]}),null,[],0,0);
  assert.equal((html.match(/data-fin/g)||[]).length,0);
  assert.match(html,/data-line="15" style="grid-row:15;/);
});
