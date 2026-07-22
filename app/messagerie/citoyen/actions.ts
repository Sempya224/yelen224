"use server";

import { createClient } from "@supabase/supabase-js";
import { enregistrerAction } from "@/lib/journalActivite";

// Journalise un message envoyé PAR le citoyen — lib/messagerie.ts::sendMessage()
// insère directement depuis le navigateur via le client anon (RLS
// messages_citoyen_own), donc ne peut pas appeler enregistrerAction() qui
// nécessite SUPABASE_SERVICE_ROLE_KEY (jamais exposée côté client). Cette
// Server Action fait le pont : appelée juste après un envoi réussi, elle
// journalise côté serveur (même pattern que app/rdv/[id]/actions.ts).
// Sans ça, seuls les messages envoyés par l'institution apparaissaient
// dans le Journal d'activité — un fil de conversation à sens unique,
// trompeur pour un audit (signalé le 18/07/2026).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function journaliserMessageCitoyen(institutionId: string, citoyenId: string): Promise<void> {
  // Garde anti-injection : cette action n'a pas de vérification d'auth
  // propre (contrairement à sendMessage(), protégé par la policy RLS
  // messages_citoyen_own) et écrit via service_role. Sans ce contrôle,
  // n'importe qui connaissant cette Server Action pourrait l'appeler avec
  // des ids arbitraires et injecter une fausse entrée dans le journal
  // d'audit d'une institution. On exige donc qu'un message réel,
  // correspondant exactement à cette paire (citoyen, institution), ait
  // été envoyé dans les 30 dernières secondes.
  const { data: recent } = await sb
    .from("messages")
    .select("cree_le")
    .eq("expediteur_citoyen_id", citoyenId)
    .eq("destinataire_institution_id", institutionId)
    .order("cree_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!recent || Date.now() - new Date(recent.cree_le).getTime() > 30_000) return;

  const { data: u } = await sb.from("users").select("nom,prenom,phone").eq("id", citoyenId).maybeSingle();
  const nomCitoyen = [u?.prenom, u?.nom].filter(Boolean).join(" ") || u?.phone || "Citoyen";

  await enregistrerAction({
    institutionId,
    membreId: null,
    membreNom: nomCitoyen,
    action: "message_recu",
    cibleTable: "messages",
    cibleId: citoyenId,
  });
}
