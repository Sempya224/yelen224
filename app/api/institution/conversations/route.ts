import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Messagerie V2 — Lot B (chantier "Customer Communication Workspace",
// 06/09/2026). Inbox institution basée sur la vraie entité `conversations`
// (Lot A) plutôt que l'ancien agrégat "une entrée par rdv" de
// app/api/institution/messages/route.ts (conservée telle quelle, encore
// utilisée par l'ancien écran MessagerieTab.tsx tant que le Lot C/D n'a pas
// basculé l'UI dessus).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// GET : liste des conversations de l'institution (inbox), triées par
// dernière activité. Pas de pagination ni de filtre serveur pour l'instant
// (même simplification assumée que l'ancien écran Messagerie — volume par
// institution attendu modeste, à reprendre si besoin réel après un premier
// usage) : le Lot C filtre/cherche côté client sur la liste complète.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "messagerie") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data: convs, error: convErr } = await sb
    .from("conversations")
    .select("id,citoyen_id,rdv_id,sujet,statut,assigned_membre_id,cree_le,mis_a_jour_le")
    .eq("institution_id", authInstId)
    .order("mis_a_jour_le", { ascending: false });
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!convs || convs.length === 0) {
    return NextResponse.json({ conversations: [], counts: { toutes: 0, non_lues: 0, en_attente: 0, terminees: 0 } });
  }

  const convIds = convs.map((c) => c.id);
  const rdvIds = [...new Set(convs.map((c) => c.rdv_id).filter((v): v is string => !!v))];
  const citoyenIds = [...new Set(convs.map((c) => c.citoyen_id))];
  const membreIds = [...new Set(convs.map((c) => c.assigned_membre_id).filter((v): v is string => !!v))];

  const [{ data: rdvs }, { data: citoyens }, { data: membres }, { data: msgs }] = await Promise.all([
    rdvIds.length ? sb.from("rdv").select("id,service,date_rdv,heure_rdv,statut").in("id", rdvIds) : Promise.resolve({ data: [] }),
    sb.from("users").select("id,nom,prenom,phone,identite_verifiee,photo_url").in("id", citoyenIds),
    membreIds.length ? sb.from("institution_membres").select("id,nom,prenom").in("id", membreIds) : Promise.resolve({ data: [] }),
    sb.from("messages").select("conversation_id,contenu,image_url,type,lu,cree_le,destinataire_institution_id").in("conversation_id", convIds).order("cree_le", { ascending: true }),
  ]);

  const rdvMap = new Map((rdvs ?? []).map((r) => [r.id, r]));
  const citoyenMap = new Map((citoyens ?? []).map((u) => [u.id, u]));
  const membreMap = new Map((membres ?? []).map((m) => [m.id, m]));

  const dernierParConv = new Map<string, { contenu: string | null; type: string; cree_le: string }>();
  const nonLusParConv = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (!m.conversation_id) continue;
    dernierParConv.set(m.conversation_id, { contenu: m.contenu, type: m.type ?? "texte", cree_le: m.cree_le });
    if (m.destinataire_institution_id === authInstId && !m.lu) {
      nonLusParConv.set(m.conversation_id, (nonLusParConv.get(m.conversation_id) ?? 0) + 1);
    }
  }

  const conversations = convs.map((c) => {
    const rdv = c.rdv_id ? rdvMap.get(c.rdv_id) : undefined;
    const citoyen = citoyenMap.get(c.citoyen_id);
    const membreAssigne = c.assigned_membre_id ? membreMap.get(c.assigned_membre_id) : undefined;
    const dernier = dernierParConv.get(c.id);
    return {
      id: c.id,
      citoyen_id: c.citoyen_id,
      citoyen_nom: buildNom(citoyen),
      citoyen_verifie: citoyen?.identite_verifiee ?? false,
      citoyen_photo_url: citoyen?.photo_url ?? null,
      statut: c.statut as "ouverte" | "en_attente" | "fermee",
      sujet: c.sujet,
      rdv: rdv ? { id: rdv.id, service: rdv.service, date_rdv: rdv.date_rdv, heure_rdv: rdv.heure_rdv, statut: rdv.statut } : null,
      assigned_membre: membreAssigne ? { id: membreAssigne.id, nom: [membreAssigne.prenom, membreAssigne.nom].filter(Boolean).join(" ") } : null,
      dernier_message: dernier?.contenu ?? null,
      dernier_message_type: dernier?.type ?? null,
      dernier_message_at: dernier?.cree_le ?? null,
      non_lus: nonLusParConv.get(c.id) ?? 0,
      cree_le: c.cree_le,
      mis_a_jour_le: c.mis_a_jour_le,
    };
  });

  const counts = {
    toutes: conversations.length,
    non_lues: conversations.filter((c) => c.non_lus > 0).length,
    en_attente: conversations.filter((c) => c.statut === "en_attente").length,
    terminees: conversations.filter((c) => c.statut === "fermee").length,
  };

  return NextResponse.json({ conversations, counts });
}
