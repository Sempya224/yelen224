import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { DEVISE_LABEL } from "@/lib/devise";

// Export du journal Transactions (Lot 3, refonte "journal financier
// Enterprise", décision CEO 06/08/2026) — même patron que
// app/api/institution/journal/export/route.ts : exporte TOUTES les lignes
// correspondant aux filtres actifs (jusqu'à MAX_LIGNES), pas seulement la
// page affichée côté client. exceljs et pdfkit sont déjà des dépendances
// du projet (Journal d'activité), aucune nouvelle installation requise.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_LIGNES = 5000;
const FORMATS = ["csv", "xlsx", "pdf"] as const;
type Format = (typeof FORMATS)[number];
function isFormat(v: string | null): v is Format {
  return !!v && (FORMATS as readonly string[]).includes(v);
}

type LigneExport = {
  reference: string; type_transaction: string; montant: number; motif: string | null;
  membre_nom: string; citoyen_nom: string | null; service_nom: string | null; created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  encaissement: "Encaissement", remboursement: "Remboursement", correction: "Correction",
  annulation: "Annulation", ajustement: "Ajustement",
};

function genererCsv(lignes: LigneExport[]): string {
  const header = ["Référence", "Type", "Citoyen", "Service", "Agent", "Montant", "Motif", "Date"];
  const rows = lignes.map(l => [
    l.reference, TYPE_LABEL[l.type_transaction] ?? l.type_transaction, l.citoyen_nom ?? "", l.service_nom ?? "",
    l.membre_nom, String(Math.round(l.montant)), l.motif ?? "", new Date(l.created_at).toLocaleString("fr-FR"),
  ]);
  return "﻿" + [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

async function genererXlsx(lignes: LigneExport[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yelen224";
  workbook.created = new Date();
  const feuille = workbook.addWorksheet("Transactions");
  feuille.columns = [
    { header: "Référence", key: "reference", width: 18 },
    { header: "Type", key: "type", width: 16 },
    { header: "Citoyen", key: "citoyen", width: 22 },
    { header: "Service", key: "service", width: 22 },
    { header: "Agent", key: "agent", width: 20 },
    { header: `Montant (${DEVISE_LABEL})`, key: "montant", width: 16 },
    { header: "Motif", key: "motif", width: 26 },
    { header: "Date", key: "date", width: 20 },
  ];
  feuille.getRow(1).font = { bold: true };
  lignes.forEach(l => feuille.addRow({
    reference: l.reference, type: TYPE_LABEL[l.type_transaction] ?? l.type_transaction,
    citoyen: l.citoyen_nom ?? "", service: l.service_nom ?? "", agent: l.membre_nom,
    montant: Math.round(l.montant), motif: l.motif ?? "", date: new Date(l.created_at).toLocaleString("fr-FR"),
  }));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function genererPdf(lignes: LigneExport[], institutionNom: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#111").text(`Transactions — ${institutionNom}`);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#666").text(`Généré le ${new Date().toLocaleString("fr-FR")} — ${lignes.length} transaction(s)`);
    doc.moveDown(0.8);

    lignes.forEach(l => {
      if (doc.y > 520) doc.addPage();
      doc.fontSize(8).fillColor("#111").text(
        `${l.reference}  ·  ${new Date(l.created_at).toLocaleString("fr-FR")}  ·  ${TYPE_LABEL[l.type_transaction] ?? l.type_transaction}  ·  ${l.citoyen_nom ?? "—"}  ·  ${l.service_nom ?? "—"}  ·  ${l.membre_nom}  ·  ${Math.round(l.montant).toLocaleString("fr-FR")} ${DEVISE_LABEL}`
      );
    });

    doc.end();
  });
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "transactions") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  if (!isFormat(format)) return NextResponse.json({ error: "Format invalide (csv, xlsx ou pdf)" }, { status: 400 });

  const type = searchParams.get("type");
  const agent = searchParams.get("agent");
  const service = searchParams.get("service");
  const depuis = searchParams.get("depuis"); // ISO
  const montantMin = searchParams.get("montantMin");
  const montantMax = searchParams.get("montantMax");
  const q = searchParams.get("q");

  let query = sb
    .from("transactions_financieres")
    .select("id,reference,type_transaction,montant,motif,membre_nom,paid_booking_id,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .range(0, MAX_LIGNES - 1);
  if (type) query = query.eq("type_transaction", type);
  if (agent) query = query.eq("membre_nom", agent);
  if (depuis) query = query.gte("created_at", depuis);
  if (montantMin) query = query.gte("montant", Number(montantMin));
  if (montantMax) query = query.lte("montant", Number(montantMax));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookingIds = [...new Set((data ?? []).map(t => t.paid_booking_id).filter((id): id is string => !!id))];
  const bookingMap = new Map<string, { citoyen_nom: string; service_nom: string }>();
  if (bookingIds.length > 0) {
    const { data: bookingsD } = await sb.from("paid_bookings").select("id,paid_services(nom),users!paid_bookings_citoyen_id_fkey(prenom,nom,phone)").in("id", bookingIds);
    type BookingRow = { id: string; paid_services: { nom: string | null } | null; users: { prenom: string | null; nom: string | null; phone: string | null } | null };
    ((bookingsD ?? []) as unknown as BookingRow[]).forEach((b) => {
      const u = b.users;
      const nomCitoyen = u ? ([u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen") : "Citoyen";
      bookingMap.set(b.id, { citoyen_nom: nomCitoyen, service_nom: b.paid_services?.nom ?? "Service" });
    });
  }

  let lignes: LigneExport[] = (data ?? []).map(t => ({
    reference: t.reference, type_transaction: t.type_transaction, montant: t.montant, motif: t.motif,
    membre_nom: t.membre_nom,
    citoyen_nom: t.paid_booking_id ? (bookingMap.get(t.paid_booking_id)?.citoyen_nom ?? null) : null,
    service_nom: t.paid_booking_id ? (bookingMap.get(t.paid_booking_id)?.service_nom ?? null) : null,
    created_at: t.created_at,
  }));

  if (service) lignes = lignes.filter(l => l.service_nom === service);
  if (q) {
    const qLower = q.toLowerCase();
    lignes = lignes.filter(l => l.reference.toLowerCase().includes(qLower) || (l.citoyen_nom ?? "").toLowerCase().includes(qLower));
  }

  const { data: inst } = await sb.from("institutions").select("name").eq("id", membre.institutionId).maybeSingle();
  const institutionNom = inst?.name ?? "Institution";
  const dateStr = new Date().toISOString().slice(0, 10);

  let body: string | Buffer;
  let contentType: string;
  let filename: string;

  if (format === "csv") {
    body = genererCsv(lignes);
    contentType = "text/csv;charset=utf-8;";
    filename = `transactions_${dateStr}.csv`;
  } else if (format === "xlsx") {
    body = await genererXlsx(lignes);
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    filename = `transactions_${dateStr}.xlsx`;
  } else {
    body = await genererPdf(lignes, institutionNom);
    contentType = "application/pdf";
    filename = `transactions_${dateStr}.pdf`;
  }

  // "Toutes les exportations sont enregistrées dans le journal d'activité"
  // (§13 du brief) — même convention que journal/export/route.ts.
  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "export_transactions",
    cibleTable: "transactions_financieres",
    details: { format, nb_lignes: lignes.length },
    req,
  });

  return new NextResponse(body as unknown as BodyInit, {
    headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
