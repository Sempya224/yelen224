// Supabase Edge Function — Clock In Shift, calcul de daily_attendance
// (décision CEO 26/07/2026, architecture figée 05/08/2026). Planifiée par
// pg_cron toutes les 15 min (voir migration
// 20260805000011_clock_in_daily_attendance_cron.sql), même mécanisme que
// supabase/functions/rappels-rdv (net.http_post + secret Vault
// 'service_role_key', déjà créé — pas besoin de le recréer).
//
// Traite systématiquement AUJOURD'HUI et HIER à chaque exécution (upsert
// sur employee_id+date_jour) : "aujourd'hui" pour un dashboard qui se
// rapproche du temps réel demandé par le CEO (statut Incomplet/Présent qui
// se met à jour au fil de la journée), "hier" pour finaliser une fois le
// jour complètement écoulé, y compris les horaires de nuit dont la sortie
// tombe après minuit. Ne touche jamais une ligne où override_manuel=true
// (correction manuelle admin, voir app/api/institution/clock-in/corrections).
//
// ⚠️ Hypothèse structurante : la Guinée est UTC+0 toute l'année (pas de
// changement d'heure) — les timestamptz Postgres sont donc traités
// directement comme heure locale, aucune conversion de fuseau nécessaire.
// Si Yelen sert un jour une institution hors Guinée, cette fonction devra
// être revue.
//
// ⚠️ Fenêtre de recherche des pointages pour un horaire de nuit : élargie
// à 36h après le début du jour (heuristique documentée, pas une garantie
// absolue) pour couvrir une sortie après minuit sans empiéter sur le
// prochain quart de la même équipe si celui-ci démarre l'après-midi. Un
// enchaînement d'horaires de nuit consécutifs très rapprochés pourrait
// théoriquement chevaucher — cas non couvert en V1, à surveiller si des
// institutions utilisent des rotations de nuit serrées.
//
// Duplique volontairement les décisions déjà prises dans le plan schéma
// (statuts V1 strictement Présent/Retard/Absent/Congé/Incomplet, jamais de
// 6e valeur) plutôt que d'importer un module Next.js depuis Deno (voir la
// même remarque dans rappels-rdv/index.ts).

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const JOURS_SEMAINE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

type Segment = { debut: string; fin: string; traverse_minuit?: boolean };
type JourPattern = { repos: boolean; segments: Segment[] };
type Pattern = { jours: Record<string, JourPattern> };
type ScheduleInfo = {
  pattern: Pattern;
  tolerance_retard_minutes: number;
  tolerance_depart_anticipe_minutes: number;
  heures_sup_autorisees: boolean;
  heures_sup_seuil_minutes: number | null;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function traiterDate(dateJour: string): Promise<number> {
  const jourSemaine = JOURS_SEMAINE[new Date(`${dateJour}T00:00:00Z`).getUTCDay()];

  const { data: assignations } = await sb
    .from("employee_schedule_assignments")
    .select("employee_id,institution_id,work_schedule_id,work_schedules(pattern,tolerance_retard_minutes,tolerance_depart_anticipe_minutes,heures_sup_autorisees,heures_sup_seuil_minutes)")
    .lte("date_debut", dateJour)
    .or(`date_fin.is.null,date_fin.gte.${dateJour}`);

  let traites = 0;

  for (const assignation of assignations ?? []) {
    const scheduleRel = assignation.work_schedules as unknown as ScheduleInfo | ScheduleInfo[] | null;
    const schedule = Array.isArray(scheduleRel) ? scheduleRel[0] : scheduleRel;
    if (!schedule) continue;

    const jourConfig = schedule.pattern?.jours?.[jourSemaine];
    if (!jourConfig || jourConfig.repos || jourConfig.segments.length === 0) continue; // jour non travaillé, pas de ligne

    const { data: existant } = await sb
      .from("daily_attendance")
      .select("id,override_manuel")
      .eq("employee_id", assignation.employee_id)
      .eq("date_jour", dateJour)
      .maybeSingle();
    if (existant?.override_manuel) continue; // ne jamais écraser une correction manuelle

    const estNuit = jourConfig.segments.some((s) => s.traverse_minuit);
    const debutFenetre = new Date(`${dateJour}T00:00:00Z`);
    const finFenetre = new Date(debutFenetre.getTime() + (estNuit ? 36 : 24) * 60 * 60 * 1000);

    const { data: auditsRemplaces } = await sb
      .from("attendance_audit_logs")
      .select("attendance_log_id_origine")
      .eq("employee_id", assignation.employee_id)
      .not("attendance_log_id_origine", "is", null);
    const idsRemplaces = (auditsRemplaces ?? [])
      .map((a) => a.attendance_log_id_origine)
      .filter((id): id is string => typeof id === "string");

    let logsQuery = sb
      .from("attendance_logs")
      .select("type_action,horodatage")
      .eq("employee_id", assignation.employee_id)
      .gte("horodatage", debutFenetre.toISOString())
      .lt("horodatage", finFenetre.toISOString())
      .order("horodatage", { ascending: true });
    if (idsRemplaces.length > 0) logsQuery = logsQuery.not("id", "in", `(${idsRemplaces.join(",")})`);
    const { data: logs } = await logsQuery;

    let heuresTravailleesMin = 0;
    let premiereEntree: string | null = null;
    let derniereSortie: string | null = null;
    let enCoursEntree: Date | null = null;
    let nombrePointages = 0;
    let incomplet = false;

    for (const log of logs ?? []) {
      nombrePointages++;
      if (log.type_action === "entree") {
        if (enCoursEntree) incomplet = true;
        enCoursEntree = new Date(log.horodatage);
        if (!premiereEntree) premiereEntree = log.horodatage;
      } else {
        if (!enCoursEntree) {
          incomplet = true;
          continue;
        }
        heuresTravailleesMin += (new Date(log.horodatage).getTime() - enCoursEntree.getTime()) / 60000;
        derniereSortie = log.horodatage;
        enCoursEntree = null;
      }
    }
    if (enCoursEntree) incomplet = true;

    let heuresPrevuesMin = 0;
    for (const segment of jourConfig.segments) {
      const debut = toMinutes(segment.debut);
      let fin = toMinutes(segment.fin);
      if (segment.traverse_minuit || fin < debut) fin += 24 * 60;
      heuresPrevuesMin += fin - debut;
    }

    const tolRetard = schedule.tolerance_retard_minutes ?? 0;
    const tolDepart = schedule.tolerance_depart_anticipe_minutes ?? 0;

    let retardMin = 0;
    if (premiereEntree) {
      const premierSegment = jourConfig.segments[0];
      const [h, m] = premierSegment.debut.split(":").map(Number);
      const heureAttendue = new Date(debutFenetre);
      heureAttendue.setUTCHours(h, m, 0, 0);
      const ecart = (new Date(premiereEntree).getTime() - heureAttendue.getTime()) / 60000;
      if (ecart > tolRetard) retardMin = Math.round(ecart);
    }

    let departAnticipeMin = 0;
    if (derniereSortie) {
      const dernierSegment = jourConfig.segments[jourConfig.segments.length - 1];
      const [h, m] = dernierSegment.fin.split(":").map(Number);
      const heureAttendueFin = new Date(debutFenetre);
      if (dernierSegment.traverse_minuit) heureAttendueFin.setUTCDate(heureAttendueFin.getUTCDate() + 1);
      heureAttendueFin.setUTCHours(h, m, 0, 0);
      const ecart = (heureAttendueFin.getTime() - new Date(derniereSortie).getTime()) / 60000;
      if (ecart > tolDepart) departAnticipeMin = Math.round(ecart);
    }

    let statut: "Présent" | "Retard" | "Absent" | "Incomplet";
    if (nombrePointages === 0) statut = "Absent";
    else if (incomplet) statut = "Incomplet";
    else if (retardMin > 0) statut = "Retard";
    else statut = "Présent";

    let heuresNormalesMin = heuresTravailleesMin;
    let heuresSupMin = 0;
    const seuilSup = schedule.heures_sup_seuil_minutes;
    if (schedule.heures_sup_autorisees && seuilSup !== null && seuilSup !== undefined && heuresTravailleesMin > seuilSup) {
      heuresNormalesMin = seuilSup;
      heuresSupMin = heuresTravailleesMin - seuilSup;
    }

    await sb.from("daily_attendance").upsert(
      {
        institution_id: assignation.institution_id,
        employee_id: assignation.employee_id,
        date_jour: dateJour,
        work_schedule_id: assignation.work_schedule_id,
        heures_prevues_minutes: Math.round(heuresPrevuesMin),
        heures_travaillees_minutes: Math.round(heuresTravailleesMin),
        heures_normales_minutes: Math.round(heuresNormalesMin),
        heures_supplementaires_minutes: Math.round(heuresSupMin),
        retard_minutes: retardMin,
        depart_anticipe_minutes: departAnticipeMin,
        premiere_entree: premiereEntree,
        derniere_sortie: derniereSortie,
        nombre_pointages: nombrePointages,
        statut,
        calcule_le: new Date().toISOString(),
      },
      { onConflict: "employee_id,date_jour" },
    );
    traites++;
  }

  return traites;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const maintenant = new Date();
  const hier = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);

  const traitesAujourdhui = await traiterDate(dateStr(maintenant));
  const traitesHier = await traiterDate(dateStr(hier));

  return new Response(
    JSON.stringify({ ok: true, traites_aujourdhui: traitesAujourdhui, traites_hier: traitesHier }),
    { headers: { "Content-Type": "application/json" } },
  );
});
