import { NextRequest, NextResponse } from "next/server";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { terminerParCitoyen } from "@/lib/supportTickets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const { id } = await params;
  const result = await terminerParCitoyen({ citoyenId: user.id, ticketId: id, req: request });
  if (!result.ok) return NextResponse.json({ error: result.error, code: "TERMINER_ERROR" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
