// Polices du gabarit PDF (24/10/2026) : chargement conditionnel avec repli sur
// Helvetica. Aucun fichier de police n'est embarqué aujourd'hui (voir config.ts).
//
// ⚠️ Limite des polices standard pdfkit : encodage WinAnsi (Latin-1 + quelques
// signes de cp1252). Les caractères hors de cet ensemble (lettres africaines
// étendues, arabe, N'Ko, flèches, symboles mathématiques, émojis...) ne
// s'affichent pas correctement ; `assainir` les remplace par « ? » (et retire les
// caractères invisibles) plutôt que d'afficher des glyphes erronés. Avec une police
// Unicode embarquée, `assainir` devient l'identité. Cette limite ne concerne que le
// rendu du PDF : les lignes signées et les autres formats ne sont jamais modifiés.
import fs from "fs";
import path from "path";
import { FICHIERS_POLICES, type FichiersPolices } from "./config";

export type PolicesGabarit = {
  regulier: string;
  gras: string;
  italique: string;
  // true = polices standard (Helvetica, WinAnsi).
  standard: boolean;
  assainir: (texte: string) => string;
};

// Signes de cp1252 hors Latin-1 présents dans WinAnsi.
const SIGNES_WINANSI = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "Ž", "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "ž", "Ÿ",
]);
const INVISIBLES = /[​-‍⁠﻿‪-‮⁦-⁩]/g;
const ESPACES_SPECIAUX = /[ -   　]/g;

function estWinAnsi(caractere: string): boolean {
  const n = caractere.codePointAt(0) ?? 0;
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || n === 0x0a || SIGNES_WINANSI.has(caractere);
}

export function assainirPourHelvetica(texte: string): string {
  return Array.from(texte.replace(INVISIBLES, "").replace(ESPACES_SPECIAUX, " ").replace(/\r\n?|\t/g, " "))
    .map(c => (estWinAnsi(c) ? c : "?"))
    .join("");
}

// Vrai si `assainir` modifierait le texte (utile pour signaler la limite).
export function contientHorsWinAnsi(texte: string): boolean {
  return Array.from(texte.replace(INVISIBLES, "").replace(ESPACES_SPECIAUX, " ")).some(c => !estWinAnsi(c) && c !== "\r" && c !== "\t");
}

const STANDARD: PolicesGabarit = {
  regulier: "Helvetica", gras: "Helvetica-Bold", italique: "Helvetica-Oblique", standard: true, assainir: assainirPourHelvetica,
};

export function chargerPolices(doc: PDFKit.PDFDocument, fichiers: FichiersPolices | null = FICHIERS_POLICES): PolicesGabarit {
  if (!fichiers) return STANDARD;
  try {
    const chemins = [fichiers.regulier, fichiers.gras, fichiers.italique].map(f => (path.isAbsolute(f) ? f : path.join(process.cwd(), f)));
    if (!chemins.every(c => fs.existsSync(c))) return STANDARD;
    doc.registerFont("Yelen-Regulier", chemins[0]);
    doc.registerFont("Yelen-Gras", chemins[1]);
    doc.registerFont("Yelen-Italique", chemins[2]);
    // Chargement immédiat : une police illisible se découvre ici, pas au milieu du rendu.
    doc.font("Yelen-Regulier").font("Yelen-Gras").font("Yelen-Italique").font(STANDARD.regulier);
    return { regulier: "Yelen-Regulier", gras: "Yelen-Gras", italique: "Yelen-Italique", standard: false, assainir: (t: string) => t };
  } catch {
    return STANDARD;
  }
}
