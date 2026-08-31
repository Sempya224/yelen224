import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Miroir de app/api/admin/auth/me/route.ts — "qui suis-je" pour une session
// institution (JWT yelen224_institution_session), utilisé par les pages
// standalone /institution/* qui ont besoin de vérifier la session côté
// client avant de rendre du contenu réservé au personnel d'établissement.
export async function GET(request: NextRequest) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  return NextResponse.json({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    role: membre.role,
  });
}
