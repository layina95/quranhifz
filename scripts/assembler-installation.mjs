/**
 * Assemble les douze scripts SQL du dossier supabase/ en un seul fichier, dans
 * l'ordre qui a ete eprouve sur une base neuve. Le but : remplacer douze
 * collages manuels par un seul, pour une personne qui decouvre l'outil.
 *
 * Usage : node scripts/assembler-installation.mjs [sortie]
 *
 * Le fichier de sortie est versionne, et un test verifie qu'il correspond bien
 * aux sources. C'est ce qui manquait : l'assembleur vivait hors du depot, donc
 * le fichier que la personne colle etait le seul livrable que rien ne
 * controlait. Il est reste en retard sur supabase/daily-content.sql sans que
 * rien ne le signale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'supabase');
const SORTIE = resolve(RACINE, process.argv[2] ?? 'installation-complete.sql');

export const ORDRE = [
  'schema.sql',
  'social.sql',
  'notifications.sql',
  'social-v2.sql',
  'friend-avatars.sql',
  'friend-realtime.sql',
  'fix-social-push.sql',
  'recitations.sql',
  'notification-corrections.sql',
  'recitation-sharing.sql',
  'admin-notifications.sql',
  'daily-content.sql',
  'social-pseudo.sql',
  'admin-contact.sql',
];

/**
 * Ce que l'installation produit une fois appliquee, sur une base neuve.
 *
 * Sert au pied du fichier engendre ET au banc qui verifie l'assemblage : une
 * seule valeur, donc plus de « Attendu : 24 » qui survit a l'ajout d'une table.
 * Le banc ne se contente pas de la relire — il compare ces nombres a ceux d'une
 * execution fichier par fichier, pour que la valeur ecrite soit confrontee a la
 * mesure et pas seulement a elle-meme.
 */
export const TABLES_ATTENDUES = 25;
export const POLITIQUES_ATTENDUES = 66;

/**
 * La source d'un script, ramenee a des fins de ligne LF.
 *
 * Sans cette normalisation, le fichier engendre depend de l'etat de la copie de
 * travail : sur un poste Windows ou git extrait en CRLF, les scripts sortent en
 * CRLF et les entetes ecrites ici en LF, donc l'assemblage est MIXTE. Le meme
 * generateur produirait alors deux fichiers differents selon la machine, et un
 * controle par comparaison d'octets serait vert en integration continue et
 * rouge sur un poste — mesure : 71 verts sur 72 sur un clone neuf Windows.
 */
function lireSource(nom) {
  return readFileSync(join(DOSSIER, nom), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

export function assembler() {
  const entete = `-- =====================================================================
--  Installation complete de la base, en un seul collage
-- =====================================================================
--
--  Ce fichier reunit les ${ORDRE.length} scripts du dossier supabase/, dans l'ordre
--  verifie. Collez-le en entier dans le SQL Editor de Supabase, puis Run.
--
--  L'ordre a ete eprouve sur une base PostgreSQL neuve : les ${ORDRE.length} scripts
--  s'appliquent sans erreur, et la sequence se rejoue telle quelle. Un
--  message « already exists » est donc sans gravite si vous relancez.
--
--  Ne collez pas ce fichier deux fois en meme temps dans deux onglets.
--
--  Fichier engendre : ne le modifiez pas a la main, modifiez supabase/, puis
--  relancez « node scripts/assembler-installation.mjs ».
--
-- =====================================================================

`;

  const morceaux = [entete];

  ORDRE.forEach((nom, index) => {
    const brut = lireSource(nom);
    const numero = String(index + 1).padStart(2, '0');
    morceaux.push(
      `-- =====================================================================\n` +
        `--  ${numero}/${ORDRE.length}   ${nom}\n` +
        `-- =====================================================================\n\n` +
        brut.trimEnd() +
        '\n\n',
    );
  });

  morceaux.push(
    `-- =====================================================================\n` +
      `--  Fin. Controle : dans une nouvelle requete, executez\n` +
      `--    select count(*) from pg_tables where schemaname = 'public';\n` +
      `--  Attendu : ${TABLES_ATTENDUES}.\n` +
      `-- =====================================================================\n`,
  );

  return morceaux.join('');
}

export function fichiersAbsents(contenu) {
  const manquants = [];
  for (const nom of ORDRE) {
    const brut = lireSource(nom).trimEnd();
    if (!contenu.includes(brut)) manquants.push(nom);
  }
  return manquants;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('assembler-installation.mjs')) {
  const contenu = assembler();
  writeFileSync(SORTIE, contenu, 'utf8');

  console.log(`Ecrit : ${SORTIE}`);
  console.log(`Octets : ${Buffer.byteLength(contenu, 'utf8')}`);
  console.log(`Fichiers reunis : ${ORDRE.length}`);
  ORDRE.forEach((nom, index) => console.log(`  ${String(index + 1).padStart(2, '0')} ${nom}`));

  const manquants = fichiersAbsents(contenu);
  if (manquants.length > 0) {
    console.error(`[ECHEC] ${manquants.length} fichier(s) non retrouve(s) intact(s) : ${manquants.join(', ')}`);
    process.exit(1);
  }
  console.log(`Controle : les ${ORDRE.length} fichiers sont retrouves intacts dans le resultat.`);
}
