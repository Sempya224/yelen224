import { NextRequest, NextResponse } from "next/server";
import { obtenirTicketParToken } from "@/lib/supportTickets";
import { SUPPORT_SUIVI_COOKIE_NAME } from "@/lib/supportTicketsConstants";

// Support Public Yelen (24/09/2026) — lue par la page /support/suivi côté
// client (rafraîchissement manuel après envoi de message / fin de
// conversation), jamais atteinte directement par l'utilisateur. Voir
// docs/support-center/public-support-technical-design.md §8.2. Le
// chargement initial de la page passe par obtenirTicketParToken() en
// direct (Server Component), pas par cette route — évite un aller-retour
// réseau inutile au premier rendu.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SUPPORT_SUIVI_COOKIE_NAME)?.value ?? "";
  const ticket = token ? await obtenirTicketParToken(token) : null;
  if (!ticket) {
    return NextResponse.json({ ok: false, error: "Session de suivi expirée. Redemandez un lien depuis votre email." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ticket });
}
