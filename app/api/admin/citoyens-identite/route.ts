import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// File de vérification d'identité citoyen (pipeline réel, 28/08/2026) —
// remplace l'ancienne auto-vérification instantanée. Filtre par défaut sur
// "en_attente" (la file de travail réelle) ; `statut` accepte aussi
// verifiee/refusee pour consulter l'historique des décisions déjà prises.
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, "citoyens.verify");

    const { searchParams } = new URL(request.url);
    const statut = searchParams.get("statut") || "en_attente";
    const search = searchParams.get("search") || "";

    let query = supabaseAdmin
      .from("users")
      .select("id, nom, prenom, phone, cin_soumis_le, cin_statut, identite_verifiee, cin_examine_le")
      .not("cin_soumis_le", "is", null)
      .order("cin_soumis_le", { ascending: false })
      .limit(100);

    if (statut === "verifiee") query = query.eq("identite_verifiee", true);
    else if (statut === "refusee") query = query.eq("cin_statut", "refusee");
    else query = query.eq("cin_statut", "en_attente");

    if (search) {
      query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
