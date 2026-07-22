import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import ExcelJS from "exceljs";
// pdfkit — nouvelle dépendance (Lot G, export enrichi). Bryan doit exécuter
// `npm install pdfkit @types/pdfkit` avant de tester cette route (même
// pattern que l'ajout d'exceljs pour app/api/institution/rapports/route.ts).
import PDFDocument from "pdfkit";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { lireFiltresJournal, requeteJournalFiltree, type FiltresJournal } from "@/lib/journalRequete";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Export enrichi du Journal d'activité (Lot G, 2026) — contrairement à
// l'ancien exporterCsv() 100% client de JournalTab.tsx, cette route exporte
// TOUTES les lignes correspondant aux filtres actifs (jusqu'à MAX_LIGNES),
// pas seulement la page actuellement affichée (LIMIT=50 côté client).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_LIGNES = 5000;
const COLONNES = "id,audit_id,membre_id,membre_nom,action,categorie,niveau,cible_table,cible_id,details,ancienne_valeur,nouvelle_valeur,ip,user_agent,navigateur,os,plateforme,created_at";

type EntreeJournal = {
  id: string;
  audit_id: string;
  membre_id: string | null;
  membre_nom: string;
  action: string;
  categorie: string;
  niveau: string;
  cible_table: string;
  cible_id: string | null;
  details: Record<string, unknown>;
  ancienne_valeur: Record<string, unknown> | null;
  nouvelle_valeur: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  navigateur: string | null;
  os: string | null;
  plateforme: string;
  created_at: string;
};

const FORMATS = ["csv", "xlsx", "json", "pdf", "signe"] as const;
type Format = (typeof FORMATS)[number];
function isFormat(v: string | null): v is Format {
  return !!v && (FORMATS as readonly string[]).includes(v);
}

function resumerFiltres(filtres: FiltresJournal): string {
  const parts: string[] = [];
  if (filtres.dateFrom || filtres.dateTo) parts.push(`Période : ${filtres.dateFrom ?? "…"} → ${filtres.dateTo ?? "…"}`);
  if (filtres.categorie) parts.push(`Catégorie : ${filtres.categorie}`);
  if (filtres.niveau) parts.push(`Niveau : ${filtres.niveau}`);
  if (filtres.plateforme) parts.push(`Plateforme : ${filtres.plateforme}`);
  if (filtres.role) parts.push(`Rôle : ${filtres.role}`);
  if (filtres.membreId) parts.push(`Membre : ${filtres.membreId}`);
  if (filtres.q) parts.push(`Recherche : "${filtres.q}"`);
  return parts.length ? parts.join(" — ") : "Aucun filtre (toutes les entrées)";
}

// Empreinte de vérification — sérialisation canonique (tri stable par id,
// ordre de champs fixe) pour que l'empreinte soit recalculable
// indépendamment à partir des mêmes données brutes, sans dépendre de
// l'ordre de retour de la requête Supabase.
function calculerEmpreinte(entrees: EntreeJournal[]): string {
  const canon = [...entrees]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => ({
      id: e.id, audit_id: e.audit_id, membre_id: e.membre_id, membre_nom: e.membre_nom,
      action: e.action, categorie: e.categorie, niveau: e.niveau, cible_table: e.cible_table,
      cible_id: e.cible_id, details: e.details, ancienne_valeur: e.ancienne_valeur,
      nouvelle_valeur: e.nouvelle_valeur, ip: e.ip, user_agent: e.user_agent,
      navigateur: e.navigateur, os: e.os, plateforme: e.plateforme, created_at: e.created_at,
    }));
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

function genererCsv(entrees: EntreeJournal[]): string {
  const header = ["Référence", "Date", "Membre", "Action", "Catégorie", "Niveau", "Cible", "Détails", "Ancienne valeur", "Nouvelle valeur", "IP", "Navigateur", "OS", "Plateforme"];
  const rows = entrees.map((e) => [
    e.audit_id,
    new Date(e.created_at).toLocaleString("fr-FR"),
    e.membre_nom,
    e.action,
    e.categorie,
    e.niveau,
    e.cible_table,
    JSON.stringify(e.details || {}),
    e.ancienne_valeur ? JSON.stringify(e.ancienne_valeur) : "",
    e.nouvelle_valeur ? JSON.stringify(e.nouvelle_valeur) : "",
    e.ip ?? "",
    e.navigateur ?? "",
    e.os ?? "",
    e.plateforme,
  ]);
  return [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function ajouterFeuilleDetail(workbook: ExcelJS.Workbook, entrees: EntreeJournal[]) {
  const feuille = workbook.addWorksheet("Détail");
  feuille.columns = [
    { header: "Référence", key: "ref", width: 20 },
    { header: "Date", key: "date", width: 20 },
    { header: "Membre", key: "membre", width: 20 },
    { header: "Action", key: "action", width: 22 },
    { header: "Catégorie", key: "categorie", width: 16 },
    { header: "Niveau", key: "niveau", width: 12 },
    { header: "Cible", key: "cible", width: 18 },
    { header: "Détails", key: "details", width: 40 },
    { header: "IP", key: "ip", width: 16 },
    { header: "Navigateur", key: "navigateur", width: 14 },
    { header: "OS", key: "os", width: 12 },
    { header: "Plateforme", key: "plateforme", width: 12 },
  ];
  feuille.getRow(1).font = { bold: true };
  entrees.forEach((e) => feuille.addRow({
    ref: e.audit_id,
    date: new Date(e.created_at).toLocaleString("fr-FR"),
    membre: e.membre_nom,
    action: e.action,
    categorie: e.categorie,
    niveau: e.niveau,
    cible: e.cible_table,
    details: JSON.stringify(e.details || {}),
    ip: e.ip ?? "",
    navigateur: e.navigateur ?? "",
    os: e.os ?? "",
    plateforme: e.plateforme,
  }));
}

async function genererPdf(entrees: EntreeJournal[], institutionNom: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#111").text(`Journal d'activité — ${institutionNom}`);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#666").text(`Généré le ${new Date().toLocaleString("fr-FR")} — ${entrees.length} entrée(s)`);
    doc.moveDown(0.8);

    entrees.forEach((e) => {
      if (doc.y > 760) doc.addPage();
      doc.fontSize(8).fillColor("#111").text(
        `${new Date(e.created_at).toLocaleString("fr-FR")}  ·  ${e.membre_nom}  ·  ${e.action}  ·  ${e.categorie}/${e.niveau}  ·  ${e.audit_id}`
      );
    });

    doc.end();
  });
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "journal.export")) return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  if (!isFormat(format)) return NextResponse.json({ error: "Format invalide (csv, xlsx, json, pdf ou signe)" }, { status: 400 });

  const filtres = lireFiltresJournal(searchParams);
  const { query } = await requeteJournalFiltree(sb, membre.institutionId, filtres, COLONNES);
  const { data, error } = await query.order("created_at", { ascending: false }).range(0, MAX_LIGNES - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Le client Supabase n'est pas typé avec le schéma généré (createClient
  // sans generic Database, même pattern que journal/route.ts) — .select()
  // avec une chaîne de colonnes brute retourne un type générique que
  // TypeScript ne peut pas faire correspondre structurellement à
  // EntreeJournal sans ce cast.
  const entrees = (data ?? []) as unknown as EntreeJournal[];
  // Signalé plutôt que masqué : un export tronqué sans le dire serait
  // trompeur, en particulier pour le "Rapport signé" qui prétend faire foi.
  const tronque = entrees.length >= MAX_LIGNES;

  const membreNom = await getMembreNomPourJournal(membre.membreId);
  const dateStr = new Date().toISOString().slice(0, 10);
  const headersCommuns: Record<string, string> = { "X-Export-Tronque": tronque ? "true" : "false" };

  let body: string | Buffer;
  let contentType: string;
  let filename: string;

  if (format === "csv") {
    body = "﻿" + genererCsv(entrees);
    contentType = "text/csv;charset=utf-8;";
    filename = `journal_activite_${dateStr}.csv`;
  } else if (format === "json") {
    body = JSON.stringify(entrees, null, 2);
    contentType = "application/json;charset=utf-8;";
    filename = `journal_activite_${dateStr}.json`;
  } else if (format === "pdf") {
    const { data: inst } = await sb.from("institutions").select("nom").eq("id", membre.institutionId).maybeSingle();
    body = await genererPdf(entrees, inst?.nom ?? "Institution");
    contentType = "application/pdf";
    filename = `journal_activite_${dateStr}.pdf`;
  } else if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Yelen224";
    workbook.created = new Date();
    ajouterFeuilleDetail(workbook, entrees);
    body = Buffer.from(await workbook.xlsx.writeBuffer());
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    filename = `journal_activite_${dateStr}.xlsx`;
  } else {
    // "signe" — Rapport signé : feuille Certificat (cachet + empreinte
    // SHA-256) + feuille Détail identique au format xlsx.
    const { data: inst } = await sb.from("institutions").select("nom").eq("id", membre.institutionId).maybeSingle();
    const empreinte = calculerEmpreinte(entrees);
    const periode = filtres.dateFrom || filtres.dateTo
      ? `${filtres.dateFrom ?? "…"} → ${filtres.dateTo ?? "…"}`
      : "Toutes dates";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Yelen224";
    workbook.created = new Date();

    const certificat = workbook.addWorksheet("Certificat");
    certificat.columns = [{ header: "Champ", key: "champ", width: 26 }, { header: "Valeur", key: "valeur", width: 70 }];
    certificat.getRow(1).font = { bold: true };
    [
      ["Institution", inst?.nom ?? "—"],
      ["Rapport", "Journal d'activité — extrait signé"],
      ["Généré le", new Date().toLocaleString("fr-FR")],
      ["Généré par", `${membreNom} (${membre.role})`],
      ["Période couverte", periode],
      ["Nombre d'entrées", String(entrees.length) + (tronque ? " (tronqué)" : "")],
      ["Filtres appliqués", resumerFiltres(filtres)],
      ["Empreinte de vérification (SHA-256)", empreinte],
      ["Note", "Cette empreinte est calculée sur les données de la feuille \"Détail\". Toute modification d'une seule entrée change intégralement l'empreinte — recalculez-la pour vérifier l'intégrité du rapport."],
      ...(tronque ? [["Note importante", `Ce rapport est limité aux ${MAX_LIGNES} entrées les plus récentes correspondant aux filtres — le nombre réel d'entrées peut être supérieur. Affinez les filtres (période plus courte) pour un extrait exhaustif.`]] : []),
    ].forEach(([champ, valeur]) => certificat.addRow({ champ, valeur }));

    ajouterFeuilleDetail(workbook, entrees);

    body = Buffer.from(await workbook.xlsx.writeBuffer());
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    filename = `rapport_signe_journal_${dateStr}.xlsx`;
    headersCommuns["X-Empreinte-Sha256"] = empreinte;
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom,
    action: "export_journal",
    cibleTable: "journal_activite",
    details: { format, nb_lignes: entrees.length, filtres: resumerFiltres(filtres) },
    req,
  });

  // Buffer est accepté à l'exécution par NextResponse (même pattern que
  // app/api/institution/rapports/route.ts, où un Buffer nu passé en ligne
  // typecheck sans cast) — le cast n'est nécessaire ici que parce que
  // `body` transite par une variable `string | Buffer`, pas parce que
  // Buffer serait réellement incompatible à l'exécution.
  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...headersCommuns,
    },
  });
}
