/**
 * Interrupteur unique de la lecture « Coran Tajweed ».
 *
 * Ce mode affiche la page du Moushaf telle qu'elle est imprimee : chaque mot est
 * dessine par la police de la page fournie par Quran Foundation (QCF V4), ce qui
 * place les versets exactement comme dans le Moushaf et colore les regles de
 * Tajweed. Les glyphes et la police ne sont jamais recopies dans l'application :
 * la page est demandee a la fonction Edge `qcf-v4-page`, qui seule detient les
 * identifiants Quran Foundation.
 *
 * Pour retirer la lecture sans toucher au reste de l'application, passer
 * `coranTajweedActif` a `false` : le mode disparait des Reglages et du menu du
 * lecteur, et une preference deja enregistree revient au Moushaf de Medine.
 * La marche a suivre complete, y compris l'effacement du code, est decrite dans
 * `docs/retirer-coran-tajweed.md`.
 */
export const coranTajweedActif = true;

/**
 * Les presentations arabes du lecteur.
 *
 * `tajweedPages` est la cle historiquement enregistree pour cette lecture : la
 * garder telle quelle permet a une preference mise de cote pendant le retrait
 * de retrouver le mode sans rien reecrire.
 */
export type MushafMode = 'traditional' | 'tajweed' | 'tajweedPages';

/** Les presentations reellement proposees aujourd'hui, dans l'ordre d'affichage. */
export function modesMushaf(): MushafMode[] {
  return coranTajweedActif ? ['traditional', 'tajweed', 'tajweedPages'] : ['traditional', 'tajweed'];
}

/** Ramene toute preference stockee a une presentation qui existe encore. */
export function normaliserMushaf(valeur: unknown): MushafMode {
  return modesMushaf().includes(valeur as MushafMode) ? (valeur as MushafMode) : 'traditional';
}
