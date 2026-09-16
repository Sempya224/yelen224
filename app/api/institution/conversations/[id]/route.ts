import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Messagerie V2 — Lot B. Détail d'une conversation (fil + fiche) et
// transitions de statut/assignation — voir app/api/institution/conversations/route.ts
// pour le contexte général du chantier.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

async function chargerConversation(id: string, authInstId: string) {
  const { data: conv } = await sb
    .from("conversations")
    .select("id,citoyen_id,rdv_id,sujet,statut,assigned_membre_id,fermee_le,cree_le,mis_a_jour_le")
    .eq("id", id).eq("institution_id", authInstId).maybeSingle();
  return conv;
}

// GET : fil complet + fiche client + rdv lié, et marque les messages
// entrants comme lus.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "messagerie") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;
  const { id } = await params;

  const conv = await chargerConversation(id, authInstId);
  if (!conv) return NextResponse.json({ error: "Conversation introuvable pour cette institution" }, { status: 404 });

  const [{ data: citoyen }, { data: rdv }, membreAssigneResult, { data: msgs, error: msgsErr }] = await Promise.all([
    sb.from("users").select("id,nom,prenom,phone,email,ville,identite_verifiee,photo_url").eq("id", conv.citoyen_id).maybeSingle(),
    conv.rdv_id ? sb.from("rdv").select("id,service,date_rdv,heure_rdv,statut").eq("id", conv.rdv_id).maybeSingle() : Promise.resolve({ data: null }),
    conv.assigned_membre_id ? sb.from("institution_membres").select("id,nom,prenom").eq("id", conv.assigned_membre_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("messages").select("id,expediteur_citoyen_id,contenu,image_url,type,lu,cree_le").eq("conversation_id", id).order("cree_le", { ascending: true }),
  ]);
  if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 });

  await sb.from("messages").update({ lu: true }).eq("conversation_id", id).eq("destinataire_institution_id", authInstId).eq("lu", false);

  const membreAssigne = membreAssigneResult.data;

  return NextResponse.json({
    conversation: {
      id: conv.id, statut: conv.statut, sujet: conv.sujet,
      rdv: rdv ? { id: rdv.id, service: rdv.service, date_rdv: rdv.date_rdv, heure_rdv: rdv.heure_rdv, statut: rdv.statut } : null,
      assigned_membre: membreAssigne ? { id: membreAssigne.id, nom: [membreAssigne.prenom, membreAssigne.nom].filter(Boolean).join(" ") } : null,
      cree_le: conv.cree_le, mis_a_jour_le: conv.mis_a_jour_le,
    },
    citoyen: citoyen ? {
      id: citoyen.id, nom: buildNom(citoyen), telephone: citoyen.phone, email: citoyen.email,
      ville: citoyen.ville, identite_verifiee: citoyen.identite_verifiee, photo_url: citoyen.photo_url,
    } : null,
    messages: (msgs ?? []).map((m) => ({
      id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type ?? "texte", lu: m.lu, cree_le: m.cree_le,
      emetteur: m.expediteur_citoyen_id ? "citoyen" as const : "institution" as const,
    })),
  });
}

type Action = "fermer" | "reouvrir" | "mettre_en_attente" | "reprendre" | "assigner";

// PATCH : transitions de statut et assignation — chaque action n'est
// légale que depuis un statut précis (section "actions contextuelles" du
// brief), jamais un simple set arbitraire du champ statut par le client.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "messagerie") !== "full") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const action = body?.action as Action | undefined;
  if (!action || !["fermer", "reouvrir", "mettre_en_attente", "reprendre", "assigner"].includes(action)) {
    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  }

  const conv = await chargerConversation(id, authInstId);
  if (!conv) return NextResponse.json({ error: "Conversation introuvable pour cette institution" }, { status: 404 });

  if (action === "assigner") {
    const membreId = body?.membre_id ?? null;
    if (membreId !== null) {
      const { data: cible } = await sb.from("institution_membres").select("id").eq("id", membreId).eq("institution_id", authInstId).maybeSingle();
      if (!cible) return NextResponse.json({ error: "Membre introuvable pour cette institution" }, { status: 404 });
    }
    const { error } = await sb.from("conversations").update({ assigned_membre_id: membreId, mis_a_jour_le: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const transitions: Record<Exclude<Action, "assigner">, { depuis: string[]; update: Record<string, unknown> }> = {
    fermer: { depuis: ["ouverte", "en_attente"], update: { statut: "fermee", fermee_par: membre.membreId, fermee_le: new Date().toISOString() } },
    reouvrir: { depuis: ["fermee"], update: { statut: "ouverte", fermee_par: null, fermee_le: null } },
    mettre_en_attente: { depuis: ["ouverte"], update: { statut: "en_attente" } },
    reprendre: { depuis: ["en_attente"], update: { statut: "ouverte" } },
  };
  const t = transitions[action as Exclude<Action, "assigner">];
  if (!t.depuis.includes(conv.statut)) {
    return NextResponse.json({ error: `Action "${action}" impossible depuis le statut actuel ("${conv.statut}")` }, { status: 409 });
  }

  const { error } = await sb.from("conversations").update({ ...t.update, mis_a_jour_le: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
