// Supabase Edge Function — déclenchement automatique du début de pause
// selon les règles de planning (brief Bryan 21/09/2026, §3 : "l'automatisation
// doit concerner le DÉBUT de la pause selon la règle configurée, pas une
// modification silencieuse des données"). Planifiée par pg_cron toutes les
// 1-2 minutes (voir migration 20260921000007_clock_in_pause_trigger_cron.sql)
// — plus fréquente que clock-in-daily-attendance (15 min, trop grossier
// pour déclencher "à 12:00 pile").
//
// Fonction strictement additive et non destructive : n'écrit JAMAIS
// pause_fin (la reprise reste TOUJOURS une action employé explicite, non
// négociable — brief §4) et ne touche jamais daily_attendance (le job
// clock-in-daily-attendance reste seul responsable des résumés).
//
// ⚠️ Même hypothèse structurante que clock-in-daily-attendance : Guinée =
// UTC+0 toute l'année, timestamps traités comme heure locale sans
// conversion. Duplique volontairement fenetrePauseProgrammee() de
// lib/clockInPause.ts (module Next.js, incompatible avec Deno) — même
// convention déjà en place dans ce dossier.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const JOURS_SEMAINE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
// Tolérance : ne déclenche que dans les X minutes suivant l'heure
// programmée — si le cron a été interrompu plus longtemps que ça, ne
// jamais démarrer une pause tardive de façon fabriquée. L'employé garde
// toujours la possibilité de la démarrer lui-même.
const FENETRE_TOLERANCE_MIN = 10;

type Segment = { debut: string; fin: string; traverse_minuit?: boolean };
type JourPattern = { repos: boolean; segments: Segment[] };
type ScheduleInfo = {
  pattern: { jours: Record<string, JourPattern> };
  pause_obligatoire_minutes: number;
  pause_heure_debut: string | null;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Copie de lib/clockInPause.ts::fenetrePauseProgrammee — voir ce fichier
// pour la logique commentée en détail (2+ segments = écart entre segments,
// 1 segment = pause_heure_debut + pause_obligatoire_minutes).
function fenetrePauseProgrammee(jourConfig: JourPattern | undefined, pauseObligatoireMinutes: number, pauseHeureDebut: string | null): { debutMin: number; finMin: number } | null {
  if (!jourConfig || jourConfig.repos || !jourConfig.segments || jourConfig.segments.length === 0) return null;
  if (jourConfig.segments.length >= 2) {
    const debutMin = toMinutes(jourConfig.segments[0].fin);
    let finMin = toMinutes(jourConfig.segments[1].debut);
    if (finMin <= debutMin) finMin += 24 * 60;
    return { debutMin, finMin };
  }
  if (pauseHeureDebut && pauseObligatoireMinutes > 0) {
    const debutMin = toMinutes(pauseHeureDebut);
    return { debutMin, finMin: debutMin + pauseObligatoireMinutes };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const maintenant = new Date();
  const dateJour = maintenant.toISOString().slice(0, 10);
  const jourSemaine = JOURS_SEMAINE[maintenant.getUTCDay()];
  const nowMin = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();

  const { data: assignations } = await sb
    .from("employee_schedule_assignments")
    .select("employee_id,institution_id,work_schedules(pattern,pause_obligatoire_minutes,pause_heure_debut)")
    .lte("date_debut", dateJour)
    .or(`date_fin.is.null,date_fin.gte.${dateJour}`);

  let declenches = 0;

  for (const assignation of assignations ?? []) {
    const scheduleRel = assignation.work_schedules as unknown as ScheduleInfo | ScheduleInfo[] | null;
    const schedule = Array.isArray(scheduleRel) ? scheduleRel[0] : scheduleRel;
    if (!schedule) continue;

    const jourConfig = schedule.pattern?.jours?.[jourSemaine];
    const fenetre = fenetrePauseProgrammee(jourConfig, schedule.pause_obligatoire_minutes ?? 0, schedule.pause_heure_debut ?? null);
    if (!fenetre) continue;
    if (nowMin < fenetre.debutMin || nowMin > fenetre.debutMin + FENETRE_TOLERANCE_MIN) continue;

    // Éligible seulement si l'employé est actuellement "en service, pas en
    // pause" — dernier événement ACTIF = 'entree'. Si le dernier événement
    // est 'pause_debut' (pause déjà en cours, manuelle ou déjà déclenchée
    // par ce job à un passage précédent) ou 'pause_fin' (pause déjà prise
    // et reprise ce shift — V1 = une seule par shift) ou 'sortie'/rien
    // (pas en service), on ignore — jamais une pause fabriquée hors de
    // l'état réel de l'employé.
    const { data: auditsRemplaces } = await sb
      .from("attendance_audit_logs")
      .select("attendance_log_id_origine")
      .eq("employee_id", assignation.employee_id)
      .not("attendance_log_id_origine", "is", null);
    const idsRemplaces = (auditsRemplaces ?? [])
      .map((a) => a.attendance_log_id_origine)
      .filter((id): id is string => typeof id === "string");

    let dernierQuery = sb
      .from("attendance_logs")
      .select("type_action")
      .eq("employee_id", assignation.employee_id)
      .order("horodatage", { ascending: false })
      .limit(1);
    if (idsRemplaces.length > 0) dernierQuery = dernierQuery.not("id", "in", `(${idsRemplaces.join(",")})`);
    const { data: dernier } = await dernierQuery.maybeSingle();
    if (!dernier || dernier.type_action !== "entree") continue;

    const { error } = await sb.from("attendance_logs").insert({
      institution_id: assignation.institution_id,
      employee_id: assignation.employee_id,
      type_action: "pause_debut",
      methode: "auto",
    });
    if (!error) declenches++;
    else console.error("[clock-in-pause-trigger] insert error:", error.message);
  }

  return new Response(JSON.stringify({ ok: true, declenches }), { headers: { "Content-Type": "application/json" } });
});
