import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { formatYelenId } from "./citoyenIdentite";
import { DEVISE_LABEL } from "./devise";

// Lot C (reçu Yelen, décision CEO 05/08/2026) — génération PDF serveur,
// même librairie que app/api/institution/journal/export/route.ts (pdfkit,
// déjà installée et utilisée, aucune nouvelle dépendance). "Guichet"
// volontairement absent (déjà tranché : aucune notion de comptoir/guichet
// n'existe en base).
//
// Refonte "niveau US / reçu légal" (décision CEO 06/08/2026, brief détaillé
// façon Stripe/Apple/Square). Choix documentés là où le brief demandait des
// données qui n'existent pas encore, pour ne jamais en inventer :
// - Numéro d'identification d'entreprise (RCCM/SIRET) : AUCUNE colonne de
//   ce type n'existe sur `institutions` — absent du reçu plutôt qu'inventé.
// - "Frais" séparés : le modèle de service n'a qu'un prix unique, aucun
//   concept de frais additionnels — jamais de ligne "Frais : 0 GNF".
// - Devise : GNF (lib/devise.ts, DEVISE_LABEL), migration produit complète
//   du 06/08/2026 (décision CEO — la vraie monnaie de Guinée est le GNF,
//   pas le FCFA). formatPrix() ci-dessous garde son regroupement de
//   milliers par espace ASCII manuel (jamais toLocaleString ici — pdfkit
//   ne supporte pas le séparateur U+202F qu'il produit, voir plus bas).
// - "Code de vérification court" : pas un second identifiant inventé en
//   plus du Receipt ID (déjà court, déjà unique) — le Receipt ID EST le
//   code de vérification affiché en gros dans le pied de page.
// - Fuseau horaire : Guinée = UTC+0 toute l'année (hypothèse déjà
//   documentée et utilisée par supabase/functions/clock-in-daily-attendance),
//   affiché tel quel, jamais une conversion inventée.
//
// Signature numérique (§6/§8 du brief) : empreinte SHA-256 sur les champs
// canoniques du reçu, même mécanisme que le "Rapport signé" du Journal
// d'activité (calculerEmpreinte dans journal/export/route.ts) — recalculable
// indépendamment, pas un simple horodatage.
//
// Corrige au passage 2 bugs réels trouvés sur le tout premier PDF généré
// (capture Bryan 06/08/2026) : le séparateur de milliers de
// toLocaleString("fr-FR") est un espace fine insécable (U+202F) absente de
// l'encodage WinAnsi des polices standard pdfkit — s'affichait comme "/".
// Même chose pour le caractère "✓" (U+2713, hors WinAnsi) — remplacé
// partout par un vrai coche vectoriel dessiné (moveTo/lineTo/stroke).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LOGO_YELEN_PATH = path.join(process.cwd(), "public", "icon-512.png");

export type DonneesRecu = {
  id: string;
  receiptId: string;
  transactionId: string | null;
  montant: number;
  montantDeclareCitoyen: number;
  membreNom: string;
  createdAt: string;
  confirmationCode: string;
  dateRdv: string;
  heureRdv: string;
  traiteLe: string | null;
  serviceNom: string;
  methodePaiement: string | null;
  citoyenId: string;
  citoyenNom: string;
  citoyenPhotoUrl: string | null;
  institutionNom: string;
  institutionLogo: string | null;
  institutionAdresse: string | null;
  institutionTelephone: string | null;
  institutionEmail: string | null;
};

export async function chargerDonneesRecu(recuId: string): Promise<DonneesRecu | null> {
  const { data: recu } = await sb
    .from("recus")
    .select("id,receipt_id,transaction_id,montant,montant_declare_citoyen,membre_nom,created_at,paid_booking_id,institution_id,citoyen_id")
    .eq("id", recuId)
    .maybeSingle();
  if (!recu) return null;

  const [{ data: booking }, { data: institution }, { data: citoyen }] = await Promise.all([
    sb.from("paid_bookings").select("confirmation_code,date_rdv,heure_rdv,traite_le,methode_paiement,paid_services(nom)").eq("id", recu.paid_booking_id).maybeSingle(),
    sb.from("institutions").select("name,logo,adresse,phone,email").eq("id", recu.institution_id).maybeSingle(),
    sb.from("users").select("nom,prenom,photo_url").eq("id", recu.citoyen_id).maybeSingle(),
  ]);

  return {
    id: recu.id,
    receiptId: recu.receipt_id,
    transactionId: recu.transaction_id,
    montant: recu.montant,
    montantDeclareCitoyen: recu.montant_declare_citoyen,
    membreNom: recu.membre_nom,
    createdAt: recu.created_at,
    confirmationCode: booking?.confirmation_code ?? "",
    dateRdv: booking?.date_rdv ?? "",
    heureRdv: booking?.heure_rdv ?? "",
    traiteLe: booking?.traite_le ?? null,
    serviceNom: (booking?.paid_services as unknown as { nom: string } | null)?.nom ?? "Service",
    methodePaiement: booking?.methode_paiement ?? null,
    citoyenId: recu.citoyen_id,
    citoyenNom: `${citoyen?.prenom ?? ""} ${citoyen?.nom ?? ""}`.trim() || "Citoyen",
    citoyenPhotoUrl: citoyen?.photo_url ?? null,
    institutionNom: institution?.name ?? "Institution",
    institutionLogo: institution?.logo ?? null,
    institutionAdresse: institution?.adresse ?? null,
    institutionTelephone: institution?.phone ?? null,
    institutionEmail: institution?.email ?? null,
  };
}

// Regroupement de milliers avec un espace ASCII normal (jamais
// toLocaleString ici — voir commentaire d'en-tête sur U+202F).
function formatPrix(p: number): string {
  const entier = Math.round(p).toString();
  const avecEspaces = entier.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return avecEspaces + " " + DEVISE_LABEL;
}

// Empreinte de vérification — même principe que calculerEmpreinte()
// (app/api/institution/journal/export/route.ts) : sérialisation canonique,
// recalculable indépendamment à partir des champs immuables du reçu
// (jamais les colonnes de cycle de vie, qui changent après coup).
function calculerSignature(d: DonneesRecu): string {
  const canon = {
    receiptId: d.receiptId, transactionId: d.transactionId, montant: d.montant,
    citoyenId: d.citoyenId, confirmationCode: d.confirmationCode, createdAt: d.createdAt,
  };
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

// Une image distante (logo institution, photo citoyen) ne doit jamais faire
// échouer la génération du reçu — beaucoup plus critique qu'un simple
// défaut d'affichage : voir le principe déjà établi ailleurs sur ce projet
// (insert non-bloquant pour transactions_financieres/journal_activite).
async function chargerImageDistante(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function genererRecuPdf(donnees: DonneesRecu, verifyUrl: string): Promise<Buffer> {
  const [logoInstitution, photoCitoyen, qrBuffer] = await Promise.all([
    chargerImageDistante(donnees.institutionLogo),
    chargerImageDistante(donnees.citoyenPhotoUrl),
    QRCode.toBuffer(verifyUrl, { width: 220, margin: 1, errorCorrectionLevel: "M" }),
  ]);
  // Logo Yelen réel — fichier local (public/icon-512.png, même icône que
  // le PWA), jamais distant : ne dépend d'aucun réseau, ne peut donc
  // jamais faire échouer la génération pour cette partie-là.
  let logoYelen: Buffer | null = null;
  try { logoYelen = fs.readFileSync(LOGO_YELEN_PATH); } catch { logoYelen = null; }

  const maintenant = new Date();
  const signature = calculerSignature(donnees);
  const yelenId = formatYelenId(donnees.citoyenId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gold = "#F5A623";
    const green = "#1DAA61";
    const dark = "#111111";
    const muted = "#6C6C70";
    const border = "#E5E5EA";

    // Bandeau doré fin en tête de page — renforce discrètement l'identité
    // Yelen (finition 24/08/2026, retour Bryan : "utilise la vraie couleur
    // Yelen déjà utilisée ailleurs", #F5A623 plat, jamais un dégradé) sans
    // ajouter d'élément décoratif superflu.
    doc.rect(0, 0, doc.page.width, 5).fill(gold);

    // Filigrane — logo Yelen très discret en arrière-plan (§10 du brief),
    // dessiné en premier pour rester derrière tout le reste.
    if (logoYelen) {
      try {
        doc.save();
        doc.opacity(0.035);
        const size = 300;
        doc.image(logoYelen, (doc.page.width - size) / 2, (doc.page.height - size) / 2, { width: size, height: size });
        doc.opacity(1);
        doc.restore();
      } catch {}
    }

    // Coche vectorielle — remplace tout usage de "✓" (voir commentaire
    // d'en-tête). x,y = coin haut-gauche de la zone, size = côté.
    function coche(x: number, y: number, size: number, color: string) {
      doc.save();
      doc.strokeColor(color).lineWidth(Math.max(1.4, size * 0.16)).lineCap("round").lineJoin("round");
      doc.moveTo(x + size * 0.08, y + size * 0.52)
        .lineTo(x + size * 0.38, y + size * 0.82)
        .lineTo(x + size * 0.92, y + size * 0.15)
        .stroke();
      doc.restore();
    }

    function ligneSeparation(y: number) {
      doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(border).lineWidth(1).stroke();
    }

    // ── En-tête : marque Yelen + institution — coordonnées absolues
    // partout (pdfkit avance doc.y à chaque .text(), des offsets relatifs
    // comme "doc.y - 22" se désynchronisent dès le deuxième appel). ──
    const headerY = doc.page.margins.top;
    // Logo Yelen agrandi (30→40px) et strictement plus grand que celui de
    // l'établissement (42→36px) — finition 24/08/2026 : l'émetteur du
    // document doit visuellement primer sur l'établissement mentionné,
    // cohérent avec la hiérarchie demandée "Yelen → statut → réservation…".
    if (logoYelen) {
      try { doc.image(logoYelen, doc.page.margins.left, headerY, { width: 40, height: 40 }); } catch {}
    } else {
      doc.roundedRect(doc.page.margins.left, headerY, 40, 40, 9).fill(gold);
    }
    doc.fillColor(dark).fontSize(17).font("Helvetica-Bold").text("Yelen", doc.page.margins.left + 48, headerY + 4, { lineBreak: false });
    doc.fillColor(gold).fontSize(8).font("Helvetica-Bold").text("REÇU OFFICIEL DE PAIEMENT", doc.page.margins.left + 48, headerY + 24, { characterSpacing: 0.6, lineBreak: false });

    if (logoInstitution) {
      try { doc.image(logoInstitution, doc.page.width - doc.page.margins.right - 36, headerY, { width: 36, height: 36 }); } catch {}
    }
    doc.fillColor(dark).fontSize(10).font("Helvetica-Bold").text(donnees.institutionNom, doc.page.margins.left, headerY + 48, { width: pageW - 52, align: "right" });
    let institY = headerY + 62;
    [donnees.institutionAdresse, donnees.institutionTelephone, donnees.institutionEmail].filter(Boolean).forEach((ligne) => {
      doc.fillColor(muted).fontSize(7.5).font("Helvetica").text(ligne as string, doc.page.margins.left, institY, { width: pageW - 52, align: "right" });
      institY += 10.5;
    });

    doc.y = Math.max(headerY + 70, institY) + 12;
    ligneSeparation(doc.y);
    doc.moveDown(1);

    // ── Badge PAIEMENT CONFIRMÉ + date d'émission réelle du reçu ──
    // Corrige un vrai défaut de justesse légale (finition 24/08/2026) :
    // affichait auparavant `maintenant` (l'instant de CE téléchargement du
    // PDF, qui change à chaque re-téléchargement) sous le libellé "Généré
    // le" — un document officiel doit annoncer sa date d'émission réelle et
    // immuable (`donnees.createdAt`, déjà chargée mais jamais utilisée).
    const emisLe = new Date(donnees.createdAt);
    const badgeY = doc.y;
    doc.roundedRect(doc.page.margins.left, badgeY, 172, 26, 13).fill(`${green}1F`);
    coche(doc.page.margins.left + 14, badgeY + 8, 11, green);
    doc.fillColor(green).fontSize(11).font("Helvetica-Bold").text("PAIEMENT CONFIRMÉ", doc.page.margins.left + 30, badgeY + 8);
    doc.fillColor(muted).fontSize(7.5).font("Helvetica").text(
      `Reçu émis le ${emisLe.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${emisLe.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (UTC+0, heure de Conakry)`,
      doc.page.margins.left, badgeY + 32, { width: pageW }
    );
    doc.y = badgeY + 48;

    // ── Citoyen ──
    const citoyenBlockY = doc.y;
    const photoSize = 52;
    if (photoCitoyen) {
      try { doc.image(photoCitoyen, doc.page.margins.left, citoyenBlockY, { width: photoSize, height: photoSize }); } catch {}
    } else {
      doc.circle(doc.page.margins.left + photoSize / 2, citoyenBlockY + photoSize / 2, photoSize / 2).fill("#EDEDF2");
    }
    doc.fillColor(dark).fontSize(14).font("Helvetica-Bold").text(donnees.citoyenNom, doc.page.margins.left + photoSize + 14, citoyenBlockY + 4);
    doc.roundedRect(doc.page.margins.left + photoSize + 14, citoyenBlockY + 22, 120, 16, 8).fill(`${green}18`);
    coche(doc.page.margins.left + photoSize + 22, citoyenBlockY + 26, 8, green);
    doc.fillColor(green).fontSize(8).font("Helvetica-Bold").text("Citoyen Yelen vérifié", doc.page.margins.left + photoSize + 36, citoyenBlockY + 26);
    doc.fillColor(muted).fontSize(8).font("Helvetica").text(`Yelen ID : ${yelenId}`, doc.page.margins.left + photoSize + 14, citoyenBlockY + 42);
    doc.y = citoyenBlockY + photoSize + 12;

    // ── Détails du paiement — carte avec bordure légère (§5/§9 du brief) ──
    const colGap = 20;
    const colW = (pageW - colGap) / 2;
    const cardPad = 18;
    const cardY = doc.y;
    const cardH = 176;
    doc.roundedRect(doc.page.margins.left, cardY, pageW, cardH, 10).lineWidth(1).strokeColor(border).stroke();
    const startY = cardY + cardPad;
    const startX = doc.page.margins.left + cardPad;
    const innerW = colW - cardPad;

    function champ(label: string, valeur: string, x: number, y: number, w: number, accent = false) {
      doc.fillColor(muted).fontSize(8).font("Helvetica").text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.5 });
      doc.fillColor(accent ? gold : dark).fontSize(accent ? 15 : 11).font("Helvetica-Bold").text(valeur || "—", x, y + 12, { width: w });
    }

    // Rendez-vous prévu ET paiement confirmé le — deux dates distinctes
    // (finition 24/08/2026) : la version précédente ne montrait que l'une
    // OU l'autre (traiteLe écrasait silencieusement dateRdv/heureRdv dès
    // qu'il existait), perdant la date du rendez-vous. Les deux existent
    // déjà dans le modèle, aucune donnée inventée.
    const rdvDateHeure = `${new Date(`${donnees.dateRdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${donnees.heureRdv}`;
    const paiementDateHeure = donnees.traiteLe
      ? `${new Date(donnees.traiteLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${new Date(donnees.traiteLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (UTC+0)`
      : "—";

    champ("Service", donnees.serviceNom, startX, startY, innerW);
    champ("Total payé", formatPrix(donnees.montant), startX + colW, startY, innerW, true);
    champ("Référence RDV", donnees.confirmationCode, startX, startY + 42, innerW);
    champ("Référence reçu", donnees.receiptId, startX + colW, startY + 42, innerW);
    champ("Rendez-vous prévu", rdvDateHeure, startX, startY + 84, innerW);
    champ("Paiement confirmé le", paiementDateHeure, startX + colW, startY + 84, innerW);
    champ("Mode de paiement", donnees.methodePaiement || "Espèces, sur place", startX, startY + 126, innerW);
    champ("Agent ayant confirmé", donnees.membreNom, startX + colW, startY + 126, innerW);

    doc.y = cardY + cardH + 16;
    ligneSeparation(doc.y);
    doc.moveDown(1);

    // ── Certificat de validation (§8 du brief, renommé depuis
    // "Vérifications") — chaîne de confiance complète. "Reçu signé
    // numériquement" n'est affirmé que parce qu'une vraie empreinte
    // SHA-256 est calculée et affichée plus bas, jamais une case cochée
    // sans preuve associée. ──
    doc.fillColor(dark).fontSize(9).font("Helvetica-Bold").text("CERTIFICAT DE VALIDATION", doc.page.margins.left, doc.y, { characterSpacing: 0.5 });
    doc.moveDown(0.6);
    [
      "Paiement déclaré par le citoyen",
      "Paiement confirmé par l'institution",
      "Validation Yelen",
      "Reçu signé numériquement (SHA-256)",
      "Authenticité vérifiable via QR Code",
    ].forEach((ligne) => {
      const ligneY = doc.y;
      coche(doc.page.margins.left, ligneY + 1, 9, green);
      doc.fillColor(dark).fontSize(9).font("Helvetica").text(ligne, doc.page.margins.left + 16, ligneY);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.5);
    ligneSeparation(doc.y);
    doc.moveDown(0.8);

    // ── Mentions légales — reprises telles quelles de app/cgu/page.tsx
    // (identité réelle de l'opérateur, jamais un texte juridique inventé).
    // Yelen224 y est décrit comme intermédiaire technique : le paiement se
    // fait en espèces, directement entre le citoyen et l'établissement,
    // cohérent avec le fonctionnement réel du produit. ──
    doc.fillColor(muted).fontSize(8).font("Helvetica-Bold").text("MENTIONS LÉGALES", doc.page.margins.left, doc.y, { characterSpacing: 0.5 });
    doc.moveDown(0.4);
    doc.fillColor(muted).fontSize(7.5).font("Helvetica").text(
      "Ce document constitue un reçu officiel généré automatiquement par la plateforme Yelen224, attestant du paiement effectué directement entre le citoyen et l'établissement mentionné ci-dessus. Yelen224 agit en tant qu'intermédiaire technique et n'est pas partie prenante de la transaction financière.",
      doc.page.margins.left, doc.y, { width: pageW, lineGap: 1.5 }
    );
    doc.moveDown(0.5);
    doc.fillColor(muted).fontSize(7.5).font("Helvetica").text(
      "Yelen224 est une plateforme numérique développée et opérée par Sempya224, avec représentation opérationnelle à Cimenterie, Commune de Ratoma, Conakry, République de Guinée — yelen224.com · contact@yelen224.com",
      doc.page.margins.left, doc.y, { width: pageW, lineGap: 1.5 }
    );

    // Garde-fou : si le contenu déborde exceptionnellement (adresse très
    // longue, etc.), on repart sur une nouvelle page plutôt que de
    // chevaucher le pied de page.
    if (doc.y > doc.page.height - doc.page.margins.bottom - 170) doc.addPage();

    // ── Pied : QR de vérification + identifiants + signature ──
    doc.moveDown(1);
    const footerY = doc.y;
    ligneSeparation(footerY);
    const qrY = footerY + 14;
    doc.image(qrBuffer, doc.page.margins.left, qrY, { width: 78, height: 78 });
    doc.fillColor(muted).fontSize(7).font("Helvetica").text("Vérifiez ce reçu sur Yelen.", doc.page.margins.left, qrY + 82, { width: 78, lineGap: 1 });

    const idColX = doc.page.margins.left + 96;
    const idColW = pageW - 96;
    doc.fillColor(muted).fontSize(7.5).font("Helvetica").text("RECEIPT ID (CODE DE VÉRIFICATION)", idColX, qrY, { width: idColW, characterSpacing: 0.4 });
    doc.fillColor(dark).fontSize(12).font("Helvetica-Bold").text(donnees.receiptId, idColX, qrY + 11, { width: idColW });
    if (donnees.transactionId) {
      doc.fillColor(muted).fontSize(7.5).font("Helvetica").text("TRANSACTION ID", idColX, qrY + 30, { characterSpacing: 0.4 });
      doc.fillColor(dark).fontSize(8.5).font("Helvetica-Bold").text(donnees.transactionId, idColX, qrY + 40, { width: idColW });
    }
    doc.fillColor(muted).fontSize(7.5).font("Helvetica").text("SIGNATURE NUMÉRIQUE (SHA-256)", idColX, qrY + 56, { characterSpacing: 0.4 });
    doc.fillColor(dark).fontSize(7).font("Helvetica").text(signature, idColX, qrY + 66, { width: idColW });

    const basY = qrY + 96;
    ligneSeparation(basY);
    doc.fillColor(muted).fontSize(7).font("Helvetica").text(
      `© Yelen224 ${maintenant.getFullYear()} — Document généré automatiquement, sans signature manuscrite. yelen224.com/confidentialite`,
      doc.page.margins.left, basY + 10, { width: pageW, align: "center" }
    );

    doc.end();
  });
}
