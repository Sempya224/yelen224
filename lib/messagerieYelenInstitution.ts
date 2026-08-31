import { SupabaseClient } from "@supabase/supabase-js";

export type StatutConversationYelen = "nouvelle" | "prise_en_charge" | "fermee";
export type ConversationYelen = { id: string; statut: StatutConversationYelen };

// Partagé entre app/api/institution/messagerie-yelen/route.ts et
// upload-image/route.ts (chantier Messagerie Lot 2, 21/08/2026, retour
// Bryan) — une conversation fermée n'est jamais réouverte : trouve la
// conversation active courante, ou en crée une nouvelle si aucune
// n'existe (jamais eu, ou la précédente a été fermée définitivement).
// La contrainte d'unicité partielle en base (migration 20260821000013)
// garantit qu'il n'y a jamais plus d'une conversation active à la fois.
export async function trouverOuCreerConversationActive(sb: SupabaseClient, institutionId: string): Promise<ConversationYelen> {
  const { data: existante } = await sb
    .from("messages_yelen_institution_conversations")
    .select("id,statut")
    .eq("institution_id", institutionId)
    .neq("statut", "fermee")
    .maybeSingle();
  if (existante) return existante as ConversationYelen;

  const { data: nouvelle, error } = await sb
    .from("messages_yelen_institution_conversations")
    .insert({ institution_id: institutionId })
    .select("id,statut")
    .single();
  if (error) throw error;
  return nouvelle as ConversationYelen;
}
