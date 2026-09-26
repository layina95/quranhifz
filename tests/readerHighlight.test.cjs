// Controle de forme : le verset actif est surligne par la couleur du theme,
// il n'est plus encadre. Ce fichier lit la source, parce que ces deux faits
// sont des choix de style : aucun test de donnees ne peut les voir.
const test=require('node:test');
const assert=require('node:assert/strict');
const chemin=require('node:path');
const {readFileSync}=require('node:fs');

const racine=chemin.join(__dirname,'..');
const lire=nom=>readFileSync(chemin.join(racine,nom),'utf8');

test('le verset actif n est plus encadre',()=>{
  const page=lire('src/MushafPage.tsx');
  assert.ok(!/borderColor:colors\.green\b/.test(page),'un cadre vert subsiste autour du verset actif');
  assert.ok(!/borderWidth:active\?2/.test(page),'un cadre subsiste sur la ligne active en mode image');
  assert.ok(!/active\?'transparent'/.test(page),'la ligne active reste sans fond en mode image');
  // Le vrai contrat, et il n'est pas cosmetique : la bordure ne doit plus
  // dependre de la selection. Chercher « borderColor:colors.green2 » ne
  // prouverait rien, cette chaine n'existe pas dans le code.
  assert.ok(
    !/borderWidth:[^,}]*verseSelected/.test(page),
    'la bordure depend encore de la selection en mode texte',
  );
  // Et la bordure rouge des versets a retravailler doit survivre au changement.
  assert.ok(/borderColor:'#D97878'/.test(page),'la bordure des versets difficiles a disparu');
});

test('la surbrillance vient du theme et pas d une couleur ecrite en dur',()=>{
  const page=lire('src/MushafPage.tsx');
  const usages=(page.match(/colors\.highlight/g)??[]).length;
  assert.ok(usages>=2,`${usages} usage(s) de colors.highlight, attendu au moins 2 (texte et image)`);
  assert.ok(/lineHighlightRect\(/.test(page),'le mode image doit decouper la surbrillance par ligne');
});

test('les quatre themes declarent une surbrillance semi-transparente',()=>{
  const theme=lire('src/ui/theme.tsx');
  const valeurs=theme.match(/highlight:'#[0-9A-Fa-f]{8}'/g)??[];
  assert.equal(valeurs.length,4,`${valeurs.length} palette(s) declarent highlight, attendu 4`);
  for(const valeur of valeurs){
    const alpha=parseInt(valeur.slice(-3,-1),16);
    assert.ok(alpha>=0x20&&alpha<=0x40,`alpha ${alpha} hors de la plage lisible (32 a 64)`);
  }
});

test('la surbrillance est distincte du jeton de selection existant',()=>{
  const theme=lire('src/ui/theme.tsx');
  // `selected` est opaque : pose sur l'image du moushaf, il masquerait le texte.
  const selection=theme.match(/selected:'#[0-9A-Fa-f]{6}'/g)??[];
  assert.equal(selection.length,4,`${selection.length} palette(s) declarent selected, attendu 4`);
});
