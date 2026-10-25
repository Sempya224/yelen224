// Filigrane et logo vectoriels du gabarit PDF (24/10/2026). Le soleil reprend
// exactement le tracé de components/YelenLogo.tsx (viewBox 24 : un cercle de rayon 3
// et 8 rayons en trait arrondi) : aucune image, aucun dégradé, net à toute taille,
// poids négligeable.
import { COULEURS_PDF } from "./config";

const BOITE = 24;
const RAYON_CENTRE = 3;
const EPAISSEUR_TRAIT = 2.5;
const RAYONS = "M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12";

export const FILIGRANE_TAILLE = 320;
export const FILIGRANE_OPACITE = 0.05;

// Soleil dans un carré de côté `taille` dont le coin haut-gauche est (x, y).
export function dessinerSoleil(doc: PDFKit.PDFDocument, o: { x: number; y: number; taille: number; couleur: string; opacite?: number }): void {
  doc.save();
  if (o.opacite !== undefined) doc.opacity(o.opacite);
  doc.translate(o.x, o.y);
  doc.scale(o.taille / BOITE);
  doc.lineWidth(EPAISSEUR_TRAIT).lineCap("round").lineJoin("round").strokeColor(o.couleur);
  doc.circle(BOITE / 2, BOITE / 2, RAYON_CENTRE).stroke();
  doc.path(RAYONS).stroke();
  doc.restore();
}

// Filigrane : grand soleil centré, or plat, opacité 5 %, dessiné AVANT le contenu
// de la page (donc derrière le texte).
export function dessinerFiligrane(doc: PDFKit.PDFDocument): void {
  dessinerSoleil(doc, {
    x: (doc.page.width - FILIGRANE_TAILLE) / 2,
    y: (doc.page.height - FILIGRANE_TAILLE) / 2,
    taille: FILIGRANE_TAILLE,
    couleur: COULEURS_PDF.or,
    opacite: FILIGRANE_OPACITE,
  });
}

// Pose le filigrane sur CHAQUE page : l'événement `pageAdded` n'est pas émis pour
// la première page (créée par le constructeur avant tout écouteur), d'où l'appel
// manuel. `aussi` : autre décor à poser au même moment (ex. bandeau doré).
export function installerFiligrane(doc: PDFKit.PDFDocument, aussi?: (doc: PDFKit.PDFDocument) => void): void {
  const decorer = () => {
    dessinerFiligrane(doc);
    aussi?.(doc);
  };
  decorer();
  doc.on("pageAdded", decorer);
}
