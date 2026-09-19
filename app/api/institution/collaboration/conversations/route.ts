import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";

// Module Collaboration — Lot A (conversations directes) + Lot B (groupes,
// 16/09/2026). Distinct de /api/institution/conversations (citoyen <->
// institution) — nouvelle famille de tables collab_* dédiée, jamais
// mélangée à la messagerie citoyen.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNomMembre(m: { prenom: string; nom: string } | undefined): string {
  return m ? `${m.prenom} ${m.nom}` : "Ancien membre";
}

// GET : conversations où le membre appelant est participant actif, triées
// par dernière activité. Pas de pagination pour l'instant (même
// simplification assumée que Messagerie V2 — volume par institution
// attendu modeste).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data: mesParticipations, error: partErr } = await sb
    .from("collab_conversation_membres")
    .select("conversation_id,favori,dernier_lu_le")
    .eq("membre_id", membre.membreId)
    .eq("statut", "active");
  if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });
  if (!mesParticipations || mesParticipations.length === 0) return NextResponse.json({ conversations: [] });

  const convIds = mesParticipations.map(p => p.conversation_id);
  const lectureParConv = new Map(mesParticipations.map(p => [p.conversation_id, { favori: p.favori, dernierLu: p.dernier_lu_le }]));

  const [{ data: convs, error: convErr }, { data: autresParticipants }, { data: messagesRecents }] = await Promise.all([
    sb.from("collab_conversations").select("id,institution_id,type,nom,statut,cree_par,mis_a_jour_le").in("id", convIds).eq("institution_id", membre.institutionId).order("mis_a_jour_le", { ascending: false }),
    sb.from("collab_conversation_membres").select("conversation_id,membre_id,institution_membres(prenom,nom,role)").in("conversation_id", convIds).eq("statut", "active").neq("membre_id", membre.membreId),
    sb.from("collab_messages").select("conversation_id,contenu,auteur_membre_id,cree_le,supprime_le").in("conversation_id", convIds).order("cree_le", { ascending: false }).limit(500),
  ]);
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });

  type AutreParticipant = { conversation_id: string; membre_id: string; institution_membres: { prenom: string; nom: string; role: string } | { prenom: string; nom: string; role: string }[] | null };
  const participantsParConv = new Map<string, { prenom: string; nom: string; role: string }[]>();
  for (const p of (autresParticipants ?? []) as AutreParticipant[]) {
    const rel = Array.isArray(p.institution_membres) ? p.institution_membres[0] : p.institution_membres;
    if (!rel) continue;
    const liste = participantsParConv.get(p.conversation_id) ?? [];
    liste.push(rel);
    participantsParConv.set(p.conversation_id, liste);
  }

  const dernierMessageParConv = new Map<string, { contenu: string; auteur_membre_id: string; cree_le: string; supprime: boolean }>();
  const nonLusParConv = new Map<string, number>();
  for (const m of messagesRecents ?? []) {
    if (!dernierMessageParConv.has(m.conversation_id)) {
      dernierMessageParConv.set(m.conversation_id, { contenu: m.supprime_le ? "Message supprimé" : m.contenu, auteur_membre_id: m.auteur_membre_id, cree_le: m.cree_le, supprime: !!m.supprime_le });
    }
    const lecture = lectureParConv.get(m.conversation_id);
    const nonLu = m.auteur_membre_id !== membre.membreId && (!lecture?.dernierLu || m.cree_le > lecture.dernierLu);
    if (nonLu) nonLusParConv.set(m.conversation_id, (nonLusParConv.get(m.conversation_id) ?? 0) + 1);
  }

  const conversations = (convs ?? []).map(c => {
    const autres = participantsParConv.get(c.id) ?? [];
    const nom = c.type === "groupe" ? (c.nom || "Groupe") : buildNomMembre(autres[0]);
    const dernier = dernierMessageParConv.get(c.id) ?? null;
    return {
      id: c.id,
      type: c.type,
      nom,
      role: c.type === "directe" ? (autres[0]?.role ?? null) : null,
      participants: autres.map(a => ({ prenom: a.prenom, nom: a.nom, role: a.role })),
      membre_count: c.type === "groupe" ? autres.length + 1 : null,
      peut_gerer: c.type === "groupe" && (c.cree_par === membre.membreId || membre.role === "admin"),
      favori: lectureParConv.get(c.id)?.favori ?? false,
      dernier_message: dernier ? { contenu: dernier.contenu, de_moi: dernier.auteur_membre_id === membre.membreId, cree_le: dernier.cree_le } : null,
      non_lus: nonLusParConv.get(c.id) ?? 0,
      mis_a_jour_le: c.mis_a_jour_le,
    };
  });

  return NextResponse.json({ conversations });
}

// POST : démarre (ou retrouve) une conversation directe avec un autre
// membre (body { membre_id }), OU crée un groupe (body { type: "groupe",
// nom, membre_ids }) — Lot B. Une seule conversation directe persistante
// par paire — pas de nouvelle créée si une existe déjà, même active de
// longue date. Les groupes, eux, n'ont pas cette contrainte : plusieurs
// groupes avec les mêmes membres peuvent coexister (noms différents).
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "collaboration", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  if (body?.type === "groupe") {
    if (!can(membre.role, "collaboration.create_group", membre.accesRestreints)) {
      return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
    }
    const nom = typeof body?.nom === "string" ? body.nom.trim() : "";
    const membreIds: unknown = body?.membre_ids;
    if (!nom) return NextResponse.json({ error: "Donnez un nom à votre groupe." }, { status: 400 });
    if (!Array.isArray(membreIds) || membreIds.length === 0 || !membreIds.every(m => typeof m === "string")) {
      return NextResponse.json({ error: "Ajoutez au moins un collègue à votre groupe." }, { status: 400 });
    }
    const idsUniques = [...new Set(membreIds as string[])].filter(id => id !== membre.membreId);

    const { data: cibles } = await sb.from("institution_membres").select("id,institution_id,actif").in("id", idsUniques);
    const valides = (cibles ?? []).filter(c => c.institution_id === membre.institutionId && c.actif).map(c => c.id);
    if (valides.length === 0) {
      return NextResponse.json({ error: "Ajoutez au moins un collègue encore actif dans votre établissement." }, { status: 400 });
    }

    const { data: nouveauGroupe, error: creationErr } = await sb
      .from("collab_conversations")
      .insert({ institution_id: membre.institutionId, type: "groupe", nom, cree_par: membre.membreId })
      .select("id")
      .single();
    if (creationErr) return NextResponse.json({ error: creationErr.message }, { status: 500 });

    const { error: membresErr } = await sb.from("collab_conversation_membres").insert([
      { conversation_id: nouveauGroupe.id, membre_id: membre.membreId },
      ...valides.map(id => ({ conversation_id: nouveauGroupe.id, membre_id: id })),
    ]);
    if (membresErr) return NextResponse.json({ error: membresErr.message }, { status: 500 });

    return NextResponse.json({ id: nouveauGroupe.id, cree: true });
  }

  const autreMembreId = body?.membre_id;
  if (typeof autreMembreId !== "string" || !autreMembreId) {
    return NextResponse.json({ error: "Choisissez un collègue pour démarrer une conversation." }, { status: 400 });
  }
  if (autreMembreId === membre.membreId) {
    return NextResponse.json({ error: "Vous ne pouvez pas démarrer une conversation avec vous-même." }, { status: 400 });
  }

  const { data: cible } = await sb.from("institution_membres").select("id,institution_id,actif").eq("id", autreMembreId).maybeSingle();
  if (!cible || cible.institution_id !== membre.institutionId || !cible.actif) {
    return NextResponse.json({ error: "Ce membre est introuvable dans votre établissement." }, { status: 404 });
  }

  // Recherche d'une conversation directe existante entre les deux membres —
  // via mes participations, filtrées à celles où l'autre membre participe
  // aussi (pas de requête SQL "intersection" simple sur cette forme de
  // schéma, fait en deux temps).
  const { data: mesConvsDirectes } = await sb
    .from("collab_conversation_membres")
    .select("conversation_id,collab_conversations!inner(type)")
    .eq("membre_id", membre.membreId)
    .eq("statut", "active")
    .eq("collab_conversations.type", "directe");
  const mesConvIds = (mesConvsDirectes ?? []).map(c => c.conversation_id);

  if (mesConvIds.length > 0) {
    const { data: existante } = await sb
      .from("collab_conversation_membres")
      .select("conversation_id")
      .eq("membre_id", autreMembreId)
      .eq("statut", "active")
      .in("conversation_id", mesConvIds)
      .maybeSingle();
    if (existante) return NextResponse.json({ id: existante.conversation_id, cree: false });
  }

  const { data: nouvelle, error: creationErr } = await sb
    .from("collab_conversations")
    .insert({ institution_id: membre.institutionId, type: "directe", cree_par: membre.membreId })
    .select("id")
    .single();
  if (creationErr) return NextResponse.json({ error: creationErr.message }, { status: 500 });

  const { error: membresErr } = await sb.from("collab_conversation_membres").insert([
    { conversation_id: nouvelle.id, membre_id: membre.membreId },
    { conversation_id: nouvelle.id, membre_id: autreMembreId },
  ]);
  if (membresErr) return NextResponse.json({ error: membresErr.message }, { status: 500 });

  return NextResponse.json({ id: nouvelle.id, cree: true });
}
