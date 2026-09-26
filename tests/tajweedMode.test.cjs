const test=require('node:test');
const assert=require('node:assert/strict');
const {coranTajweedActif,modesMushaf,normaliserMushaf}=require('./build/core/tajweedMode.js');

// Ce test decrit le lien entre l'interrupteur et les menus, pas une valeur figee :
// il doit rester vert que le mode soit actif ou retire. C'est le falsificateur
// qui bascule le drapeau et exige que le mode disparaisse.

test('les presentations proposees decoulent du seul interrupteur',()=>{
  assert.equal(typeof coranTajweedActif,'boolean');
  const attendu=coranTajweedActif?['traditional','tajweed','tajweedPages']:['traditional','tajweed'];
  assert.deepEqual(modesMushaf(),attendu);
  assert.equal(modesMushaf().includes('tajweedPages'),coranTajweedActif);
});

test('une preference stockee qui n’est plus proposee retombe sur le Moushaf de Medine',()=>{
  assert.equal(normaliserMushaf('traditional'),'traditional');
  assert.equal(normaliserMushaf('tajweed'),'tajweed');
  assert.equal(normaliserMushaf('tajweedPages'),coranTajweedActif?'tajweedPages':'traditional');
});

test('une preference absente ou inconnue ne laisse jamais le lecteur sans presentation',()=>{
  for(const valeur of [undefined,null,'','nimporte quoi',0,{},[],true,'TRADITIONAL']){
    assert.equal(normaliserMushaf(valeur),'traditional',`valeur ${JSON.stringify(valeur)}`);
  }
});

test('les deux autres presentations restent proposees meme sans Coran Tajweed',()=>{
  assert.deepEqual(modesMushaf().slice(0,2),['traditional','tajweed']);
});

// --- Accord entre l'interrupteur et les points d'entree de l'ecran ---
// Ces controles lisent la source : ils tiennent l'accord entre le module qui
// decide du mode et l'ecran qui le propose. Sans eux, retirer le mode laisserait
// un choix coche ou un libelle annoncant une page qui n'est plus dessinee.

const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','src','App.tsx'),'utf8');

test('la presentation affichee vient toujours de la valeur normalisee',()=>{
  // Toute lecture de la preference doit passer par normaliserMushaf : la valeur
  // stockee brute peut porter un mode que l'interrupteur a retire.
  const brutes=app.match(/(?<!normaliserMushaf\()state\.reader\?\.mushaf/g)||[];
  assert.deepEqual(brutes,[],'App.tsx decide d’une presentation sans normaliser la preference stockee');
  assert.match(app,/const mushaf=normaliserMushaf\(state\.reader\?\.mushaf\)/,'la valeur normalisee doit avoir un nom unique');
  assert.match(app,/<MushafPage[^>]*mode=\{mushaf\}/,'le rendu doit lire la valeur normalisee');
});

test('les deux points d’entree du mode sont commandes par l’interrupteur',()=>{
  assert.match(app,/coranTajweedActif&&<Choice label="Coran Tajweed"/,'le choix des Reglages doit etre commande par l’interrupteur');
  assert.match(app,/\.\.\.\(coranTajweedActif\?\[\{text:'Coran Tajweed'/,'l’entree du menu du lecteur doit etre commandee par l’interrupteur');
});

