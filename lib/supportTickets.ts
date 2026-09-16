import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { extraireContexteRequete } from "./journalActivite";
import {
  SUPPORT_TRANSITIONS, prioriteInitiale, isSupportRatingRaison,
  type SupportCategorie, type SupportCategorieInstitution, type SupportStatut, type SupportPriorite,
  type SupportEventType, type SupportContexteType,
} from "./supportTicketsConstants";

// Support Yelen (ticketing citoyen↔agent humain, 04/09/2026, aucun LLM) —
// seul point d'écriture pour support_tickets/support_ticket_messages/
// support_ticket_events, comme lib/signalements.ts pour signalements. Les 3
// tables sont RLS activé + zéro policy (voir migration
// 20260904000001_support_tickets_core.sql) : aucune route ne doit jamais
// les toucher directement, uniquement via les fonctions ci-dessous, pour
// qu'aucun statut/priorité/agent ne puisse être falsifié côté client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Acteur = { type: "citoyen" | "agent" | "system" | "institution"; agentId?: string | null; agentNom?: string | null };
type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function ajouterEvenement(params: {
  ticketId: string; type: SupportEventType; acteur: Acteur;
  ancienneValeur?: Record<string, unknown> | null; nouvelleValeur?: Record<string, unknown> | null;
  commentaire?: string | null; req?: NextRequest;
}): Promise<void> {
  const { ip, userAgent } = extraireContexteRequete(params.req);
  const { error } = await sb.from("support_ticket_events").insert({
    ticket_id: params.ticketId,
    type: params.type,
    acteur_type: params.acteur.type,
    agent_id: params.acteur.type === "agent" ? params.acteur.agentId ?? null : null,
    agent_nom: params.acteur.type === "agent" ? params.acteur.agentNom ?? null : null,
    ancienne_valeur: params.ancienneValeur ?? null,
    nouvelle_valeur: params.nouvelleValeur ?? null,
    commentaire: params.commentaire ?? null,
    ip,
    user_agent: userAgent,
  });
  if (error) console.error("[Support] Erreur insertion événement:", error.message);
}

// Notification workflow — messages système autorisés uniquement (brief
// section 0), jamais de texte simulant une réflexion IA. Type "message"
// réutilisé (aucune contrainte DB sur notifications.type, mais NotifType
// applicatif dans lib/notifications.ts n'inclut pas de valeur dédiée
// ticket — cohérent avec le reste de la messagerie support).
async function notifierCitoyen(citoyenId: string, ticketId: string, titre: string, message: string): Promise<void> {
  const { error } = await sb.from("notifications").insert({
    destinataire_id: citoyenId,
    destinataire_type: "citoyen",
    type: "message",
    titre,
    message,
    // Retour Bryan 04/09/2026 : le support vit dans l'écran Messagerie
    // existant (onglet "Yelen"), pas dans une page /support séparée —
    // même paramètre ?ticket_id que ?institution_id déjà utilisé pour
    // présélectionner une conversation Établissements.
    lien: `/messagerie/citoyen?tab=yelen&ticket_id=${ticketId}`,
    lu: false,
  });
  if (error) console.error("[Support] Erreur notification:", error.message);
}

// Équivalent institution — lien vers l'écran Support Yelen dédié
// (SupportYelenTab.tsx, ouvert en nouvel onglet depuis le header), pas la
// route citoyen ci-dessus.
async function notifierInstitution(institutionId: string, ticketId: string, titre: string, message: string): Promise<void> {
  const { error } = await sb.from("notifications").insert({
    destinataire_id: institutionId,
    destinataire_type: "institution",
    type: "message",
    titre,
    message,
    lien: `/support?ticket_id=${ticketId}`,
    lu: false,
  });
  if (error) console.error("[Support] Erreur notification institution:", error.message);
}

// ── Citoyen ──────────────────────────────────────────────────────────────

export type TicketListItem = {
  id: string; numero_public: string; categorie: SupportCategorie; sujet: string;
  statut: SupportStatut; priorite: SupportPriorite; agent_nom: string | null;
  dernier_message: string | null; dernier_message_at: string | null; cree_le: string; non_lus: number;
};

export async function listerTicketsCitoyen(citoyenId: string): Promise<TicketListItem[]> {
  const { data: tickets, error } = await sb
    .from("support_tickets")
    .select("id,numero_public,categorie,sujet,statut,priorite,assigned_agent_id,cree_le")
    .eq("citoyen_id", citoyenId)
    .order("cree_le", { ascending: false });
  if (error || !tickets || tickets.length === 0) return [];

  const ids = tickets.map(t => t.id);
  const { data: msgs } = await sb
    .from("support_ticket_messages")
    .select("ticket_id,contenu,type,cree_le,expediteur_type,lu")
    .in("ticket_id", ids)
    .order("cree_le", { ascending: false });
  const dernierParTicket = new Map<string, { contenu: string | null; type: string; cree_le: string }>();
  const nonLusParTicket = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (!dernierParTicket.has(m.ticket_id)) dernierParTicket.set(m.ticket_id, m);
    if (m.expediteur_type === "agent" && !m.lu) nonLusParTicket.set(m.ticket_id, (nonLusParTicket.get(m.ticket_id) ?? 0) + 1);
  }

  const agentIds = [...new Set(tickets.map(t => t.assigned_agent_id).filter((v): v is string => !!v))];
  const { data: agents } = agentIds.length
    ? await sb.from("admin_users").select("id,nom,prenom").in("id", agentIds)
    : { data: [] as { id: string; nom: string | null; prenom: string | null }[] };
  const agentNomMap = new Map((agents ?? []).map(a => [a.id, [a.prenom, a.nom].filter(Boolean).join(" ") || "Agent Yelen"]));

  return tickets.map(t => {
    const dernier = dernierParTicket.get(t.id);
    return {
      id: t.id, numero_public: t.numero_public, categorie: t.categorie as SupportCategorie,
      sujet: t.sujet, statut: t.statut as SupportStatut, priorite: t.priorite as SupportPriorite,
      agent_nom: t.assigned_agent_id ? agentNomMap.get(t.assigned_agent_id) ?? null : null,
      dernier_message: dernier ? (dernier.type === "image" ? "📷 Image" : dernier.contenu) : null,
      dernier_message_at: dernier?.cree_le ?? null,
      cree_le: t.cree_le, non_lus: nonLusParTicket.get(t.id) ?? 0,
    };
  });
}

export async function creerTicket(params: {
  citoyenId: string; categorie: SupportCategorie; sujet: string; message: string;
  contexte?: { type: SupportContexteType; id: string } | null; req?: NextRequest;
}): Promise<ActionResult<{ id: string; numeroPublic: string }>> {
  const priorite = prioriteInitiale(params.categorie);
  const { data: ticket, error } = await sb.from("support_tickets").insert({
    citoyen_id: params.citoyenId,
    categorie: params.categorie,
    priorite,
    sujet: params.sujet,
    contexte_type: params.contexte?.type ?? null,
    contexte_id: params.contexte?.id ?? null,
  }).select("id,numero_public").single();
  if (error || !ticket) return { ok: false, error: error?.message || "Création impossible." };

  const { error: msgErr } = await sb.from("support_ticket_messages").insert({
    ticket_id: ticket.id, expediteur_type: "citoyen", contenu: params.message, type: "texte",
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  await ajouterEvenement({
    ticketId: ticket.id, type: "created", acteur: { type: "citoyen" },
    nouvelleValeur: { categorie: params.categorie, priorite, statut: "attente_agent" },
    req: params.req,
  });

  return { ok: true, id: ticket.id, numeroPublic: ticket.numero_public };
}

export type TicketRating = { note: number; raisons: string[]; commentaire: string | null; cree_le: string };

export type TicketDetail = {
  id: string; numero_public: string; categorie: SupportCategorie; sujet: string;
  statut: SupportStatut; priorite: SupportPriorite;
  agent_nom: string | null; contexte_type: SupportContexteType | null; contexte_id: string | null;
  cree_le: string;
  // Fin de conversation + évaluation (04/09/2026) — resolu_par vient du
  // dernier événement 'resolved' (acteur_type uniquement, jamais l'IP/UA de
  // support_ticket_events, qui reste hors de portée du citoyen) : sert
  // uniquement à choisir entre "Vous avez terminé..."/"Cette conversation a
  // été terminée par le support Yelen." côté UI (brief section 13).
  resolu_par: "citoyen" | "agent" | "system" | null;
  rating: TicketRating | null;
  messages: { id: string; expediteur_type: "citoyen" | "agent"; agent_nom: string | null; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string }[];
};

// Ownership vérifié ici (citoyenId doit correspondre) — jamais fait
// confiance à un ticketId seul passé par le client.
export async function obtenirTicketCitoyen(citoyenId: string, ticketId: string): Promise<TicketDetail | null> {
  const { data: ticket } = await sb
    .from("support_tickets")
    .select("id,numero_public,categorie,sujet,statut,priorite,assigned_agent_id,contexte_type,contexte_id,cree_le")
    .eq("id", ticketId).eq("citoyen_id", citoyenId).maybeSingle();
  if (!ticket) return null;

  let agentNom: string | null = null;
  if (ticket.assigned_agent_id) {
    const { data: agent } = await sb.from("admin_users").select("nom,prenom").eq("id", ticket.assigned_agent_id).maybeSingle();
    agentNom = agent ? [agent.prenom, agent.nom].filter(Boolean).join(" ") || "Agent Yelen" : null;
  }

  let resoluPar: "citoyen" | "agent" | "system" | null = null;
  if (ticket.statut === "resolu" || ticket.statut === "cloture") {
    const { data: evt } = await sb
      .from("support_ticket_events").select("acteur_type")
      .eq("ticket_id", ticketId).eq("type", "resolved")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    resoluPar = (evt?.acteur_type as "citoyen" | "agent" | "system" | undefined) ?? null;
  }
  const { data: ratingRow } = await sb
    .from("support_ticket_ratings").select("note,raisons,commentaire,cree_le")
    .eq("ticket_id", ticketId).maybeSingle();
  const rating: TicketRating | null = ratingRow
    ? { note: ratingRow.note, raisons: ratingRow.raisons ?? [], commentaire: ratingRow.commentaire, cree_le: ratingRow.cree_le }
    : null;

  const { data: messages } = await sb
    .from("support_ticket_messages")
    .select("id,expediteur_type,agent_id,contenu,image_url,type,cree_le")
    .eq("ticket_id", ticketId)
    .order("cree_le", { ascending: true });

  // Marquer lu côté citoyen — messages agent non lus.
  void sb.from("support_ticket_messages").update({ lu: true }).eq("ticket_id", ticketId).eq("expediteur_type", "agent").eq("lu", false);

  // Nom par MESSAGE, pas par ticket : un ticket réouvert (brief section
  // 21) peut être repris par un agent différent — utiliser agentNom
  // (agent actuellement assigné) pour tous les messages historiques
  // afficherait le mauvais nom sur les messages d'un agent précédent.
  const agentIdsMessages = [...new Set((messages ?? []).map(m => m.agent_id).filter((v): v is string => !!v))];
  const agentNomParMessage = new Map<string, string>();
  if (agentIdsMessages.length) {
    const { data: agentsMsg } = await sb.from("admin_users").select("id,nom,prenom").in("id", agentIdsMessages);
    for (const a of agentsMsg ?? []) agentNomParMessage.set(a.id, [a.prenom, a.nom].filter(Boolean).join(" ") || "Agent Yelen");
  }

  return {
    id: ticket.id, numero_public: ticket.numero_public, categorie: ticket.categorie as SupportCategorie,
    sujet: ticket.sujet, statut: ticket.statut as SupportStatut, priorite: ticket.priorite as SupportPriorite,
    agent_nom: agentNom, contexte_type: ticket.contexte_type as SupportContexteType | null, contexte_id: ticket.contexte_id,
    cree_le: ticket.cree_le, resolu_par: resoluPar, rating,
    messages: (messages ?? []).map(m => ({
      id: m.id, expediteur_type: m.expediteur_type as "citoyen" | "agent",
      agent_nom: m.agent_id ? agentNomParMessage.get(m.agent_id) ?? "Agent Yelen" : null,
      contenu: m.contenu, image_url: m.image_url, type: m.type as "texte" | "image", cree_le: m.cree_le,
    })),
  };
}

// Retour Bryan 04/09/2026 : le citoyen ne peut plus écrire que sur une
// conversation 'en_cours' — ni pendant l'attente d'un agent (avant, c'était
// autorisé, voir CLAUDE.md), ni sur une conversation 'resolu' (avant, un
// message la rouvrait automatiquement vers 'attente_agent' — ce
// comportement est retiré : une conversation terminée reste terminée,
// « Parler au support » démarre une nouvelle conversation à la place,
// même traitement que 'cloture').
export async function envoyerMessageCitoyen(params: {
  citoyenId: string; ticketId: string; texte?: string; imageUrl?: string; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,statut").eq("id", params.ticketId).eq("citoyen_id", params.citoyenId).maybeSingle();
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (ticket.statut === "attente_agent") return { ok: false, error: "Un agent doit prendre en charge la conversation avant que vous puissiez continuer à échanger." };
  if (ticket.statut === "resolu" || ticket.statut === "cloture") return { ok: false, error: "Cette conversation est terminée. Utilisez « Parler au support » pour nous écrire à nouveau." };

  const type = params.imageUrl ? "image" : "texte";
  const { error: msgErr } = await sb.from("support_ticket_messages").insert({
    ticket_id: params.ticketId, expediteur_type: "citoyen", contenu: params.texte ?? null, image_url: params.imageUrl ?? null, type,
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  await ajouterEvenement({ ticketId: params.ticketId, type: "message_sent", acteur: { type: "citoyen" }, req: params.req });

  return { ok: true };
}

// Fin de conversation côté citoyen (brief "fin de conversation & évaluation",
// 04/09/2026) — équivalent citoyen de resoudreTicket(), mais sans exiger
// d'agent assigné : le citoyen doit pouvoir terminer même une conversation
// encore en file d'attente ("je n'ai plus besoin d'aide"). UPDATE conditionné
// sur le statut (jamais un SELECT puis UPDATE séparés, même principe que
// prendreEnCharge) pour rester idempotent si l'agent résout au même instant
// (brief section 15) : 0 ligne affectée = déjà terminée par ailleurs, on
// renvoie ok quand même — jamais une erreur pour une action qui a de toute
// façon abouti au résultat voulu.
const STATUTS_TERMINABLES_PAR_CITOYEN: SupportStatut[] = ["attente_agent", "en_cours"];

export async function terminerParCitoyen(params: { citoyenId: string; ticketId: string; req?: NextRequest }): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,statut").eq("id", params.ticketId).eq("citoyen_id", params.citoyenId).maybeSingle();
  if (!ticket) return { ok: false, error: "Conversation introuvable." };
  if (!STATUTS_TERMINABLES_PAR_CITOYEN.includes(ticket.statut as SupportStatut)) return { ok: true };

  const maintenant = new Date().toISOString();
  const { data: updated, error } = await sb
    .from("support_tickets")
    .update({ statut: "resolu", resolu_le: maintenant, mis_a_jour_le: maintenant })
    .eq("id", params.ticketId).in("statut", STATUTS_TERMINABLES_PAR_CITOYEN)
    .select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: true };

  await ajouterEvenement({
    ticketId: params.ticketId, type: "resolved", acteur: { type: "citoyen" },
    ancienneValeur: { statut: ticket.statut }, nouvelleValeur: { statut: "resolu" }, req: params.req,
  });

  return { ok: true };
}

// Évaluation de l'expérience support (brief section 6-11) — jamais un score
// attribué au citoyen (voir CLAUDE.md /chantier-strategie-retention-v2),
// ici c'est l'inverse : le citoyen note le SUPPORT. Unicité appliquée deux
// fois (contrôle applicatif + contrainte UNIQUE en base sur ticket_id,
// migration 20260904000003) — la contrainte base couvre le cas d'un double
// submit réseau que le contrôle applicatif seul manquerait.
export async function enregistrerEvaluationCitoyen(params: {
  citoyenId: string; ticketId: string; note: number; raisons: string[]; commentaire: string | null; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,statut").eq("id", params.ticketId).eq("citoyen_id", params.citoyenId).maybeSingle();
  if (!ticket) return { ok: false, error: "Conversation introuvable." };
  if (ticket.statut !== "resolu" && ticket.statut !== "cloture") {
    return { ok: false, error: "Cette conversation doit être terminée avant de pouvoir être évaluée." };
  }
  if (!Number.isInteger(params.note) || params.note < 1 || params.note > 5) {
    return { ok: false, error: "Note invalide." };
  }

  const raisonsValides = [...new Set(params.raisons)].filter(isSupportRatingRaison).slice(0, 10);
  const commentaire = params.commentaire?.trim().slice(0, 2000) || null;

  const { error } = await sb.from("support_ticket_ratings").insert({
    ticket_id: params.ticketId, citoyen_id: params.citoyenId,
    note: params.note, raisons: raisonsValides, commentaire,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Cette conversation a déjà été évaluée." };
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// ── Institution ──────────────────────────────────────────────────────────
// Miroir exact des fonctions citoyen ci-dessus (chantier "Support Yelen
// institution", 06/09/2026) — mêmes règles de transition/statut/immuabilité,
// seule la colonne d'origine change (institution_id au lieu de citoyen_id,
// expediteur_type/acteur_type 'institution' au lieu de 'citoyen').

export type TicketListItemInstitution = {
  id: string; numero_public: string; categorie: SupportCategorie | SupportCategorieInstitution; sujet: string;
  statut: SupportStatut; priorite: SupportPriorite; agent_nom: string | null;
  dernier_message: string | null; dernier_message_at: string | null; cree_le: string; non_lus: number;
};

export async function listerTicketsInstitution(institutionId: string): Promise<TicketListItemInstitution[]> {
  const { data: tickets, error } = await sb
    .from("support_tickets")
    .select("id,numero_public,categorie,sujet,statut,priorite,assigned_agent_id,cree_le")
    .eq("institution_id", institutionId)
    .order("cree_le", { ascending: false });
  if (error || !tickets || tickets.length === 0) return [];

  const ids = tickets.map(t => t.id);
  const { data: msgs } = await sb
    .from("support_ticket_messages")
    .select("ticket_id,contenu,type,cree_le,expediteur_type,lu")
    .in("ticket_id", ids)
    .order("cree_le", { ascending: false });
  const dernierParTicket = new Map<string, { contenu: string | null; type: string; cree_le: string }>();
  const nonLusParTicket = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (!dernierParTicket.has(m.ticket_id)) dernierParTicket.set(m.ticket_id, m);
    if (m.expediteur_type === "agent" && !m.lu) nonLusParTicket.set(m.ticket_id, (nonLusParTicket.get(m.ticket_id) ?? 0) + 1);
  }

  const agentIds = [...new Set(tickets.map(t => t.assigned_agent_id).filter((v): v is string => !!v))];
  const { data: agents } = agentIds.length
    ? await sb.from("admin_users").select("id,nom,prenom").in("id", agentIds)
    : { data: [] as { id: string; nom: string | null; prenom: string | null }[] };
  const agentNomMap = new Map((agents ?? []).map(a => [a.id, [a.prenom, a.nom].filter(Boolean).join(" ") || "Agent Yelen"]));

  return tickets.map(t => {
    const dernier = dernierParTicket.get(t.id);
    return {
      id: t.id, numero_public: t.numero_public, categorie: t.categorie as SupportCategorieInstitution,
      sujet: t.sujet, statut: t.statut as SupportStatut, priorite: t.priorite as SupportPriorite,
      agent_nom: t.assigned_agent_id ? agentNomMap.get(t.assigned_agent_id) ?? null : null,
      dernier_message: dernier ? (dernier.type === "image" ? "Image" : dernier.contenu) : null,
      dernier_message_at: dernier?.cree_le ?? null,
      cree_le: t.cree_le, non_lus: nonLusParTicket.get(t.id) ?? 0,
    };
  });
}

export async function creerTicketInstitution(params: {
  institutionId: string; categorie: SupportCategorieInstitution; sujet: string; message: string; req?: NextRequest;
}): Promise<ActionResult<{ id: string; numeroPublic: string }>> {
  const priorite = prioriteInitiale(params.categorie);
  const { data: ticket, error } = await sb.from("support_tickets").insert({
    institution_id: params.institutionId,
    categorie: params.categorie,
    priorite,
    sujet: params.sujet,
  }).select("id,numero_public").single();
  if (error || !ticket) return { ok: false, error: error?.message || "Création impossible." };

  const { error: msgErr } = await sb.from("support_ticket_messages").insert({
    ticket_id: ticket.id, expediteur_type: "institution", contenu: params.message, type: "texte",
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  await ajouterEvenement({
    ticketId: ticket.id, type: "created", acteur: { type: "institution" },
    nouvelleValeur: { categorie: params.categorie, priorite, statut: "attente_agent" },
    req: params.req,
  });

  return { ok: true, id: ticket.id, numeroPublic: ticket.numero_public };
}

export type TicketDetailInstitution = {
  id: string; numero_public: string; categorie: SupportCategorie | SupportCategorieInstitution; sujet: string;
  statut: SupportStatut; priorite: SupportPriorite;
  agent_nom: string | null; cree_le: string; assigne_le: string | null;
  // Position réelle dans la file (retour Bryan 06/09/2026, "ne jamais
  // afficher une position fictive") — rang réel parmi les tickets encore
  // 'attente_agent' créés avant celui-ci, tous demandeurs confondus (la
  // même file que travaillent réellement les agents, cf.
  // fileAttenteAgent()). null si le ticket n'est plus en attente.
  position_file: number | null;
  resolu_par: "institution" | "agent" | "system" | null;
  rating: TicketRating | null;
  messages: { id: string; expediteur_type: "institution" | "agent"; agent_nom: string | null; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string }[];
};

export async function obtenirTicketInstitution(institutionId: string, ticketId: string): Promise<TicketDetailInstitution | null> {
  const { data: ticket } = await sb
    .from("support_tickets")
    .select("id,numero_public,categorie,sujet,statut,priorite,assigned_agent_id,assigne_le,cree_le")
    .eq("id", ticketId).eq("institution_id", institutionId).maybeSingle();
  if (!ticket) return null;

  let agentNom: string | null = null;
  if (ticket.assigned_agent_id) {
    const { data: agent } = await sb.from("admin_users").select("nom,prenom").eq("id", ticket.assigned_agent_id).maybeSingle();
    agentNom = agent ? [agent.prenom, agent.nom].filter(Boolean).join(" ") || "Agent Yelen" : null;
  }

  let positionFile: number | null = null;
  if (ticket.statut === "attente_agent") {
    const { count } = await sb
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("statut", "attente_agent")
      .lt("cree_le", ticket.cree_le);
    positionFile = (count ?? 0) + 1;
  }

  let resoluPar: "institution" | "agent" | "system" | null = null;
  if (ticket.statut === "resolu" || ticket.statut === "cloture") {
    const { data: evt } = await sb
      .from("support_ticket_events").select("acteur_type")
      .eq("ticket_id", ticketId).eq("type", "resolved")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    resoluPar = (evt?.acteur_type as "institution" | "agent" | "system" | undefined) ?? null;
  }
  const { data: ratingRow } = await sb
    .from("support_ticket_ratings").select("note,raisons,commentaire,cree_le")
    .eq("ticket_id", ticketId).maybeSingle();
  const rating: TicketRating | null = ratingRow
    ? { note: ratingRow.note, raisons: ratingRow.raisons ?? [], commentaire: ratingRow.commentaire, cree_le: ratingRow.cree_le }
    : null;

  const { data: messages } = await sb
    .from("support_ticket_messages")
    .select("id,expediteur_type,agent_id,contenu,image_url,type,cree_le")
    .eq("ticket_id", ticketId)
    .order("cree_le", { ascending: true });

  void sb.from("support_ticket_messages").update({ lu: true }).eq("ticket_id", ticketId).eq("expediteur_type", "agent").eq("lu", false);

  const agentIdsMessages = [...new Set((messages ?? []).map(m => m.agent_id).filter((v): v is string => !!v))];
  const agentNomParMessage = new Map<string, string>();
  if (agentIdsMessages.length) {
    const { data: agentsMsg } = await sb.from("admin_users").select("id,nom,prenom").in("id", agentIdsMessages);
    for (const a of agentsMsg ?? []) agentNomParMessage.set(a.id, [a.prenom, a.nom].filter(Boolean).join(" ") || "Agent Yelen");
  }

  return {
    id: ticket.id, numero_public: ticket.numero_public, categorie: ticket.categorie as SupportCategorieInstitution,
    sujet: ticket.sujet, statut: ticket.statut as SupportStatut, priorite: ticket.priorite as SupportPriorite,
    agent_nom: agentNom, cree_le: ticket.cree_le, assigne_le: ticket.assigne_le, position_file: positionFile,
    resolu_par: resoluPar, rating,
    messages: (messages ?? []).map(m => ({
      id: m.id, expediteur_type: m.expediteur_type as "institution" | "agent",
      agent_nom: m.agent_id ? agentNomParMessage.get(m.agent_id) ?? "Agent Yelen" : null,
      contenu: m.contenu, image_url: m.image_url, type: m.type as "texte" | "image", cree_le: m.cree_le,
    })),
  };
}

export async function envoyerMessageInstitution(params: {
  institutionId: string; ticketId: string; texte?: string; imageUrl?: string; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,statut").eq("id", params.ticketId).eq("institution_id", params.institutionId).maybeSingle();
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  // Retour Bryan 06/09/2026 : contrairement au citoyen (envoyerMessageCitoyen,
  // système fermé, non modifié), l'institution peut compléter sa demande
  // pendant l'attente — "ajouter des informations sans attendre l'agent".
  // Reste un insert sur LE MÊME ticket (jamais un nouveau), aucune
  // transition de statut déclenchée par ce message.
  if (ticket.statut === "resolu" || ticket.statut === "cloture") return { ok: false, error: "Cette conversation est terminée. Démarrez une nouvelle conversation pour nous écrire à nouveau." };

  const type = params.imageUrl ? "image" : "texte";
  const { error: msgErr } = await sb.from("support_ticket_messages").insert({
    ticket_id: params.ticketId, expediteur_type: "institution", contenu: params.texte ?? null, image_url: params.imageUrl ?? null, type,
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  await ajouterEvenement({ ticketId: params.ticketId, type: "message_sent", acteur: { type: "institution" }, req: params.req });

  return { ok: true };
}

const STATUTS_TERMINABLES_PAR_INSTITUTION: SupportStatut[] = ["attente_agent", "en_cours"];

export async function terminerParInstitution(params: { institutionId: string; ticketId: string; req?: NextRequest }): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,statut").eq("id", params.ticketId).eq("institution_id", params.institutionId).maybeSingle();
  if (!ticket) return { ok: false, error: "Conversation introuvable." };
  if (!STATUTS_TERMINABLES_PAR_INSTITUTION.includes(ticket.statut as SupportStatut)) return { ok: true };

  const maintenant = new Date().toISOString();
  const { data: updated, error } = await sb
    .from("support_tickets")
    .update({ statut: "resolu", resolu_le: maintenant, mis_a_jour_le: maintenant })
    .eq("id", params.ticketId).in("statut", STATUTS_TERMINABLES_PAR_INSTITUTION)
    .select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: true };

  await ajouterEvenement({
    ticketId: params.ticketId, type: "resolved", acteur: { type: "institution" },
    ancienneValeur: { statut: ticket.statut }, nouvelleValeur: { statut: "resolu" }, req: params.req,
  });

  return { ok: true };
}

export async function enregistrerEvaluationInstitution(params: {
  institutionId: string; ticketId: string; note: number; raisons: string[]; commentaire: string | null; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,statut").eq("id", params.ticketId).eq("institution_id", params.institutionId).maybeSingle();
  if (!ticket) return { ok: false, error: "Conversation introuvable." };
  if (ticket.statut !== "resolu" && ticket.statut !== "cloture") {
    return { ok: false, error: "Cette conversation doit être terminée avant de pouvoir être évaluée." };
  }
  if (!Number.isInteger(params.note) || params.note < 1 || params.note > 5) {
    return { ok: false, error: "Note invalide." };
  }

  const raisonsValides = [...new Set(params.raisons)].filter(isSupportRatingRaison).slice(0, 10);
  const commentaire = params.commentaire?.trim().slice(0, 2000) || null;

  const { error } = await sb.from("support_ticket_ratings").insert({
    ticket_id: params.ticketId, institution_id: params.institutionId,
    note: params.note, raisons: raisonsValides, commentaire,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Cette conversation a déjà été évaluée." };
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// ── Agent (console admin) ───────────────────────────────────────────────

export type FileAttenteItem = {
  id: string; numero_public: string; categorie: SupportCategorie | SupportCategorieInstitution; sujet: string;
  statut: SupportStatut; priorite: SupportPriorite;
  // Origine (chantier "Support Yelen institution" 06/09/2026) : exactement
  // un des deux non-null, jamais les deux (même garantie que la contrainte
  // DB). citoyen_nom conservé tel quel (non renommé) pour ne pas casser
  // app/admin/support/page.tsx dans ce lot — institution_nom est un ajout
  // pur. Lot E (UI admin) affichera les deux distinctement.
  origine: "citoyen" | "institution";
  citoyen_nom: string | null; institution_nom: string | null;
  assigned_agent_id: string | null; agent_nom: string | null; cree_le: string; dernier_message_at: string | null;
};

export async function fileAttenteAgent(filtreStatut?: SupportStatut): Promise<{ items: FileAttenteItem[]; compteurs: Record<SupportStatut, number> }> {
  const { data: tickets } = await sb
    .from("support_tickets")
    .select("id,numero_public,citoyen_id,institution_id,categorie,sujet,statut,priorite,assigned_agent_id,cree_le")
    .order("cree_le", { ascending: true });
  const all = tickets ?? [];

  const compteurs: Record<SupportStatut, number> = { attente_agent: 0, en_cours: 0, resolu: 0, cloture: 0 };
  for (const t of all) compteurs[t.statut as SupportStatut] = (compteurs[t.statut as SupportStatut] ?? 0) + 1;

  const visibles = filtreStatut ? all.filter(t => t.statut === filtreStatut) : all.filter(t => t.statut !== "cloture");

  const citoyenIds = [...new Set(visibles.map(t => t.citoyen_id).filter((v): v is string => !!v))];
  const institutionIds = [...new Set(visibles.map(t => t.institution_id).filter((v): v is string => !!v))];
  const agentIds = [...new Set(visibles.map(t => t.assigned_agent_id).filter((v): v is string => !!v))];
  const [{ data: citoyens }, { data: institutions }, { data: agents }, { data: derniers }] = await Promise.all([
    citoyenIds.length ? sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds) : Promise.resolve({ data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] }),
    institutionIds.length ? sb.from("institutions").select("id,name").in("id", institutionIds) : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    agentIds.length ? sb.from("admin_users").select("id,nom,prenom").in("id", agentIds) : Promise.resolve({ data: [] as { id: string; nom: string | null; prenom: string | null }[] }),
    sb.from("support_ticket_messages").select("ticket_id,cree_le").in("ticket_id", visibles.map(t => t.id)).order("cree_le", { ascending: false }),
  ]);
  const citoyenNomMap = new Map((citoyens ?? []).map(c => [c.id, [c.prenom, c.nom].filter(Boolean).join(" ") || c.phone || "Citoyen"]));
  const institutionNomMap = new Map((institutions ?? []).map(i => [i.id, i.name || "Établissement"]));
  const agentNomMap = new Map((agents ?? []).map(a => [a.id, [a.prenom, a.nom].filter(Boolean).join(" ") || "Agent Yelen"]));
  const dernierMsgMap = new Map<string, string>();
  for (const m of derniers ?? []) if (!dernierMsgMap.has(m.ticket_id)) dernierMsgMap.set(m.ticket_id, m.cree_le);

  const items: FileAttenteItem[] = visibles.map(t => ({
    id: t.id, numero_public: t.numero_public, categorie: t.categorie as SupportCategorie, sujet: t.sujet,
    statut: t.statut as SupportStatut, priorite: t.priorite as SupportPriorite,
    origine: (t.institution_id ? "institution" : "citoyen") as FileAttenteItem["origine"],
    citoyen_nom: t.citoyen_id ? citoyenNomMap.get(t.citoyen_id) ?? "Citoyen" : null,
    institution_nom: t.institution_id ? institutionNomMap.get(t.institution_id) ?? "Établissement" : null,
    assigned_agent_id: t.assigned_agent_id, agent_nom: t.assigned_agent_id ? agentNomMap.get(t.assigned_agent_id) ?? null : null,
    cree_le: t.cree_le, dernier_message_at: dernierMsgMap.get(t.id) ?? null,
  })).sort((a, b) => new Date(b.dernier_message_at ?? b.cree_le).getTime() - new Date(a.dernier_message_at ?? a.cree_le).getTime());

  return { items, compteurs };
}

// Retour type élargi (chantier "Support Yelen institution" 06/09/2026) :
// citoyen_nom devient nullable, institution_id/institution_nom ajoutés —
// additif, ne casse pas app/admin/support/page.tsx (type local découplé,
// citoyen_nom toujours affiché tel quel en JSX, un null n'y affiche rien).
export async function obtenirTicketAgent(ticketId: string): Promise<(Omit<TicketDetail, "messages"> & {
  citoyen_nom: string | null; institution_id: string | null; institution_nom: string | null;
  messages: (Omit<TicketDetail["messages"][number], "expediteur_type"> & { expediteur_type: "citoyen" | "agent" | "institution" })[];
}) | null> {
  const { data: ticket } = await sb
    .from("support_tickets")
    .select("id,numero_public,citoyen_id,institution_id,categorie,sujet,statut,priorite,assigned_agent_id,contexte_type,contexte_id,cree_le")
    .eq("id", ticketId).maybeSingle();
  if (!ticket) return null;

  const expediteurNonAgent = ticket.institution_id ? "institution" : "citoyen";
  const [{ data: citoyen }, { data: institution }, { data: agent }, { data: messages }] = await Promise.all([
    ticket.citoyen_id ? sb.from("users").select("nom,prenom,phone").eq("id", ticket.citoyen_id).maybeSingle() : Promise.resolve({ data: null }),
    ticket.institution_id ? sb.from("institutions").select("name").eq("id", ticket.institution_id).maybeSingle() : Promise.resolve({ data: null }),
    ticket.assigned_agent_id ? sb.from("admin_users").select("nom,prenom").eq("id", ticket.assigned_agent_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("support_ticket_messages").select("id,expediteur_type,agent_id,contenu,image_url,type,cree_le").eq("ticket_id", ticketId).order("cree_le", { ascending: true }),
  ]);
  const agentNom = agent ? [agent.prenom, agent.nom].filter(Boolean).join(" ") || "Agent Yelen" : null;

  void sb.from("support_ticket_messages").update({ lu: true }).eq("ticket_id", ticketId).eq("expediteur_type", expediteurNonAgent).eq("lu", false);

  // Voir obtenirTicketCitoyen : nom par message, pas par ticket (agent
  // potentiellement différent après une réouverture).
  const agentIdsMessages = [...new Set((messages ?? []).map(m => m.agent_id).filter((v): v is string => !!v))];
  const agentNomParMessage = new Map<string, string>();
  if (ticket.assigned_agent_id && agentNom) agentNomParMessage.set(ticket.assigned_agent_id, agentNom);
  const idsRestants = agentIdsMessages.filter(id => !agentNomParMessage.has(id));
  if (idsRestants.length) {
    const { data: agentsMsg } = await sb.from("admin_users").select("id,nom,prenom").in("id", idsRestants);
    for (const a of agentsMsg ?? []) agentNomParMessage.set(a.id, [a.prenom, a.nom].filter(Boolean).join(" ") || "Agent Yelen");
  }

  return {
    id: ticket.id, numero_public: ticket.numero_public, categorie: ticket.categorie as SupportCategorie,
    sujet: ticket.sujet, statut: ticket.statut as SupportStatut, priorite: ticket.priorite as SupportPriorite,
    agent_nom: agentNom, contexte_type: ticket.contexte_type as SupportContexteType | null, contexte_id: ticket.contexte_id,
    // resolu_par/rating : champs ajoutés au type TicketDetail partagé pour
    // l'écran citoyen (fin de conversation + évaluation, 04/09/2026) — pas
    // encore affichés dans la console admin (hors périmètre de ce chantier),
    // donc non calculés ici pour éviter deux requêtes supplémentaires
    // inutilisées côté agent.
    resolu_par: null, rating: null,
    cree_le: ticket.cree_le,
    citoyen_nom: citoyen ? [citoyen.prenom, citoyen.nom].filter(Boolean).join(" ") || citoyen.phone || "Citoyen" : null,
    institution_id: ticket.institution_id, institution_nom: institution ? institution.name || "Établissement" : null,
    messages: (messages ?? []).map(m => ({
      id: m.id, expediteur_type: m.expediteur_type as "citoyen" | "agent" | "institution",
      agent_nom: m.agent_id ? agentNomParMessage.get(m.agent_id) ?? "Agent Yelen" : null,
      contenu: m.contenu, image_url: m.image_url, type: m.type as "texte" | "image", cree_le: m.cree_le,
    })),
  };
}

// Assignation atomique (brief section 7 : "deux agents ne doivent jamais
// pouvoir prendre simultanément le même ticket") — UPDATE conditionné sur
// statut='attente_agent', jamais un SELECT puis UPDATE séparés. 0 ligne
// affectée = un autre agent a déjà pris le ticket entre-temps.
export async function prendreEnCharge(params: { agentId: string; agentNom: string; ticketId: string; req?: NextRequest }): Promise<ActionResult> {
  const maintenant = new Date().toISOString();
  const { data, error } = await sb
    .from("support_tickets")
    .update({ statut: "en_cours", assigned_agent_id: params.agentId, assigne_le: maintenant, mis_a_jour_le: maintenant })
    .eq("id", params.ticketId).eq("statut", "attente_agent")
    .select("id,citoyen_id,institution_id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Cette demande a déjà été prise en charge par un autre agent." };

  await ajouterEvenement({
    ticketId: params.ticketId, type: "assigned", acteur: { type: "agent", agentId: params.agentId, agentNom: params.agentNom },
    nouvelleValeur: { statut: "en_cours", assigned_agent_id: params.agentId }, req: params.req,
  });
  if (data.institution_id) {
    await notifierInstitution(data.institution_id, params.ticketId, "Vous êtes en contact avec Yelen", `${params.agentNom} va vous aider.`);
  } else if (data.citoyen_id) {
    await notifierCitoyen(data.citoyen_id, params.ticketId, "Vous êtes en contact avec Yelen", `${params.agentNom} va vous aider.`);
  }

  return { ok: true };
}

export async function envoyerMessageAgent(params: {
  agentId: string; agentNom: string; ticketId: string; contenu: string; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,citoyen_id,institution_id,statut,assigned_agent_id").eq("id", params.ticketId).maybeSingle();
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (ticket.statut !== "en_cours" || ticket.assigned_agent_id !== params.agentId) {
    return { ok: false, error: "Vous devez avoir pris en charge cette demande pour y répondre." };
  }

  const { error: msgErr } = await sb.from("support_ticket_messages").insert({
    ticket_id: params.ticketId, expediteur_type: "agent", agent_id: params.agentId, contenu: params.contenu, type: "texte",
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  await ajouterEvenement({ ticketId: params.ticketId, type: "message_sent", acteur: { type: "agent", agentId: params.agentId, agentNom: params.agentNom }, req: params.req });
  if (ticket.institution_id) {
    await notifierInstitution(ticket.institution_id, params.ticketId, "Nouvelle réponse de l'agent Yelen", `${params.agentNom} : ${params.contenu.slice(0, 120)}`);
  } else if (ticket.citoyen_id) {
    await notifierCitoyen(ticket.citoyen_id, params.ticketId, "Nouvelle réponse de l'agent Yelen", `${params.agentNom} : ${params.contenu.slice(0, 120)}`);
  }

  return { ok: true };
}

export async function resoudreTicket(params: { agentId: string; agentNom: string; ticketId: string; req?: NextRequest }): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,citoyen_id,institution_id,statut,assigned_agent_id").eq("id", params.ticketId).maybeSingle();
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (!SUPPORT_TRANSITIONS[ticket.statut as SupportStatut]?.includes("resolu") || ticket.assigned_agent_id !== params.agentId) {
    return { ok: false, error: "Transition impossible." };
  }

  const maintenant = new Date().toISOString();
  const { error } = await sb.from("support_tickets").update({ statut: "resolu", resolu_le: maintenant, mis_a_jour_le: maintenant }).eq("id", params.ticketId);
  if (error) return { ok: false, error: error.message };

  await ajouterEvenement({
    ticketId: params.ticketId, type: "resolved", acteur: { type: "agent", agentId: params.agentId, agentNom: params.agentNom },
    ancienneValeur: { statut: ticket.statut }, nouvelleValeur: { statut: "resolu" }, req: params.req,
  });
  if (ticket.institution_id) {
    await notifierInstitution(ticket.institution_id, params.ticketId, "Votre problème est résolu", `${params.agentNom} considère votre problème résolu. Répondez ici si vous avez encore besoin d'aide.`);
  } else if (ticket.citoyen_id) {
    await notifierCitoyen(ticket.citoyen_id, params.ticketId, "Votre problème est résolu", `${params.agentNom} considère votre problème résolu. Répondez ici si vous avez encore besoin d'aide.`);
  }

  return { ok: true };
}

export async function cloturerTicket(params: { agentId: string; agentNom: string; ticketId: string; req?: NextRequest }): Promise<ActionResult> {
  const { data: ticket } = await sb.from("support_tickets").select("id,citoyen_id,institution_id,statut,assigned_agent_id").eq("id", params.ticketId).maybeSingle();
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (!SUPPORT_TRANSITIONS[ticket.statut as SupportStatut]?.includes("cloture") || ticket.assigned_agent_id !== params.agentId) {
    return { ok: false, error: "Transition impossible — la demande doit être résolue avant clôture." };
  }

  const maintenant = new Date().toISOString();
  const { error } = await sb.from("support_tickets").update({ statut: "cloture", cloture_le: maintenant, mis_a_jour_le: maintenant }).eq("id", params.ticketId);
  if (error) return { ok: false, error: error.message };

  await ajouterEvenement({
    ticketId: params.ticketId, type: "closed", acteur: { type: "agent", agentId: params.agentId, agentNom: params.agentNom },
    ancienneValeur: { statut: ticket.statut }, nouvelleValeur: { statut: "cloture" }, req: params.req,
  });
  if (ticket.institution_id) {
    await notifierInstitution(ticket.institution_id, params.ticketId, "Conversation terminée", "Merci d'avoir contacté Yelen. Vous pouvez nous écrire à tout moment si vous avez besoin d'aide.");
  } else if (ticket.citoyen_id) {
    await notifierCitoyen(ticket.citoyen_id, params.ticketId, "Conversation terminée", "Merci d'avoir contacté Yelen. Vous pouvez nous écrire à tout moment si vous avez besoin d'aide.");
  }

  return { ok: true };
}
