import { NextRequest, NextResponse } from "next/server";
import { GEO_BYPASS_COOKIE, timingSafeEqual } from "@/lib/geoAccess";

// Accès équipe technique / outils internes à la restriction géographique
// de pré-lancement (mission sécurité, 09/08/2026) — "architecture propre
// plutôt que des exceptions sauvages dans le code" (brief CEO) : pas d'IP
// codée en dur, un token secret (GEO_BYPASS_TOKEN, à définir par Bryan
// dans Netlify — jamais commité) pose un cookie de contournement.
//
// GET /api/internal/geo-bypass?token=... — jamais de POST/formulaire,
// pensé pour être visité une fois manuellement (lien partagé en interne),
// pas pour être appelé par le front.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const expected = process.env.GEO_BYPASS_TOKEN;

  if (!expected || !token || !timingSafeEqual(token, expected)) {
    // Jamais indiquer si le token existe/est proche — même 404 générique
    // que si la route n'existait pas.
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(GEO_BYPASS_COOKIE, expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 jours
  });
  return response;
}
