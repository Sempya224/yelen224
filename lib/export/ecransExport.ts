// Livraison des exports CSV serveur des écrans (phase 1, 24/10/2026), partagée par
// api/institution/rdv-historique/export (RDV passés et accueil) et
// api/institution/paiements/export (Paiements et Historique financier).
//
// Ordre : session → corps (écran + identifiants, max 5000) → droit d'accès à l'écran
// (canAccessTab ≠ none) → relecture des lignes de L'ÉTABLISSEMENT DE LA SESSION par
// paquets (un identifiant d'un autre établissement n'est jamais exporté) → modèle de
// lignes avec masque des téléphones selon le rôle → préparation (référence, empreinte,
// signature) → CSV → confirmation de l'enregistrement. Sans enregistrement ni clé de
// signature, aucun fichier n'est livré ; un rendu qui échoue n'enregistre rien.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab, ROLE_LABELS, type TabKey } from "@/lib/institutionPermissions";
import { getMembreNomPourJournal } from "@/lib/journalActivite";
import { assemblerRdvHistorique, COLONNES_RDV_HISTORIQUE, type RdvBrut } from "@/lib/rdvHistorique";
import { assemblerPaiements, COLONNES_PAIEMENTS, type BookingRow } from "@/lib/paiementsListe";
import { preparerExport, type ExportPrepare } from "./enregistrer";
import { lirePaquets } from "./lirePaquets";
import { genererCsv, type InfosDocument, type ModeleExport } from "./rendus";
import {
  LIBELLES_ECRAN, VERSIONS_GABARIT_ECRAN, construireFiltresEcranSignes, construireLignesHistoriqueFinancier, construireLignesPaiements,
  construireLignesRdv, lireDemandeExport, reordonnerParIdentifiants, resumerSelection, type EcranExport,
} from "./ecransLignes";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Onglet dont le droit d'accès conditionne l'export de chaque écran.
const ONGLET_PAR_ECRAN: Readonly<Record<EcranExport, TabKey>> = {
  rdv_passes: "rdv-historique", rdv_accueil: "rdv", historique_financier: "historique-financier", paiements: "paiements",
};

export async function livrerExportEcran(req: NextRequest, ecransAcceptes: readonly EcranExport[]): Promise<NextResponse> {
  const t0 = performance.now();
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const corps: unknown = await req.json().catch(() => null);
  const demande = lireDemandeExport(corps);
  if ("erreur" in demande) return NextResponse.json({ error: demande.erreur }, { status: 400 });
  const { ecran, ids } = demande;
  if (!ecransAcceptes.includes(ecran)) return NextResponse.json({ error: "Écran d'export inconnu" }, { status: 400 });

  if (canAccessTab(membre.role, ONGLET_PAR_ECRAN[ecran]) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const telephoneClair = can(membre.role, "export.telephone_clair");

  // ── Relecture des lignes : établissement de la session uniquement ─────────
  let modele: ModeleExport;
  let idsRetenus: number;
  try {
    if (ecran === "rdv_passes" || ecran === "rdv_accueil") {
      const brutes = await lirePaquets(ids, async (paquet) => {
        const { data, error } = await sb.from("rdv").select(COLONNES_RDV_HISTORIQUE).eq("institution_id", membre.institutionId).in("id", paquet);
        if (error) throw new Error(`lecture rdv: ${error.code ?? "erreur"}`);
        return (data ?? []) as unknown as RdvBrut[];
      });
      const ordonnees = reordonnerParIdentifiants(brutes, ids, r => r.id);
      idsRetenus = ordonnees.length;
      modele = construireLignesRdv(await assemblerRdvHistorique(sb, membre.institutionId, ordonnees), { telephoneClair });
    } else {
      const brutes = await lirePaquets(ids, async (paquet) => {
        const { data, error } = await sb.from("paid_bookings").select(COLONNES_PAIEMENTS).eq("institution_id", membre.institutionId).in("id", paquet);
        if (error) throw new Error(`lecture paiements: ${error.code ?? "erreur"}`);
        return (data ?? []) as unknown as BookingRow[];
      });
      const ordonnees = reordonnerParIdentifiants(brutes, ids, b => b.id);
      idsRetenus = ordonnees.length;
      const assembles = await assemblerPaiements(sb, ordonnees);
      modele = ecran === "paiements" ? construireLignesPaiements(assembles) : construireLignesHistoriqueFinancier(assembles, { telephoneClair });
    }
  } catch (err) {
    console.error("[ExportEcran] lecture impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }
  if (idsRetenus === 0) return NextResponse.json({ error: "Aucune ligne exportable pour votre établissement" }, { status: 404 });
  const tLecture = performance.now();

  const { data: inst } = await sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle();
  const etablissement = inst?.name ?? "Établissement";
  const membreNom = await getMembreNomPourJournal(membre.membreId);
  const filtresSignes = construireFiltresEcranSignes(ecran, { idsRecus: ids.length, idsRetenus, telephoneClair });

  let prepare: ExportPrepare;
  try {
    prepare = await preparerExport({
      institutionId: membre.institutionId, auteurId: membre.membreId, auteurNom: membreNom, role: membre.role,
      type: ecran, format: "csv", ecran, filtres: filtresSignes, versionGabarit: VERSIONS_GABARIT_ECRAN[ecran],
      lignes: modele.lignes, actionJournal: "export_ecran", req,
    });
  } catch (err) {
    console.error("[ExportEcran] export non préparé:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  const infos: InfosDocument = {
    reference: prepare.reference, etablissement, creeLe: prepare.creeLe, auteur: membreNom, role: ROLE_LABELS[membre.role],
    filtresLisibles: `${LIBELLES_ECRAN[ecran]} : ${resumerSelection(ids.length, idsRetenus)}`, nbLignes: prepare.nbLignes, tronque: false,
    hash: prepare.hash, versionGabarit: VERSIONS_GABARIT_ECRAN[ecran], filtresSignes,
  };

  let csv: string;
  try {
    csv = genererCsv(modele, infos);
  } catch (err) {
    console.error("[ExportEcran] rendu impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  try {
    await prepare.confirmer();
  } catch (err) {
    console.error("[ExportEcran] enregistrement impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  // Durées côté serveur (aucune donnée personnelle : seulement des compteurs).
  console.info(JSON.stringify({
    export: "ecran", ecran, reference: prepare.reference, ids_recus: ids.length, nb_lignes: idsRetenus, telephone: telephoneClair ? "clair" : "masque",
    taille_ko: Math.round(Buffer.byteLength(csv) / 1024), ms_lecture: Math.round(tLecture - t0), ms_total: Math.round(performance.now() - t0),
  }));

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8;",
      "Content-Disposition": `attachment; filename="${ecran}_${prepare.reference}.csv"`,
      "X-Export-Tronque": "false",
      "X-Export-Reference": prepare.reference,
      "X-Empreinte-Sha256": prepare.hash,
    },
  });
}
