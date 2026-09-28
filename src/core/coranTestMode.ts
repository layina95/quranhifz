/**
 * Interrupteur unique de la lecture « Coran Test ».
 *
 * Ce mode affiche la page du Moushaf telle qu'elle est imprimee : chaque mot est
 * dessine par la police de la page fournie par Quran Foundation (QCF V4), ce qui
 * place les versets exactement comme dans le Moushaf et colore les regles de
 * Tajweed. Les glyphes et la police ne sont jamais recopies dans l'application :
 * la page est demandee a la fonction Edge `qcf-v4-page`, ou, a defaut, a l'API
 * publique api.quran.com -- la meme edition.
 *
 * Ce mode a d'abord ete livre sous le nom « Coran Tajweed », retire le
 * 26 septembre 2026, puis remis sous le nom « Coran Test ». Il s'ajoute A COTE
 * du Moushaf de Medine, il ne le remplace pas.
 *
 * Pour retirer la lecture sans toucher au reste de l'application, passer
 * `coranTestActif` a `false` : le mode disparait des Reglages et du menu du
 * lecteur, et une preference deja enregistree revient au Moushaf de Medine.
 * La marche a suivre complete, y compris l'effacement du code, est decrite dans
 * `docs/retirer-coran-tajweed.md`.
 *
 * La preuve que cet interrupteur gouverne seul les menus est
 * `_inspect/falsifier-coran-tajweed.mjs` : il force la valeur opposee dans une
 * copie du module, la recompile, et exige que les menus suivent.
 */
export const coranTestActif = true;

/**
 * Les presentations arabes du lecteur.
 *
 * `tajweedPages` est la cle historiquement enregistree pour cette lecture : le
 * mode s'appelait « Coran Tajweed » avant d'etre repris sous le nom « Coran
 * Test ». La garder telle quelle permet a une preference mise de cote pendant le
 * retrait de retrouver le mode sans rien reecrire dans l'etat stocke.
 */
export type MushafMode = 'traditional' | 'tajweed' | 'tajweedPages';

/** Les presentations reellement proposees aujourd'hui, dans l'ordre d'affichage. */
export function modesMushaf(): MushafMode[] {
  return coranTestActif ? ['traditional', 'tajweed', 'tajweedPages'] : ['traditional', 'tajweed'];
}

/** Ramene toute preference stockee a une presentation qui existe encore. */
export function normaliserMushaf(valeur: unknown): MushafMode {
  return modesMushaf().includes(valeur as MushafMode) ? (valeur as MushafMode) : 'traditional';
}

/**
 * La taille du texte de « Coran Test ».
 *
 * Le livre ne change pas de taille d'une page a l'autre : a la taille
 * « Normale », la page est dessinee exactement a la proportion du livre, et
 * c'est ce reglage-la qui reste par defaut. Les deux autres tailles AGRANDISSENT
 * la page d'un facteur entier sans toucher a ses proportions -- la colonne reste
 * 16,15 em et la lettre 0,047910 de la largeur de la page. L'emplacement imprime
 * des versets ne bouge donc pas : seule la loupe change, et la page se laisse
 * faire defiler au lieu d'etre rognee.
 *
 * Les facteurs sont ici, dans le coeur, pour que le telephone et les bancs ne
 * puissent pas diverger sur ce que « Grande » veut dire.
 */
export const TAILLES_MUSHAF = ['normale', 'grande', 'tresGrande'] as const;
export type TailleMushaf = (typeof TAILLES_MUSHAF)[number];

export const LIBELLES_TAILLE: Record<TailleMushaf, string> = {
  normale: 'Normale',
  grande: 'Grande',
  tresGrande: 'Très grande',
};

export function normaliserTaille(valeur: unknown): TailleMushaf {
  return TAILLES_MUSHAF.includes(valeur as TailleMushaf) ? (valeur as TailleMushaf) : 'normale';
}

/**
 * Le facteur de loupe d'une taille. `1` est la proportion du livre : c'est la
 * seule valeur ou la page tient entierement dans l'ecran sans defiler.
 */
export function zoomDeTaille(valeur: unknown): number {
  const taille = normaliserTaille(valeur);
  return taille === 'grande' ? 1.35 : taille === 'tresGrande' ? 1.8 : 1;
}
