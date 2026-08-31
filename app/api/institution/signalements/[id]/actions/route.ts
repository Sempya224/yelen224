import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { assignerSignalement } from "@/lib/signalements";

// Signalements — Lot 1 (case management, 08/08/2026). Un seul POST
// discriminé par `action` — même forme que app/api/institution/clock-in/
// corrections/route.ts et le PATCH de paid-bookings/valider/route.ts.
//
// ⚠️ Chantier arbitrage Yelen (15/08/2026) : cette route ne garde QUE
// "assigner" (outil interne, ne décide rien). Toutes les actions qui
// décident de l'issue d'un dossier (changer_priorite, changer_statut,
// resoudre, cloturer, reouvrir, escalader, marquer_doublon) sont retirées
// — une institution ne peut plus être seule juge de son propre
// signalement (y compris ceux qu'elle dépose elle-même contre un
// citoyen). Ces actions vivent désormais exclusivement dans
// app/api/admin/signalements-cas/[id]/actions/route.ts (Yelen seul juge,
// décision transmise aux 2 parties par notification). Garde en place même
// si l'UI (SignalementsTab.tsx) ne montre plus ces boutons — défense en
// profondeur contre un appel direct à l'ancienne forme de la route.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;

  const { data: signalement } = await sb.from("signalements").select("id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!signalement) return NextResponse.json({ error: "Signalement introuvable pour cette institution" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const action = body?.action;

  const { data: membreRow } = await sb.from("institution_membres").select("prenom, nom").eq("id", membre.membreId).maybeSingle();
  const parMembre = { id: membre.membreId, nom: membreRow ? `${membreRow.prenom} ${membreRow.nom}` : "Membre" };

  if (action === "assigner") {
    if (!can(membre.role, "signalements.manage")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
    const assigneAMembreId = body?.assigneAMembreId;
    if (typeof assigneAMembreId !== "string" || !assigneAMembreId) return NextResponse.json({ error: "assigneAMembreId requis" }, { status: 400 });
    const resultat = await assignerSignalement({ signalementId: id, institutionId: membre.institutionId, assigneAMembreId, parMembre, req });
    return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
  }

  // Arbitrage réservé à Yelen (chantier 15/08/2026) : toute autre action
  // que "assigner" est refusée ici, y compris pour un dossier que cette
  // institution a elle-même déposé — voir app/api/admin/signalements-cas/
  // [id]/actions/route.ts.
  return NextResponse.json({ error: "Seule Yelen peut décider de l'issue d'un signalement — action non disponible côté institution." }, { status: 403 });
}
