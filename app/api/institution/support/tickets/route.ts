import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { listerTicketsInstitution, creerTicketInstitution } from "@/lib/supportTickets";
import { isSupportCategorieInstitution } from "@/lib/supportTicketsConstants";

// Support Yelen institution (chantier "Support Yelen institution",
// 06/09/2026) — miroir exact de app/api/citoyen/support/tickets/route.ts,
// auth JWT custom (cookie) au lieu du Bearer token Supabase.
export async function GET(request: NextRequest) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const tickets = await listerTicketsInstitution(membre.institutionId);
  return NextResponse.json({ tickets });
}

export async function POST(request: NextRequest) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const categorie = body?.categorie;
  const sujet = typeof body?.sujet === "string" ? body.sujet.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (typeof categorie !== "string" || !isSupportCategorieInstitution(categorie)) {
    return NextResponse.json({ error: "Catégorie invalide.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!sujet || sujet.length > 150) {
    return NextResponse.json({ error: "Sujet requis (150 caractères max).", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Message requis (4000 caractères max).", code: "BAD_REQUEST" }, { status: 400 });
  }

  const result = await creerTicketInstitution({ institutionId: membre.institutionId, categorie, sujet, message, req: request });
  if (!result.ok) return NextResponse.json({ error: result.error, code: "CREATE_ERROR" }, { status: 500 });

  return NextResponse.json({ id: result.id, numeroPublic: result.numeroPublic });
}
