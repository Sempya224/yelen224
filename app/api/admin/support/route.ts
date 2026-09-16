import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { fileAttenteAgent, obtenirTicketAgent, prendreEnCharge, envoyerMessageAgent, resoudreTicket, cloturerTicket } from "@/lib/supportTickets";
import { isSupportStatut } from "@/lib/supportTicketsConstants";

// Console agent "Support Yelen" (04/09/2026) — file d'attente + fiche
// ticket + actions de cycle de vie. Même structure à une route/3 verbes
// que /api/admin/messagerie (GET liste ou détail, POST message, PATCH
// action) plutôt que des fichiers séparés par action.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function nomAgent(adminId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("admin_users").select("nom,prenom").eq("id", adminId).maybeSingle();
  return data ? [data.prenom, data.nom].filter(Boolean).join(" ") || "Agent Yelen" : "Agent Yelen";
}

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, "support.access");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const ticket = await obtenirTicketAgent(id);
      if (!ticket) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
      return NextResponse.json({ ticket });
    }

    const filtreStatut = searchParams.get("statut");
    const { items, compteurs } = await fileAttenteAgent(filtreStatut && isSupportStatut(filtreStatut) ? filtreStatut : undefined);
    return NextResponse.json({ items, compteurs });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authorizeAdmin(request, "support.access");
    const body = await request.json().catch(() => null);
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId : null;
    const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
    if (!ticketId || !contenu) return NextResponse.json({ error: "ticketId et contenu requis" }, { status: 400 });

    const agentNom = await nomAgent(session.adminId);
    const result = await envoyerMessageAgent({ agentId: session.adminId, agentNom, ticketId, contenu, req: request });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await authorizeAdmin(request, "support.access");
    const body = await request.json().catch(() => null);
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId : null;
    const action = body?.action as "prendre_en_charge" | "resoudre" | "cloturer" | undefined;
    if (!ticketId || !action) return NextResponse.json({ error: "ticketId et action requis" }, { status: 400 });

    const agentNom = await nomAgent(session.adminId);
    const params = { agentId: session.adminId, agentNom, ticketId, req: request };
    const result = action === "prendre_en_charge" ? await prendreEnCharge(params)
      : action === "resoudre" ? await resoudreTicket(params)
      : action === "cloturer" ? await cloturerTicket(params)
      : { ok: false as const, error: "Action inconnue" };

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
