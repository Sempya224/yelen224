import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { extraireMentions } from "@/lib/collaborationMessages";

// Module Collaboration — Lot D (16/09/2026). Modifier/supprimer SON PROPRE
// message uniquement — jamais celui d'un autre membre (pas de modération
// dans ce lot, hors périmètre). L'ActionKey ouvre juste l'accès de rôle ;
// la vraie barrière est auteur_membre_id === appelant, vérifiée ici.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Revue critique 16/09/2026 (2e passage) : re-vérifie que l'appelant est
// toujours participant ACTIF de la conversation, pas seulement l'auteur du
// message — sans ça, quelqu'un qui a quitté/été retiré d'un groupe
// gardait indéfiniment le pouvoir de modifier/supprimer ses anciens
// messages via appel direct à l'API (jamais exposé dans l'UI, mais
// atteignable). Une fois parti, l'historique qu'on a laissé se fige,
// comme pour tout le monde.
async function chargerMessageDeLAppelant(conversationId: string, messageId: string, membreId: string) {
  const { data: participation } = await sb.from("collab_conversation_membres").select("id").eq("conversation_id", conversationId).eq("membre_id", membreId).eq("statut", "active").maybeSingle();
  if (!participation) return "forbidden" as const;
  const { data } = await sb.from("collab_messages").select("id,conversation_id,auteur_membre_id,supprime_le,fichier_path").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle();
  if (!data) return null;
  if (data.auteur_membre_id !== membreId) return "forbidden" as const;
  return data;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "collaboration.edit_message", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id, messageId } = await params;

  const message = await chargerMessageDeLAppelant(id, messageId, membre.membreId);
  if (!message) return NextResponse.json({ error: "Ce message est introuvable." }, { status: 404 });
  if (message === "forbidden") return NextResponse.json({ error: "Vous ne pouvez modifier que vos propres messages." }, { status: 403 });
  if (message.supprime_le) return NextResponse.json({ error: "Impossible de modifier un message supprimé." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (!contenu && !message.fichier_path) return NextResponse.json({ error: "Écrivez quelque chose avant d'enregistrer." }, { status: 400 });
  if (contenu.length > 4000) return NextResponse.json({ error: "Votre message est un peu long (4000 caractères maximum) — essayez de le raccourcir." }, { status: 400 });

  const { error } = await sb.from("collab_messages").update({ contenu: contenu || null, modifie_le: new Date().toISOString() }).eq("id", messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Revue critique 16/09/2026 (2e passage) : l'extraction des @mentions ne
  // se faisait qu'à l'envoi initial — ajouter une mention en modifiant un
  // message ne notifiait jamais personne. On ré-extrait ici et n'insère que
  // les mentions manquantes (celles déjà enregistrées, y compris pour un
  // ancien participant retiré depuis, restent inchangées : on ne retire
  // jamais une mention déjà livrée).
  if (contenu) {
    const { data: tousParticipants } = await sb
      .from("collab_conversation_membres")
      .select("membre_id,institution_membres(prenom,nom)")
      .eq("conversation_id", id)
      .eq("statut", "active");
    type P = { membre_id: string; institution_membres: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null };
    const candidats = ((tousParticipants ?? []) as P[])
      .map(p => { const rel = Array.isArray(p.institution_membres) ? p.institution_membres[0] : p.institution_membres; return rel ? { membre_id: p.membre_id, prenom: rel.prenom, nom: rel.nom } : null; })
      .filter((p): p is { membre_id: string; prenom: string; nom: string } => !!p);
    const mentionnes = extraireMentions(contenu, candidats).filter(mId => mId !== membre.membreId);
    if (mentionnes.length > 0) {
      const { data: dejaMentionnes } = await sb.from("collab_mentions").select("membre_id").eq("message_id", messageId);
      const dejaIds = new Set((dejaMentionnes ?? []).map(m => m.membre_id));
      const nouveaux = mentionnes.filter(mId => !dejaIds.has(mId));
      if (nouveaux.length > 0) {
        await sb.from("collab_mentions").insert(nouveaux.map(mId => ({ message_id: messageId, membre_id: mId })));
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "collaboration.delete_message", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id, messageId } = await params;

  const message = await chargerMessageDeLAppelant(id, messageId, membre.membreId);
  if (!message) return NextResponse.json({ error: "Ce message est introuvable." }, { status: 404 });
  if (message === "forbidden") return NextResponse.json({ error: "Vous ne pouvez supprimer que vos propres messages." }, { status: 403 });

  // Suppression douce — le contenu reste en base (audit), jamais réaffiché
  // une fois supprime_le renseigné (voir sélection GET, contenu: null).
  const { error } = await sb.from("collab_messages").update({ supprime_le: new Date().toISOString() }).eq("id", messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (message.fichier_path) {
    await sb.storage.from("collaboration-fichiers").remove([message.fichier_path]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
