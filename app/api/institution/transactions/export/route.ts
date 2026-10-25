import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab, ROLE_LABELS } from "@/lib/institutionPermissions";
import { getMembreNomPourJournal } from "@/lib/journalActivite";
import { preparerExport, type ExportPrepare } from "@/lib/export/enregistrer";
import { genererQrVerification } from "@/lib/export/qrVerification";
import { PDF_MAX_LIGNES } from "@/lib/export/pdf/config";
import { genererPdfGabarit, type ColonnePdf } from "@/lib/export/pdf/gabarit";
import {
  ajouterFeuilleChampValeur, ajouterFeuilleTable, genererCsv, lignesInformations, MAX_LIGNES_EXPORT, MENTION_PDF_VUE,
  type InfosDocument, type ModeleExport,
} from "@/lib/export/rendus";
import {
  BALAYAGE_MAX_TRANSACTIONS, TAILLE_LOT_TRANSACTIONS, VERSION_GABARIT_TRANSACTIONS,
  collecterTransactions, construireFiltresTransactionsSignes, construireLignesTransactions, formaterMontantPdf,
  lireFiltresTransactions, nomCitoyenPourExport, resumerFiltresTransactions,
  type TransactionExport,
} from "@/lib/export/transactionsLignes";

// Export du journal Transactions, branché sur le module lib/export (24/10/2026).
// Ordre : droits → filtres → lecture par lots (filtres AVANT le plafond de 5000) →
// lignes du modèle unique → préparation (référence réservée, empreinte, signature)
// → rendu du fichier → confirmation de l'enregistrement. Sans enregistrement ni clé
// de signature, aucun fichier n'est livré ; un rendu qui échoue n'enregistre rien.
//
// ⚠️ Le PDF est une vue partielle (8 colonnes, 1000 lignes au plus) du jeu de données
// certifié ; aucune valeur probante n'est promise.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FORMATS = ["csv", "xlsx", "pdf"] as const;
type Format = (typeof FORMATS)[number];
function lireFormat(v: string | null): Format | null {
  return v && (FORMATS as readonly string[]).includes(v) ? (v as Format) : null;
}

type LigneBrute = {
  id: string; reference: string; type_transaction: string; montant: number; motif: string | null;
  membre_nom: string; paid_booking_id: string | null; created_at: string;
};
type ReservationRow = {
  id: string;
  paid_services: { nom: string | null } | null;
  users: { prenom: string | null; nom: string | null } | null;
};

// Les identifiants de réservation sont passés à `.in()` par paquets : une liste de
// plusieurs centaines d'UUID dépasse la longueur d'URL acceptée par l'API.
const TAILLE_PAQUET_RESERVATIONS = 100;

const COLONNES_PDF: ColonnePdf[] = [
  { cle: "reference", entete: "Référence", fraction: 0.13 },
  { cle: "date", entete: "Date (heure de Conakry)", fraction: 0.16 },
  { cle: "type", entete: "Type", fraction: 0.10 },
  { cle: "citoyen", entete: "Citoyen", fraction: 0.14 },
  { cle: "service", entete: "Service", fraction: 0.14 },
  { cle: "agent", entete: "Agent", fraction: 0.11 },
  { cle: "montant", entete: "Montant", fraction: 0.10, align: "right" },
  { cle: "motif", entete: "Motif", fraction: 0.12 },
];

const LARGEURS_XLSX: Record<string, number> = {
  reference: 20, date: 30, horodatage_utc: 26, type: 16, citoyen: 24, service: 24, agent: 22, montant: 16, motif: 30,
};

async function genererXlsx(modele: ModeleExport, infos: InfosDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yelen224";
  wb.created = new Date(infos.creeLe);
  wb.title = "Transactions";
  wb.subject = `Référence ${infos.reference}`;
  wb.keywords = infos.reference;
  ajouterFeuilleChampValeur(wb, "Informations", [...lignesInformations(infos), { champ: "Version du gabarit", valeur: infos.versionGabarit }]);
  ajouterFeuilleTable(wb, "Transactions", modele.colonnes, modele.lignes, { largeurs: LARGEURS_XLSX });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "transactions") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const format = lireFormat(searchParams.get("format"));
  if (!format) return NextResponse.json({ error: "Format invalide (csv, xlsx ou pdf)" }, { status: 400 });
  const filtres = lireFiltresTransactions(searchParams);
  const qMinuscule = filtres.q ? filtres.q.toLowerCase() : null;

  // Filtres SQL : type, agent, date, montant. Service et recherche sont appliqués par
  // lot après enrichissement (voir collecterTransactions).
  const chargerLot = async (offset: number, taille: number): Promise<unknown[]> => {
    let query = sb
      .from("transactions_financieres")
      .select("id,reference,type_transaction,montant,motif,membre_nom,paid_booking_id,created_at")
      .eq("institution_id", membre.institutionId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + taille - 1);
    if (filtres.type) query = query.eq("type_transaction", filtres.type);
    if (filtres.agent) query = query.eq("membre_nom", filtres.agent);
    if (filtres.depuis) query = query.gte("created_at", filtres.depuis);
    if (filtres.montantMin !== null) query = query.gte("montant", filtres.montantMin);
    if (filtres.montantMax !== null) query = query.lte("montant", filtres.montantMax);
    const { data, error } = await query;
    if (error) throw new Error(`lecture transactions: ${error.code ?? "erreur"}`);
    return data ?? [];
  };

  const reservations = new Map<string, { citoyen_nom: string; service_nom: string }>();
  const chargerReservations = async (ids: string[]) => {
    const manquantes = [...new Set(ids)].filter(id => !reservations.has(id));
    for (let i = 0; i < manquantes.length; i += TAILLE_PAQUET_RESERVATIONS) {
      const paquet = manquantes.slice(i, i + TAILLE_PAQUET_RESERVATIONS);
      // Ni téléphone ni e-mail : seulement prénom et nom du citoyen.
      const { data, error } = await sb
        .from("paid_bookings")
        .select("id,paid_services(nom),users!paid_bookings_citoyen_id_fkey(prenom,nom)")
        .in("id", paquet);
      if (error) throw new Error(`lecture réservations: ${error.code ?? "erreur"}`);
      for (const b of (data ?? []) as unknown as ReservationRow[]) {
        reservations.set(b.id, { citoyen_nom: nomCitoyenPourExport(b.users), service_nom: b.paid_services?.nom ?? "Service" });
      }
    }
  };

  const traiterLot = async (lot: unknown[]): Promise<TransactionExport[]> => {
    const lignes = lot as LigneBrute[];
    await chargerReservations(lignes.map(l => l.paid_booking_id).filter((id): id is string => !!id));
    return lignes
      .map((t): TransactionExport => {
        const r = t.paid_booking_id ? reservations.get(t.paid_booking_id) : undefined;
        return {
          reference: t.reference, type_transaction: t.type_transaction, montant: t.montant, motif: t.motif,
          membre_nom: t.membre_nom, citoyen_nom: r?.citoyen_nom ?? null, service_nom: r?.service_nom ?? null, created_at: t.created_at,
        };
      })
      .filter(t => !filtres.service || t.service_nom === filtres.service)
      .filter(t => !qMinuscule || t.reference.toLowerCase().includes(qMinuscule) || (t.citoyen_nom ?? "").toLowerCase().includes(qMinuscule));
  };

  let collecte: Awaited<ReturnType<typeof collecterTransactions>>;
  try {
    collecte = await collecterTransactions({
      chargerLot, traiterLot, max: MAX_LIGNES_EXPORT, tailleLot: TAILLE_LOT_TRANSACTIONS, balayageMax: BALAYAGE_MAX_TRANSACTIONS,
    });
  } catch (err) {
    console.error("[TransactionsExport] lecture impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }
  const tLecture = performance.now();

  const { data: inst } = await sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle();
  const etablissement = inst?.name ?? "Établissement";
  const membreNom = await getMembreNomPourJournal(membre.membreId);

  const modele = construireLignesTransactions(collecte.lignes);
  const tronquePdf = format === "pdf" && modele.lignes.length > PDF_MAX_LIGNES;
  const filtresSignes: Record<string, unknown> = {
    ...construireFiltresTransactionsSignes(filtres, collecte.tronque, format === "pdf" ? { limite: PDF_MAX_LIGNES, tronque: tronquePdf } : undefined),
    ...(collecte.balayageAtteint ? { balayage_limite: BALAYAGE_MAX_TRANSACTIONS } : {}),
  };

  let prepare: ExportPrepare;
  try {
    prepare = await preparerExport({
      institutionId: membre.institutionId, auteurId: membre.membreId, auteurNom: membreNom, role: membre.role,
      type: "transactions", format, ecran: "transactions", filtres: filtresSignes, versionGabarit: VERSION_GABARIT_TRANSACTIONS,
      lignes: modele.lignes, actionJournal: "export_transactions", req,
    });
  } catch (err) {
    console.error("[TransactionsExport] export non préparé:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  const infos: InfosDocument = {
    reference: prepare.reference, etablissement, creeLe: prepare.creeLe, auteur: membreNom, role: ROLE_LABELS[membre.role],
    filtresLisibles: resumerFiltresTransactions(filtres), nbLignes: prepare.nbLignes, tronque: collecte.tronque,
    hash: prepare.hash, versionGabarit: VERSION_GABARIT_TRANSACTIONS, filtresSignes, libelleNombre: "Nombre de transactions",
    mentionTroncature: collecte.balayageAtteint
      ? `Recherche limitée aux ${BALAYAGE_MAX_TRANSACTIONS} transactions les plus récentes : des transactions plus anciennes peuvent correspondre aux filtres.`
      : `Résultat limité aux ${MAX_LIGNES_EXPORT} transactions les plus récentes correspondant aux filtres : le nombre réel peut être supérieur.`,
  };

  const ref = prepare.reference;
  let body: string | Buffer;
  let contentType: string;
  let filename: string;
  let nbPagesPdf: number | undefined;
  try {
    if (format === "csv") {
      body = genererCsv(modele, infos);
      contentType = "text/csv;charset=utf-8;";
      filename = `transactions_${ref}.csv`;
    } else if (format === "xlsx") {
      body = await genererXlsx(modele, infos);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = `transactions_${ref}.xlsx`;
    } else {
      const qr = await genererQrVerification(new URL(req.url).origin, ref, prepare.hash, "TransactionsExport");
      const lignesPdf = modele.lignes.slice(0, PDF_MAX_LIGNES).map(l => ({ ...l, montant: formaterMontantPdf(Number(l.montant)) }));
      const rendu = await genererPdfGabarit({
        orientation: "paysage", titre: "Transactions", etablissement, reference: ref, creeLe: prepare.creeLe, hash: prepare.hash,
        auteur: membreNom, role: infos.role,
        informations: lignesInformations(infos).filter(l => l.champ !== "Empreinte SHA-256"),
        mentionsEntete: [MENTION_PDF_VUE],
        mentionLimite: tronquePdf
          ? `PDF limité aux ${PDF_MAX_LIGNES} lignes les plus récentes sur ${modele.lignes.length}. Les formats tableur contiennent l'ensemble (jusqu'à ${MAX_LIGNES_EXPORT}).`
          : undefined,
        colonnes: COLONNES_PDF, lignes: lignesPdf, qr, motsCles: ["transactions"],
      });
      body = rendu.buffer;
      nbPagesPdf = rendu.nbPages;
      contentType = "application/pdf";
      filename = `transactions_${ref}.pdf`;
    }
  } catch (err) {
    // Rien n'a été enregistré : seule la référence réservée est perdue.
    console.error("[TransactionsExport] rendu impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }
  const tRendu = performance.now();

  try {
    await prepare.confirmer();
  } catch (err) {
    console.error("[TransactionsExport] enregistrement impossible:", err instanceof Error ? err.message : "erreur inconnue");
    return NextResponse.json({ error: "Export indisponible" }, { status: 500 });
  }

  // Durées côté serveur (aucune donnée personnelle : seulement des compteurs).
  console.info(JSON.stringify({
    export: "transactions", format, reference: ref, nb_lignes: modele.lignes.length, lignes_lues: collecte.lignesLues,
    nb_pages: nbPagesPdf, taille_ko: Math.round((typeof body === "string" ? Buffer.byteLength(body) : body.length) / 1024),
    ms_lecture: Math.round(tLecture - t0), ms_rendu: Math.round(tRendu - tLecture), ms_total: Math.round(performance.now() - t0),
  }));

  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Tronque": collecte.tronque ? "true" : "false",
      "X-Export-Reference": ref,
      "X-Empreinte-Sha256": prepare.hash,
    },
  });
}
