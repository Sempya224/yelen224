import { NextRequest, NextResponse } from "next/server";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { obtenirTicketCitoyen } from "@/lib/supportTickets";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const { id } = await params;
  const ticket = await obtenirTicketCitoyen(user.id, id);
  if (!ticket) return NextResponse.json({ error: "Conversation introuvable", code: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ticket });
}
