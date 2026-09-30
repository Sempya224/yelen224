import { NextRequest, NextResponse } from "next/server";
import { envoyerMessageVisiteur } from "@/lib/supportTickets";
import { SUPPORT_SUIVI_COOKIE_NAME } from "@/lib/supportTicketsConstants";

// Support Public Yelen (24/09/2026) — réponse du visiteur sur une
// conversation déjà prise en charge par un agent (même règle que
// envoyerMessageCitoyen, appliquée par envoyerMessageVisiteur elle-même).
// Voir docs/support-center/public-support-technical-design.md §8.3.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SUPPORT_SUIVI_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Session de suivi expirée. Redemandez un lien depuis votre email." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const texte = typeof body?.texte === "string" ? body.texte.trim() : "";
  if (!texte || texte.length > 4000) {
    return NextResponse.json({ ok: false, error: "Message requis (4000 caractères maximum)." }, { status: 400 });
  }

  const result = await envoyerMessageVisiteur({ rawToken: token, texte, req: request });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
