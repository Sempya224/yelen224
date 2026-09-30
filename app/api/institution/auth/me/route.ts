import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Miroir de app/api/admin/auth/me/route.ts — "qui suis-je" pour une session
// institution (JWT yelen224_institution_session), utilisé par les pages
// standalone /institution/* qui ont besoin de vérifier la session côté
// client avant de rendre du contenu réservé au personnel d'établissement.
//
// name/slug ajoutés (30/09/2026, chantier Legal Center Guest/Authenticated)
// pour app/(legal)/_components/LegalHeader.tsx — même besoin côté
// institution que côté citoyen (nom affiché + lien retour dashboard).
// Service role comme app/api/institution/profile/route.ts : une
// institution pas encore `validee` n'est pas couverte par la policy RLS
// anon, et cette route doit rester utilisable avant validation.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(request: NextRequest) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data } = await sb.from("institutions").select("name,slug").eq("id", membre.institutionId).maybeSingle();

  return NextResponse.json({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    role: membre.role,
    name: data?.name ?? null,
    slug: data?.slug ?? null,
  });
}
