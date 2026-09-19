import { NextRequest, NextResponse } from "next/server";
import { getEtatSessionCheckin, revoquerSessionCheckin, CHECKIN_COOKIE_NAME } from "@/lib/checkinAuth";

// POST → "Terminer ma session" (bouton explicite, arbitrage Bryan
// 13/09/2026) — révocation serveur immédiate, pas seulement l'effacement
// du cookie côté client.
export async function POST(req: NextRequest) {
  const etat = await getEtatSessionCheckin(req);
  if (etat.etat === "ok" || etat.etat === "verrouillee") {
    await revoquerSessionCheckin(etat.ctx.sid, "logout_explicite");
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete(CHECKIN_COOKIE_NAME);
  return response;
}
