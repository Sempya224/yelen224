import { NextRequest, NextResponse } from "next/server";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { listerTicketsCitoyen, creerTicket } from "@/lib/supportTickets";
import { isSupportCategorie, type SupportContexteType } from "@/lib/supportTicketsConstants";

// Support Yelen — Support Home citoyen (04/09/2026). GET liste "Mes
// demandes", POST crée un nouveau ticket (statut attente_agent forcé
// côté serveur, voir lib/supportTickets.ts — jamais accepté du client).
export async function GET(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const tickets = await listerTicketsCitoyen(user.id);
  return NextResponse.json({ tickets });
}

export async function POST(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const categorie = body?.categorie;
  const sujet = typeof body?.sujet === "string" ? body.sujet.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const contexte = body?.contexte as { type: SupportContexteType; id: string } | undefined;

  if (typeof categorie !== "string" || !isSupportCategorie(categorie)) {
    return NextResponse.json({ error: "Catégorie invalide.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!sujet || sujet.length > 150) {
    return NextResponse.json({ error: "Sujet requis (150 caractères max).", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Message requis (4000 caractères max).", code: "BAD_REQUEST" }, { status: 400 });
  }

  const result = await creerTicket({
    citoyenId: user.id, categorie, sujet, message,
    contexte: contexte && contexte.type && contexte.id ? contexte : null,
    req: request,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: "CREATE_ERROR" }, { status: 500 });

  return NextResponse.json({ id: result.id, numeroPublic: result.numeroPublic });
}
