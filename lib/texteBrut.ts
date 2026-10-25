// Textes libres publics de l'établissement (Conditions / Informations
// importantes / Informations légales) : stockés et affichés en TEXTE BRUT.
// Aujourd'hui leur seule protection à l'affichage est l'échappement de React
// (fiche publique + dashboard). Ces deux fonctions ajoutent une défense en
// profondeur pour ne pas dépendre de React seul :
//  - nettoyerTextePublic : normalisation à l'ENREGISTREMENT (serveur),
//  - echapperHtml : à utiliser par tout futur consommateur qui produit du
//    HTML (e-mail, PDF HTML, export), jamais d'interpolation brute.
// Les balises ne sont volontairement PAS retirées à l'enregistrement : un
// texte légitime peut contenir "<" ou ">" (ex. "délai < 24 h"). C'est
// l'échappement à la sortie qui les neutralise, pas une suppression.

// Octets nuls et contrôles C0 (hors tabulation, saut de ligne, retour
// chariot), DEL, et caractères invisibles ou de réorientation bidirectionnelle
// utilisables pour falsifier l'aspect d'un texte légal (U+202A–202E,
// U+2066–2069, U+200B, U+2060, U+FEFF). Les marques LRM/RLM (U+200E/F) et
// le ZWJ (U+200D, séquences d'emoji) sont conservés : usages légitimes.
const CARACTERES_REFUSES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​‪-‮⁠⁦-⁩﻿]/g;

export function nettoyerTextePublic(texte: string): string {
  return texte
    .replace(/\r\n?/g, "\n")
    .replace(CARACTERES_REFUSES, "")
    .normalize("NFC");
}

const ECHAPPEMENTS_HTML: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

export function echapperHtml(texte: string): string {
  return texte.replace(/[&<>"']/g, c => ECHAPPEMENTS_HTML[c]);
}
