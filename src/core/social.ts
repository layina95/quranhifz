// Amis et entraide : le vocabulaire et les regles pures, sans base ni reseau.
//
// Ces valeurs sont le miroir de ce que la base impose. Les tests comparent les
// deux, parce qu'un ecart entre l'ecran et la contrainte se paie au moment ou
// quelqu'un valide un formulaire que la base refuse — ou l'inverse, plus grave :
// un formulaire qui accepte ce que la base rejettera.

/** Longueurs du pseudo, sans l'arrobase. */
export const PSEUDO_MIN = 3;
export const PSEUDO_MAX = 20;

/**
 * La forme d'un pseudo : minuscules, commence par une lettre ou un chiffre,
 * puis lettres, chiffres, point, tiret ou souligne. L'arrobase n'en fait pas
 * partie : elle est l'affichage, pas la donnee.
 */
export const PSEUDO_MOTIF = /^[a-z0-9][a-z0-9._-]{2,19}$/;

/**
 * Les pseudos qu'on ne peut pas prendre, parce qu'ils laisseraient croire a une
 * identite officielle. Le meme mot reserve vaut cote base : une liste ecrite
 * d'un seul cote ne protegerait de rien.
 */
export const PSEUDO_RESERVES = [
  'admin', 'administrateur', 'administratrice', 'moderateur', 'moderatrice',
  'support', 'aide', 'coran', 'quranhifz', 'fcpe', 'professeur', 'maitresse',
];

/** Bornes du message adresse a l'administrateur, en caracteres. */
export const CONTACT_MIN = 1;
export const CONTACT_MAX = 2000;

/**
 * Le pseudo ramene a sa forme de stockage : sans arrobase, en minuscules, sans
 * espaces autour. Rend une chaine vide si la saisie est vide.
 */
export function normaliserPseudo(valeur: string | null | undefined): string {
  const texte = (valeur ?? '').trim().toLowerCase();
  return texte.startsWith('@') ? texte.slice(1).trim() : texte;
}

/**
 * La raison du refus, ou null si le pseudo convient. Une raison est plus utile
 * qu'un simple faux : l'ecran peut la dire a la personne.
 */
export function raisonPseudoRefuse(valeur: string | null | undefined): string | null {
  const pseudo = normaliserPseudo(valeur);
  if (!pseudo) return 'Choisis un pseudo.';
  if (pseudo.length < PSEUDO_MIN) return `Le pseudo doit faire au moins ${PSEUDO_MIN} caracteres.`;
  if (pseudo.length > PSEUDO_MAX) return `Le pseudo ne doit pas depasser ${PSEUDO_MAX} caracteres.`;
  if (!PSEUDO_MOTIF.test(pseudo)) {
    return 'Le pseudo accepte les lettres, les chiffres, le point, le tiret et le souligne.';
  }
  if (PSEUDO_RESERVES.includes(pseudo)) return 'Ce pseudo est reserve. Choisis-en un autre.';
  return null;
}

export function pseudoUtilisable(valeur: string | null | undefined): boolean {
  return raisonPseudoRefuse(valeur) === null;
}

/**
 * L'apercu affiche sous le champ, pour que la personne voie ce qui sera
 * reellement enregistre — sans arrobase ni majuscules.
 */
export function pseudoAffiche(valeur: string | null | undefined): string {
  const pseudo = normaliserPseudo(valeur);
  return pseudo ? `@${pseudo}` : '';
}

/** Un message a l'administrateur : non vide, dans les bornes de la base. */
export function raisonContactRefuse(valeur: string | null | undefined): string | null {
  const texte = (valeur ?? '').trim();
  if (texte.length < CONTACT_MIN) return 'Ecris ton message avant de l envoyer.';
  if (texte.length > CONTACT_MAX) return `Le message ne doit pas depasser ${CONTACT_MAX} caracteres.`;
  return null;
}

export function contactEnvoyable(valeur: string | null | undefined): boolean {
  return raisonContactRefuse(valeur) === null;
}

/**
 * Ce qu'on montre d'une reponse recue : le texte, ou une phrase qui dit qu'il y
 * a quelque chose a lire. Sert a la pastille du bouton.
 */
export function textePastille(nombre: number): string {
  return nombre > 9 ? '9+' : String(nombre);
}
