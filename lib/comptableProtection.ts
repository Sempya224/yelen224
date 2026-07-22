import { createClient } from "@supabase/supabase-js";

// Protection du domaine comptable — décision CEO 22/07/2026. L'admin garde
// le contrôle total de l'institution, mais deux actions restent le domaine
// réservé du comptable, spécialiste de ce travail : rembourser un paiement
// et émettre/annuler une facture. L'admin ne peut les effectuer lui-même
// qu'en "accès d'urgence" — uniquement s'il n'y a plus AUCUN comptable actif
// (suspendu ou désactivé). Ça rend toute intervention de l'admin sur le
// travail du comptable un acte visible et tracé (il faut d'abord suspendre
// le compte, dans l'onglet Équipe), jamais une prise de contrôle silencieuse.
// Ne s'applique jamais au comptable lui-même — seulement à l'admin.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function accesUrgenceAdminDebloque(institutionId: string): Promise<boolean> {
  const { data } = await sb
    .from("institution_membres")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("role", "comptable")
    .eq("actif", true)
    .limit(1)
    .maybeSingle();
  return !data;
}
