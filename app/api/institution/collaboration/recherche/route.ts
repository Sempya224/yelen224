import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Module Collaboration — Lot E (16/09/2026). Recherche globale scopée aux
// conversations où l'appelant participe activement — jamais un accès
// transversal à toute l'institution. Couvre messages (contenu), fichiers
// (nom) et noms de conversation/participants, jamais Annonces/Support/
// Messagerie citoyen/Communication (périmètre explicite du module).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ messages: [] });

  const { data: mesParticipations } = await sb
    .from("collab_conversation_membres")
    .select("conversation_id")
    .eq("membre_id", membre.membreId)
    .eq("statut", "active");
  const convIds = (mesParticipations ?? []).map(p => p.conversation_id);
  if (convIds.length === 0) return NextResponse.json({ messages: [] });

  // Deux requêtes séparées plutôt qu'un .or() — le texte tapé par
  // l'utilisateur peut contenir des virgules/parenthèses qui casseraient
  // la syntaxe de filtre PostgREST d'un .or() brut (échapper % et _ ne
  // suffit pas à le rendre sûr pour ce cas précis).
  const motif = `%${q.replace(/[%_]/g, c => `\\${c}`)}%`;
  const SELECT = "id,conversation_id,contenu,fichier_nom,auteur_membre_id,cree_le,supprime_le,institution_membres(prenom,nom)";
  const [{ data: parContenu, error: err1 }, { data: parFichier, error: err2 }] = await Promise.all([
    sb.from("collab_messages").select(SELECT).in("conversation_id", convIds).is("supprime_le", null).ilike("contenu", motif).order("cree_le", { ascending: false }).limit(30),
    sb.from("collab_messages").select(SELECT).in("conversation_id", convIds).is("supprime_le", null).ilike("fichier_nom", motif).order("cree_le", { ascending: false }).limit(30),
  ]);
  if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });
  if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });

  const parId = new Map<string, NonNullable<typeof parContenu>[number]>();
  for (const r of [...(parContenu ?? []), ...(parFichier ?? [])]) parId.set(r.id, r);
  const resultats = [...parId.values()].sort((a, b) => b.cree_le.localeCompare(a.cree_le)).slice(0, 30);

  const conversationIds = [...new Set((resultats ?? []).map(r => r.conversation_id))];
  const { data: conversations } = conversationIds.length
    ? await sb.from("collab_conversations").select("id,type,nom").in("id", conversationIds)
    : { data: [] as { id: string; type: string; nom: string | null }[] };
  const nomsParConv = new Map<string, string>();
  for (const c of conversations ?? []) {
    if (c.type === "groupe") { nomsParConv.set(c.id, c.nom || "Groupe"); continue; }
  }
  // Pour une conversation directe, le "nom" est l'AUTRE participant — pas
  // le même pour chaque appelant, donc calculé séparément (contrairement
  // aux groupes dont le nom est fixe).
  const conversationsDirectes = (conversations ?? []).filter(c => c.type === "directe").map(c => c.id);
  if (conversationsDirectes.length > 0) {
    const { data: autres } = await sb
      .from("collab_conversation_membres")
      .select("conversation_id,institution_membres(prenom,nom)")
      .in("conversation_id", conversationsDirectes)
      .neq("membre_id", membre.membreId);
    type Rel = { conversation_id: string; institution_membres: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null };
    for (const a of (autres ?? []) as Rel[]) {
      const rel = Array.isArray(a.institution_membres) ? a.institution_membres[0] : a.institution_membres;
      if (rel) nomsParConv.set(a.conversation_id, `${rel.prenom} ${rel.nom}`);
    }
  }

  const messages = (resultats ?? []).map(r => {
    const auteurRel = Array.isArray(r.institution_membres) ? r.institution_membres[0] : r.institution_membres;
    return {
      id: r.id,
      conversation_id: r.conversation_id,
      conversation_nom: nomsParConv.get(r.conversation_id) ?? "Conversation",
      auteur_nom: auteurRel ? `${auteurRel.prenom} ${auteurRel.nom}` : "Ancien membre",
      extrait: r.contenu ?? (r.fichier_nom ? `Fichier : ${r.fichier_nom}` : ""),
      est_fichier: !r.contenu && !!r.fichier_nom,
      cree_le: r.cree_le,
    };
  });

  return NextResponse.json({ messages });
}
