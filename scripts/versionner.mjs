/**
 * Tient la version de l'application, et empeche de livrer deux fois la meme.
 *
 * Pourquoi un script plutot qu'une note dans un guide : la version vit a TROIS
 * endroits qui doivent bouger ensemble — `version`, `ios.buildNumber` et
 * `android.versionCode`. En oublier un produit soit un paquet qu'Android refuse
 * d'installer par-dessus l'ancien (versionCode inchange), soit deux paquets
 * indistinguables dans l'historique.
 *
 * Usage :
 *   node scripts/versionner.mjs                  etat courant
 *   node scripts/versionner.mjs bump [patch]     incremente version et numeros de build
 *   node scripts/versionner.mjs verifier         refuse une version deja livree (code 1)
 *   node scripts/versionner.mjs marquer          enregistre la version courante comme livree
 *
 * `verifier` est appele par les deux flux de compilation : c'est la porte. Une
 * version deja livree ne peut pas etre recompilee, donc un oubli de bump se voit
 * avant la compilation, pas apres.
 *
 * L'ecriture dans app.json est chirurgicale : le fichier porte des objets sur
 * une seule ligne, et le reecrire avec JSON.stringify produirait un diff de tout
 * le fichier pour trois nombres changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(RACINE, 'app.json');
const REGISTRE = join(RACINE, 'version-publiee.json');

const MOTIFS = {
  version: /"version"\s*:\s*"(\d+\.\d+\.\d+)"/,
  buildNumber: /"buildNumber"\s*:\s*"(\d+)"/,
  versionCode: /"versionCode"\s*:\s*(\d+)/,
};

function lireApp() {
  return readFileSync(APP, 'utf8');
}

function valeur(source, cle) {
  const trouve = source.match(MOTIFS[cle]);
  if (!trouve) throw new Error(`app.json : aucun champ « ${cle} » trouve`);
  return trouve[1];
}

export function etat() {
  const source = lireApp();
  return {
    version: valeur(source, 'version'),
    buildNumber: Number(valeur(source, 'buildNumber')),
    versionCode: Number(valeur(source, 'versionCode')),
  };
}

export function registre() {
  try {
    return JSON.parse(readFileSync(REGISTRE, 'utf8'));
  } catch {
    return null;
  }
}

/** Compare deux versions « majeure.mineure.correctif ». */
export function compare(gauche, droite) {
  const a = gauche.split('.').map(Number);
  const b = droite.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function incrementer(version, genre) {
  const [majeure, mineure, correctif] = version.split('.').map(Number);
  if (genre === 'major') return `${majeure + 1}.0.0`;
  if (genre === 'minor') return `${majeure}.${mineure + 1}.0`;
  return `${majeure}.${mineure}.${correctif + 1}`;
}

function remplacerUneFois(source, motif, remplacement, cle) {
  const trouves = source.match(new RegExp(motif.source, 'g')) ?? [];
  if (trouves.length !== 1) {
    throw new Error(`app.json : « ${cle} » apparait ${trouves.length} fois, attendu une seule`);
  }
  return source.replace(motif, remplacement);
}

export function bumper(genre = 'patch') {
  const avant = etat();
  const suite = incrementer(avant.version, genre);
  let source = lireApp();
  source = remplacerUneFois(source, MOTIFS.version, `"version": "${suite}"`, 'version');
  source = remplacerUneFois(source, MOTIFS.buildNumber, `"buildNumber": "${avant.buildNumber + 1}"`, 'buildNumber');
  source = remplacerUneFois(source, MOTIFS.versionCode, `"versionCode": ${avant.versionCode + 1}`, 'versionCode');
  writeFileSync(APP, source, 'utf8');
  return { avant, apres: etat() };
}

/**
 * La porte : refuse de compiler une version deja livree, et refuse un numero de
 * build qui n'augmente pas — Android exige un versionCode superieur pour
 * remplacer une application installee.
 */
export function verifier() {
  const courant = etat();
  const livre = registre();
  if (!livre) return { ok: true, raison: 'aucune version livree enregistree' };
  if (courant.version === livre.version) {
    return {
      ok: false,
      raison:
        `la version ${courant.version} a deja ete livree. ` +
        'Augmente-la avant de compiler : node scripts/versionner.mjs bump',
    };
  }
  if (compare(courant.version, livre.version) < 0) {
    return { ok: false, raison: `la version ${courant.version} est anterieure a la version livree ${livre.version}` };
  }
  if (courant.versionCode <= livre.versionCode) {
    return {
      ok: false,
      raison:
        `le numero de build ${courant.versionCode} n augmente pas (dernier livre : ${livre.versionCode}). ` +
        'Android refusera d installer le paquet par-dessus l ancien.',
    };
  }
  return { ok: true, raison: `version ${courant.version} (build ${courant.versionCode}) inedite` };
}

export function marquer(date = new Date().toISOString().slice(0, 10)) {
  const courant = etat();
  const contenu = { version: courant.version, versionCode: courant.versionCode, livreLe: date };
  writeFileSync(REGISTRE, `${JSON.stringify(contenu, null, 2)}\n`, 'utf8');
  return contenu;
}

if (process.argv[1]?.endsWith('versionner.mjs')) {
  const [, , commande = 'etat', argument] = process.argv;
  if (commande === 'etat') {
    const courant = etat();
    const livre = registre();
    console.log(`version declaree : ${courant.version} (build ${courant.versionCode}, iOS ${courant.buildNumber})`);
    console.log(livre ? `derniere livree   : ${livre.version} (build ${livre.versionCode}, le ${livre.livreLe})` : 'derniere livree   : aucune');
  } else if (commande === 'bump') {
    const { avant, apres } = bumper(argument ?? 'patch');
    console.log(`version : ${avant.version} -> ${apres.version}`);
    console.log(`build   : ${avant.versionCode} -> ${apres.versionCode} (iOS ${apres.buildNumber})`);
  } else if (commande === 'verifier') {
    const verdict = verifier();
    console.log(verdict.ok ? `Version acceptee : ${verdict.raison}.` : `REFUS : ${verdict.raison}`);
    if (!verdict.ok) process.exit(1);
  } else if (commande === 'marquer') {
    const enregistre = marquer();
    console.log(`Enregistre comme livree : ${enregistre.version} (build ${enregistre.versionCode}).`);
  } else {
    console.error(`commande inconnue : ${commande}`);
    process.exit(2);
  }
}
