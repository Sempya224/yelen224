import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { obtenirTicketInstitution } from "@/lib/supportTickets";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const { id } = await params;
  const ticket = await obtenirTicketInstitution(membre.institutionId, id);
  if (!ticket) return NextResponse.json({ error: "Conversation introuvable", code: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ticket });
}
