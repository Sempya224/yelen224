import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedEmployee } from "@/lib/employeeAuth";

// Permet au portail /clock/[slug] de savoir, au chargement de la page, si
// une session employé valide existe déjà (cookie yelen224_employee_session)
// avant d'afficher le formulaire de connexion — évite de redemander
// Identifiant+PIN à chaque rechargement pendant les 12h de validité du JWT.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data } = await sb.from("employees").select("nom,prenom,statut").eq("id", employee.employeeId).maybeSingle();
  if (!data || data.statut !== "actif") {
    return NextResponse.json({ error: "Compte employé inactif", code: "EMPLOYEE_INACTIVE" }, { status: 403 });
  }

  return NextResponse.json({ employeeId: employee.employeeId, role: employee.role, nom: data.nom, prenom: data.prenom });
}
