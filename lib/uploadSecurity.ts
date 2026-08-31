import { fileTypeFromBuffer } from "file-type";

// Source unique de vérité pour la validation des fichiers uploadés
// (audit sécurité 08/08/2026, décision CEO). Principe : le client propose
// un fichier, le serveur détermine seul ce qu'il est autorisé à être —
// jamais file.name, jamais file.type (Content-Type déclaré, falsifiable),
// jamais une extension dérivée du nom client.
//
// Stateless par conception : ne touche jamais la DB, les permissions
// métier, le stockage ou la logique de route. Répond uniquement à « ce
// fichier respecte-t-il la politique de cette catégorie, et quelle
// extension sûre utiliser ? ». Toute nouvelle route qui accepte un upload
// doit passer par ce module plutôt que réimplémenter sa propre logique
// (voir CLAUDE.md /helper-upload-security).
//
// file-type détecte le type réel par signature binaire (magic bytes),
// best-effort par nature (sa propre documentation le précise) — ne couvre
// pas les formats textuels comme SVG, qui reste donc refusé partout où il
// n'est pas explicitement listé (jamais accepté "faute de détection").
//
// Cas particulier documenté : les anciens formats Office (.doc/.xls,
// pré-2007) partagent un même conteneur binaire générique (CFB,
// "application/x-cfb") — file-type ne peut pas distinguer un vieux .doc
// d'un vieux .xls par le contenu réel (décision Bryan 08/08/2026) :
// conteneur CFB détecté + extension client parmi ("doc","xls") acceptée
// pour ce seul cas, jamais pour autre chose.

export type UploadCategory =
  | "DOCUMENT_KYC"
  | "DOCUMENT_TRAVAIL"
  | "MESSAGE_IMAGE"
  | "PUBLIC_IMAGE"
  | "PUBLIC_PDF"
  | "PUBLIC_VIDEO"
  | "SIGNALEMENT_PREUVE"
  | "FEEDBACK_CAPTURE"
  | "SELFIE_IDENTITE";

type Regle = { mime: string; extension: string };

const REGLES: Record<UploadCategory, Regle[]> = {
  DOCUMENT_KYC: [
    { mime: "application/pdf", extension: "pdf" },
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
  ],
  DOCUMENT_TRAVAIL: [
    { mime: "application/pdf", extension: "pdf" },
    { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
    { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
  ],
  MESSAGE_IMAGE: [
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
    { mime: "image/webp", extension: "webp" },
  ],
  PUBLIC_IMAGE: [
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
    { mime: "image/webp", extension: "webp" },
  ],
  PUBLIC_PDF: [{ mime: "application/pdf", extension: "pdf" }],
  PUBLIC_VIDEO: [
    { mime: "video/mp4", extension: "mp4" },
    { mime: "video/webm", extension: "webm" },
    { mime: "video/quicktime", extension: "mov" },
  ],
  // Signalements — Lot 1 (08/08/2026). Preuves jointes à un cas
  // (signalement_attachments), bucket privé — mêmes types que DOCUMENT_KYC.
  SIGNALEMENT_PREUVE: [
    { mime: "application/pdf", extension: "pdf" },
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
  ],
  // Feedback technique citoyen (écran /compte/feedback, 24/08/2026) —
  // capture d'écran jointe, bucket privé. Images seulement (le libellé UI
  // ne promet jamais l'enregistrement vidéo, hors périmètre v1).
  FEEDBACK_CAPTURE: [
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
  ],
  // Photo de la personne (flux vérification d'identité recto+verso+selfie,
  // 28/08/2026) — jamais un PDF pour une photo de visage, webp accepté en
  // plus (certains appareils Android enregistrent la galerie dans ce
  // format), contrairement à DOCUMENT_KYC qui reste pdf/jpg/png.
  SELFIE_IDENTITE: [
    { mime: "image/jpeg", extension: "jpg" },
    { mime: "image/png", extension: "png" },
    { mime: "image/webp", extension: "webp" },
  ],
};

// Legacy Office (.doc/.xls) — voir commentaire d'en-tête. Extension
// acceptée uniquement si le conteneur CFB est confirmé par magic bytes ET
// que l'extension client déclarée fait partie de cette liste fermée.
const CFB_MIME = "application/x-cfb";
const CFB_EXTENSIONS_ACCEPTEES = ["doc", "xls"];
const CATEGORIES_ACCEPTANT_CFB: UploadCategory[] = ["DOCUMENT_TRAVAIL"];

export type ValidationResultat =
  | { valid: true; detectedType: string; extension: string }
  | { valid: false; reason: string };

export async function validateUpload(
  buffer: Buffer,
  category: UploadCategory,
  maxBytes: number,
  clientFileName?: string
): Promise<ValidationResultat> {
  if (buffer.byteLength === 0) return { valid: false, reason: "Fichier vide" };
  if (buffer.byteLength > maxBytes) return { valid: false, reason: "Fichier trop volumineux" };

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) return { valid: false, reason: "Type de fichier non identifiable" };

  const regle = REGLES[category].find((r) => r.mime === detected.mime);
  if (regle) return { valid: true, detectedType: detected.mime, extension: regle.extension };

  if (detected.mime === CFB_MIME && CATEGORIES_ACCEPTANT_CFB.includes(category)) {
    const clientExt = (clientFileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (CFB_EXTENSIONS_ACCEPTEES.includes(clientExt)) {
      return { valid: true, detectedType: detected.mime, extension: clientExt };
    }
  }

  return { valid: false, reason: `Type de fichier non autorisé pour cette catégorie (détecté : ${detected.mime})` };
}
