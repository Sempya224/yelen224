import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// Liste/recherche d'institutions pour la console de vérification (Trust
// Lot 2.5) — gardée exclusivement par institutions.verify, jamais
// institutions.manage (règle CEO explicite : ne pas réutiliser la
// permission de gestion opérationnelle pour l'accès à la vérification).
// Route de LECTURE seule — le dossier complet et les décisions vivent sur
// app/api/admin/institutions/[id]/verification/*.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "institutions.verify");
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const limitParsed = parseInt(searchParams.get("limit") || "30", 10);
    const limit = Math.min(Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : 30, 100);

    let query = sb
      .from("institutions")
      .select("id, name, statut, statut_juridique, secteur, badge_verifie, niveau_confiance, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
