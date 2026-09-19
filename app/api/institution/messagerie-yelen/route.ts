import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { trouverOuCreerConversationActive, type StatutConversationYelen } from "@/lib/messagerieYelenInstitution";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Statut = StatutConversationYelen;

// Conversation institution ↔ support Yelen — cycle de vie réel depuis le
// Lot 2 (21/08/2026, retour Bryan) : "nouvelle" → "prise_en_charge" →
// "fermee" DÉFINITIVE, jamais réouverte. Un message envoyé alors qu'aucune
// conversation active n'existe (jamais eu, ou la dernière est fermée) en
// ouvre une toute neuve — messages_yelen_institution_conversations (au
// plus une non fermée par institution, contrainte en base, voir migration
// 20260821000013). mirroring messages_yelen_citoyen côté citoyen
// (lib/messagerie.ts), qui suit le même principe via rdv.
async function trouverConversationActive(institutionId: string) {
  const { data } = await sb
    .from("messages_yelen_institution_conversations")
    .select("id,statut")
    .eq("institution_id", institutionId)
    .neq("statut", "fermee")
    .maybeSingle();
  return data as { id: string; statut: Statut } | null;
}

async function trouverConversationRecente(institutionId: string) {
  const { data } = await sb
    .from("messages_yelen_institution_conversations")
    .select("id,statut")
    .eq("institution_id", institutionId)
    .order("cree_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; statut: Statut } | null;
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  if (searchParams.get("compte") === "1") {
    const conv = await trouverConversationActive(authInstId);
    if (!conv) return NextResponse.json({ non_lus: 0 });
    const { count } = await sb
      .from("messages_yelen_institution")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conv.id)
      .eq("expediteur", "yelen")
      .eq("lu", false);
    return NextResponse.json({ non_lus: count ?? 0 });
  }

  // La conversation la plus récente (active OU fermée) reste affichée telle
  // quelle tant qu'aucun nouveau message n'a créé la suivante — permet de
  // voir la résolution d'une conversation qui vient d'être fermée, jamais
  // un écran vide brutal.
  const conv = await trouverConversationRecente(authInstId);
  if (!conv) return NextResponse.json({ messages: [], etat: null });

  const { data, error } = await sb
    .from("messages_yelen_institution")
    .select("id,expediteur,contenu,image_url,type,lu,cree_le")
    .eq("conversation_id", conv.id)
    .order("cree_le", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb
    .from("messages_yelen_institution")
    .update({ lu: true })
    .eq("conversation_id", conv.id)
    .eq("expediteur", "yelen")
    .eq("lu", false);

  // "En attente depuis" = le dernier message réel du fil, jamais une
  // horloge côté client — n'a de sens que si personne n'a encore pris en
  // charge.
  const attenteDepuis = conv.statut === "nouvelle" && data && data.length > 0 ? data[data.length - 1].cree_le : null;

  return NextResponse.json({ messages: data ?? [], etat: { statut: conv.statut, attente_depuis: attenteDepuis } });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (!contenu) return NextResponse.json({ error: "Contenu requis" }, { status: 400 });

  // Jamais bloqué côté institution — si aucune conversation active
  // n'existe (jamais eu, ou la précédente est fermée pour de bon), on en
  // ouvre une nouvelle plutôt que de refuser l'envoi.
  const conv = await trouverOuCreerConversationActive(sb, authInstId).catch(() => null);
  if (!conv) return NextResponse.json({ error: "Impossible d'ouvrir la conversation." }, { status: 500 });

  const { error } = await sb.from("messages_yelen_institution").insert({
    institution_id: authInstId,
    conversation_id: conv.id,
    membre_id: membre.membreId,
    expediteur: "institution",
    contenu,
    type: "texte",
    lu: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
