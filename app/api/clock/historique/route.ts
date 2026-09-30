import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedEmployee } from "@/lib/employeeAuth";

// Historique personnel du portail employé (30 derniers jours calculés,
// même source que l'historique institution — daily_attendance, résumé
// précalculé par le job clock-in-daily-attendance). Self-service : scope
// toujours dérivé du JWT (employee.employeeId), jamais d'un paramètre de
// requête — un employé ne peut consulter que son propre historique.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await sb
    .from("daily_attendance")
    .select("id,date_jour,statut,heures_prevues_minutes,heures_travaillees_minutes,retard_minutes,premiere_entree,derniere_sortie,nombre_pointages")
    .eq("employee_id", employee.employeeId)
    .order("date_jour", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ records: data ?? [] });
}
