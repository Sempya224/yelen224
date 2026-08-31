import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Miroir de app/api/institution/membres/route.ts, appliqué à `employees`
// (profil RH Clock In Shift — table séparée de institution_membres, voir
// CLAUDE.md /chantier-clock-in-shift). Aucune policy RLS publique sur
// employees/employee_credentials (migrations 20260805000002/000004),
// accès exclusivement via cette route en service_role.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// PIN employé à 4 chiffres (kiosque de pointage, entrée rapide) —
// distinct des 6 chiffres du PIN institution_membres (dashboard), voir
// PIN_REGEX dans app/api/institution/membres/route.ts.
const PIN_REGEX = /^\d{4}$/;
const EMPLOYEE_ROLES = ["admin", "manager", "employe"] as const;
const EMPLOYEE_STATUTS = ["actif", "suspendu", "en_conge", "archive", "desactive", "teletravail", "mission"] as const;

function isEmployeeRole(value: unknown): value is (typeof EMPLOYEE_ROLES)[number] {
  return typeof value === "string" && (EMPLOYEE_ROLES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.read_full")) {
    return NextResponse.json({ error: "Accès réservé à ce module" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("employees")
    .select("id,matricule,nom,prenom,telephone,email,department_id,poste,manager_id,date_embauche,statut,role,created_at,employee_credentials(doit_changer_pin)")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aplatit employee_credentials(doit_changer_pin) (relation 1:1, mais
  // PostgREST renvoie un tableau) en un simple booléen — utilisé par
  // l'alerte RH "PIN pas encore changé" de la refonte Employés
  // (05/08/2026). Jamais le PIN lui-même, seulement ce flag.
  const employees = (data ?? []).map((e) => {
    const { employee_credentials, ...rest } = e;
    const cred = Array.isArray(employee_credentials) ? employee_credentials[0] : employee_credentials;
    return { ...rest, doit_changer_pin: cred?.doit_changer_pin ?? false };
  });

  return NextResponse.json({ employees, role: membre.role });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "employe_acces_refuse", cibleTable: "employees",
      details: { role: membre.role, methode: "POST" },
      req,
    });
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const matricule = body?.matricule;
  const nom = body?.nom;
  const prenom = body?.prenom;
  const dateEmbauche = body?.dateEmbauche;
  const role = body?.role;
  const pin = body?.pin;
  // Sans indication contraire, identifiant de connexion = matricule (même
  // valeur par défaut, voir schéma) — un admin peut le distinguer
  // explicitement si besoin.
  const identifiant = typeof body?.identifiant === "string" && body.identifiant.trim() ? body.identifiant.trim() : matricule;

  if (typeof matricule !== "string" || !matricule.trim()) return NextResponse.json({ error: "Matricule requis" }, { status: 400 });
  if (typeof nom !== "string" || !nom.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (typeof prenom !== "string" || !prenom.trim()) return NextResponse.json({ error: "Prénom requis" }, { status: 400 });
  if (typeof dateEmbauche !== "string" || !dateEmbauche.trim()) return NextResponse.json({ error: "Date d'embauche requise" }, { status: 400 });
  if (!isEmployeeRole(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
  if (typeof pin !== "string" || !PIN_REGEX.test(pin)) return NextResponse.json({ error: "Le PIN doit contenir exactement 4 chiffres" }, { status: 400 });

  const { data: matriculeExistant } = await sb
    .from("employees")
    .select("id")
    .eq("institution_id", membre.institutionId)
    .eq("matricule", matricule.trim())
    .maybeSingle();
  if (matriculeExistant) return NextResponse.json({ error: "Ce matricule est déjà utilisé" }, { status: 409 });

  const { data: identifiantExistant } = await sb
    .from("employee_credentials")
    .select("id")
    .eq("institution_id", membre.institutionId)
    .eq("identifiant", identifiant)
    .maybeSingle();
  if (identifiantExistant) return NextResponse.json({ error: "Cet identifiant est déjà utilisé" }, { status: 409 });

  const { data: employe, error: employeError } = await sb
    .from("employees")
    .insert({
      institution_id: membre.institutionId,
      matricule: matricule.trim(),
      nom: nom.trim(),
      prenom: prenom.trim(),
      telephone: typeof body?.telephone === "string" && body.telephone.trim() ? body.telephone.trim() : null,
      email: typeof body?.email === "string" && body.email.trim() ? body.email.trim() : null,
      department_id: typeof body?.departmentId === "string" ? body.departmentId : null,
      poste: typeof body?.poste === "string" && body.poste.trim() ? body.poste.trim() : null,
      manager_id: typeof body?.managerId === "string" ? body.managerId : null,
      date_embauche: dateEmbauche,
      role,
    })
    .select("id")
    .single();
  if (employeError) return NextResponse.json({ error: employeError.message }, { status: 500 });

  const pinHash = await bcrypt.hash(pin, 12);
  const { error: credError } = await sb.from("employee_credentials").insert({
    institution_id: membre.institutionId,
    employee_id: employe.id,
    identifiant,
    pin_hash: pinHash,
    doit_changer_pin: true,
  });
  if (credError) {
    // Rollback manuel : pas de transaction multi-table via supabase-js,
    // même limite que partout ailleurs dans ce projet (ex. membres/route.ts
    // n'a qu'un insert). Sans ça, un employé sans identifiants utilisables
    // resterait orphelin en base.
    await sb.from("employees").delete().eq("id", employe.id);
    return NextResponse.json({ error: credError.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "employe_cree",
    cibleTable: "employees",
    cibleId: employe.id,
    details: { matricule: matricule.trim(), identifiant, role },
    req,
  });

  return NextResponse.json({ ok: true, id: employe.id });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "employe_acces_refuse", cibleTable: "employees",
      details: { role: membre.role, methode: "PATCH" },
      req,
    });
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("employees").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Employé introuvable pour cette institution" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.nom === "string" && body.nom.trim()) updates.nom = body.nom.trim();
  if (typeof body?.prenom === "string" && body.prenom.trim()) updates.prenom = body.prenom.trim();
  if (typeof body?.telephone === "string") updates.telephone = body.telephone.trim() || null;
  if (typeof body?.email === "string") updates.email = body.email.trim() || null;
  if (typeof body?.departmentId === "string" || body?.departmentId === null) updates.department_id = body.departmentId;
  if (typeof body?.poste === "string") updates.poste = body.poste.trim() || null;
  if (typeof body?.managerId === "string" || body?.managerId === null) updates.manager_id = body.managerId;
  if (isEmployeeRole(body?.role)) updates.role = body.role;
  if (typeof body?.statut === "string" && (EMPLOYEE_STATUTS as readonly string[]).includes(body.statut)) updates.statut = body.statut;

  const { error } = await sb.from("employees").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (typeof body?.pin === "string") {
    if (!PIN_REGEX.test(body.pin)) return NextResponse.json({ error: "Le PIN doit contenir exactement 4 chiffres" }, { status: 400 });
    const pinHash = await bcrypt.hash(body.pin, 12);
    const { error: credError } = await sb
      .from("employee_credentials")
      .update({ pin_hash: pinHash, doit_changer_pin: true, failed_attempts: 0, locked_until: null })
      .eq("employee_id", id);
    if (credError) return NextResponse.json({ error: credError.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "employe_modifie",
    cibleTable: "employees",
    cibleId: id,
    details: { champs: Object.keys(updates).filter((k) => k !== "updated_at") },
    req,
  });

  return NextResponse.json({ ok: true });
}

// Pas de vrai DELETE : employees n'est jamais supprimé physiquement
// (décision schéma 05/08/2026, attendance_logs/daily_attendance
// référencent employee_id en ON DELETE RESTRICT). "Suppression" = statut
// archive.
export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "clock_in.write")) {
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId,
      membreNom: await getMembreNomPourJournal(membre.membreId),
      action: "employe_acces_refuse", cibleTable: "employees",
      details: { role: membre.role, methode: "DELETE" },
      req,
    });
    return NextResponse.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: cible } = await sb.from("employees").select("id,institution_id").eq("id", id).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId) {
    return NextResponse.json({ error: "Employé introuvable pour cette institution" }, { status: 404 });
  }

  const { error } = await sb
    .from("employees")
    .update({ statut: "archive", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "employe_archive",
    cibleTable: "employees",
    cibleId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
