import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import QRCode from "qrcode";
import { baseUrlApplication, urlVerificationExport, urlVerificationExportAvecEmpreinte } from "@/lib/export/empreinteUrl";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, ROLE_LABELS } from "@/lib/institutionPermissions";
import { lireFiltresJournal, masquerDonneesTechniques, rechercheRessembleAUneIp, requeteJournalFiltree } from "@/lib/journalRequete";
import { getMembreNomPourJournal } from "@/lib/journalActivite";
import { enregistrerExport, type ExportEnregistre } from "@/lib/export/enregistrer";
import {
  MAX_LIGNES_JOURNAL, MENTION_PDF, VERSION_GABARIT_JOURNAL,
  construireFiltresSignes, construireLignesExport, genererCsvJournal, genererJsonJournal, lignesInformations, resumerFiltresLisibles,
  type EntreeExportJournal, type InfosDocument, type ModeleExport,
} from "@/lib/export/journalLignes";
import { PDF_MAX_LIGNES } from "@/lib/export/pdf/config";
import { genererPdfGabarit, type ColonnePdf, type ResultatPdf } from "@/lib/export/pdf/gabarit";
import { ajouterFeuilleChampValeur, ajouterFeuilleTable } from "@/lib/export/rendus";
import { lireParLots } from "@/lib/export/lectureParLots";

// Export du Journal d'activité, branché sur le module lib/export (24/10/2026).
// Ordre : droits → filtres → requête (5000 max) → masquage IP selon le rôle →
// lignes du modèle UNIQUE → enregistrerExport (BLOQUANT : sans enregistrement ni
// clé de signature, aucun fichier n'est livré) → rendu du format choisi. Les
// lignes écrites dans les fichiers sont exactement celles qui ont été signées.
//
// ⚠️ Le PDF (gabarit commun lib/export/pdf) est un rendu partiel du jeu de données
// certifié : 7 colonnes, son texte ne permet pas de recalculer l'empreinte. Aucune
// valeur probante n'est promise.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const COLONNES = "id,audit_id,membre_id,membre_nom,action,categorie,niveau,cible_table,cible_id,details,ancienne_valeur,nouvelle_valeur,ip,user_agent,navigateur,os,plateforme,created_at";

type EntreeJournal = EntreeExportJournal & { id: string; user_agent: string | null };

// Taille d'un lot de lecture (le plafond de l'API peut être plus bas : sans importance,
// on avance de la taille réellement reçue).
const TAILLE_LOT_JOURNAL = 1000;

const FORMATS = ["csv", "xlsx", "json", "pdf", "certifie"] as const;
type Format = (typeof FORMATS)[number];
// « signe » : ancien nom du rapport certifié, accepté comme alias.
function lireFormat(v: string | null): Format | null {
  if (v === "signe") return "certifie";
  return v && (FORMATS as readonly string[]).includes(v) ? (v as Format) : null;
}

// Colonnes du PDF Journal : 7 sur les 12 à 16 du modèle (illisibles en A4). Détails,
// valeurs avant/après et adresse IP figurent dans les formats tableur.
const COLONNES_PDF: ColonnePdf[] = [
  { cle: "date", entete: "Date (heure de Conakry)", fraction: 0.17 },
  { cle: "membre", entete: "Membre", fraction: 0.15 },
  { cle: "action_libelle", entete: "Action", fraction: 0.26 },
  { cle: "categorie", entete: "Catégorie", fraction: 0.11 },
  { cle: "niveau", entete: "Niveau", fraction: 0.08 },
  { cle: "cible", entete: "Cible", fraction: 0.10 },
  { cle: "reference", entete: "Référence", fraction: 0.13 },
];
const MENTION_PDF_COLONNES = "Les détails, les valeurs avant/après et, selon vos droits, l'adresse IP figurent dans les formats tableur (CSV, Excel, JSON).";

// Le PDF n'imprime que les PDF_MAX_LIGNES lignes les plus récentes (le jeu certifié et
// les formats tableur contiennent tout). `mentionLimite` : affichée en en-tête et au pied.
async function genererPdf(
  modele: ModeleExport, infos: InfosDocument, qr: { image: Buffer; urlCourte: string }, mentionLimite: string | undefined,
): Promise<ResultatPdf> {
  return genererPdfGabarit({
    orientation: "paysage",
    titre: "Journal d'activité",
    etablissement: infos.etablissement,
    reference: infos.reference,
    creeLe: infos.creeLe,
    hash: infos.hash,
    auteur: infos.auteur,
    role: infos.role,
    informations: lignesInformations(infos).filter(l => l.champ !== "Empreinte SHA-256").map(l => ({ champ: l.champ, valeur: l.valeur })),
    mentionsEntete: [MENTION_PDF, MENTION_PDF_COLONNES],
    mentionLimite,
    colonnes: COLONNES_PDF,
    lignes: modele.lignes.slice(0, PDF_MAX_LIGNES),
    qr,
    motsCles: ["journal d'activité"],
  });
}

const LARGEURS: Record<string, number> = {
  reference: 22, date: 30, horodatage_utc: 26, membre: 22, action: 24, action_libelle: 36, categorie: 16, niveau: 14,
  cible: 22, details: 44, avant: 30, apres: 30, ip: 18, navigateur: 14, os: 12, plateforme: 12,
};

async function genererXlsx(modele: ModeleExport, infos: InfosDocument, certifie: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yelen224";
  wb.created = new Date(infos.creeLe);
  wb.title = certifie ? "Rapport certifié - Journal d'activité" : "Journal d'activité";
  wb.subject = `Référence ${infos.reference}`;
  wb.keywords = infos.reference;

  if (certifie) {
    ajouterFeuilleChampValeur(wb, "Certificat", [
      { champ: "Document", valeur: "Rapport certifié - Journal d'activité" },
      { champ: "Référence", valeur: infos.reference },
      { champ: "Empreinte SHA-256", valeur: infos.hash },
      { champ: "Contenu couvert", valeur: "L'empreinte est calculée sur le contenu de la feuille « Détail », cellule par cellule, avec les filtres et le périmètre de la feuille « Informations »." },
      { champ: "Vérification", valeur: "Aucun service de vérification en ligne n'est encore disponible. La procédure de recalcul sera fournie avec l'annexe de données certifiées (à venir)." },
    ]);
  }
  ajouterFeuilleChampValeur(wb, "Informations", [...lignesInformations(infos), { champ: "Version du gabarit", valeur: infos.versionGabarit }]);
  ajouterFeuilleTable(wb, "Détail", modele.colonnes, modele.lignes, { largeurs: LARGEURS });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "journal.export")) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const format = lireFormat(searchParams.get("format"));
  if (!format) return NextResponse.json({ error: "Format invalide (csv, xlsx, json, pdf ou certifie)" }, { status: 400 });

  const filtres = lireFiltresJournal(searchParams);
  // IP et user-agent bruts réservés à admin/superviseur ; recherche par
  // fragment d'IP refusée sinon (recherche_texte indexe l'IP).
  const voirIp = can(membre.role, "journal.voir_ip");
  if (!voirIp && rechercheRessembleAUneIp(filtres.q)) {
    return NextResponse.json({ error: "La recherche par adresse IP est réservée à l'administration." }, { status: 400 });
  }
  // Lecture PAR LOTS : une requête unique de 5000 lignes serait plafonnée en silence par
  // la limite « Max rows » de l'API (1000 par défaut), et l'export, signé comme complet,
  // serait tronqué. Ordre stable (created_at desc, id desc) et borne haute fixée au
  // début de l'export : les entrées créées pendant la lecture ne décalent pas les lots.
  const borneHaute = new Date().toISOString();
  const chargerLot = async (offset: number, taille: number): Promise<EntreeJournal[]> => {
    const { query } = await requeteJournalFiltree(sb, membre.institutionId, filtres, COLONNES);
    const { data, error } = await query
      .lte("created_at", borneHaute)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + taille - 1);
    if (error) throw new Error(`lecture journal: ${error.code ?? "erreur"}`);
    // Client Supabase non typé avec le schéma : cast structurel nécessaire.
    return (data ?? []) as unknown as EntreeJournal[];
  };
  let lecture: Awaited<ReturnType<typeof lireParLots<EntreeJournal>>>;
  try {
    lecture = await lireParLots<EntreeJournal>({ chargerLot, max: MAX_LIGNES_JOURNAL, tailleLot: TAILLE_LOT_JOURNAL, cle: e => e.id });
  } catch (err) {
    console.error("[JournalExport] lecture impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }
  const entrees = voirIp ? lecture.lignes : masquerDonneesTechniques(lecture.lignes);
  // Vrai seulement s'il existe réellement plus de lignes que le plafond : signalé, jamais masqué.
  const tronque = lecture.tronque;

  // Une seule lecture du nom (colonne `name`, pas `nom`) ; repli sans bloquer l'export.
  const { data: inst } = await sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle();
  const etablissement = inst?.name ?? "Établissement";
  const membreNom = await getMembreNomPourJournal(membre.membreId);

  const tRequete = performance.now();
  const modele = construireLignesExport(entrees, { voirIp });
  // Plafond du PDF : signé avec les filtres du seul export PDF (les autres formats et
  // le hash de leurs lignes sont inchangés).
  const tronquePdf = format === "pdf" && modele.lignes.length > PDF_MAX_LIGNES;
  const filtresSignes = format === "pdf"
    ? { ...construireFiltresSignes(filtres, tronque), limite_lignes_pdf: PDF_MAX_LIGNES, tronque_pdf: tronquePdf }
    : construireFiltresSignes(filtres, tronque);
  const mentionLimite = tronquePdf
    ? `PDF limité aux ${PDF_MAX_LIGNES} lignes les plus récentes sur ${modele.lignes.length}. Les formats tableur contiennent l'ensemble (jusqu'à ${MAX_LIGNES_JOURNAL}).`
    : undefined;

  let enregistre: ExportEnregistre;
  try {
    enregistre = await enregistrerExport({
      institutionId: membre.institutionId, auteurId: membre.membreId, auteurNom: membreNom, role: membre.role,
      type: "journal", format, ecran: "journal", filtres: filtresSignes, versionGabarit: VERSION_GABARIT_JOURNAL,
      lignes: modele.lignes, actionJournal: "export_journal", req,
    });
  } catch (err) {
    // Aucune valeur sensible dans ces erreurs (clé absente : nom de la variable seulement).
    console.error("[JournalExport] export non livré:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  const tEnregistre = performance.now();
  let diagnosticPdf: ResultatPdf["diagnostic"] | null = null;
  let nbPagesPdf: number | null = null;
  const infos: InfosDocument = {
    reference: enregistre.reference, etablissement, creeLe: enregistre.creeLe, auteur: membreNom,
    role: ROLE_LABELS[membre.role], filtresLisibles: resumerFiltresLisibles(filtres), nbLignes: enregistre.nbLignes,
    tronque, hash: enregistre.hash, versionGabarit: VERSION_GABARIT_JOURNAL, filtresSignes,
  };

  let body: string | Buffer;
  let contentType: string;
  let filename: string;
  const ref = enregistre.reference;

  if (format === "csv") {
    body = genererCsvJournal(modele, infos);
    contentType = "text/csv;charset=utf-8;";
    filename = `journal_activite_${ref}.csv`;
  } else if (format === "json") {
    body = genererJsonJournal(modele, infos);
    contentType = "application/json;charset=utf-8;";
    filename = `journal_activite_${ref}.json`;
  } else if (format === "pdf") {
    // Lien du QR : NEXT_PUBLIC_APP_URL, à défaut l'origine de la requête (en
    // préversion, le QR pointerait alors vers l'URL de la préversion).
    const { base, viaEnv } = baseUrlApplication(new URL(req.url).origin);
    if (!viaEnv) console.warn("[JournalExport] NEXT_PUBLIC_APP_URL absente : le QR du PDF utilise l'origine de la requête.");
    const image = await QRCode.toBuffer(urlVerificationExportAvecEmpreinte(base, ref, enregistre.hash), { width: 360, margin: 1, errorCorrectionLevel: "M" });
    const rendu = await genererPdf(modele, infos, { image, urlCourte: urlVerificationExport(base, ref) }, mentionLimite);
    body = rendu.buffer;
    diagnosticPdf = rendu.diagnostic;
    nbPagesPdf = rendu.nbPages;
    contentType = "application/pdf";
    filename = `journal_activite_${ref}.pdf`;
  } else {
    body = await genererXlsx(modele, infos, format === "certifie");
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    filename = format === "certifie" ? `rapport_certifie_journal_${ref}.xlsx` : `journal_activite_${ref}.xlsx`;
  }

  // Durées côté serveur, pour mesurer la génération en production (aucune donnée
  // personnelle : ni nom, ni filtre, ni contenu — seulement des compteurs).
  console.info(JSON.stringify({
    export: "journal", format, reference: ref, nb_lignes: modele.lignes.length,
    nb_lignes_pdf: format === "pdf" ? Math.min(modele.lignes.length, PDF_MAX_LIGNES) : undefined,
    nb_pages: nbPagesPdf ?? undefined, cellules_mesurees: diagnosticPdf?.nbCellulesMesurees, cellules_rapides: diagnosticPdf?.nbCellulesRapides,
    taille_ko: Math.round((typeof body === "string" ? Buffer.byteLength(body) : body.length) / 1024),
    ms_requete: Math.round(tRequete - t0), ms_enregistrement: Math.round(tEnregistre - tRequete),
    ms_rendu: Math.round(performance.now() - tEnregistre), ms_total: Math.round(performance.now() - t0),
  }));

  // Buffer accepté à l'exécution par NextResponse ; le cast ne sert qu'à
  // l'union `string | Buffer` (même pattern que rapports/route.ts).
  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Tronque": tronque ? "true" : "false",
      "X-Export-Reference": ref,
      "X-Empreinte-Sha256": enregistre.hash,
    },
  });
}
