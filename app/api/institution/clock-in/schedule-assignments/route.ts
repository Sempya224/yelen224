import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Même pattern que les autres routes app/api/institution/clock-in/*.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const employeeId = new URL(req.url).searchParams.get("employeeId");
  let query = sb
    .from("employee_schedule_assignments")
    .select("id,employee_id,work_schedule_id,date_debut,date_fin,created_at")
    .eq("institution_id", membre.institutionId)
    .order("date_debut", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assignments: data ?? [] });
}

// Créer une nouvelle affectation clôture automatiquement l'affectation
// ouverte existante de l'employé (date_fin = veille de la nouvelle
// date_debut) — évite d'imposer un aller-retour "fermer puis créer" à
// l'admin. L'index unique partiel (20260805000006) garantit qu'il n'y a
// jamais plus d'une affectation ouverte à la fois ; cette route respecte
// cette contrainte explicitement plutôt que de compter sur l'erreur SQL.
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const employeeId = body?.employeeId;
  const workScheduleId = body?.workScheduleId;
  const dateDebut = body?.dateDebut;

  if (typeof employeeId !== "string") return NextResponse.json({ error: "employeeId requis" }, { status: 400 });
  if (typeof workScheduleId !== "string") return NextResponse.json({ error: "workScheduleId requis" }, { status: 400 });
  if (typeof dateDebut !== "string" || !DATE_REGEX.test(dateDebut)) {
    return NextResponse.json({ error: "dateDebut invalide (AAAA-MM-JJ)" }, { status: 400 });
  }

  const { data: employe } = await sb.from("employees").select("id").eq("id", employeeId).eq("institution_id", membre.institutionId).maybeSingle();
  if (!employe) return NextResponse.json({ error: "Employé introuvable pour cette institution" }, { status: 404 });

  const { data: horaire } = await sb.from("work_schedules").select("id").eq("id", workScheduleId).eq("institution_id", membre.institutionId).maybeSingle();
  if (!horaire) return NextResponse.json({ error: "Horaire introuvable pour cette institution" }, { status: 404 });

  const { data: ouverte } = await sb
    .from("employee_schedule_assignments")
    .select("id,date_debut")
    .eq("employee_id", employeeId)
    .is("date_fin", null)
    .maybeSingle();

  if (ouverte) {
    if (dateDebut <= ouverte.date_debut) {
      return NextResponse.json(
        { error: "La nouvelle date de début doit être après le début de l'affectation en cours" },
        { status: 400 }
      );
    }
    const veille = new Date(dateDebut);
    veille.setDate(veille.getDate() - 1);
    const { error: closeError } = await sb
      .from("employee_schedule_assignments")
      .update({ date_fin: veille.toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq("id", ouverte.id);
    if (closeError) return NextResponse.json({ error: closeError.message }, { status: 500 });
  }

  const { data, error } = await sb
    .from("employee_schedule_assignments")
    .insert({
      institution_id: membre.institutionId,
      employee_id: employeeId,
      work_schedule_id: workScheduleId,
      date_debut: dateDebut,
      membre_id: membre.membreId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "affectation_horaire_creee",
    cibleTable: "employee_schedule_assignments",
    cibleId: data.id,
    details: { employeeId, workScheduleId, dateDebut, remplaceAffectation: ouverte?.id ?? null },
    req,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("employee_schedule_assignments").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Affectation introuvable pour cette institution" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.dateFin === "string" && DATE_REGEX.test(body.dateFin)) updates.date_fin = body.dateFin;
  if (body?.dateFin === null) updates.date_fin = null;
  if (typeof body?.workScheduleId === "string") {
    const { data: horaire } = await sb.from("work_schedules").select("id").eq("id", body.workScheduleId).eq("institution_id", membre.institutionId).maybeSingle();
    if (!horaire) return NextResponse.json({ error: "Horaire introuvable pour cette institution" }, { status: 404 });
    updates.work_schedule_id = body.workScheduleId;
  }

  const { error } = await sb.from("employee_schedule_assignments").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "affectation_horaire_modifiee",
    cibleTable: "employee_schedule_assignments",
    cibleId: id,
    details: { champs: Object.keys(updates).filter((k) => k !== "updated_at") },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("employee_schedule_assignments").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Affectation introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb.from("employee_schedule_assignments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "affectation_horaire_supprimee",
    cibleTable: "employee_schedule_assignments",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
