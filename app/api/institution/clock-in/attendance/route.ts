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

// Géolocalisation (Phase 2 roadmap §5.6, voir docs/product/YELEN_CLOCK_IN_
// ANALYSE_BENCHMARK_ROADMAP.md) — la comparaison distance/rayon est
// calculée ICI, à la lecture, jamais stockée sur attendance_logs (voir
// commentaire de la migration 20260921000003_clock_in_work_zones.sql) :
// une correction ultérieure du rayon ou du centre de la zone ne doit
// jamais rendre incohérente une ligne déjà écrite.
function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
type ZoneTravail = { latitude: number; longitude: number; rayon_metres: number };

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

  // Vue "rapport de période" : agrégats par employé sur une plage de dates
  // (Phase 2 roadmap Clock In, voir docs/product/YELEN_CLOCK_IN_ANALYSE_
  // BENCHMARK_ROADMAP.md §5.8) — agrégation en mémoire sur les lignes
  // daily_attendance déjà calculées, même convention que le reste du
  // module (jamais de recalcul à la volée). Plage bornée à 92 jours pour
  // éviter une requête pathologique.
  const dateDebut = url.searchParams.get("dateDebut");
  const dateFin = url.searchParams.get("dateFin");
  if (dateDebut && dateFin) {
    if (!DATE_REGEX.test(dateDebut) || !DATE_REGEX.test(dateFin) || dateDebut > dateFin) {
      return NextResponse.json({ error: "Période invalide" }, { status: 400 });
    }
    const spanJours = (new Date(dateFin).getTime() - new Date(dateDebut).getTime()) / 86400000;
    if (spanJours > 92) {
      return NextResponse.json({ error: "Période limitée à 92 jours" }, { status: 400 });
    }

    const { data: lignes, error: erreurPeriode } = await sb
      .from("daily_attendance")
      .select("employee_id,statut,heures_travaillees_minutes,heures_supplementaires_minutes,retard_minutes,employees(nom,prenom,matricule)")
      .eq("institution_id", membre.institutionId)
      .gte("date_jour", dateDebut)
      .lte("date_jour", dateFin);
    if (erreurPeriode) return NextResponse.json({ error: erreurPeriode.message }, { status: 500 });

    type AggEmploye = {
      employeeId: string; nom: string; prenom: string; matricule: string;
      present: number; retard: number; absent: number; conge: number; incomplet: number;
      heuresTravailleesMinutes: number; heuresSupplementairesMinutes: number; retardMinutesTotal: number;
    };
    const parEmployeMap = new Map<string, AggEmploye>();
    const totaux = { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, heuresTravailleesMinutes: 0, heuresSupplementairesMinutes: 0 };

    for (const r of lignes ?? []) {
      const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      if (!emp) continue;
      let agg = parEmployeMap.get(r.employee_id);
      if (!agg) {
        agg = {
          employeeId: r.employee_id, nom: emp.nom, prenom: emp.prenom, matricule: emp.matricule,
          present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0,
          heuresTravailleesMinutes: 0, heuresSupplementairesMinutes: 0, retardMinutesTotal: 0,
        };
        parEmployeMap.set(r.employee_id, agg);
      }
      if (r.statut === "Présent") { agg.present++; totaux.present++; }
      else if (r.statut === "Retard") { agg.retard++; totaux.retard++; }
      else if (r.statut === "Absent") { agg.absent++; totaux.absent++; }
      else if (r.statut === "Congé") { agg.conge++; totaux.conge++; }
      else if (r.statut === "Incomplet") { agg.incomplet++; totaux.incomplet++; }
      agg.heuresTravailleesMinutes += r.heures_travaillees_minutes ?? 0;
      agg.heuresSupplementairesMinutes += r.heures_supplementaires_minutes ?? 0;
      agg.retardMinutesTotal += r.retard_minutes ?? 0;
      totaux.heuresTravailleesMinutes += r.heures_travaillees_minutes ?? 0;
      totaux.heuresSupplementairesMinutes += r.heures_supplementaires_minutes ?? 0;
    }

    const parEmploye = Array.from(parEmployeMap.values()).sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`));
    return NextResponse.json({ dateDebut, dateFin, parEmploye, totaux });
  }

  // Zone de travail géolocalisée (si configurée et active) — réutilisée par
  // les deux vues ci-dessous. Aucun effet si l'institution n'a jamais défini
  // de zone : `zone` reste null, `horsZone` reste null partout, aucune
  // requête supplémentaire n'est exécutée.
  const { data: zone } = await sb
    .from("work_zones")
    .select("latitude,longitude,rayon_metres")
    .eq("institution_id", membre.institutionId)
    .eq("actif", true)
    .maybeSingle<ZoneTravail>();

  // Vue "historique d'un employé" : pas de KPI, juste les 60 derniers jours
  // calculés, du plus récent au plus ancien.
  if (employeeId) {
    const { data, error } = await sb
      .from("daily_attendance")
      .select("id,date_jour,statut,heures_prevues_minutes,heures_travaillees_minutes,heures_supplementaires_minutes,retard_minutes,depart_anticipe_minutes,premiere_entree,derniere_sortie,nombre_pointages,override_manuel")
      .eq("institution_id", membre.institutionId)
      .eq("employee_id", employeeId)
      .order("date_jour", { ascending: false })
      .limit(60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const horsZoneParJour = new Map<string, boolean>();
    if (zone && data && data.length > 0) {
      const dateMin = data[data.length - 1].date_jour;
      const dateMax = data[0].date_jour;
      const { data: logs } = await sb
        .from("attendance_logs")
        .select("horodatage,latitude,longitude")
        .eq("institution_id", membre.institutionId)
        .eq("employee_id", employeeId)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .gte("horodatage", `${dateMin}T00:00:00.000Z`)
        .lte("horodatage", `${dateMax}T23:59:59.999Z`);
      for (const log of logs ?? []) {
        const jour = log.horodatage.slice(0, 10);
        const horsZone = distanceMetres(zone.latitude, zone.longitude, log.latitude as number, log.longitude as number) > zone.rayon_metres;
        if (horsZone) horsZoneParJour.set(jour, true);
        else if (!horsZoneParJour.has(jour)) horsZoneParJour.set(jour, false);
      }
    }
    const records = (data ?? []).map(r => ({ ...r, horsZone: zone ? (horsZoneParJour.get(r.date_jour) ?? null) : null }));
    return NextResponse.json({ records });
  }

  // Vue "journée" : tous les employés pour une date donnée (défaut
  // aujourd'hui), avec compteurs par statut pour les cartes KPI du
  // dashboard.
  const date = url.searchParams.get("date");
  const dateJour = date && DATE_REGEX.test(date) ? date : new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("daily_attendance")
    .select("id,employee_id,statut,heures_travaillees_minutes,heures_supplementaires_minutes,retard_minutes,depart_anticipe_minutes,premiere_entree,derniere_sortie,nombre_pointages,override_manuel,employees(nom,prenom,matricule,department_id,poste)")
    .eq("institution_id", membre.institutionId)
    .eq("date_jour", dateJour)
    .order("statut", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const kpis = { present: 0, retard: 0, absent: 0, conge: 0, incomplet: 0, departsAnticipes: 0 };
  let sommeHeuresTravaillees = 0;
  let sommeHeuresSup = 0;
  let nbAvecPresence = 0;
  for (const r of data ?? []) {
    if (r.statut === "Présent") kpis.present++;
    else if (r.statut === "Retard") kpis.retard++;
    else if (r.statut === "Absent") kpis.absent++;
    else if (r.statut === "Congé") kpis.conge++;
    else if (r.statut === "Incomplet") kpis.incomplet++;
    if (r.depart_anticipe_minutes > 0) kpis.departsAnticipes++;
    if (r.nombre_pointages > 0) { sommeHeuresTravaillees += r.heures_travaillees_minutes; nbAvecPresence++; }
    sommeHeuresSup += r.heures_supplementaires_minutes ?? 0;
  }
  // Conformité = part des employés attendus qui se sont effectivement
  // présentés (Présent/Retard/Incomplet), congé exclu du dénominateur —
  // une absence autorisée n'est pas une non-conformité. Choix assumé, pas
  // une formule dictée par le brief (qui ne la définissait pas).
  const denomConformite = kpis.present + kpis.retard + kpis.absent + kpis.incomplet;
  const conformite = denomConformite > 0 ? Math.round(((kpis.present + kpis.retard) / denomConformite) * 100) : null;
  const heuresTravailleesMoyenne = nbAvecPresence > 0 ? Math.round(sommeHeuresTravaillees / nbAvecPresence) : 0;

  const horsZoneParEmploye = new Map<string, boolean>();
  if (zone && data && data.length > 0) {
    const { data: logs } = await sb
      .from("attendance_logs")
      .select("employee_id,latitude,longitude")
      .eq("institution_id", membre.institutionId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .gte("horodatage", `${dateJour}T00:00:00.000Z`)
      .lte("horodatage", `${dateJour}T23:59:59.999Z`);
    for (const log of logs ?? []) {
      const horsZone = distanceMetres(zone.latitude, zone.longitude, log.latitude as number, log.longitude as number) > zone.rayon_metres;
      if (horsZone) horsZoneParEmploye.set(log.employee_id, true);
      else if (!horsZoneParEmploye.has(log.employee_id)) horsZoneParEmploye.set(log.employee_id, false);
    }
  }
  const records = (data ?? []).map(r => ({ ...r, horsZone: zone ? (horsZoneParEmploye.get(r.employee_id) ?? null) : null }));
  const horsZoneCount = Array.from(horsZoneParEmploye.values()).filter(Boolean).length;

  // Observabilité du job pg_cron (Phase 1 roadmap §5.2, voir docs/product/
  // YELEN_CLOCK_IN_ANALYSE_BENCHMARK_ROADMAP.md) — sans ça, un job qui
  // s'arrête silencieusement n'a aucun signal visible (constat de l'audit
  // du 21/09/2026 §1.3) : le dashboard affiche des chiffres figés sans que
  // personne ne s'en rende compte. `calcule_le` le plus récent, tous
  // employés/dates confondus pour l'institution, pas seulement la date
  // affichée — reflète le dernier passage réel du job, pas juste le
  // dernier jour traité.
  const { data: dernierCalculRow } = await sb
    .from("daily_attendance")
    .select("calcule_le")
    .eq("institution_id", membre.institutionId)
    .order("calcule_le", { ascending: false })
    .limit(1)
    .maybeSingle<{ calcule_le: string }>();

  return NextResponse.json({
    date: dateJour, records, kpis, total: records.length,
    conformite, heuresTravailleesMoyenne, heuresSupplementairesTotal: sommeHeuresSup,
    zoneConfiguree: !!zone, horsZoneCount,
    dernierCalculAuto: dernierCalculRow?.calcule_le ?? null,
  });
}
