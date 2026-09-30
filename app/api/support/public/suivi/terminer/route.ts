import { NextRequest, NextResponse } from "next/server";
import { terminerParVisiteur } from "@/lib/supportTickets";
import { SUPPORT_SUIVI_COOKIE_NAME } from "@/lib/supportTicketsConstants";

// Support Public Yelen (24/09/2026) — équivalent visiteur de
// terminerParCitoyen()/terminerParInstitution() : le visiteur peut mettre
// fin à sa conversation même encore en file d'attente. Idempotent (voir
// terminerParVisiteur), jamais d'erreur pour une action qui a de toute
// façon abouti au résultat voulu.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SUPPORT_SUIVI_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Session de suivi expirée. Redemandez un lien depuis votre email." }, { status: 401 });
  }

  const result = await terminerParVisiteur({ rawToken: token, req: request });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
