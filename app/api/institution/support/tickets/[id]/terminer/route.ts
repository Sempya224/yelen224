import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { terminerParInstitution } from "@/lib/supportTickets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const { id } = await params;
  const result = await terminerParInstitution({ institutionId: membre.institutionId, ticketId: id, req: request });
  if (!result.ok) return NextResponse.json({ error: result.error, code: "TERMINER_ERROR" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
