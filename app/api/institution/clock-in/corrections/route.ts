import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { getMembreNomPourJournal } from "@/lib/journalActivite";

// attendance_logs ET attendance_audit_logs sont immuables au niveau base
// (triggers, voir 20260805000007/000009) — toute correction est 100%
// insert-only : jamais un UPDATE sur une ligne attendance_logs existante,
// jamais un UPDATE/DELETE sur attendance_audit_logs. Voir le commentaire
// d'en-tête de 20260805000007_clock_in_attendance_logs.sql pour le
// mécanisme complet. Seule daily_attendance (résumé recalculable, pas
// immuable) accepte un UPDATE direct, pour action_type=override_statut_jour.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES_ACTION = ["entree", "sortie"] as const;
const STATUTS_JOUR = ["Présent", "Retard", "Absent", "Congé", "Incomplet"] as const;

function isTypeAction(value: unknown): value is (typeof TYPES_ACTION)[number] {
  return typeof value === "string" && (TYPES_ACTION as readonly string[]).includes(value);
}
function isStatutJour(value: unknown): value is (typeof STATUTS_JOUR)[number] {
  return typeof value === "string" && (STATUTS_JOUR as readonly string[]).includes(value);
}

function getIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const type = body?.type;
  const raison = body?.raison;
  if (typeof raison !== "string" || !raison.trim()) {
    return NextResponse.json({ error: "Raison requise" }, { status: 400 });
  }

  const ip = getIp(req);
  const membreNom = await getMembreNomPourJournal(membre.membreId);

  if (type === "ajout_pointage") {
    const employeeId = body?.employeeId;
    const typeAction = body?.typeAction;
    const horodatage = body?.horodatage;
    if (typeof employeeId !== "string") return NextResponse.json({ error: "employeeId requis" }, { status: 400 });
    if (!isTypeAction(typeAction)) return NextResponse.json({ error: "typeAction invalide" }, { status: 400 });
    if (typeof horodatage !== "string" || Number.isNaN(Date.parse(horodatage))) {
      return NextResponse.json({ error: "horodatage invalide" }, { status: 400 });
    }

    const { data: employe } = await sb
      .from("employees")
      .select("id,nom,prenom,matricule")
      .eq("id", employeeId)
      .eq("institution_id", membre.institutionId)
      .maybeSingle();
    if (!employe) return NextResponse.json({ error: "Employé introuvable pour cette institution" }, { status: 404 });

    const { data: nouveauLog, error: logError } = await sb
      .from("attendance_logs")
      .insert({
        institution_id: membre.institutionId,
        employee_id: employeeId,
        type_action: typeAction,
        horodatage,
        methode: "manuel",
        membre_id: membre.membreId,
        ip,
      })
      .select("id")
      .single();
    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

    const { error: auditError } = await sb.from("attendance_audit_logs").insert({
      institution_id: membre.institutionId,
      employee_id: employeeId,
      employee_nom: `${employe.prenom} ${employe.nom}`,
      employee_matricule: employe.matricule,
      action_type: "ajout_pointage",
      attendance_log_id_correction: nouveauLog.id,
      nouvelle_valeur: { type_action: typeAction, horodatage },
      raison: raison.trim(),
      membre_id: membre.membreId,
      membre_nom: membreNom,
      ip,
    });
    if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

    return NextResponse.json({ ok: true, attendanceLogId: nouveauLog.id });
  }

  if (type === "correction_pointage") {
    const attendanceLogIdOrigine = body?.attendanceLogIdOrigine;
    const typeAction = body?.typeAction;
    const horodatage = body?.horodatage;
    if (typeof attendanceLogIdOrigine !== "string") return NextResponse.json({ error: "attendanceLogIdOrigine requis" }, { status: 400 });
    if (!isTypeAction(typeAction)) return NextResponse.json({ error: "typeAction invalide" }, { status: 400 });
    if (typeof horodatage !== "string" || Number.isNaN(Date.parse(horodatage))) {
      return NextResponse.json({ error: "horodatage invalide" }, { status: 400 });
    }

    const { data: origine } = await sb
      .from("attendance_logs")
      .select("id,employee_id,type_action,horodatage")
      .eq("id", attendanceLogIdOrigine)
      .eq("institution_id", membre.institutionId)
      .maybeSingle();
    if (!origine) return NextResponse.json({ error: "Pointage d'origine introuvable pour cette institution" }, { status: 404 });

    const { data: dejaCorrige } = await sb
      .from("attendance_audit_logs")
      .select("id")
      .eq("attendance_log_id_origine", attendanceLogIdOrigine)
      .maybeSingle();
    if (dejaCorrige) return NextResponse.json({ error: "Ce pointage a déjà été corrigé", code: "ALREADY_CORRECTED" }, { status: 409 });

    const { data: employe } = await sb
      .from("employees")
      .select("id,nom,prenom,matricule")
      .eq("id", origine.employee_id)
      .maybeSingle();
    if (!employe) return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });

    const { data: nouveauLog, error: logError } = await sb
      .from("attendance_logs")
      .insert({
        institution_id: membre.institutionId,
        employee_id: origine.employee_id,
        type_action: typeAction,
        horodatage,
        methode: "manuel",
        membre_id: membre.membreId,
        ip,
      })
      .select("id")
      .single();
    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

    const { error: auditError } = await sb.from("attendance_audit_logs").insert({
      institution_id: membre.institutionId,
      employee_id: origine.employee_id,
      employee_nom: `${employe.prenom} ${employe.nom}`,
      employee_matricule: employe.matricule,
      action_type: "correction_pointage",
      attendance_log_id_origine: origine.id,
      attendance_log_id_correction: nouveauLog.id,
      ancienne_valeur: { type_action: origine.type_action, horodatage: origine.horodatage },
      nouvelle_valeur: { type_action: typeAction, horodatage },
      raison: raison.trim(),
      membre_id: membre.membreId,
      membre_nom: membreNom,
      ip,
    });
    if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

    return NextResponse.json({ ok: true, attendanceLogId: nouveauLog.id });
  }

  if (type === "override_statut_jour") {
    const dailyAttendanceId = body?.dailyAttendanceId;
    const statut = body?.statut;
    if (typeof dailyAttendanceId !== "string") return NextResponse.json({ error: "dailyAttendanceId requis" }, { status: 400 });
    if (!isStatutJour(statut)) return NextResponse.json({ error: "statut invalide" }, { status: 400 });

    const { data: jour } = await sb
      .from("daily_attendance")
      .select("id,employee_id,statut")
      .eq("id", dailyAttendanceId)
      .eq("institution_id", membre.institutionId)
      .maybeSingle();
    if (!jour) return NextResponse.json({ error: "Jour introuvable pour cette institution" }, { status: 404 });

    const { data: employe } = await sb
      .from("employees")
      .select("id,nom,prenom,matricule")
      .eq("id", jour.employee_id)
      .maybeSingle();
    if (!employe) return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });

    const { error: updateError } = await sb
      .from("daily_attendance")
      .update({ statut, override_manuel: true, updated_at: new Date().toISOString() })
      .eq("id", dailyAttendanceId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { error: auditError } = await sb.from("attendance_audit_logs").insert({
      institution_id: membre.institutionId,
      employee_id: jour.employee_id,
      employee_nom: `${employe.prenom} ${employe.nom}`,
      employee_matricule: employe.matricule,
      action_type: "override_statut_jour",
      daily_attendance_id: dailyAttendanceId,
      ancienne_valeur: { statut: jour.statut },
      nouvelle_valeur: { statut },
      raison: raison.trim(),
      membre_id: membre.membreId,
      membre_nom: membreNom,
      ip,
    });
    if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "type invalide (ajout_pointage, correction_pointage, override_statut_jour)" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
