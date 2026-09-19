import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Module Collaboration — Lot C (16/09/2026). Vue "Mentions" : tous les
// messages où l'appelant a été @mentionné, toutes conversations
// confondues. GET ne marque RIEN comme lu (sinon un simple polling de
// badge effacerait silencieusement le compteur) — PATCH dédié, appelé
// explicitement à l'ouverture du panneau côté client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data: mentions, error } = await sb
    .from("collab_mentions")
    .select("id,message_id,lu,cree_le,collab_messages(id,contenu,supprime_le,auteur_membre_id,conversation_id,parent_message_id,institution_membres(prenom,nom))")
    .eq("membre_id", membre.membreId)
    .order("cree_le", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conversationIds = new Set<string>();
  const lignes = (mentions ?? []).map(m => {
    const msg = Array.isArray(m.collab_messages) ? m.collab_messages[0] : m.collab_messages;
    if (msg) conversationIds.add(msg.conversation_id);
    return { mention: m, msg };
  });

  // Revue critique 16/09/2026 : une mention reste en base même après qu'on
  // ait quitté/été retiré de la conversation où elle a eu lieu — sans ce
  // filtre, la vue Mentions restait un accès permanent au contenu d'un
  // groupe qu'on ne devrait plus pouvoir consulter (même faille que
  // /recherche corrige déjà en revérifiant la participation active à
  // chaque appel, jamais une fois pour toutes).
  const { data: participationsActives } = conversationIds.size
    ? await sb.from("collab_conversation_membres").select("conversation_id").eq("membre_id", membre.membreId).eq("statut", "active").in("conversation_id", [...conversationIds])
    : { data: [] as { conversation_id: string }[] };
  const conversationsAccessibles = new Set((participationsActives ?? []).map(p => p.conversation_id));

  const { data: conversations } = conversationIds.size
    ? await sb.from("collab_conversations").select("id,type,nom").in("id", [...conversationIds])
    : { data: [] as { id: string; type: string; nom: string | null }[] };
  const nomConvParId = new Map((conversations ?? []).map(c => [c.id, c.type === "groupe" ? (c.nom || "Groupe") : null]));

  const resultats = lignes
    .filter(l => l.msg && conversationsAccessibles.has(l.msg.conversation_id))
    .map(l => {
      const msg = l.msg!;
      const auteur = Array.isArray(msg.institution_membres) ? msg.institution_membres[0] : msg.institution_membres;
      return {
        id: l.mention.id,
        conversation_id: msg.conversation_id,
        conversation_nom: nomConvParId.get(msg.conversation_id) ?? null,
        message_id: msg.id,
        parent_message_id: msg.parent_message_id,
        auteur_nom: auteur ? `${auteur.prenom} ${auteur.nom}` : "Ancien membre",
        extrait: msg.supprime_le ? "Message supprimé" : (msg.contenu ?? ""),
        lu: l.mention.lu,
        cree_le: l.mention.cree_le,
      };
    });

  return NextResponse.json({ mentions: resultats });
}

// PATCH : marque toutes les mentions de l'appelant comme lues — appelé
// explicitement à l'ouverture du panneau "Mentions", jamais en arrière-plan.
export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { error } = await sb.from("collab_mentions").update({ lu: true }).eq("membre_id", membre.membreId).eq("lu", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
