import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Module Collaboration — Lot B (16/09/2026). Ajout/retrait de membres d'un
// GROUPE uniquement (une conversation directe a toujours exactement 2
// participants, jamais modifiable). Réservé au créateur du groupe ou à un
// admin — collaboration.manage_group ouvre juste l'accès de rôle, la vraie
// barrière est cree_par === appelant (vérifiée ici, pas seulement côté UI).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function chargerGroupeGerable(conversationId: string, institutionId: string, membreId: string, role: string) {
  const { data: conv } = await sb.from("collab_conversations").select("id,type,cree_par").eq("id", conversationId).eq("institution_id", institutionId).maybeSingle();
  if (!conv || conv.type !== "groupe") return null;
  if (conv.cree_par !== membreId && role !== "admin") return "forbidden" as const;
  return conv;
}

async function chargerGroupe(conversationId: string, institutionId: string) {
  const { data: conv } = await sb.from("collab_conversations").select("id,type,cree_par").eq("id", conversationId).eq("institution_id", institutionId).maybeSingle();
  if (!conv || conv.type !== "groupe") return null;
  return conv;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "collaboration.manage_group", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const { id } = await params;

  const groupe = await chargerGroupeGerable(id, membre.institutionId, membre.membreId, membre.role);
  if (!groupe) return NextResponse.json({ error: "Ce groupe est introuvable." }, { status: 404 });
  if (groupe === "forbidden") return NextResponse.json({ error: "Seul le créateur du groupe (ou un admin) peut y ajouter des membres." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const nouveauMembreId = body?.membre_id;
  if (typeof nouveauMembreId !== "string" || !nouveauMembreId) {
    return NextResponse.json({ error: "Choisissez un collègue à ajouter." }, { status: 400 });
  }

  const { data: cible } = await sb.from("institution_membres").select("id,institution_id,actif").eq("id", nouveauMembreId).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId || !cible.actif) {
    return NextResponse.json({ error: "Ce membre est introuvable dans votre établissement." }, { status: 404 });
  }

  // Peut déjà exister à l'état 'retire' (ancien membre du groupe qu'on
  // rajoute) — on réactive plutôt que d'insérer une seconde ligne, la
  // contrainte UNIQUE(conversation_id, membre_id) l'interdirait de toute façon.
  const { data: existante } = await sb.from("collab_conversation_membres").select("id,statut").eq("conversation_id", id).eq("membre_id", nouveauMembreId).maybeSingle();
  if (existante?.statut === "active") {
    return NextResponse.json({ error: "Ce membre fait déjà partie du groupe." }, { status: 409 });
  }

  const { error } = existante
    ? await sb.from("collab_conversation_membres").update({ statut: "active", rejoint_le: new Date().toISOString(), retire_le: null }).eq("id", existante.id)
    : await sb.from("collab_conversation_membres").insert({ conversation_id: id, membre_id: nouveauMembreId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  const membreIdARetirer = new URL(req.url).searchParams.get("membre_id");
  if (!membreIdARetirer) return NextResponse.json({ error: "membre_id requis" }, { status: 400 });

  // Revue critique 16/09/2026 (MEDIUM #3) : un membre doit pouvoir quitter
  // un groupe lui-même, sans dépendre du créateur/admin — avant ce
  // correctif, aucun chemin de sortie volontaire n'existait. Le créateur
  // reste bloqué (groupe orphelin sinon) — aucun transfert de propriété ni
  // dissolution de groupe n'existe encore dans ce lot, ne pas le laisser
  // sous-entendre côté message d'erreur.
  const seRetirerSoiMeme = membreIdARetirer === membre.membreId;

  if (seRetirerSoiMeme) {
    const groupe = await chargerGroupe(id, membre.institutionId);
    if (!groupe) return NextResponse.json({ error: "Ce groupe est introuvable." }, { status: 404 });
    if (membreIdARetirer === groupe.cree_par) {
      return NextResponse.json({ error: "En tant que créateur, vous ne pouvez pas quitter ce groupe." }, { status: 400 });
    }
    const { error } = await sb
      .from("collab_conversation_membres")
      .update({ statut: "retire", retire_le: new Date().toISOString() })
      .eq("conversation_id", id)
      .eq("membre_id", membreIdARetirer);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!can(membre.role, "collaboration.manage_group", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const groupe = await chargerGroupeGerable(id, membre.institutionId, membre.membreId, membre.role);
  if (!groupe) return NextResponse.json({ error: "Ce groupe est introuvable." }, { status: 404 });
  if (groupe === "forbidden") return NextResponse.json({ error: "Seul le créateur du groupe (ou un admin) peut en retirer des membres." }, { status: 403 });
  if (membreIdARetirer === groupe.cree_par) {
    return NextResponse.json({ error: "Le créateur du groupe ne peut pas être retiré." }, { status: 400 });
  }

  const { error } = await sb
    .from("collab_conversation_membres")
    .update({ statut: "retire", retire_le: new Date().toISOString() })
    .eq("conversation_id", id)
    .eq("membre_id", membreIdARetirer);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
