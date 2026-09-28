const test=require('node:test');
const assert=require('node:assert/strict');
const {coranTestActif,LIBELLES_TAILLE,modesMushaf,normaliserMushaf,normaliserTaille,TAILLES_MUSHAF,zoomDeTaille}=require('./build/core/coranTestMode.js');

// Ce test decrit le lien entre l'interrupteur et les menus, pas une valeur figee :
// il doit rester vert que le mode soit actif ou retire. C'est le falsificateur
// qui bascule le drapeau et exige que le mode disparaisse.

test('les presentations proposees decoulent du seul interrupteur',()=>{
  assert.equal(typeof coranTestActif,'boolean');
  const attendu=coranTestActif?['traditional','tajweed','tajweedPages']:['traditional','tajweed'];
  assert.deepEqual(modesMushaf(),attendu);
  assert.equal(modesMushaf().includes('tajweedPages'),coranTestActif);
});

test('une preference stockee qui n’est plus proposee retombe sur le Moushaf de Medine',()=>{
  assert.equal(normaliserMushaf('traditional'),'traditional');
  assert.equal(normaliserMushaf('tajweed'),'tajweed');
  assert.equal(normaliserMushaf('tajweedPages'),coranTestActif?'tajweedPages':'traditional');
});

test('une preference absente ou inconnue ne laisse jamais le lecteur sans presentation',()=>{
  for(const valeur of [undefined,null,'','nimporte quoi',0,{},[],true,'TRADITIONAL']){
    assert.equal(normaliserMushaf(valeur),'traditional',`valeur ${JSON.stringify(valeur)}`);
  }
});

test('les deux autres presentations restent proposees meme sans Coran Test',()=>{
  assert.deepEqual(modesMushaf().slice(0,2),['traditional','tajweed']);
});

// --- La cle stockee n'a pas change en meme temps que le nom -------------------
// Le mode s'appelait « Coran Tajweed » et s'appelle « Coran Test ». Une
// preference enregistree sous l'ancien nom doit retrouver la lecture, sans quoi
// le renommage ferait perdre le reglage a ceux qui l'avaient choisi.

test('la cle stockee « tajweedPages » traverse le renommage',()=>{
  assert.ok(modesMushaf().includes('tajweedPages'),'la cle historique doit rester la cle du mode');
  assert.equal(normaliserMushaf('tajweedPages'),coranTestActif?'tajweedPages':'traditional');
});

// --- La personnalisation : la loupe ------------------------------------------
// La page garde les proportions du livre a toute taille ; seul le facteur change.
// Ce que ces controles tiennent, c'est que la taille « Normale » vaut EXACTEMENT
// la proportion du livre (facteur 1), sans quoi le mode ne serait plus fidele a
// l'imprime par defaut.

test('la taille Normale est la proportion du livre, et c’est le defaut',()=>{
  assert.equal(zoomDeTaille('normale'),1);
  for(const valeur of [undefined,null,'','inconnue',0,{},[],true,'GRANDE']){
    assert.equal(normaliserTaille(valeur),'normale',`valeur ${JSON.stringify(valeur)}`);
    assert.equal(zoomDeTaille(valeur),1,`valeur ${JSON.stringify(valeur)}`);
  }
});

test('les trois tailles sont proposees, nommees, et d’un facteur croissant',()=>{
  assert.deepEqual([...TAILLES_MUSHAF],['normale','grande','tresGrande']);
  for(const taille of TAILLES_MUSHAF){
    assert.equal(typeof LIBELLES_TAILLE[taille],'string');
    assert.ok(LIBELLES_TAILLE[taille].length>0,`libelle manquant pour ${taille}`);
  }
  assert.ok(zoomDeTaille('grande')>zoomDeTaille('normale'));
  assert.ok(zoomDeTaille('tresGrande')>zoomDeTaille('grande'));
  assert.equal(normaliserTaille('grande'),'grande');
  assert.equal(normaliserTaille('tresGrande'),'tresGrande');
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
  // Le motif exige un caractere qui n'est pas un mot apres « mushaf » : sans lui,
  // il attrape aussi le PREFIXE de « mushafTaille », qui est un autre champ.
  const brutes=app.match(/(?<!normaliserMushaf\()state\.reader\?\.mushaf(?!\w)/g)||[];
  assert.deepEqual(brutes,[],'App.tsx decide d’une presentation sans normaliser la preference stockee');
  assert.match(app,/const mushaf=normaliserMushaf\(state\.reader\?\.mushaf\)/,'la valeur normalisee doit avoir un nom unique');
  assert.match(app,/<MushafPage[^>]*mode=\{mushaf\}/,'le rendu doit lire la valeur normalisee');
});

test('la taille lue vient toujours de la valeur normalisee',()=>{
  // Meme regle pour la loupe : une valeur stockee inconnue ne doit pas atteindre
  // le rendu, sinon la page ne saurait plus quelle largeur prendre.
  const brutes=app.match(/(?<!normaliserTaille\()state\.reader\?\.mushafTaille/g)||[];
  assert.deepEqual(brutes,[],'App.tsx lit la taille sans normaliser la preference stockee');
});

test('les deux points d’entree du mode sont commandes par l’interrupteur',()=>{
  assert.match(app,/coranTestActif&&<Choice label="Coran Test"/,'le choix des Reglages doit etre commande par l’interrupteur');
  assert.match(app,/\.\.\.\(coranTestActif\?\[\{text:'Coran Test'/,'l’entree du menu du lecteur doit etre commandee par l’interrupteur');
});

// --- La loupe est proposee la ou elle a un sens, et pas ailleurs --------------
test('la taille n’est proposee que pour Coran Test, et passee au rendu',()=>{
  assert.match(app,/coranTestActif&&mushaf==='tajweedPages'&&<View[^>]*>.*?Taille du texte/s,'la loupe doit etre proposee pour le seul mode qui la lit');
  assert.match(app,/const taille=normaliserTaille\(state\.reader\?\.mushafTaille\)/,'la taille doit etre normalisee');
  assert.match(app,/<MushafPage[^>]*taille=\{taille\}/,'le rendu doit recevoir la taille');
});
