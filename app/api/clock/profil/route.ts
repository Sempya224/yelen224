import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getAuthenticatedEmployee } from "@/lib/employeeAuth";

// Lot 1 "Profil employé" (brief CEO 10/09/2026) — uniquement des données
// réelles déjà gérées par l'institution (employees.poste/department_id/
// manager_id/date_embauche/statut) + le changement de PIN, seul morceau
// "contrôle direct employé" qui a déjà son backend (doit_changer_pin,
// jamais consommé côté portail jusqu'ici). Tout le reste de la vision CEO
// (contact personnel, demandes de correction, vérification d'identité,
// audit trail visible employé) nécessite de nouvelles colonnes/tables —
// hors périmètre de ce lot, décision explicite de Bryan.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PIN_REGEX = /^\d{4}$/;

export async function GET(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: fiche } = await sb
    .from("employees")
    .select("matricule,nom,prenom,poste,department_id,manager_id,date_embauche,statut,role")
    .eq("id", employee.employeeId)
    .maybeSingle();
  if (!fiche) return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });

  const [{ data: departement }, { data: manager }, { data: credentials }] = await Promise.all([
    fiche.department_id
      ? sb.from("departments").select("nom").eq("id", fiche.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fiche.manager_id
      ? sb.from("employees").select("nom,prenom").eq("id", fiche.manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("employee_credentials").select("doit_changer_pin").eq("employee_id", employee.employeeId).maybeSingle(),
  ]);

  return NextResponse.json({
    matricule: fiche.matricule,
    nom: fiche.nom,
    prenom: fiche.prenom,
    poste: fiche.poste,
    departement: departement?.nom ?? null,
    manager: manager ? `${manager.prenom} ${manager.nom}` : null,
    dateEmbauche: fiche.date_embauche,
    statut: fiche.statut,
    role: fiche.role,
    doitChangerPin: credentials?.doit_changer_pin ?? false,
  });
}

// Changement de PIN self-service — exige toujours le PIN actuel (même
// lors d'un changement forcé après première connexion, doit_changer_pin
// n'est pas un blanc-seing : l'employé doit prouver qu'il connaît déjà le
// PIN qui vient de lui être communiqué).
export async function POST(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pinActuel = body?.pinActuel;
  const nouveauPin = body?.nouveauPin;
  if (typeof pinActuel !== "string" || !PIN_REGEX.test(pinActuel)) {
    return NextResponse.json({ error: "PIN actuel invalide" }, { status: 400 });
  }
  if (typeof nouveauPin !== "string" || !PIN_REGEX.test(nouveauPin)) {
    return NextResponse.json({ error: "Le nouveau PIN doit contenir exactement 4 chiffres" }, { status: 400 });
  }
  if (nouveauPin === pinActuel) {
    return NextResponse.json({ error: "Le nouveau PIN doit être différent de l'actuel" }, { status: 400 });
  }

  const { data: credentials } = await sb
    .from("employee_credentials")
    .select("id,pin_hash")
    .eq("employee_id", employee.employeeId)
    .maybeSingle();
  if (!credentials) return NextResponse.json({ error: "Identifiants introuvables" }, { status: 404 });

  const valide = await bcrypt.compare(pinActuel, credentials.pin_hash);
  if (!valide) return NextResponse.json({ error: "PIN actuel incorrect" }, { status: 401 });

  const nouveauHash = await bcrypt.hash(nouveauPin, 12);
  const { error } = await sb
    .from("employee_credentials")
    .update({ pin_hash: nouveauHash, doit_changer_pin: false, failed_attempts: 0, locked_until: null })
    .eq("id", credentials.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
