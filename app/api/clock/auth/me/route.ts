import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedEmployee } from "@/lib/employeeAuth";

// Permet au portail /clock/[slug] de savoir, au chargement de la page, si
// une session employé valide existe déjà (cookie yelen224_employee_session)
// avant d'afficher le formulaire de connexion — évite de redemander
// Identifiant+PIN à chaque rechargement pendant les 12h de validité du JWT.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Segment = { debut: string; fin: string };
type Assignation = { work_schedule_id: string; date_debut: string; date_fin: string | null };
type Horaire = { pattern: Record<string, unknown>; pause: number };

export async function GET(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data } = await sb.from("employees").select("nom,prenom,statut,poste,department_id").eq("id", employee.employeeId).maybeSingle();
  if (!data || data.statut !== "actif") {
    return NextResponse.json({ error: "Compte employé inactif", code: "EMPLOYEE_INACTIVE" }, { status: 403 });
  }

  // Statut de présence courant (en service ou non), pour que le portail
  // affiche directement "en service depuis X" / "pas encore pointé" sans
  // demander à l'employé de choisir Clock In/Out lui-même (brief CEO
  // 10/09/2026). Même logique d'exclusion des lignes remplacées que
  // app/api/clock/pointage/route.ts — dupliquée ici volontairement (2
  // call-sites seulement, pas de lib partagée pour ~15 lignes).
  const { data: audits } = await sb
    .from("attendance_audit_logs")
    .select("attendance_log_id_origine")
    .eq("employee_id", employee.employeeId)
    .not("attendance_log_id_origine", "is", null);
  const supersededIds = (audits ?? [])
    .map((a) => a.attendance_log_id_origine)
    .filter((id): id is string => typeof id === "string");

  let dernierQuery = sb
    .from("attendance_logs")
    .select("type_action,horodatage")
    .eq("employee_id", employee.employeeId)
    .order("horodatage", { ascending: false })
    .limit(1);
  if (supersededIds.length > 0) {
    dernierQuery = dernierQuery.not("id", "in", `(${supersededIds.join(",")})`);
  }
  const { data: dernier } = await dernierQuery.maybeSingle();

  // "Ma journée" + "Cette semaine" + "Planning" (brief CEO 10/09/2026) —
  // dérivées de employee_schedule_assignments + work_schedules.pattern,
  // jamais une valeur inventée : rien n'apparaît pour un jour sans
  // affectation ou marqué "repos" dans le pattern. Guinée = UTC+0 toute
  // l'année (même hypothèse documentée que le job daily-attendance) —
  // Date() côté serveur correspond donc à l'heure locale Guinée sans
  // conversion. Semaine ISO (lundi→dimanche).
  const JOURS_SEMAINE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
  const maintenant = new Date();
  const jourSemaineIdx = maintenant.getUTCDay();
  const lundi = new Date(maintenant);
  lundi.setUTCDate(maintenant.getUTCDate() + (jourSemaineIdx === 0 ? -6 : 1 - jourSemaineIdx));
  lundi.setUTCHours(0, 0, 0, 0);
  const lundiStr = lundi.toISOString().slice(0, 10);
  const aujourdHuiStr = maintenant.toISOString().slice(0, 10);
  // Horizon "Planning" — du lundi de cette semaine jusqu'à 13 jours après
  // aujourd'hui. Fenêtre fixe assumée (pas de notion de "planning publié"
  // dans le produit), pas une valeur inventée : uniquement les jours
  // réellement couverts par une affectation + non "repos" apparaissent.
  const finHorizon = new Date(maintenant.getTime() + 13 * 86400000);
  const finHorizonStr = finHorizon.toISOString().slice(0, 10);
  const nbJoursHorizon = Math.round((finHorizon.getTime() - lundi.getTime()) / 86400000) + 1;

  const { data: assignations } = await sb
    .from("employee_schedule_assignments")
    .select("work_schedule_id,date_debut,date_fin")
    .eq("employee_id", employee.employeeId)
    .lte("date_debut", finHorizonStr)
    .or(`date_fin.is.null,date_fin.gte.${lundiStr}`);
  const assignationsSemaine: Assignation[] = assignations ?? [];

  const scheduleIds = Array.from(new Set(assignationsSemaine.map((a) => a.work_schedule_id)));
  const horairesParId = new Map<string, Horaire>();
  if (scheduleIds.length > 0) {
    const { data: horaires } = await sb.from("work_schedules").select("id,pattern,pause_obligatoire_minutes").in("id", scheduleIds);
    for (const h of horaires ?? []) {
      horairesParId.set(h.id, { pattern: (h.pattern as Record<string, unknown>) ?? {}, pause: h.pause_obligatoire_minutes ?? 0 });
    }
  }

  // Résout les segments réels programmés pour un jour donné (AAAA-MM-JJ) —
  // seule source de vérité, utilisée pour planDuJour, semaine et le
  // planning complet, pour ne jamais diverger entre les trois.
  function segmentsDuJour(jourStr: string): { segments: Segment[]; pauseMinutes: number } | null {
    const jourNomKey = JOURS_SEMAINE[new Date(`${jourStr}T00:00:00Z`).getUTCDay()];
    const assignationJour = assignationsSemaine.find((a) => a.date_debut <= jourStr && (!a.date_fin || a.date_fin >= jourStr));
    const horaire = assignationJour ? horairesParId.get(assignationJour.work_schedule_id) : undefined;
    const jours = horaire?.pattern?.jours as Record<string, unknown> | undefined;
    const config = jours?.[jourNomKey] as { repos?: boolean; segments?: Segment[] } | undefined;
    if (!horaire || !config || config.repos === true || !config.segments || config.segments.length === 0) return null;
    return { segments: config.segments, pauseMinutes: horaire.pause };
  }

  function dureeMinutes(seg: Segment): number {
    const [hD, mD] = seg.debut.split(":").map(Number);
    const [hF, mF] = seg.fin.split(":").map(Number);
    return Math.max(0, (hF * 60 + mF) - (hD * 60 + mD));
  }

  let planDuJour: { debut: string; fin: string; pauseMinutes: number; dureeMinutes: number } | null = null;
  let prevuesMinutes = 0;
  const prevuesParJour = new Map<string, number>();
  const shiftsParJour: { date: string; jour: string; segments: Segment[] }[] = [];
  for (let i = 0; i < nbJoursHorizon; i++) {
    const jourDate = new Date(lundi.getTime() + i * 86400000);
    const jourStr = jourDate.toISOString().slice(0, 10);
    const jourNomAffiche = JOURS_SEMAINE[jourDate.getUTCDay()];
    const resultat = segmentsDuJour(jourStr);
    if (!resultat) continue;

    shiftsParJour.push({ date: jourStr, jour: jourNomAffiche.charAt(0).toUpperCase() + jourNomAffiche.slice(1), segments: resultat.segments });

    const dureeBrute = resultat.segments.reduce((total, seg) => total + dureeMinutes(seg), 0);
    const dureeNette = Math.max(0, dureeBrute - resultat.pauseMinutes);
    if (i < 7) {
      prevuesMinutes += dureeNette;
      prevuesParJour.set(jourStr, dureeNette);
    }
    if (jourStr === aujourdHuiStr) {
      planDuJour = { debut: resultat.segments[0].debut, fin: resultat.segments[resultat.segments.length - 1].fin, pauseMinutes: resultat.pauseMinutes, dureeMinutes: dureeNette };
    }
  }

  // Heures travaillées cette semaine — paires entree/sortie réelles
  // (attendance_logs, mêmes lignes exclues que ci-dessus), plus le
  // segment en cours si l'employé est actuellement en service. Un
  // pointage entamé avant lundi n'est volontairement pas reconstitué
  // (simplification assumée, cas rare).
  let logsSemaineQuery = sb
    .from("attendance_logs")
    .select("id,type_action,horodatage")
    .eq("employee_id", employee.employeeId)
    .gte("horodatage", lundi.toISOString())
    .order("horodatage", { ascending: true });
  if (supersededIds.length > 0) {
    logsSemaineQuery = logsSemaineQuery.not("id", "in", `(${supersededIds.join(",")})`);
  }
  const { data: logsSemaine } = await logsSemaineQuery;
  let travailleesMinutes = 0;
  let ouvertDepuis: Date | null = null;
  let aujourdHuiPremiereEntree: Date | null = null;
  let aujourdHuiDerniereSortie: Date | null = null;
  let aujourdHuiDureeMinutes = 0;
  const travailleesParJour = new Map<string, number>();
  for (const log of logsSemaine ?? []) {
    const jourLog = log.horodatage.slice(0, 10);
    const estAujourdHui = jourLog === aujourdHuiStr;
    if (log.type_action === "entree") {
      ouvertDepuis = new Date(log.horodatage);
      if (estAujourdHui && !aujourdHuiPremiereEntree) aujourdHuiPremiereEntree = ouvertDepuis;
    } else if (log.type_action === "sortie" && ouvertDepuis) {
      const dureeMin = (new Date(log.horodatage).getTime() - ouvertDepuis.getTime()) / 60000;
      travailleesMinutes += dureeMin;
      travailleesParJour.set(jourLog, (travailleesParJour.get(jourLog) ?? 0) + dureeMin);
      if (estAujourdHui) {
        aujourdHuiDureeMinutes += dureeMin;
        aujourdHuiDerniereSortie = new Date(log.horodatage);
      }
      ouvertDepuis = null;
    }
  }
  if (ouvertDepuis) {
    const liveMin = (maintenant.getTime() - ouvertDepuis.getTime()) / 60000;
    travailleesMinutes += liveMin;
    travailleesParJour.set(aujourdHuiStr, (travailleesParJour.get(aujourdHuiStr) ?? 0) + liveMin);
  }
  travailleesMinutes = Math.round(travailleesMinutes);
  prevuesMinutes = Math.round(prevuesMinutes);

  const semaineDetail: { date: string; jour: string; prevuesMinutes: number; travailleesMinutes: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const jourDate = new Date(lundi.getTime() + i * 86400000);
    const jourStr = jourDate.toISOString().slice(0, 10);
    const jourNomKey = JOURS_SEMAINE[jourDate.getUTCDay()];
    semaineDetail.push({
      date: jourStr,
      jour: jourNomKey.charAt(0).toUpperCase() + jourNomKey.slice(1),
      prevuesMinutes: Math.round(prevuesParJour.get(jourStr) ?? 0),
      travailleesMinutes: Math.round(travailleesParJour.get(jourStr) ?? 0),
    });
  }

  // Présence réelle d'aujourd'hui (État "shift terminé") — distincte de
  // planDuJour (l'horaire prévu) : null tant qu'aucune paire entree/sortie
  // complète n'a eu lieu aujourd'hui. Limitation connue : sans notion de
  // pause dans attendance_logs (CHECK type_action IN ('entree','sortie')
  // uniquement, 20260805000007), une sortie suivie d'une pause avant
  // reprise apparaîtrait aussi comme "terminé" — pas de faux résultat
  // inventé, juste une distinction que le modèle actuel ne peut pas faire.
  const aujourdHuiReel = (aujourdHuiPremiereEntree && aujourdHuiDerniereSortie)
    ? {
        debut: aujourdHuiPremiereEntree.toISOString().slice(11, 16),
        fin: aujourdHuiDerniereSortie.toISOString().slice(11, 16),
        dureeMinutes: Math.round(aujourdHuiDureeMinutes),
      }
    : null;

  const { data: departement } = data.department_id
    ? await sb.from("departments").select("nom").eq("id", data.department_id).maybeSingle()
    : { data: null };

  return NextResponse.json({
    employeeId: employee.employeeId, role: employee.role, nom: data.nom, prenom: data.prenom,
    poste: data.poste, departement: departement?.nom ?? null,
    dernierStatut: dernier?.type_action ?? null,
    horodatage: dernier?.horodatage ?? null,
    planDuJour,
    aujourdHuiReel,
    semaine: { travailleesMinutes, prevuesMinutes, ecartMinutes: travailleesMinutes - prevuesMinutes },
    semaineDetail,
    shiftsParJour,
  });
}
