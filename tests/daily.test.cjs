// Rappels & Invocations : les regles pures, eprouvees pour de bon, et les
// accords entre fichiers qui ne peuvent pas se lire.
//
// Les fonctions du domaine viennent du module compile : elles sont vraiment
// executees. Le reste lit la source, parce que ce sont des choix de structure
// — une politique de securite, un branchement d'ecran — qu'aucun test de
// donnees ne peut voir.
const test=require('node:test');
const assert=require('node:assert/strict');
const chemin=require('node:path');
const {readFileSync}=require('node:fs');
const {audioMime,audioFileName,audioPickerTypes,dailyShareText,dailyKinds,dailyKindTab,dailyKindLabel,dailyKindEmpty,MAX_AUDIO_BYTES}=require('./build/core/daily.js');

const racine=chemin.join(__dirname,'..');
const lire=nom=>readFileSync(chemin.join(racine,nom),'utf8');

/**
 * La source sans ses commentaires : on juge le code, pas ce qu'il raconte.
 *
 * Les CRLF sont ramenes a des LF d'abord, et ce n'est pas cosmetique : en
 * JavaScript le point ne franchit pas `\r`, qui est un terminateur de ligne.
 * Sur un fichier CRLF, `/\/\/.*$/` ne trouve donc jamais rien, et le controle
 * se contenterait de lire les commentaires en croyant lire le code.
 */
const sansCommentaires=source=>source
  .replace(/\r\n/g,'\n')
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .split('\n')
  .map(ligne=>ligne.replace(/\/\/.*$/,''))
  .join('\n');

/** Le texte d'une instruction `create policy <nom> ... ;`. */
function instruction(source,debut){
  const index=source.indexOf(debut);
  if(index<0)return null;
  return source.slice(index,source.indexOf(';',index)+1);
}

test('le type MIME est deduit de l extension, et le reste est refuse',()=>{
  assert.equal(audioMime('recitation.mp3'),'audio/mpeg');
  assert.equal(audioMime('rappel.m4a'),'audio/mp4');
  assert.equal(audioMime('invocation.aac'),'audio/mp4');
  assert.equal(audioMime('enregistrement.3gp'),'audio/3gpp');
  // La casse ne doit pas decider du sort d'un fichier.
  assert.equal(audioMime('RAPPEL.MP3'),'audio/mpeg');
  for(const refuse of ['notes.txt','musique.wav','sans-extension','','.']){
    assert.throws(()=>audioMime(refuse),/Format audio non reconnu/,`${refuse||'(vide)'} aurait du etre refuse`);
  }
});

test('le nom envoye ne garde ni chemin, ni espace, ni accent',()=>{
  const noms=[
    '/var/mobile/tmp/enregistrement 1.m4a',
    'file:///cache/Voice Memo.mp3?t=1700000000',
    'C:\\Users\\moi\\Mes documents\\invocation été.aac',
    '/tmp/sans-extension',
  ];
  for(const uri of noms){
    const nom=audioFileName(uri,'rappel');
    assert.ok(!nom.includes('/'),`${nom} contient un chemin`);
    assert.ok(!nom.includes('\\'),`${nom} contient un chemin`);
    assert.ok(/^[A-Za-z0-9._-]+$/.test(nom),`${nom} contient un caractere non sur`);
    assert.ok(nom.length<=45,`${nom} est trop long`);
    assert.doesNotThrow(()=>audioMime(nom),`${nom} n a pas une extension acceptee`);
  }
  // Un fichier sans extension utilisable retombe sur M4A, il n'est pas refuse :
  // le selecteur ne garantit pas le suffixe, ce n'est pas a la personne de payer.
  assert.ok(audioFileName('/tmp/sans-extension','invocation').endsWith('.m4a'));
  assert.ok(audioFileName('/tmp/','invocation').startsWith('invocation'));
});

test('le texte partage garde la traduction et la source, rien de plus',()=>{
  const texte=dailyShareText({
    title:'La patience',arabicText:'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ',
    translation:'Certes, Allah est avec les endurants.',source:'Coran 2:153',
  });
  const lignes=texte.split('\n');
  assert.equal(lignes[0],'La patience');
  assert.ok(texte.includes('إِنَّ اللَّهَ مَعَ الصَّابِرِينَ'),'le texte arabe a disparu');
  assert.ok(texte.includes('Certes, Allah est avec les endurants.'),'la traduction a disparu');
  assert.ok(texte.trimEnd().endsWith('— Coran 2:153'),'la source doit cloturer le message');
  assert.ok(!/phonetique|explication/i.test(texte));
});

test('les deux types portent chacun leur onglet et leur message vide',()=>{
  assert.deepEqual(dailyKinds,['rappel','invocation']);
  assert.ok(dailyKindTab.rappel.includes('☀'),'l onglet du rappel doit porter le soleil');
  assert.ok(dailyKindTab.invocation.includes('🌙'),'l onglet de l invocation doit porter la lune');
  for(const kind of dailyKinds){
    assert.ok(dailyKindLabel[kind],`${kind} n a pas de libelle`);
    assert.ok(dailyKindEmpty[kind]&&dailyKindEmpty[kind].length>10,`${kind} n a pas de message vide`);
  }
  assert.ok(audioPickerTypes.length>=3,'le selecteur doit proposer plusieurs formats');
});

// ------------------------------------------------- accord entre deux sources ----

test('la limite annoncee dans l application est celle du stockage',()=>{
  const sql=lire('supabase/daily-content.sql');
  const bucket=/values \('daily-content-audio','daily-content-audio',(true|false),(\d+)/.exec(sql);
  assert.ok(bucket,'le bucket daily-content-audio est introuvable dans la migration');
  assert.equal(bucket[1],'false','le bucket doit rester prive');
  // Deux fichiers qui ne peuvent pas se lire : la limite du stockage et celle
  // recopiee dans l'application. Si elles divergent, un fichier accepte par
  // l'interface est refuse par le service, sans explication utile.
  assert.equal(Number(bucket[2]),MAX_AUDIO_BYTES,`le stockage accepte ${bucket[2]} octets, l application ${MAX_AUDIO_BYTES}`);
  assert.equal(MAX_AUDIO_BYTES/1048576,5,'la limite doit valoir 5 Mo, comme l annonce le message d erreur');
  assert.ok(lire('src/services/dailyContent.ts').includes('5 Mo'),'le message d erreur doit dire la limite');
});

// ------------------------------------------------------------- la migration ----

test('la lecture anonyme ne nomme aucune fonction que anon n execute pas',()=>{
  const sql=lire('supabase/daily-content.sql');
  for(const politique of ['create policy daily_contents_read on','create policy daily_categories_read on']){
    const texte=instruction(sql,politique);
    assert.ok(texte,`${politique} ... est introuvable : ce controle serait alors vide`);
    assert.ok(/to anon/.test(texte),`${politique} ne vise plus anon`);
    // social.sql retire execute sur is_app_admin() a anon. Une politique
    // anonyme qui la nomme leve 42501 des la premiere ligne inactive, parce que
    // le second terme d'un OR n'est evalue que sur les lignes que le premier
    // rejette.
    assert.ok(!/is_app_admin/.test(texte),`${politique} nomme is_app_admin() : la lecture anonyme echouerait`);
  }
});

test('un seul contenu par type et par date est garanti par la base',()=>{
  const sql=lire('supabase/daily-content.sql');
  assert.ok(/unique \(scheduled_date, kind\)/.test(sql),'rien n empeche deux contenus du meme type le meme jour');
  // Et le type declare par une date doit etre celui du contenu qu'elle vise :
  // sans cette cle composite, une date pourrait annoncer « rappel » et pointer
  // une invocation.
  assert.ok(/unique \(id, kind\)/.test(sql),'daily_contents doit exposer la paire (id, kind)');
  assert.ok(
    /foreign key \(content_id, kind\) references public\.daily_contents\(id, kind\)/.test(sql),
    'la date ne verifie pas le type du contenu qu elle vise',
  );
});

test('les deux lectures rendent l explication et couvrent les deux types',()=>{
  const sql=lire('supabase/daily-content.sql');
  for(const fonction of ['daily_content_for_date','my_daily_favorites']){
    const index=sql.indexOf(`function public.${fonction}(`);
    assert.ok(index>0,`${fonction} est introuvable`);
    const corps=sql.slice(index,sql.indexOf('$$;',index));
    assert.ok(/explanation text/.test(corps),`${fonction} ne rend pas l explication`);
    assert.ok(/c\.explanation/.test(corps),`${fonction} ne selectionne pas l explication`);
  }
  // Le repli doit tourner sur le numero du jour, pas tirer au hasard : deux
  // personnes demandant la meme date voient la meme chose.
  assert.ok(/extract\(epoch from p_date\)::int \/ 86400/.test(sql),'le repli n est plus deterministe');
});

test('les favoris restent ceux de la personne connectee',()=>{
  const sql=lire('supabase/daily-content.sql');
  for(const politique of ['create policy daily_favorites_read on','create policy daily_favorites_insert on','create policy daily_favorites_delete on']){
    const texte=instruction(sql,politique);
    assert.ok(texte,`${politique} ... est introuvable`);
    assert.ok(/auth\.uid\(\)/.test(texte),`${politique} ne restreint pas a la personne connectee`);
  }
});

// ------------------------------------------------------------- les ecrans ----

test('l accueil ouvre la page et lit la carte du jour sans la quitter',()=>{
  const app=lire('src/App.tsx');
  assert.ok(/shortcut\('Rappels'/.test(app),'le cinquieme raccourci a disparu');
  assert.ok(/<HomeDailyCard/.test(app),'la carte du jour a disparu de l accueil');
  assert.ok(/dailyView\?<DailyScreen/.test(app),'la page complete n est plus branchee');
  // Le raccourci doit ouvrir la page, et non un onglet qui l ignore.
  assert.ok(/openDaily=\{kind=>setDailyView\(kind\)\}/.test(app),'le raccourci n ouvre pas la page');
});

test('l apercu de l administrateur est le composant que la personne verra',()=>{
  const admin=lire('src/AdminDailyContent.tsx');
  assert.ok(/import \{DailyContentCard,dailyErrorText\} from '\.\/DailyContent'/.test(admin),'l apercu doit reemployer la carte de la page');
  assert.ok(/<DailyContentCard content=\{contenuApercu\}/.test(admin),'l apercu n emploie pas la carte');
  // Une maquette recopiee finirait par diverger de la page : c'est justement ce
  // que l'apercu doit empecher.
  assert.ok(!/<Card>[^<]*<Label[^>]*>\{contenuApercu\.title\}/.test(admin),'l apercu redessine sa propre carte');
});

test('les libelles du jour viennent du domaine, pas d une chaine ecrite sur place',()=>{
  // Les pastilles de la carte et de la page portent le soleil et la lune ;
  // l'administration, elle, nomme ses onglets simplement. Chacune puise dans le
  // domaine, aucune ne recopie le mot.
  assert.ok(/dailyKindTab/.test(lire('src/DailyContent.tsx')),'les pastilles n emploient pas les onglets du domaine');
  assert.ok(/dailyKindLabel/.test(lire('src/AdminDailyContent.tsx')),'l administration n emploie pas les libelles du domaine');
  for(const fichier of ['src/DailyContent.tsx','src/AdminDailyContent.tsx']){
    const code=sansCommentaires(lire(fichier));
    assert.ok(!/['"]Rappel['"]/.test(code),`${fichier} ecrit « Rappel » sur place`);
    assert.ok(!/['"]Invocation['"]/.test(code),`${fichier} ecrit « Invocation » sur place`);
  }
});

test('aucune notion de score, de niveau ni de progression',()=>{
  // Liste volontairement etroite : « badge » et « points » sont ecartes, l'un
  // nommant une simple etiquette de date, l'autre pouvant designer un point
  // geometrique. Y figurer ferait echouer le controle sur du code legitime, et
  // un controle qui crie au loup finit par etre desactive.
  //
  // Pas de frontiere de mot APRES le terme : un identifiant comme `scoreTotal`
  // ou `niveauLecon` est exactement ce qu'on veut interdire, et `\bscore\b` ne
  // le verrait pas.
  const interdit=/\b(score|niveau|niveaux|progression|streak|médailles?|série)/i;
  for(const fichier of ['src/core/daily.ts','src/services/dailyContent.ts','src/DailyContent.tsx','src/AdminDailyContent.tsx']){
    const code=sansCommentaires(lire(fichier));
    const trouve=interdit.exec(code);
    assert.equal(trouve,null,`${fichier} parle de « ${trouve?.[0]} » : la section doit rester sans score ni progression`);
  }
});
