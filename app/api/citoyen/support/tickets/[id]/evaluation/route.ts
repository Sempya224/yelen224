import { NextRequest, NextResponse } from "next/server";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { enregistrerEvaluationCitoyen } from "@/lib/supportTickets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "number" ? body.note : NaN;
  const raisons = Array.isArray(body?.raisons) ? body.raisons.filter((r: unknown): r is string => typeof r === "string") : [];
  const commentaire = typeof body?.commentaire === "string" ? body.commentaire : null;

  const { id } = await params;
  const result = await enregistrerEvaluationCitoyen({ citoyenId: user.id, ticketId: id, note, raisons, commentaire, req: request });
  if (!result.ok) return NextResponse.json({ error: result.error, code: "EVALUATION_ERROR" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
