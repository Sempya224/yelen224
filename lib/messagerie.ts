import { supabase } from "@/lib/supabase";
import { envoyerNotification } from "@/lib/notifications";

// Messagerie citoyen ↔ institution. Une conversation = un couple
// (citoyen, institution), jamais un RDV précis — la table `messages`
// n'a pas de colonne rdv_id (vérifié par SELECT SQL le 13/07/2026).
// Écritures citoyen faites directement ici via le client supabase
// standard : la policy RLS messages_citoyen_own (expediteur_citoyen_id
// OU destinataire_citoyen_id = auth.uid()) couvre ce cas, pas besoin de
// route API dédiée côté citoyen (à la différence de l'institution, qui
// passe par /api/institution/messages en service_role).

export type Conversation = {
  institution_id: string;
  institution_nom: string;
  institution_logo: string | null;
  dernier_message: string | null;
  dernier_message_at: string | null;
  non_lus: number;
};

export type MessageThread = { id: string; contenu: string; lu: boolean; cree_le: string; emetteur: "citoyen" | "institution" };

export async function getConversations(citoyenId: string): Promise<Conversation[]> {
  const { data: rdvData, error: rdvErr } = await supabase
    .from("rdv")
    .select("institution_id, institutions!rdv_institution_id_fkey(id,name,logo)")
    .eq("citoyen_id", citoyenId);
  if (rdvErr) throw rdvErr;

  const instMap = new Map<string, { nom: string; logo: string | null }>();
  for (const r of rdvData ?? []) {
    const inst = r.institutions as unknown as { id: string; name: string; logo: string | null } | null;
    if (inst && !instMap.has(inst.id)) instMap.set(inst.id, { nom: inst.name, logo: inst.logo });
  }
  if (instMap.size === 0) return [];

  const { data: msgData, error: msgErr } = await supabase
    .from("messages")
    .select("expediteur_institution_id,destinataire_institution_id,contenu,lu,cree_le")
    .or(`expediteur_citoyen_id.eq.${citoyenId},destinataire_citoyen_id.eq.${citoyenId}`)
    .order("cree_le", { ascending: true });
  if (msgErr) throw msgErr;

  const lastByInst = new Map<string, { contenu: string; cree_le: string }>();
  const unreadByInst = new Map<string, number>();
  for (const m of msgData ?? []) {
    const instId = m.expediteur_institution_id || m.destinataire_institution_id;
    if (!instId) continue;
    lastByInst.set(instId, { contenu: m.contenu, cree_le: m.cree_le });
    if (m.expediteur_institution_id === instId && !m.lu) {
      unreadByInst.set(instId, (unreadByInst.get(instId) ?? 0) + 1);
    }
  }

  return [...instMap.entries()]
    .map(([id, info]) => ({
      institution_id: id,
      institution_nom: info.nom,
      institution_logo: info.logo,
      dernier_message: lastByInst.get(id)?.contenu ?? null,
      dernier_message_at: lastByInst.get(id)?.cree_le ?? null,
      non_lus: unreadByInst.get(id) ?? 0,
    }))
    .sort((a, b) => {
      if (!a.dernier_message_at) return 1;
      if (!b.dernier_message_at) return -1;
      return new Date(b.dernier_message_at).getTime() - new Date(a.dernier_message_at).getTime();
    });
}

export async function getThread(citoyenId: string, institutionId: string): Promise<MessageThread[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id,expediteur_citoyen_id,contenu,lu,cree_le")
    .or(`and(expediteur_institution_id.eq.${institutionId},destinataire_citoyen_id.eq.${citoyenId}),and(expediteur_citoyen_id.eq.${citoyenId},destinataire_institution_id.eq.${institutionId})`)
    .order("cree_le", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    contenu: m.contenu,
    lu: m.lu,
    cree_le: m.cree_le,
    emetteur: m.expediteur_citoyen_id ? ("citoyen" as const) : ("institution" as const),
  }));
}

export async function sendMessage(citoyenId: string, institutionId: string, contenu: string): Promise<void> {
  const { error } = await supabase.from("messages").insert({
    expediteur_citoyen_id: citoyenId,
    destinataire_institution_id: institutionId,
    contenu,
    lu: false,
  });
  if (error) throw error;

  const { data: u } = await supabase.from("users").select("nom,prenom").eq("id", citoyenId).maybeSingle();
  const nomCitoyen = [u?.prenom, u?.nom].filter(Boolean).join(" ") || "Un client";
  await envoyerNotification({
    destinataire_id: institutionId,
    destinataire_type: "institution",
    rdv_id: null,
    type: "message",
    titre: "💬 Nouveau message",
    message: `${nomCitoyen} : ${contenu.slice(0, 120)}`,
  });
}

export async function markThreadRead(citoyenId: string, institutionId: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ lu: true })
    .eq("destinataire_citoyen_id", citoyenId)
    .eq("expediteur_institution_id", institutionId)
    .eq("lu", false);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════
// V2 — conversations scopées par rdv (chantier "Messagerie" 19/07/2026)
// ════════════════════════════════════════════════════════════════════
// Décision Bryan : une conversation citoyen↔institution est désormais
// scopée à UN rdv précis (messages.rdv_id, migration
// 20260724000006_messagerie_rdv_yelen.sql), pas à la paire
// (citoyen, institution) comme `getConversations`/`getThread`/`sendMessage`
// ci-dessus (conservées telles quelles : encore utilisées par le widget
// "Conversations" de app/mes-rdv/page.tsx comme simple aperçu agrégé par
// établissement, sans besoin de la logique de fermeture). L'écran
// Messagerie citoyen (onglet "Établissements") utilise exclusivement les
// fonctions ci-dessous.

/** Statuts rdv considérés terminaux — la conversation liée se ferme
 * définitivement (plus aucun envoi possible des deux côtés). Mirroring
 * rdvsHistorique dans app/mes-rdv/page.tsx. */
export const STATUTS_RDV_FERMES = ["termine", "annule", "refuse"] as const;
export function conversationFermee(statutRdv: string): boolean {
  return (STATUTS_RDV_FERMES as readonly string[]).includes(statutRdv);
}

export type ConversationEtablissement = {
  rdv_id: string;
  institution_id: string;
  institution_nom: string;
  institution_logo: string | null;
  service: string | null;
  date_rdv: string;
  fermee: boolean;
  // Restriction messagerie citoyen → institution suspendue (retour Bryan
  // 17/08/2026) : l'établissement reste consultable pour un rdv déjà pris,
  // mais un citoyen ne doit pas pouvoir lui écrire de nouveau message tant
  // qu'il est suspendu — message explicite plutôt qu'un envoi silencieux.
  institution_suspendue: boolean;
  dernier_message: string | null;
  dernier_message_type: "texte" | "image" | null;
  dernier_message_at: string | null;
  non_lus: number;
};

export type MessageRdvThread = {
  id: string;
  contenu: string | null;
  image_url: string | null;
  type: "texte" | "image";
  lu: boolean;
  cree_le: string;
  emetteur: "citoyen" | "institution";
};

/** Liste des conversations "Établissements" : une entrée par rdv qui est
 * soit encore ouvert (peu importe qu'il y ait déjà eu un message — permet
 * de démarrer la conversation dès la prise de RDV), soit fermé mais ayant
 * eu au moins un échange (historique, lecture seule). Un rdv fermé sans
 * aucun message n'apparaît pas : rien à montrer, éviterait de polluer la
 * liste d'une entrée par rdv jamais utilisé pour discuter. */
export async function getConversationsEtablissements(citoyenId: string): Promise<ConversationEtablissement[]> {
  const { data: rdvs, error: rdvErr } = await supabase
    .from("rdv")
    .select("id,institution_id,statut,service,date_rdv,institutions!rdv_institution_id_fkey(id,name,logo,statut)")
    .eq("citoyen_id", citoyenId)
    .order("date_rdv", { ascending: false });
  if (rdvErr) throw rdvErr;
  if (!rdvs || rdvs.length === 0) return [];

  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("rdv_id,contenu,image_url,type,lu,cree_le,destinataire_citoyen_id")
    .or(`expediteur_citoyen_id.eq.${citoyenId},destinataire_citoyen_id.eq.${citoyenId}`)
    .not("rdv_id", "is", null)
    .order("cree_le", { ascending: true });
  if (msgErr) throw msgErr;

  const parRdv = new Map<string, { contenu: string | null; type: "texte" | "image"; cree_le: string }>();
  const nonLusParRdv = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (!m.rdv_id) continue;
    parRdv.set(m.rdv_id, { contenu: m.contenu, type: (m.type as "texte" | "image") ?? "texte", cree_le: m.cree_le });
    if (m.destinataire_citoyen_id === citoyenId && !m.lu) {
      nonLusParRdv.set(m.rdv_id, (nonLusParRdv.get(m.rdv_id) ?? 0) + 1);
    }
  }

  return rdvs
    .map(r => {
      const inst = r.institutions as unknown as { id: string; name: string; logo: string | null; statut: string | null } | null;
      const fermee = conversationFermee(r.statut as string);
      const dernier = parRdv.get(r.id);
      return {
        rdv_id: r.id,
        institution_id: r.institution_id,
        institution_nom: inst?.name ?? "Établissement",
        institution_logo: inst?.logo ?? null,
        service: r.service ?? null,
        date_rdv: r.date_rdv,
        fermee,
        institution_suspendue: inst?.statut === "suspendue",
        dernier_message: dernier?.contenu ?? null,
        dernier_message_type: dernier?.type ?? null,
        dernier_message_at: dernier?.cree_le ?? null,
        non_lus: nonLusParRdv.get(r.id) ?? 0,
      };
    })
    .filter(c => !c.fermee || c.dernier_message_at !== null)
    .sort((a, b) => {
      const ta = a.dernier_message_at ?? a.date_rdv;
      const tb = b.dernier_message_at ?? b.date_rdv;
      return new Date(tb).getTime() - new Date(ta).getTime();
    });
}

/** Page la plus récente par défaut (50 derniers messages, ordre chrono
 * croissant) — passer `avant` (cree_le du plus ancien message déjà chargé)
 * pour remonter une page plus loin dans l'historique. */
export async function getThreadRdv(rdvId: string, options?: { limite?: number; avant?: string }): Promise<MessageRdvThread[]> {
  let q = supabase
    .from("messages")
    .select("id,expediteur_citoyen_id,contenu,image_url,type,lu,cree_le")
    .eq("rdv_id", rdvId)
    .order("cree_le", { ascending: false })
    .limit(options?.limite ?? 50);
  if (options?.avant) q = q.lt("cree_le", options.avant);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).reverse().map(m => ({
    id: m.id,
    contenu: m.contenu,
    image_url: m.image_url,
    type: (m.type as "texte" | "image") ?? "texte",
    lu: m.lu,
    cree_le: m.cree_le,
    emetteur: m.expediteur_citoyen_id ? ("citoyen" as const) : ("institution" as const),
  }));
}

// Message personnalisé avec le vrai nom de l'établissement (retour Bryan
// 17/08/2026 : un texte générique "cet établissement" ne suffit pas, même
// convention que le reste du produit qui nomme toujours l'entité réelle —
// cf. envoyerNotification/salutation). Réutilisé à l'identique par
// app/messagerie/citoyen/page.tsx (bannière du fil) pour ne jamais
// désynchroniser le texte affiché avant l'envoi de celui renvoyé en cas
// d'échec réel.
export function messageInstitutionSuspendue(nomEtablissement: string): string {
  return `${nomEtablissement} est temporairement indisponible sur Yelen — vous ne pouvez pas lui envoyer de message pour le moment. Besoin d'aide ? Contactez le support Yelen.`;
}

// Erreur typée (plutôt qu'un message générique comparé par égalité stricte,
// fragile dès que le texte est personnalisé par établissement) — le code
// appelant distingue ce cas via `instanceof`.
export class InstitutionSuspendueError extends Error {
  constructor(nomEtablissement: string) {
    super(messageInstitutionSuspendue(nomEtablissement));
    this.name = "InstitutionSuspendueError";
  }
}

export async function sendMessageRdv(
  citoyenId: string,
  institutionId: string,
  rdvId: string,
  contenu: { texte?: string; imageUrl?: string }
): Promise<void> {
  // Restriction messagerie citoyen → institution suspendue (retour Bryan
  // 17/08/2026). Vérification client, cohérente avec l'architecture déjà en
  // place ici (écriture citoyen directe via RLS, jamais de route API
  // dédiée pour ce flux — voir en-tête de fichier) : une barrière UI, pas
  // une garantie serveur absolue, proportionnée au risque (aucune donnée
  // sensible en jeu, seulement un message qui n'aurait aucun destinataire
  // capable d'agir dessus).
  const { data: inst } = await supabase.from("institutions").select("statut,name").eq("id", institutionId).maybeSingle();
  if (inst?.statut === "suspendue") {
    throw new InstitutionSuspendueError(inst.name || "Cet établissement");
  }

  const type: "texte" | "image" = contenu.imageUrl ? "image" : "texte";
  const { error } = await supabase.from("messages").insert({
    expediteur_citoyen_id: citoyenId,
    destinataire_institution_id: institutionId,
    rdv_id: rdvId,
    contenu: contenu.texte ?? null,
    image_url: contenu.imageUrl ?? null,
    type,
    lu: false,
  });
  if (error) throw error;

  const { data: u } = await supabase.from("users").select("nom,prenom").eq("id", citoyenId).maybeSingle();
  const nomCitoyen = [u?.prenom, u?.nom].filter(Boolean).join(" ") || "Un client";
  await envoyerNotification({
    destinataire_id: institutionId,
    destinataire_type: "institution",
    rdv_id: rdvId,
    type: "message",
    titre: "Nouveau message",
    message: type === "image" ? `${nomCitoyen} a envoyé une image` : `${nomCitoyen} : ${(contenu.texte ?? "").slice(0, 120)}`,
  });
}

export async function markThreadReadRdv(citoyenId: string, rdvId: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ lu: true })
    .eq("rdv_id", rdvId)
    .eq("destinataire_citoyen_id", citoyenId)
    .eq("lu", false);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════
// Onglet "Yelen" — support plateforme, citoyen ↔ Yelen. Jamais fermée
// (contrairement aux conversations Établissements), toujours ouverte à
// l'envoi côté citoyen. Table dédiée messages_yelen_citoyen (distincte de
// `messages`, qui reste réservée à citoyen ↔ institution).
// ════════════════════════════════════════════════════════════════════

export type MessageYelenThread = {
  id: string;
  contenu: string | null;
  image_url: string | null;
  type: "texte" | "image";
  lu: boolean;
  cree_le: string;
  expediteur: "citoyen" | "yelen";
};

/** Même pagination que getThreadRdv (50 derniers par défaut, `avant` pour
 * remonter dans l'historique). */
export async function getThreadYelen(citoyenId: string, options?: { limite?: number; avant?: string }): Promise<MessageYelenThread[]> {
  let q = supabase
    .from("messages_yelen_citoyen")
    .select("id,expediteur,contenu,image_url,type,lu,cree_le")
    .eq("citoyen_id", citoyenId)
    .order("cree_le", { ascending: false })
    .limit(options?.limite ?? 50);
  if (options?.avant) q = q.lt("cree_le", options.avant);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as MessageYelenThread[]).reverse();
}

export async function sendMessageYelen(citoyenId: string, contenu: { texte?: string; imageUrl?: string }): Promise<void> {
  const type: "texte" | "image" = contenu.imageUrl ? "image" : "texte";
  const { error } = await supabase.from("messages_yelen_citoyen").insert({
    citoyen_id: citoyenId,
    expediteur: "citoyen",
    contenu: contenu.texte ?? null,
    image_url: contenu.imageUrl ?? null,
    type,
    lu: false,
  });
  if (error) throw error;
}

export async function markThreadYelenRead(citoyenId: string): Promise<void> {
  const { error } = await supabase
    .from("messages_yelen_citoyen")
    .update({ lu: true })
    .eq("citoyen_id", citoyenId)
    .eq("expediteur", "yelen")
    .eq("lu", false);
  if (error) throw error;
}

export async function getUnreadCountYelen(citoyenId: string): Promise<number> {
  const { count, error } = await supabase
    .from("messages_yelen_citoyen")
    .select("*", { count: "exact", head: true })
    .eq("citoyen_id", citoyenId)
    .eq("expediteur", "yelen")
    .eq("lu", false);
  if (error) throw error;
  return count ?? 0;
}
