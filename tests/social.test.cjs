// Le pseudo @ et le contact de l'administrateur : les regles pures, eprouvees
// pour de bon, et les accords entre des fichiers qui ne peuvent pas se lire.
//
// Les fonctions du domaine viennent du module compile : elles sont vraiment
// executees. Le reste lit la source, parce que ce sont des accords de structure
// — la meme liste de mots reserves ecrite deux fois, un bouton pose a un endroit
// precis — qu'aucun test de donnees ne peut voir.
//
// La regle de la maison vaut ici plus qu'ailleurs : une liste recopiee finit par
// diverger. C'est arrive avec un mot ajoute d'un seul cote, et la divergence se
// paie par une erreur brute au lieu du message clair « pseudo invalide ».
const test=require('node:test');
const assert=require('node:assert/strict');
const chemin=require('node:path');
const {readFileSync}=require('node:fs');
const {PSEUDO_MIN,PSEUDO_MAX,PSEUDO_MOTIF,PSEUDO_RESERVES,CONTACT_MIN,CONTACT_MAX,normaliserPseudo,raisonPseudoRefuse,pseudoUtilisable,pseudoAffiche,raisonContactRefuse,contactEnvoyable,textePastille}=require('./build/core/social.js');

const racine=chemin.join(__dirname,'..');
const lire=nom=>readFileSync(chemin.join(racine,nom),'utf8');

/** Les mots cites entre apostrophes dans un extrait de SQL. */
const motsCites=extrait=>[...extrait.matchAll(/'([a-z0-9._-]+)'/g)].map(trouve=>trouve[1]);

/** Le texte entre deux bornes, ou une chaine vide si la borne manque. */
function extraire(source,debut,fin){
  const d=source.indexOf(debut);
  if(d<0)return '';
  const f=source.indexOf(fin,d);
  return f<0?'':source.slice(d,f);
}

test('le pseudo est ramene a sa forme de stockage',()=>{
  assert.equal(normaliserPseudo('@Sarah'),'sarah');
  assert.equal(normaliserPseudo('  SARAH.K  '),'sarah.k');
  assert.equal(normaliserPseudo('@@sarah'),'@sarah');
  assert.equal(normaliserPseudo(''),'');
  assert.equal(normaliserPseudo(null),'');
  assert.equal(normaliserPseudo(undefined),'');
});

test('l apercu montre le pseudo tel qu il sera enregistre',()=>{
  assert.equal(pseudoAffiche('@Sarah'),'@sarah');
  assert.equal(pseudoAffiche('Sarah.K'),'@sarah.k');
  assert.equal(pseudoAffiche('   '),'');
});

test('les bornes du pseudo s accordent avec son motif',()=>{
  assert.ok(!PSEUDO_MOTIF.test('a'.repeat(PSEUDO_MIN-1)),'un pseudo trop court doit etre refuse par le motif');
  assert.ok(PSEUDO_MOTIF.test('a'.repeat(PSEUDO_MIN)),'un pseudo a la longueur minimale doit passer');
  assert.ok(PSEUDO_MOTIF.test('a'.repeat(PSEUDO_MAX)),'un pseudo a la longueur maximale doit passer');
  assert.ok(!PSEUDO_MOTIF.test('a'.repeat(PSEUDO_MAX+1)),'un pseudo trop long doit etre refuse par le motif');
});

test('le refus du pseudo dit pourquoi, et laisse passer ce qui convient',()=>{
  assert.equal(raisonPseudoRefuse('sarah.k'),null);
  assert.equal(raisonPseudoRefuse('@Sarah.K'),null);
  assert.equal(pseudoUtilisable('sarah.k'),true);
  assert.match(raisonPseudoRefuse(''),/Choisis un pseudo/);
  assert.match(raisonPseudoRefuse('ab'),/au moins/);
  assert.match(raisonPseudoRefuse('a'.repeat(PSEUDO_MAX+1)),/depasser/);
  assert.match(raisonPseudoRefuse('sa rah'),/lettres, les chiffres/);
  assert.match(raisonPseudoRefuse('sarah!'),/lettres, les chiffres/);
  assert.match(raisonPseudoRefuse('-sarah'),/lettres, les chiffres/);
  assert.equal(pseudoUtilisable('sa rah'),false);
  for(const mot of PSEUDO_RESERVES)assert.match(raisonPseudoRefuse(mot),/reserve/,`« ${mot} » doit etre reserve`);
  // Le mot reserve ne se contourne pas par la casse ni par l'arrobase.
  assert.match(raisonPseudoRefuse('@ADMIN'),/reserve/);
});

test('le message a l administrateur tient dans les bornes de la base',()=>{
  assert.equal(raisonContactRefuse('Bonjour'),null);
  assert.equal(contactEnvoyable('Bonjour'),true);
  assert.match(raisonContactRefuse(''),/Ecris ton message/);
  assert.match(raisonContactRefuse('   '),/Ecris ton message/);
  assert.match(raisonContactRefuse('x'.repeat(CONTACT_MAX+1)),/depasser/);
  assert.equal(contactEnvoyable('x'.repeat(CONTACT_MAX)),true);
  assert.equal(contactEnvoyable('x'.repeat(CONTACT_MAX+1)),false);
});

test('la pastille des reponses non lues ne deborde pas',()=>{
  assert.equal(textePastille(0),'0');
  assert.equal(textePastille(1),'1');
  assert.equal(textePastille(9),'9');
  assert.equal(textePastille(10),'9+');
  assert.equal(textePastille(120),'9+');
});

test('la liste des mots reserves du SQL et celle du code disent la meme chose',()=>{
  // Le normaliseur de la base et le miroir de l'ecran doivent porter exactement
  // la meme liste. Un mot ajoute d'un seul cote donnerait deux verites.
  const sql=lire('supabase/social-pseudo.sql');
  const normaliseur=extraire(sql,'create or replace function private.normaliser_pseudo','end $$;');
  assert.notEqual(normaliseur,'','le normaliseur doit exister dans social-pseudo.sql');
  assert.deepEqual(
    [...motsCites(normaliseur)].sort(),
    [...PSEUDO_RESERVES].sort(),
    'la liste des mots reserves du normaliseur et celle de src/core/social.ts ont diverge',
  );
});

test('la contrainte de forme et le normaliseur portent la meme liste',()=>{
  // Deux listes ecrites dans le meme fichier, a deux endroits : c'est la
  // contrainte qui decide en dernier. Un ecart ferait echouer une insertion sur
  // une erreur brute, au lieu du message clair rendu par la fonction.
  const sql=lire('supabase/social-pseudo.sql');
  const contrainte=extraire(sql,'add constraint friend_profiles_handle_forme check (','])\n');
  assert.notEqual(contrainte,'','la contrainte de forme doit exister');
  assert.deepEqual(
    [...motsCites(contrainte)].sort(),
    [...PSEUDO_RESERVES].sort(),
    'la contrainte de forme et src/core/social.ts ne portent pas la meme liste de mots reserves',
  );
});

test('la forme du pseudo est la meme des deux cotes',()=>{
  const sql=lire('supabase/social-pseudo.sql');
  const contrainte=extraire(sql,'add constraint friend_profiles_handle_forme check (','])\n');
  const motifSql=/handle ~ '([^']+)'/.exec(contrainte);
  assert.ok(motifSql,'la contrainte doit porter le motif de forme');
  assert.equal(motifSql[1],PSEUDO_MOTIF.source,'le motif du SQL et PSEUDO_MOTIF ont diverge');
});

test('les bornes du message sont celles de la table',()=>{
  const sql=lire('supabase/admin-contact.sql');
  const bornes=new RegExp(`char_length\\(body\\) between (\\d+) and (\\d+)`).exec(sql);
  assert.ok(bornes,'la table doit borner la longueur du message');
  assert.equal(Number(bornes[1]),CONTACT_MIN,'la borne basse du message a diverge');
  assert.equal(Number(bornes[2]),CONTACT_MAX,'la borne haute du message a diverge');
});

test('l invitation accepte un code comme un pseudo',()=>{
  const sql=lire('supabase/social-pseudo.sql');
  const fonction=extraire(sql,'create or replace function public.request_friend','end $$;');
  assert.match(fonction,/invite_code=upper\(btrim\(p_code\)\)/,'le code d invitation doit rester le premier essai');
  assert.match(fonction,/private\.normaliser_pseudo\(p_code\)/,'le pseudo doit etre essaye ensuite');
});

test('le pseudo ne s ecrit que par la fonction prevue',()=>{
  // Un seul chemin d'ecriture : la fonction. Un update direct depuis l'ecran
  // laisserait passer une variante que la contrainte refuserait, et l'erreur
  // arriverait brute a la personne.
  const service=lire('src/services/social.ts');
  assert.match(service,/rpc\('choisir_pseudo'/,'le service doit passer par choisir_pseudo');
  assert.ok(!/update\(\{[^}]*handle/.test(service),'le service ne doit pas ecrire le pseudo par un update direct');
});

test('le bouton pour ecrire a l administrateur est en bas de l ecran Amis',()=>{
  // La demande etait explicite : « mets plutot le bouton dans amis, tout en bas ».
  // Un bouton perdu au milieu de l'ecran, ou deplace dans un autre ecran, ne
  // repondrait plus a la demande — et rien d'autre ne le verrait.
  const ecran=lire('src/SocialScreens.tsx');
  const bouton=ecran.indexOf('>Contacter l’administrateur{');
  const dernierTitre=ecran.indexOf('Cercles privés');
  const finDesAmis=ecran.indexOf('export function AdminScreen');
  assert.ok(bouton>0,'le bouton « Contacter l’administrateur » doit exister dans SocialScreens.tsx');
  assert.ok(dernierTitre>0,'le titre des cercles doit exister');
  assert.ok(finDesAmis>0,'l ecran d administration doit exister');
  assert.ok(bouton>dernierTitre,'le bouton doit venir apres le dernier titre, donc tout en bas');
  assert.ok(bouton<finDesAmis,'le bouton doit rester dans l ecran Amis, pas dans l ecran d administration');
});

test('le pseudo se propose a la creation du compte',()=>{
  // La demande : « la proposition de creer un pseudo soit faite en meme temps
  // que la creation de compte ». Le champ doit donc vivre dans le formulaire
  // d'inscription, et le pseudo partir avec l'inscription.
  const app=lire('src/App.tsx');
  const bloc=extraire(app,'function AccountWelcome','function Home(');
  assert.notEqual(bloc,'','le formulaire d inscription doit exister');
  assert.match(bloc,/pseudoAffiche\(pseudo\)/,'le champ pseudo doit montrer son apercu');
  assert.match(bloc,/pseudoUtilisable\(pseudo\)/,'le bouton de creation doit exiger un pseudo utilisable');
  assert.match(bloc,/stagePseudo\(email\.trim\(\),normaliserPseudo\(pseudo\)\)/,'le pseudo doit partir avec l inscription');
});

test('le pseudo est mis de cote tant que le compte n existe pas',()=>{
  // Supabase peut exiger la confirmation du courriel : il n'y a alors pas de
  // session, donc personne a qui attribuer un pseudo. Le service doit savoir le
  // garder et l'appliquer a la premiere connexion reussie.
  const service=lire('src/services/social.ts');
  assert.match(service,/export async function stagePseudo/);
  assert.match(service,/export async function appliquerPseudoEnAttente/);
  const app=lire('src/App.tsx');
  assert.match(app,/appliquerPseudoEnAttente\(user\.email\)/,'la connexion doit appliquer le pseudo mis de cote');
});
