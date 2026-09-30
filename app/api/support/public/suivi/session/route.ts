import { NextRequest, NextResponse } from "next/server";
import { obtenirTicketParToken } from "@/lib/supportTickets";
import { SUPPORT_SUIVI_COOKIE_NAME as COOKIE_NAME } from "@/lib/supportTicketsConstants";

// Durée fixe alignée sur celle du token de suivi (30 jours) — simplification
// assumée : si le token a été émis plus tôt et expire avant, le cookie
// survit un peu plus longtemps que lui, mais chaque lecture réelle
// (obtenirTicketParToken) revérifie `expires_at` côté serveur à chaque
// appel — un cookie "en retard" échoue proprement, jamais une faille.
const DUREE_COOKIE_S = 30 * 24 * 60 * 60;

// Échange un token de suivi (reçu par email OU juste après vérification)
// contre un cookie httpOnly — le token ne doit jamais rester dans l'URL
// au-delà de ce tout premier accès (fuite Referer/historique/logs, voir
// docs/support-center/public-support-technical-design.md §8). GET conçu
// pour être atteint par une navigation directe (lien email ou redirection
// post-vérification), pas par un fetch() JSON.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const valide = token ? await obtenirTicketParToken(token) : null;
  if (!valide) {
    return NextResponse.redirect(new URL("/support/suivi?erreur=1", request.url));
  }

  const response = NextResponse.redirect(new URL("/support/suivi", request.url));
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DUREE_COOKIE_S,
    path: "/",
  });
  return response;
}
