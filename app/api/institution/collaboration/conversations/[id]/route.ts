import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { extraireMentions, formaterMessagesAvecFichiersEtReactions } from "@/lib/collaborationMessages";

// Module Collaboration — Lot A (conversations) + Lot C (fils de réponse,
// @mentions), 16/09/2026. Détail d'une conversation (fil racine + envoi).
// L'appartenance à la conversation (collab_conversation_membres,
// statut='active') est LA vraie barrière — canAccessTab ne fait que
// vérifier l'accès au module dans son ensemble.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function chargerParticipation(conversationId: string, membreId: string) {
  const { data } = await sb
    .from("collab_conversation_membres")
    .select("id,conversation_id,membre_id,statut")
    .eq("conversation_id", conversationId)
    .eq("membre_id", membreId)
    .eq("statut", "active")
    .maybeSingle();
  return data;
}

function buildNomMembre(m: { prenom: string; nom: string } | undefined): string {
  return m ? `${m.prenom} ${m.nom}` : "Ancien membre";
}

// GET : fil RACINE (parent_message_id IS NULL) + fiche des autres
// participants + nombre de réponses par message racine. Les réponses
// elles-mêmes se chargent via .../messages/[messageId]/replies. Marque la
// conversation comme lue par l'appelant (dernier_lu_le = now()).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id } = await params;

  const participation = await chargerParticipation(id, membre.membreId);
  if (!participation) return NextResponse.json({ error: "Cette conversation est introuvable ou vous n'y avez plus accès." }, { status: 404 });

  const [{ data: conv }, { data: autresParticipants }, { data: messages, error: msgsErr }, { data: reponses }] = await Promise.all([
    sb.from("collab_conversations").select("id,type,nom,statut,cree_par,institution_id").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle(),
    sb.from("collab_conversation_membres").select("membre_id,institution_membres(prenom,nom,role,derniere_connexion)").eq("conversation_id", id).eq("statut", "active").neq("membre_id", membre.membreId),
    sb.from("collab_messages").select("id,auteur_membre_id,contenu,modifie_le,supprime_le,cree_le,fichier_path,fichier_nom,fichier_taille,fichier_type,institution_membres(prenom,nom)").eq("conversation_id", id).is("parent_message_id", null).order("cree_le", { ascending: true }).limit(500),
    sb.from("collab_messages").select("parent_message_id").eq("conversation_id", id).not("parent_message_id", "is", null),
  ]);
  if (!conv) return NextResponse.json({ error: "Cette conversation est introuvable ou vous n'y avez plus accès." }, { status: 404 });
  if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 });

  await sb.from("collab_conversation_membres").update({ dernier_lu_le: new Date().toISOString() }).eq("id", participation.id);

  const reponsesParParent = new Map<string, number>();
  for (const r of reponses ?? []) {
    if (!r.parent_message_id) continue;
    reponsesParParent.set(r.parent_message_id, (reponsesParParent.get(r.parent_message_id) ?? 0) + 1);
  }

  type AutreParticipant = { membre_id: string; institution_membres: { prenom: string; nom: string; role: string; derniere_connexion: string | null } | { prenom: string; nom: string; role: string; derniere_connexion: string | null }[] | null };
  const participants = ((autresParticipants ?? []) as AutreParticipant[]).map(p => {
    const rel = Array.isArray(p.institution_membres) ? p.institution_membres[0] : p.institution_membres;
    return { membre_id: p.membre_id, prenom: rel?.prenom ?? "", nom: rel?.nom ?? "", role: rel?.role ?? null, derniere_connexion: rel?.derniere_connexion ?? null };
  });

  const messagesFormates = await formaterMessagesAvecFichiersEtReactions(messages ?? [], membre.membreId);

  return NextResponse.json({
    conversation: {
      id: conv.id,
      type: conv.type,
      nom: conv.type === "groupe" ? (conv.nom || "Groupe") : buildNomMembre(participants[0]),
      statut: conv.statut,
      peut_gerer: conv.type === "groupe" && (conv.cree_par === membre.membreId || membre.role === "admin"),
      mon_membre_id: membre.membreId,
      suis_createur: conv.type === "groupe" && conv.cree_par === membre.membreId,
    },
    participants,
    messages: messagesFormates.map(m => ({ ...m, reponses: reponsesParParent.get(m.id) ?? 0 })),
  });
}

// POST : envoi d'un message dans la conversation — racine, ou réponse si
// parent_message_id fourni (doit être un message racine de CETTE
// conversation, jamais une réponse-de-réponse). Extrait les @mentions
// littérales du contenu et les enregistre dans collab_mentions.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "collaboration.send", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id } = await params;

  const participation = await chargerParticipation(id, membre.membreId);
  if (!participation) return NextResponse.json({ error: "Cette conversation est introuvable ou vous n'y avez plus accès." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (!contenu) return NextResponse.json({ error: "Écrivez quelque chose avant d'envoyer votre message." }, { status: 400 });
  if (contenu.length > 4000) return NextResponse.json({ error: "Votre message est un peu long (4000 caractères maximum) — essayez de le raccourcir." }, { status: 400 });

  let parentMessageId: string | null = null;
  if (typeof body?.parent_message_id === "string") {
    const { data: parent } = await sb.from("collab_messages").select("id,conversation_id,parent_message_id").eq("id", body.parent_message_id).maybeSingle();
    if (!parent || parent.conversation_id !== id) {
      return NextResponse.json({ error: "Le message auquel vous répondez est introuvable." }, { status: 404 });
    }
    if (parent.parent_message_id) {
      return NextResponse.json({ error: "Impossible de répondre à une réponse — répondez au message d'origine." }, { status: 400 });
    }
    parentMessageId = parent.id;
  }

  const { data: message, error } = await sb
    .from("collab_messages")
    .insert({ conversation_id: id, auteur_membre_id: membre.membreId, contenu, parent_message_id: parentMessageId })
    .select("id,cree_le")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("collab_conversations").update({ mis_a_jour_le: message.cree_le }).eq("id", id);
  await sb.from("collab_conversation_membres").update({ dernier_lu_le: message.cree_le }).eq("id", participation.id);

  // @mentions — matché contre TOUS les participants (soi-même inclus, un
  // auto-mention n'a aucun effet néfaste, juste inutile).
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
    await sb.from("collab_mentions").insert(mentionnes.map(mId => ({ message_id: message.id, membre_id: mId })));
  }

  return NextResponse.json({ id: message.id, cree_le: message.cree_le });
}

// PATCH : bascule "favori" — préférence propre à l'appelant, jamais
// partagée avec les autres participants de la conversation.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id } = await params;

  const participation = await chargerParticipation(id, membre.membreId);
  if (!participation) return NextResponse.json({ error: "Cette conversation est introuvable ou vous n'y avez plus accès." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body?.favori !== "boolean") return NextResponse.json({ error: "Impossible de mettre à jour ce favori." }, { status: 400 });

  const { error } = await sb.from("collab_conversation_membres").update({ favori: body.favori }).eq("id", participation.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
