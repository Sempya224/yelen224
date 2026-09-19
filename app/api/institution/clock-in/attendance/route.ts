import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Lecture seule de daily_attendance (résumé précalculé par le job nocturne
// clock-in-daily-attendance, voir CLAUDE.md /chantier-clock-in-shift) —
// aucune écriture ici, les corrections passent par
// app/api/institution/clock-in/corrections. Même permission que le reste
// du module (clock_in.read_full : admin/superviseur/dirigeant).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId");
  const feed = url.searchParams.get("feed");

  // Vue "flux d'activité" (Timeline Live, refonte 05/08/2026) : derniers
  // pointages bruts (attendance_logs), pas daily_attendance — reflète les
  // actions au fil de l'eau, pas le résumé calculé toutes les 15 min par le
  // job nocturne. Exclut les pointages remplacés par une correction, même
  // anti-jointure que le job (voir supabase/functions/clock-in-daily-attendance).
  if (feed) {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
    const { data: audits } = await sb
      .from("attendance_audit_logs")
      .select("attendance_log_id_origine")
      .eq("institution_id", membre.institutionId)
      .not("attendance_log_id_origine", "is", null);
    const idsRemplaces = (audits ?? []).map(a => a.attendance_log_id_origine).filter((id): id is string => typeof id === "string");

    let logsQuery = sb
      .from("attendance_logs")
      .select("id,type_action,horodatage,methode,employees(nom,prenom)")
      .eq("institution_id", membre.institutionId)
      .order("horodatage", { ascending: false })
      .limit(limit);
    if (idsRemplaces.length > 0) logsQuery = logsQuery.not("id", "in", `(${idsRemplaces.join(",")})`);
    const { data, error } = await logsQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data ?? [] });
  }

  // Vue "historique d'un employé" : pas de KPI, juste les 60 derniers jours
  // calculés, du plus récent au plus ancien.
  if (employeeId) {
    const { data, error } = await sb
      .from("daily_attendance")
      .select("id,date_jour,statut,heures_prevues_minutes,heures_travaillees_minutes,retard_minutes,depart_anticipe_minutes,premiere_entree,derniere_sortie,nombre_pointages,override_manuel")
      .eq("institution_id", membre.institutionId)
      .eq("employee_id", employeeId)
      .order("date_jour", { ascending: false })
      .limit(60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ records: data ?? [] });
  }

  // Vue "journée" : tous les employés pour une date donnée (défaut
  // aujourd'hui), avec compteurs par statut pour les cartes KPI du
  // dashboard.
  const date = url.searchParams.get("date");
  const dateJour = date && DATE_REGEX.test(date) ? date : new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("daily_attendance")
    .select("id,employee_id,statut,heures_travaillees_minutes,retard_minutes,depart_anticipe_minutes,premiere_entree,derniere_sortie,nombre_pointages,override_manuel,employees(nom,prenom,matricule,department_id,poste)")
    .eq("institution_id", membre.institutionId)
    .eq("date_jour", dateJour)
    .order("statut", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const kpis = { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, departsAnticipes: 0 };
  let sommeHeuresTravaillees = 0;
  let nbAvecPresence = 0;
  for (const r of data ?? []) {
    if (r.statut === "Présent") kpis.present++;
    else if (r.statut === "Retard") kpis.retard++;
    else if (r.statut === "Absent") kpis.absent++;
    else if (r.statut === "Congé") kpis.conge++;
    else if (r.statut === "Incomplet") kpis.incomplet++;
    if (r.depart_anticipe_minutes > 0) kpis.departsAnticipes++;
    if (r.nombre_pointages > 0) { sommeHeuresTravaillees += r.heures_travaillees_minutes; nbAvecPresence++; }
  }
  // Conformité = part des employés attendus qui se sont effectivement
  // présentés (Présent/Retard/Incomplet), congé exclu du dénominateur —
  // une absence autorisée n'est pas une non-conformité. Choix assumé, pas
  // une formule dictée par le brief (qui ne la définissait pas).
  const denomConformite = kpis.present + kpis.retard + kpis.absent + kpis.incomplet;
  const conformite = denomConformite > 0 ? Math.round(((kpis.present + kpis.retard) / denomConformite) * 100) : null;
  const heuresTravailleesMoyenne = nbAvecPresence > 0 ? Math.round(sommeHeuresTravaillees / nbAvecPresence) : 0;

  return NextResponse.json({
    date: dateJour, records: data ?? [], kpis, total: (data ?? []).length,
    conformite, heuresTravailleesMoyenne,
  });
}
