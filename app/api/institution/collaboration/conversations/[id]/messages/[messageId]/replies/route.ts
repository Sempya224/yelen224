import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { formaterMessagesAvecFichiersEtReactions } from "@/lib/collaborationMessages";

// Module Collaboration — Lot C (fils de réponse) + Lot D (fichiers,
// réactions), 16/09/2026. Panneau "Discussion" : le message racine +
// toutes ses réponses, dans l'ordre chronologique.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id, messageId } = await params;

  const { data: participation } = await sb
    .from("collab_conversation_membres")
    .select("id").eq("conversation_id", id).eq("membre_id", membre.membreId).eq("statut", "active").maybeSingle();
  if (!participation) return NextResponse.json({ error: "Cette conversation est introuvable ou vous n'y avez plus accès." }, { status: 404 });

  const { data: racine } = await sb.from("collab_messages").select("id,auteur_membre_id,contenu,modifie_le,supprime_le,cree_le,fichier_path,fichier_nom,fichier_taille,fichier_type,institution_membres(prenom,nom)").eq("id", messageId).eq("conversation_id", id).maybeSingle();
  if (!racine) return NextResponse.json({ error: "Ce message est introuvable." }, { status: 404 });

  const { data: reponses, error } = await sb
    .from("collab_messages")
    .select("id,auteur_membre_id,contenu,modifie_le,supprime_le,cree_le,fichier_path,fichier_nom,fichier_taille,fichier_type,institution_membres(prenom,nom)")
    .eq("parent_message_id", messageId)
    .order("cree_le", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [racineFormatee] = await formaterMessagesAvecFichiersEtReactions([racine], membre.membreId);
  const reponsesFormatees = await formaterMessagesAvecFichiersEtReactions(reponses ?? [], membre.membreId);

  return NextResponse.json({ racine: racineFormatee, reponses: reponsesFormatees });
}
