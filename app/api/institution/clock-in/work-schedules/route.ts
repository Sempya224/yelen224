import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Même pattern que app/api/institution/clock-in/employees/route.ts.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES_HORAIRE = ["fixe", "fractionne", "nuit", "variable"] as const;
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
const HEURE_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isTypeHoraire(value: unknown): value is (typeof TYPES_HORAIRE)[number] {
  return typeof value === "string" && (TYPES_HORAIRE as readonly string[]).includes(value);
}

// Validation manuelle (pas de zod dans ce projet) de la forme documentée en
// en-tête de 20260805000005_clock_in_work_schedules.sql — le CHECK SQL ne
// vérifie que la présence de la clé "jours", cette route est la seule
// barrière sur la structure interne.
function erreurPattern(pattern: unknown): string | null {
  if (typeof pattern !== "object" || pattern === null) return "pattern doit être un objet";
  const jours = (pattern as Record<string, unknown>).jours;
  if (typeof jours !== "object" || jours === null) return "pattern.jours doit être un objet";
  for (const jour of JOURS) {
    const config = (jours as Record<string, unknown>)[jour];
    if (typeof config !== "object" || config === null) return `pattern.jours.${jour} manquant ou invalide`;
    const { repos, segments } = config as Record<string, unknown>;
    if (typeof repos !== "boolean") return `pattern.jours.${jour}.repos doit être un booléen`;
    if (!Array.isArray(segments)) return `pattern.jours.${jour}.segments doit être un tableau`;
    for (const segment of segments) {
      if (typeof segment !== "object" || segment === null) return `segment invalide pour ${jour}`;
      const { debut, fin } = segment as Record<string, unknown>;
      if (typeof debut !== "string" || !HEURE_REGEX.test(debut)) return `heure de début invalide pour ${jour}`;
      if (typeof fin !== "string" || !HEURE_REGEX.test(fin)) return `heure de fin invalide pour ${jour}`;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("work_schedules")
    .select("id,nom,type_horaire,pattern,tolerance_retard_minutes,tolerance_depart_anticipe_minutes,pause_obligatoire_minutes,heures_sup_autorisees,heures_sup_seuil_minutes,actif,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workSchedules: data ?? [] });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nom = body?.nom;
  const typeHoraire = body?.typeHoraire;
  const pattern = body?.pattern;

  if (typeof nom !== "string" || !nom.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (!isTypeHoraire(typeHoraire)) return NextResponse.json({ error: "Type d'horaire invalide" }, { status: 400 });
  const erreur = erreurPattern(pattern);
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });

  const { data, error } = await sb
    .from("work_schedules")
    .insert({
      institution_id: membre.institutionId,
      nom: nom.trim(),
      type_horaire: typeHoraire,
      pattern,
      tolerance_retard_minutes: Number.isInteger(body?.toleranceRetardMinutes) ? body.toleranceRetardMinutes : 10,
      tolerance_depart_anticipe_minutes: Number.isInteger(body?.toleranceDepartAnticipeMinutes) ? body.toleranceDepartAnticipeMinutes : 0,
      pause_obligatoire_minutes: Number.isInteger(body?.pauseObligatoireMinutes) ? body.pauseObligatoireMinutes : 0,
      heures_sup_autorisees: body?.heuresSupAutorisees === true,
      heures_sup_seuil_minutes: Number.isInteger(body?.heuresSupSeuilMinutes) ? body.heuresSupSeuilMinutes : null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "horaire_cree",
    cibleTable: "work_schedules",
    cibleId: data.id,
    details: { nom: nom.trim(), typeHoraire },
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

  const { data: cible } = await sb.from("work_schedules").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Horaire introuvable pour cette institution" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
  if (isTypeHoraire(body?.typeHoraire)) updates.type_horaire = body.typeHoraire;
  if (body?.pattern !== undefined) {
    const erreur = erreurPattern(body.pattern);
    if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });
    updates.pattern = body.pattern;
  }
  if (Number.isInteger(body?.toleranceRetardMinutes)) updates.tolerance_retard_minutes = body.toleranceRetardMinutes;
  if (Number.isInteger(body?.toleranceDepartAnticipeMinutes)) updates.tolerance_depart_anticipe_minutes = body.toleranceDepartAnticipeMinutes;
  if (Number.isInteger(body?.pauseObligatoireMinutes)) updates.pause_obligatoire_minutes = body.pauseObligatoireMinutes;
  if (typeof body?.heuresSupAutorisees === "boolean") updates.heures_sup_autorisees = body.heuresSupAutorisees;
  if (Number.isInteger(body?.heuresSupSeuilMinutes) || body?.heuresSupSeuilMinutes === null) updates.heures_sup_seuil_minutes = body.heuresSupSeuilMinutes;
  if (typeof body?.actif === "boolean") updates.actif = body.actif;

  const { error } = await sb.from("work_schedules").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "horaire_modifie",
    cibleTable: "work_schedules",
    cibleId: id,
    details: { champs: Object.keys(updates).filter((k) => k !== "updated_at") },
    req,
  });

  return NextResponse.json({ ok: true });
}

// work_schedule_id est référencé par employee_schedule_assignments en ON
// DELETE RESTRICT (migration 20260805000006) — une suppression avec des
// affectations actives échoue côté Postgres (code 23503). On le détecte
// explicitement pour renvoyer un message clair plutôt qu'une erreur SQL
// brute au front.
export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("work_schedules").select("id,institution_id,nom").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Horaire introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb.from("work_schedules").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Cet horaire est encore affecté à des employés — réaffectez-les avant de le supprimer.", code: "SCHEDULE_IN_USE" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "horaire_supprime",
    cibleTable: "work_schedules",
    cibleId: id,
    details: { nom: cible.nom },
    req,
  });

  return NextResponse.json({ ok: true });
}
