import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { envoyerNotification } from "@/lib/notifications";
import { conversationFermee } from "@/lib/messagerie";

// Contourne RLS via service role — la policy messages_citoyen_own ne
// couvre que le citoyen (auth.uid()), pas l'institution qui utilise un
// JWT custom. institution_id vient toujours du JWT vérifié, jamais du
// client, même pattern que clients/route.ts et rdv-historique/route.ts.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

async function citoyenAppartientInstitution(institutionId: string, citoyenId: string): Promise<boolean> {
  const { data } = await sb
    .from("rdv")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("citoyen_id", citoyenId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// GET sans paramètre : liste des conversations "Citoyen" (une entrée par
// rdv, chantier Messagerie 19/07/2026 — mirroring
// lib/messagerie.ts::getConversationsEtablissements côté citoyen), pour le
// nouvel écran dédié (Lot 2). GET ?citoyen_id= : historique complet
// (tous rdv confondus) pour la fiche client — mode conservé tel quel,
// encore utilisé par MesClientsTab.tsx en lecture seule. GET ?rdv_id= :
// fil d'une conversation précise pour l'écran dédié.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const { searchParams } = new URL(req.url);
  const citoyenId = searchParams.get("citoyen_id");
  const rdvId = searchParams.get("rdv_id");

  if (rdvId) {
    const { data: rdv } = await sb.from("rdv").select("id,citoyen_id,institution_id,statut").eq("id", rdvId).maybeSingle();
    if (!rdv || rdv.institution_id !== authInstId) {
      return NextResponse.json({ error: "Rendez-vous introuvable pour cette institution" }, { status: 404 });
    }
    const { data, error } = await sb
      .from("messages")
      .select("id,expediteur_citoyen_id,contenu,image_url,type,lu,cree_le")
      .eq("rdv_id", rdvId)
      .order("cree_le", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from("messages").update({ lu: true }).eq("rdv_id", rdvId).eq("destinataire_institution_id", authInstId).eq("lu", false);

    const messages = (data ?? []).map((m) => ({
      id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type ?? "texte", lu: m.lu, cree_le: m.cree_le,
      emetteur: m.expediteur_citoyen_id ? "citoyen" as const : "institution" as const,
    }));
    return NextResponse.json({ messages, fermee: conversationFermee(rdv.statut as string) });
  }

  if (!citoyenId) {
    // Mode agrégat par rdv — écran dédié Lot 2, onglet Citoyen.
    // Audit Lot 12 (07/08/2026) : aucune des deux requêtes n'était bornée
    // avant ce correctif — une institution mature accumulant des années de
    // rdv/messages rechargeait tout en mémoire à chaque ouverture de l'écran
    // conversations. Plafond aligné sur rdv/route.ts (.limit(300)) : les
    // rdv les plus récents (déjà triés desc) suffisent pour une liste de
    // conversations, les messages ne sont ensuite lus que pour ce sous-
    // ensemble borné de rdv_id.
    const { data: rdvs, error: rdvErr } = await sb
      .from("rdv")
      .select("id,citoyen_id,statut,service,date_rdv")
      .eq("institution_id", authInstId)
      .order("date_rdv", { ascending: false })
      .limit(300);
    if (rdvErr) return NextResponse.json({ error: rdvErr.message }, { status: 500 });
    if (!rdvs || rdvs.length === 0) return NextResponse.json({ conversations: [], total_non_lus: 0 });

    const rdvIdsScope = rdvs.map((r) => r.id);
    const { data: msgs, error: msgsErr } = await sb
      .from("messages")
      .select("rdv_id,contenu,image_url,type,lu,cree_le,destinataire_institution_id")
      .in("rdv_id", rdvIdsScope)
      .order("cree_le", { ascending: true });
    if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 });

    const parRdv = new Map<string, { contenu: string | null; type: string; cree_le: string }>();
    const nonLusParRdv = new Map<string, number>();
    for (const m of msgs ?? []) {
      if (!m.rdv_id) continue;
      parRdv.set(m.rdv_id, { contenu: m.contenu, type: m.type ?? "texte", cree_le: m.cree_le });
      if (m.destinataire_institution_id === authInstId && !m.lu) {
        nonLusParRdv.set(m.rdv_id, (nonLusParRdv.get(m.rdv_id) ?? 0) + 1);
      }
    }

    const citoyenIds = [...new Set(rdvs.map((r) => r.citoyen_id))];
    const { data: usersD } = citoyenIds.length ? await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds) : { data: [] };
    const uMap = new Map((usersD ?? []).map((u) => [u.id, u]));

    const conversations = rdvs
      .map((r) => {
        const dernier = parRdv.get(r.id);
        return {
          rdv_id: r.id,
          citoyen_id: r.citoyen_id,
          citoyen_nom: buildNom(uMap.get(r.citoyen_id)),
          service: r.service,
          date_rdv: r.date_rdv,
          fermee: conversationFermee(r.statut as string),
          dernier_message: dernier?.contenu ?? null,
          dernier_message_type: dernier?.type ?? null,
          dernier_message_at: dernier?.cree_le ?? null,
          non_lus: nonLusParRdv.get(r.id) ?? 0,
        };
      })
      .filter((c) => !c.fermee || c.dernier_message_at !== null)
      .sort((a, b) => new Date(b.dernier_message_at ?? b.date_rdv).getTime() - new Date(a.dernier_message_at ?? a.date_rdv).getTime());

    return NextResponse.json({ conversations, total_non_lus: conversations.reduce((s, c) => s + c.non_lus, 0) });
  }

  if (!(await citoyenAppartientInstitution(authInstId, citoyenId))) {
    return NextResponse.json({ error: "Client introuvable pour cette institution" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("messages")
    .select("id,expediteur_citoyen_id,contenu,image_url,type,lu,cree_le")
    .or(`and(expediteur_institution_id.eq.${authInstId},destinataire_citoyen_id.eq.${citoyenId}),and(expediteur_citoyen_id.eq.${citoyenId},destinataire_institution_id.eq.${authInstId})`)
    .order("cree_le", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? []).map((m) => ({
    id: m.id,
    contenu: m.contenu,
    image_url: m.image_url,
    type: m.type ?? "texte",
    lu: m.lu,
    cree_le: m.cree_le,
    emetteur: m.expediteur_citoyen_id ? "citoyen" as const : "institution" as const,
  }));

  await sb
    .from("messages")
    .update({ lu: true })
    .eq("destinataire_institution_id", authInstId)
    .eq("expediteur_citoyen_id", citoyenId)
    .eq("lu", false);

  return NextResponse.json({ messages });
}

// POST : envoi de texte, toujours scopé à un rdv_id précis (chantier
// Messagerie 19/07/2026 — remplace l'ancien mode citoyen_id seul). Le rdv
// est la source d'appartenance (institution_id/citoyen_id lus depuis la
// ligne rdv elle-même, jamais fournis tels quels par le client) et de
// fermeture — revalide ici la même règle que
// messages_valider_rdv_conversation_trigger, exempté pour service_role.
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "mes_clients.write")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const rdvId = body?.rdv_id;
  const contenu = typeof body?.contenu === "string" ? body.contenu.trim() : "";
  if (typeof rdvId !== "string" || !contenu) {
    return NextResponse.json({ error: "rdv_id et contenu requis" }, { status: 400 });
  }

  const { data: rdv } = await sb.from("rdv").select("id,citoyen_id,institution_id,statut").eq("id", rdvId).maybeSingle();
  if (!rdv || rdv.institution_id !== authInstId) {
    return NextResponse.json({ error: "Rendez-vous introuvable pour cette institution" }, { status: 404 });
  }
  if (conversationFermee(rdv.statut as string)) {
    return NextResponse.json({ error: "Ce rendez-vous est terminé — la conversation est fermée." }, { status: 409 });
  }

  // Restriction messagerie institution → citoyen pendant une suspension
  // (retour Bryan 17/08/2026 : "côté institutions le plus important, car
  // c'est lui qui est bloqué") — barrière serveur réelle, symétrique à la
  // restriction citoyen (lib/messagerie.ts::sendMessageRdv). L'institution
  // garde la lecture de ses conversations (onglet Messagerie reste
  // accessible pendant la suspension, voir page.tsx::ALLOWED_TABS_SUSPENDU)
  // mais ne peut plus initier de nouvel envoi vers un citoyen tant qu'elle
  // est suspendue — le support Yelen (messagerie-yelen/route.ts, canal
  // séparé) n'est volontairement PAS concerné par cette restriction.
  const { data: inst } = await sb.from("institutions").select("name,statut").eq("id", authInstId).maybeSingle();
  if (inst?.statut === "suspendue") {
    return NextResponse.json({ error: "Votre établissement est suspendu — vous ne pouvez pas envoyer de nouveaux messages aux citoyens pour le moment. Besoin de parler à un agent ? Contactez le support Yelen ou demandez une révision depuis l'écran d'accueil." }, { status: 403 });
  }

  const { error } = await sb.from("messages").insert({
    expediteur_institution_id: authInstId,
    destinataire_citoyen_id: rdv.citoyen_id,
    rdv_id: rdvId,
    contenu,
    type: "texte",
    lu: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await envoyerNotification({
    destinataire_id: rdv.citoyen_id,
    destinataire_type: "citoyen",
    rdv_id: rdvId,
    type: "message",
    titre: "Nouveau message",
    message: `${inst?.name ?? "Votre établissement"} : ${contenu.slice(0, 120)}`,
  });

  const { data: citoyen } = await sb.from("users").select("nom,prenom,phone").eq("id", rdv.citoyen_id).maybeSingle();
  const nomClient = buildNom(citoyen ?? undefined);

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "message_envoye",
    cibleTable: "messages",
    cibleId: rdv.citoyen_id,
    details: { client_id: rdv.citoyen_id, client_nom: nomClient },
    req,
  });

  return NextResponse.json({ ok: true });
}
