import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";

// Module Collaboration — Lot D (16/09/2026). Réactions à types fermés —
// jamais un emoji Unicode libre (charte Yelen), rendues en SVG côté UI.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TYPES_REACTION = ["pouce", "coeur", "valide", "attention"] as const;
type TypeReaction = (typeof TYPES_REACTION)[number];
function estTypeReaction(v: unknown): v is TypeReaction { return typeof v === "string" && (TYPES_REACTION as readonly string[]).includes(v); }

async function verifierAppartenance(conversationId: string, messageId: string, membreId: string) {
  const { data: participation } = await sb.from("collab_conversation_membres").select("id").eq("conversation_id", conversationId).eq("membre_id", membreId).eq("statut", "active").maybeSingle();
  if (!participation) return false;
  const { data: message } = await sb.from("collab_messages").select("id").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle();
  return !!message;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "collaboration.send", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id, messageId } = await params;

  const body = await req.json().catch(() => null);
  if (!estTypeReaction(body?.type_reaction)) return NextResponse.json({ error: "Réaction invalide." }, { status: 400 });

  if (!(await verifierAppartenance(id, messageId, membre.membreId))) {
    return NextResponse.json({ error: "Ce message est introuvable ou vous n'y avez plus accès." }, { status: 404 });
  }

  const { error } = await sb.from("collab_message_reactions").insert({ message_id: messageId, membre_id: membre.membreId, type_reaction: body.type_reaction });
  if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 }); // 23505 = déjà réagi avec ce type, silencieux

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id, messageId } = await params;
  const typeReaction = new URL(req.url).searchParams.get("type_reaction");
  if (!estTypeReaction(typeReaction)) return NextResponse.json({ error: "Réaction invalide." }, { status: 400 });

  // Revue critique 16/09/2026 (2e passage) : alignée sur POST — même si on
  // ne retire jamais que SA PROPRE réaction (aucun risque d'accès à autrui),
  // l'incohérence laissait la porte ouverte à un appel direct depuis une
  // conversation qu'on a quittée.
  if (!(await verifierAppartenance(id, messageId, membre.membreId))) {
    return NextResponse.json({ error: "Ce message est introuvable ou vous n'y avez plus accès." }, { status: 404 });
  }

  const { error } = await sb.from("collab_message_reactions").delete().eq("message_id", messageId).eq("membre_id", membre.membreId).eq("type_reaction", typeReaction);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
