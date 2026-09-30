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
  pause_obligatoire_minutes: number;
  pause_heure_debut: string | null;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Copie de lib/clockInPause.ts::fenetrePauseProgrammee (module Next.js,
// incompatible avec Deno — même convention de duplication déjà en place
// dans ce fichier, voir rappels-rdv/index.ts). Utilisée uniquement pour
// pause_depassement_minutes ci-dessous, jamais pour fabriquer un
// événement — clock-in-pause-trigger reste seul responsable du
// déclenchement.
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

// Notifications proactives (Phase 2 roadmap Clock In, voir docs/product/
// YELEN_CLOCK_IN_ANALYSE_BENCHMARK_ROADMAP.md §5.9) — insertion directe
// dans `notifications` (destinataire_type='institution'), même schéma que
// lib/notificationEngine.ts::inserer(), dupliqué ici volontairement plutôt
// qu'importé (module Next.js, incompatible avec Deno) — même convention
// déjà en place dans ce fichier pour les statuts V1 et l'hypothèse UTC+0.
// Pas d'envoi push dans ce premier lot (web-push non dupliqué ici) —
// notification en base uniquement, visible au prochain chargement du
// dashboard institution.
function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

async function notifierInstitution(institutionId: string, type: string, titre: string, message: string): Promise<void> {
  const { error } = await sb.from("notifications").insert({
    destinataire_id: institutionId,
    destinataire_type: "institution",
    rdv_id: null,
    type,
    titre,
    message,
    lu: false,
  });
  if (error) console.error("[clock-in-daily-attendance] notification error:", error.message);
}

async function traiterDate(dateJour: string, estFinalise: boolean): Promise<number> {
  const jourSemaine = JOURS_SEMAINE[new Date(`${dateJour}T00:00:00Z`).getUTCDay()];

  const { data: assignations } = await sb
    .from("employee_schedule_assignments")
    .select("employee_id,institution_id,work_schedule_id,work_schedules(pattern,tolerance_retard_minutes,tolerance_depart_anticipe_minutes,heures_sup_autorisees,heures_sup_seuil_minutes,pause_obligatoire_minutes,pause_heure_debut),employees(nom,prenom)")
    .lte("date_debut", dateJour)
    .or(`date_fin.is.null,date_fin.gte.${dateJour}`);

  let traites = 0;

  for (const assignation of assignations ?? []) {
    const scheduleRel = assignation.work_schedules as unknown as ScheduleInfo | ScheduleInfo[] | null;
    const schedule = Array.isArray(scheduleRel) ? scheduleRel[0] : scheduleRel;
    if (!schedule) continue;

    const employeeRel = assignation.employees as unknown as { nom: string; prenom: string } | { nom: string; prenom: string }[] | null;
    const employeeInfo = Array.isArray(employeeRel) ? employeeRel[0] : employeeRel;

    const jourConfig = schedule.pattern?.jours?.[jourSemaine];
    if (!jourConfig || jourConfig.repos || jourConfig.segments.length === 0) continue; // jour non travaillé, pas de ligne

    const { data: existant } = await sb
      .from("daily_attendance")
      .select("id,override_manuel,statut,calcule_le")
      .eq("employee_id", assignation.employee_id)
      .eq("date_jour", dateJour)
      .maybeSingle();
    if (existant?.override_manuel) continue; // ne jamais écraser une correction manuelle
    const ancienStatut = existant?.statut ?? null;
    // "dejaFinalise" : le dernier calcul de cette ligne a-t-il déjà eu lieu
    // un autre jour que dateJour lui-même — c'est-à-dire lors d'un passage
    // "hier" précédent, pas pendant le déroulement de dateJour comme
    // "aujourd'hui". Nécessaire car la simple comparaison de statut
    // (ancienStatut vs statut) ne suffit pas : une absence toute la journée
    // reste "Absent" du dernier passage "aujourd'hui" (non notifié,
    // volontairement) jusqu'au premier passage "hier" du lendemain — même
    // valeur des deux côtés, donc `statut !== ancienStatut` serait toujours
    // faux à ce moment précis, ratant justement le cas qu'on veut attraper.
    const dejaFinalise = !!existant?.calcule_le && existant.calcule_le.slice(0, 10) !== dateJour;

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
      .select("type_action,horodatage,methode")
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

    // Pause imbriquée dans l'entree/sortie ouvert (brief Bryan 21/09/2026,
    // voir lib/clockInPause.ts) — soustraite du bracket entree→sortie
    // qui la contient, jamais comptée comme temps travaillé. V1 = une
    // seule pause par shift : premier pause_debut/dernier pause_fin du
    // jour suffisent à remplir pause_debut_reel/pause_fin_reelle.
    let pauseOuverteDepuis: Date | null = null;
    let pauseMinutesDansBracketCourant = 0;
    let pauseMinutesReellesTotal = 0;
    let pauseDebutReel: string | null = null;
    let pauseFinReelle: string | null = null;
    let pauseDeclenchement: "auto" | "manuel" | null = null;

    for (const log of logs ?? []) {
      nombrePointages++;
      if (log.type_action === "entree") {
        if (enCoursEntree) incomplet = true;
        enCoursEntree = new Date(log.horodatage);
        if (!premiereEntree) premiereEntree = log.horodatage;
      } else if (log.type_action === "pause_debut") {
        if (!enCoursEntree) { incomplet = true; continue; } // anomalie : pause sans service ouvert
        pauseOuverteDepuis = new Date(log.horodatage);
        if (!pauseDebutReel) {
          pauseDebutReel = log.horodatage;
          pauseDeclenchement = log.methode === "auto" ? "auto" : "manuel";
        }
      } else if (log.type_action === "pause_fin") {
        if (!pauseOuverteDepuis) { incomplet = true; continue; } // anomalie : reprise sans pause ouverte
        const dureePause = (new Date(log.horodatage).getTime() - pauseOuverteDepuis.getTime()) / 60000;
        pauseMinutesReellesTotal += dureePause;
        pauseMinutesDansBracketCourant += dureePause;
        pauseFinReelle = log.horodatage;
        pauseOuverteDepuis = null;
      } else { // sortie
        if (!enCoursEntree) {
          incomplet = true;
          continue;
        }
        const dureeBrute = (new Date(log.horodatage).getTime() - enCoursEntree.getTime()) / 60000;
        heuresTravailleesMin += Math.max(0, dureeBrute - pauseMinutesDansBracketCourant);
        pauseMinutesDansBracketCourant = 0;
        derniereSortie = log.horodatage;
        enCoursEntree = null;
      }
    }
    if (enCoursEntree) incomplet = true;
    if (pauseOuverteDepuis) incomplet = true; // oubli de reprise (§10 du brief) — jamais d'heure de reprise fabriquée

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

    // Dépassement = minutes réelles au-delà de la durée prévue — calculé
    // UNIQUEMENT si la pause est réellement terminée (pauseFinReelle connu).
    // Si la pause n'a jamais été refermée, le statut "Incomplet" ci-dessus
    // porte déjà l'anomalie — jamais d'heure de reprise fabriquée pour en
    // déduire un dépassement (§7 du brief).
    let pauseDepassementMinutes = 0;
    if (pauseFinReelle) {
      const fenetrePause = fenetrePauseProgrammee(jourConfig, schedule.pause_obligatoire_minutes ?? 0, schedule.pause_heure_debut ?? null);
      if (fenetrePause) {
        const dureePrevueMin = fenetrePause.finMin - fenetrePause.debutMin;
        pauseDepassementMinutes = Math.max(0, Math.round(pauseMinutesReellesTotal - dureePrevueMin));
      }
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
        pause_debut_reel: pauseDebutReel,
        pause_fin_reelle: pauseFinReelle,
        pause_minutes_reelles: Math.round(pauseMinutesReellesTotal),
        pause_depassement_minutes: pauseDepassementMinutes,
        pause_declenchement: pauseDeclenchement,
        calcule_le: new Date().toISOString(),
      },
      { onConflict: "employee_id,date_jour" },
    );

    // Notification proactive — "Retard" sur transition de statut (signal
    // fiable dès qu'un pointage réel en retard a eu lieu, n'importe quand
    // dans la journée). "Absent"/"Incomplet" sur première finalisation
    // (!dejaFinalise), PAS sur transition de valeur — voir le commentaire
    // sur dejaFinalise ci-dessus pour la raison (l'égalité de statut ne
    // suffit pas à détecter ce cas).
    if (statut !== ancienStatut && statut === "Retard") {
      const nom = employeeInfo ? `${employeeInfo.prenom} ${employeeInfo.nom}` : "Un employé";
      await notifierInstitution(
        assignation.institution_id, "clock_in_retard", salutation("votre équipe"),
        `${nom} a pointé son arrivée en retard aujourd'hui (${retardMin} min).`,
      );
    } else if (estFinalise && !dejaFinalise && statut === "Absent") {
      const nom = employeeInfo ? `${employeeInfo.prenom} ${employeeInfo.nom}` : "Un employé";
      await notifierInstitution(
        assignation.institution_id, "clock_in_absent", salutation("votre équipe"),
        `${nom} n'a pointé aucune présence le ${dateJour}, alors qu'un horaire était prévu.`,
      );
    } else if (estFinalise && !dejaFinalise && statut === "Incomplet") {
      const nom = employeeInfo ? `${employeeInfo.prenom} ${employeeInfo.nom}` : "Un employé";
      await notifierInstitution(
        assignation.institution_id, "clock_in_incomplet", salutation("votre équipe"),
        `Le pointage de ${nom} le ${dateJour} est incomplet (arrivée ou départ manquant).`,
      );
    }

    traites++;
  }

  return traites;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const maintenant = new Date();
  const hier = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);

  const traitesAujourdhui = await traiterDate(dateStr(maintenant), false);
  const traitesHier = await traiterDate(dateStr(hier), true);

  return new Response(
    JSON.stringify({ ok: true, traites_aujourdhui: traitesAujourdhui, traites_hier: traitesHier }),
    { headers: { "Content-Type": "application/json" } },
  );
});
