import { NextRequest, NextResponse } from "next/server";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { envoyerMessageCitoyen } from "@/lib/supportTickets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const texte = typeof body?.texte === "string" ? body.texte.trim() : undefined;
  if (!texte || texte.length > 4000) {
    return NextResponse.json({ error: "Message requis (4000 caractères max).", code: "BAD_REQUEST" }, { status: 400 });
  }

  const { id } = await params;
  const result = await envoyerMessageCitoyen({ citoyenId: user.id, ticketId: id, texte, req: request });
  if (!result.ok) return NextResponse.json({ error: result.error, code: "SEND_ERROR" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
