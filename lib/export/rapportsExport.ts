// Livraison de l'export du Rapport financier exécutif (24/10/2026), partagée par les
// routes XLSX (api/institution/rapports) et PDF (api/institution/rapports/pdf).
//
// Ordre : droits → calcul du rapport (inchangé) → contenu signé (sections à plat) →
// préparation (référence réservée, empreinte, signature) → rendu → confirmation de
// l'enregistrement. Sans enregistrement ni clé de signature, aucun fichier n'est
// livré ; un rendu qui échoue n'enregistre rien. Aucune valeur probante n'est promise.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab, ROLE_LABELS } from "@/lib/institutionPermissions";
import { getMembreNomPourJournal } from "@/lib/journalActivite";
import { calculerRapportExecutif, limiteReservationsRapportAtteinte, LIMITE_RESERVATIONS_RAPPORT } from "@/lib/rapportsAggregation";
import { dateHeureCourte } from "@/lib/heure";
import { preparerExport, type ExportPrepare } from "./enregistrer";
import { genererQrVerification } from "./qrVerification";
import { genererPdfGabarit } from "./pdf/gabarit";
import { ajouterFeuilleChampValeur, ajouterFeuilleTable, lignesInformations, MENTION_PDF_VUE, type InfosDocument } from "./rendus";
import {
  PERIMETRE_RAPPORT, TYPE_EXPORT_RAPPORT, VERSION_GABARIT_RAPPORT, construireFiltresRapportSignes, construireModeleRapport,
  mentionLimiteRapport, sectionsPdfRapport, type ModeleRapport,
} from "./rapportsLignes";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LARGEURS_RAPPORT: Record<string, number> = {
  periode: 18, montant: 20, ventes: 12, variation_pct: 28, service: 28, categorie: 22, part_ca_pct: 14, duree_min: 12, part_pct: 14, mois: 12,
};

async function genererXlsxRapport(modele: ModeleRapport, infos: InfosDocument, genereLe: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yelen224";
  wb.created = new Date(infos.creeLe);
  wb.title = "Rapport financier exécutif";
  wb.subject = `Référence ${infos.reference}`;
  wb.keywords = infos.reference;
  ajouterFeuilleChampValeur(wb, "Informations", [
    ...lignesInformations(infos),
    { champ: "Données calculées le (heure de Conakry)", valeur: dateHeureCourte(genereLe) },
    { champ: "Version du gabarit", valeur: infos.versionGabarit },
  ]);
  for (const feuille of modele.feuilles) {
    const f = ajouterFeuilleTable(wb, feuille.nom, feuille.colonnes, feuille.lignes, { largeurs: LARGEURS_RAPPORT });
    if (feuille.synthese && feuille.synthese.length > 0) {
      f.addRow([]);
      f.addRow(["Synthèse"]).font = { bold: true };
      feuille.synthese.forEach(phrase => f.addRow([phrase]));
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function livrerRapport(req: NextRequest, format: "xlsx" | "pdf"): Promise<NextResponse> {
  const t0 = performance.now();
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "rapports") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  let rapport: Awaited<ReturnType<typeof calculerRapportExecutif>>;
  let limiteAtteinte: boolean;
  try {
    [rapport, limiteAtteinte] = await Promise.all([
      calculerRapportExecutif(membre.institutionId),
      limiteReservationsRapportAtteinte(membre.institutionId),
    ]);
  } catch (err) {
    console.error("[RapportExport] calcul impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }
  const tCalcul = performance.now();

  const { data: inst } = await sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle();
  const etablissement = inst?.name ?? "Établissement";
  const membreNom = await getMembreNomPourJournal(membre.membreId);

  const modele = construireModeleRapport(rapport);
  const filtresSignes = construireFiltresRapportSignes(limiteAtteinte, LIMITE_RESERVATIONS_RAPPORT);

  let prepare: ExportPrepare;
  try {
    prepare = await preparerExport({
      institutionId: membre.institutionId, auteurId: membre.membreId, auteurNom: membreNom, role: membre.role,
      type: TYPE_EXPORT_RAPPORT, format, ecran: "rapports", filtres: filtresSignes, versionGabarit: VERSION_GABARIT_RAPPORT,
      lignes: modele.lignes, actionJournal: "export_rapport", req,
    });
  } catch (err) {
    console.error("[RapportExport] export non préparé:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  const infos: InfosDocument = {
    reference: prepare.reference, etablissement, creeLe: prepare.creeLe, auteur: membreNom, role: ROLE_LABELS[membre.role],
    filtresLisibles: PERIMETRE_RAPPORT, nbLignes: prepare.nbLignes, tronque: limiteAtteinte, hash: prepare.hash,
    versionGabarit: VERSION_GABARIT_RAPPORT, filtresSignes, libelleNombre: "Éléments certifiés",
    mentionTroncature: mentionLimiteRapport(LIMITE_RESERVATIONS_RAPPORT),
  };

  const ref = prepare.reference;
  let body: Buffer;
  let contentType: string;
  let filename: string;
  let nbPages: number | undefined;
  try {
    if (format === "xlsx") {
      body = await genererXlsxRapport(modele, infos, rapport.genere_le);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = `rapport_financier_${ref}.xlsx`;
    } else {
      const qr = await genererQrVerification(new URL(req.url).origin, ref, prepare.hash, "RapportExport");
      const rendu = await genererPdfGabarit({
        orientation: "portrait", titre: "Rapport financier exécutif", etablissement, reference: ref, creeLe: prepare.creeLe,
        hash: prepare.hash, auteur: membreNom, role: infos.role,
        informations: [
          ...lignesInformations(infos).filter(l => l.champ !== "Empreinte SHA-256"),
          { champ: "Données calculées le (heure de Conakry)", valeur: dateHeureCourte(rapport.genere_le) },
        ],
        mentionsEntete: [MENTION_PDF_VUE],
        mentionLimite: limiteAtteinte ? mentionLimiteRapport(LIMITE_RESERVATIONS_RAPPORT) : undefined,
        sections: sectionsPdfRapport(rapport), qr, motsCles: ["rapport financier"],
      });
      body = rendu.buffer;
      nbPages = rendu.nbPages;
      contentType = "application/pdf";
      filename = `rapport_financier_${ref}.pdf`;
    }
  } catch (err) {
    // Rien n'a été enregistré : seule la référence réservée est perdue.
    console.error("[RapportExport] rendu impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }
  const tRendu = performance.now();

  try {
    await prepare.confirmer();
  } catch (err) {
    console.error("[RapportExport] enregistrement impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  // Durées côté serveur (aucune donnée personnelle : seulement des compteurs).
  console.info(JSON.stringify({
    export: "rapport_financier", format, reference: ref, nb_lignes: modele.lignes.length, limite_atteinte: limiteAtteinte,
    nb_pages: nbPages, taille_ko: Math.round(body.length / 1024),
    ms_calcul: Math.round(tCalcul - t0), ms_rendu: Math.round(tRendu - tCalcul), ms_total: Math.round(performance.now() - t0),
  }));

  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Tronque": limiteAtteinte ? "true" : "false",
      "X-Export-Reference": ref,
      "X-Empreinte-Sha256": prepare.hash,
    },
  });
}
