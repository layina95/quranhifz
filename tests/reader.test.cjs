const test=require('node:test');
const assert=require('node:assert/strict');
const {frenchVerse,tajweedVerse,tajweedSpans,verseAtImagePoint,lineHighlightRect,MUSHAF_SOURCE_WIDTH,MUSHAF_SOURCE_HEIGHT}=require('./build/core/readerData.js');
const {verseAt,verseId,pageRange,hizbs,juzs}=require('./build/core/quran.js');
const {defaultState,markKnowledge,goalIsAlreadyKnown}=require('./build/core/program.js');
const bounds=require('../src/data/bounds.json');

test('la traduction et le Tajweed couvrent exactement les références Hafs',()=>{
  for(let id=1;id<=6236;id++){
    const verse=verseAt(id),french=frenchVerse(id),tajweed=tajweedVerse(id);
    assert.equal(french.surah,verse.surah);
    assert.equal(french.ayah,verse.ayah);
    assert.ok(french.translation.length>0);
    assert.equal(tajweedSpans(id).map(span=>span.text).join(''),tajweed.text);
  }
});

test('l’appui long sur une zone vérifiée pointe le bon verset',()=>{
  const first=bounds['604'][0],x=(first[3]+first[4])/2,y=(first[5]+first[6])/2;
  assert.equal(verseAtImagePoint(bounds['604'],x,y,1920,3106),verseId(first[0],first[1]));
  assert.equal(verseAtImagePoint(bounds['604'],0,0,1920,3106),null);
  assert.deepEqual(pageRange(604),{start:verseId(112,1),end:verseId(114,6)});
});

test('un Juz Amma connu exclut Sabbih et Amma, mais pas le Coran complet',()=>{
  const state=markKnowledge(defaultState(),juzs[29],'perfect');
  assert.equal(goalIsAlreadyKnown(state,'sabbih'),true);
  assert.equal(goalIsAlreadyKnown(state,'amma'),true);
  assert.equal(goalIsAlreadyKnown(state,'all'),false);
  const sabbih=markKnowledge(defaultState(),hizbs[59],'perfect');
  assert.equal(goalIsAlreadyKnown(sabbih,'sabbih'),true);
  assert.equal(goalIsAlreadyKnown(sabbih,'amma'),false);
});

// La page affichee fait imageWidth de large, moins la bordure de 2 px de chaque cote.
const pageSize=width=>[width,(width-4)*MUSHAF_SOURCE_HEIGHT/MUSHAF_SOURCE_WIDTH+4];

test('la surbrillance d une ligne epouse le texte et ne deborde pas de la page',()=>{
  const [width,height]=pageSize(400);
  let lignes=0;
  for(const page of Object.keys(bounds)){
    for(const row of bounds[page]){
      const box=lineHighlightRect(row,width,height);
      assert.ok(box.width>0&&box.height>0,`boite vide en page ${page}`);
      assert.ok(box.left>=0&&box.top>=0);
      assert.ok(box.left+box.width<=width+1e-6,`debordement horizontal en page ${page}`);
      assert.ok(box.top+box.height<=height+1e-6,`debordement vertical en page ${page}`);
      // La boite source englobe les hampes et les queues ; la surbrillance se
      // resserre autour des glyphes, sinon elle se lit comme un cadre.
      // Le seuil a 0,95 est ce qui distingue un vrai resserrement d'un
      // simple recadrage de bordure : sans lui, heightRatio=1 passerait.
      const sourceHeight=(row[6]-row[5])/MUSHAF_SOURCE_HEIGHT*height;
      assert.ok(box.height<sourceHeight*0.95,`surbrillance trop haute en page ${page}`);
      assert.ok(box.height>sourceHeight*0.7,`surbrillance trop ecrasee en page ${page}`);
      // Un verset qui commence en milieu de ligne ne doit pas etre surligne
      // depuis la marge : la surbrillance suit le texte, pas la ligne entiere.
      if(row[3]>100)assert.ok(box.left>2,`surbrillance collee a la marge en page ${page}`);
      lignes+=1;
    }
  }
  assert.ok(lignes>6000,`${lignes} lignes verifiees`);
});

test('un verset sur plusieurs lignes recoit une surbrillance par ligne',()=>{
  const [width,height]=pageSize(400);
  const lignes=bounds['3'].filter(row=>row[0]===2&&row[1]===7);
  assert.ok(lignes.length>=2,`${lignes.length} ligne(s) pour 2:7`);
  const boxes=lignes.map(row=>lineHighlightRect(row,width,height));
  for(let index=1;index<boxes.length;index+=1){
    assert.ok(boxes[index].top>boxes[index-1].top,'les surlignages se suivent dans l ordre des lignes');
  }
  const etendue=Math.max(...boxes.map(box=>box.top+box.height))-Math.min(...boxes.map(box=>box.top));
  const cumul=boxes.reduce((total,box)=>total+box.height,0);
  assert.ok(cumul<etendue,'les surlignages ne se touchent pas : un par ligne, pas un bloc');
});

test('la surbrillance suit la largeur de la page',()=>{
  const row=bounds['1'][0];
  const petite=lineHighlightRect(row,...pageSize(300));
  const grande=lineHighlightRect(row,...pageSize(600));
  const rapport=grande.width/petite.width;
  assert.ok(rapport>1.9&&rapport<2.1,`rapport ${rapport.toFixed(3)} pour une largeur doublee`);
  assert.ok(grande.height>petite.height,'la hauteur suit la largeur');
});
