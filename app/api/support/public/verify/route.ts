import { NextRequest, NextResponse } from "next/server";
import { verifierEtActiverTicketPublic } from "@/lib/supportTickets";

// Support Public Yelen (24/09/2026) — activation réelle, déclenchée
// UNIQUEMENT par le clic explicite du visiteur sur la page de confirmation
// (jamais par le simple chargement de /support/verifier?token=..., qui ne
// fait qu'un aperçu en lecture seule). Neutralise le risque de pré-clic
// automatique par un scanner d'email — voir
// docs/support-center/public-support-technical-design.md §7.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ ok: false, error: "Lien invalide ou expiré." }, { status: 400 });

  const result = await verifierEtActiverTicketPublic({ rawToken: token, req: request });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 410 });

  return NextResponse.json({ ok: true, numeroPublic: result.numeroPublic, rawTokenSuivi: result.rawTokenSuivi });
}
