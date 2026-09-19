import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { envoyerNotification } from "@/lib/notifications";

// Messagerie V2 — Lot B. Envoi d'un message dans une conversation existante
// — voir app/api/institution/conversations/route.ts pour le contexte
// général. Contrairement à l'ancien POST /api/institution/messages, la
// fermeture n'est plus dérivée du statut du rdv : seul le statut propre de
// la conversation ("fermee") bloque l'envoi.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "messagerie") !== "full") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (!contenu) return NextResponse.json({ error: "contenu requis" }, { status: 400 });

  const { data: conv } = await sb
    .from("conversations")
    .select("id,citoyen_id,rdv_id,statut")
    .eq("id", id).eq("institution_id", authInstId).maybeSingle();
  if (!conv) return NextResponse.json({ error: "Conversation introuvable pour cette institution" }, { status: 404 });
  if (conv.statut === "fermee") {
    return NextResponse.json({ error: "Cette conversation est fermée — réouvrez-la pour pouvoir répondre." }, { status: 409 });
  }

  const { data: inst } = await sb.from("institutions").select("name,statut").eq("id", authInstId).maybeSingle();
  if (inst?.statut === "suspendue") {
    return NextResponse.json({ error: "Votre établissement est suspendu — vous ne pouvez pas envoyer de nouveaux messages aux citoyens pour le moment. Besoin de parler à un agent ? Contactez le support Yelen ou demandez une révision depuis l'écran d'accueil." }, { status: 403 });
  }

  const { data: inserted, error } = await sb.from("messages").insert({
    conversation_id: id,
    expediteur_institution_id: authInstId,
    destinataire_citoyen_id: conv.citoyen_id,
    rdv_id: conv.rdv_id,
    contenu,
    type: "texte",
    lu: false,
  }).select("id,cree_le").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("conversations").update({ mis_a_jour_le: new Date().toISOString() }).eq("id", id);

  await envoyerNotification({
    destinataire_id: conv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: conv.rdv_id,
    type: "message",
    titre: "Nouveau message",
    message: `${inst?.name ?? "Votre établissement"} : ${contenu.slice(0, 120)}`,
  });

  const { data: citoyen } = await sb.from("users").select("nom,prenom,phone").eq("id", conv.citoyen_id).maybeSingle();
  const nomClient = buildNom(citoyen ?? undefined);

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "message_envoye",
    cibleTable: "messages",
    cibleId: conv.citoyen_id,
    details: { client_id: conv.citoyen_id, client_nom: nomClient, conversation_id: id },
    req,
  });

  return NextResponse.json({ ok: true, message: { id: inserted.id, cree_le: inserted.cree_le } });
}
