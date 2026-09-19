import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Identité entreprise affichée sur l'écran de login /clock/[slug], avant
// toute authentification — name/logo sont déjà publics ailleurs (fiche
// institution citoyenne), donc aucune donnée sensible exposée ici. Route
// distincte de /api/clock/auth/login : celle-ci ne vérifie aucun credential,
// juste un lookup d'affichage.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || !slug.trim()) {
    return NextResponse.json({ error: "Slug requis" }, { status: 400 });
  }

  const { data: institution } = await supabaseAdmin
    .from("institutions")
    .select("name, logo, ville")
    .eq("slug", slug.trim())
    .maybeSingle();

  if (!institution) {
    return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  }

  return NextResponse.json({ name: institution.name, logo: institution.logo, ville: institution.ville });
}
