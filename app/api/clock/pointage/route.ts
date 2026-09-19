import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedEmployee } from "@/lib/employeeAuth";

// Écrit dans attendance_logs (jamais dans daily_attendance — table
// résumée, recalculée par le job nocturne hors périmètre de cette route,
// voir CLAUDE.md /chantier-clock-in-shift). Un seul bouton "Pointer" côté
// portail employé : la direction (entree/sortie) est déduite du dernier
// pointage ACTIF de cet employé, pas envoyée par le client — évite un état
// désynchronisé si le portail a été fermé/rouvert entre deux actions.
//
// "Actif" = exclut les lignes marquées comme remplacées dans
// attendance_audit_logs.attendance_log_id_origine (mécanisme de correction
// 100% insert-only, attendance_logs est immuable au niveau base — voir
// 20260805000007_clock_in_attendance_logs.sql). Sans ce filtre, une
// correction historique fausserait la détection du prochain sens de
// pointage.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DUPLICATE_TAP_MS = 5000;

// Arrivée/départ (pas les pauses, décision Bryan 10/09/2026) passent par le
// scan du QR déjà affiché/imprimé par l'institution — voir
// ClockInShiftTab.tsx::clockPortalUrl, même contenu ("<APP_URL>/clock/<slug>").
// Parsing par pathname, jamais par host : reste valide que l'URL soit le
// lien de test local actuel ou APP_URL en prod.
function extraireSlugDepuisQr(payload: string): string | null {
  try {
    const url = new URL(payload);
    const match = url.pathname.match(/\/clock\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const employee = await getAuthenticatedEmployee(req);
  if (!employee) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Re-vérifié ici (pas seulement au login) : une session dure jusqu'à 12h,
  // un admin a pu suspendre/archiver l'employé entre-temps.
  const { data: fiche } = await sb
    .from("employees")
    .select("statut")
    .eq("id", employee.employeeId)
    .maybeSingle();
  if (!fiche || fiche.statut !== "actif") {
    return NextResponse.json({ error: "Compte employé inactif", code: "EMPLOYEE_INACTIVE" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const qrPayload: string | undefined = typeof body?.qr_payload === "string" ? body.qr_payload : undefined;
  let methode: "pin" | "qr" = "pin";
  if (qrPayload !== undefined) {
    const slugScanne = extraireSlugDepuisQr(qrPayload);
    if (!slugScanne) {
      return NextResponse.json({ error: "QR invalide, réessayez.", code: "QR_INVALID" }, { status: 400 });
    }
    const { data: inst } = await sb
      .from("institutions")
      .select("slug")
      .eq("id", employee.institutionId)
      .maybeSingle();
    if (!inst || inst.slug !== slugScanne) {
      return NextResponse.json({ error: "Ce QR ne correspond pas à votre établissement.", code: "QR_MISMATCH" }, { status: 400 });
    }
    methode = "qr";
  }

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
    .select("id,type_action,horodatage")
    .eq("employee_id", employee.employeeId)
    .order("horodatage", { ascending: false })
    .limit(1);
  if (supersededIds.length > 0) {
    dernierQuery = dernierQuery.not("id", "in", `(${supersededIds.join(",")})`);
  }
  const { data: dernier } = await dernierQuery.maybeSingle();

  if (dernier && Date.now() - new Date(dernier.horodatage).getTime() < DUPLICATE_TAP_MS) {
    return NextResponse.json(
      { error: "Pointage déjà enregistré il y a quelques secondes.", code: "DUPLICATE_TAP" },
      { status: 429 }
    );
  }

  const typeAction = !dernier || dernier.type_action === "sortie" ? "entree" : "sortie";

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || req.headers.get("x-real-ip") || null;

  const { data: nouveauLog, error } = await sb
    .from("attendance_logs")
    .insert({
      institution_id: employee.institutionId,
      employee_id: employee.employeeId,
      type_action: typeAction,
      methode,
      ip,
    })
    .select("id,type_action,horodatage")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    typeAction: nouveauLog.type_action,
    horodatage: nouveauLog.horodatage,
    message: nouveauLog.type_action === "entree" ? "Arrivée enregistrée" : "Départ enregistré",
  });
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
