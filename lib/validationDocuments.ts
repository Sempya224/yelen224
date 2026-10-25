import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequiredDocuments, getRequiredDocumentsInternational } from "@/lib/documentsInstitution";

// Garde "documents soumis avant validation" (décision Bryan 24/10/2026) —
// partagée par les deux routes admin qui font passer un établissement à
// 'validee' : valider et reactiver. Miroir applicatif du trigger SQL
// institutions_exiger_documents_avant_validation (migrations 20261024000002 et
// 20261024000003), qui reste la barrière infranchissable ; ce helper existe
// pour renvoyer à l'admin un message lisible plutôt qu'une erreur de base.

export type VerdictDocuments = { ok: true } | { ok: false; error: string };

/** Vrai si l'établissement a déjà été validé un jour : acceptation des
 * conditions prestataire (n'est demandée qu'après validation) ou trace
 * VALIDER_INSTITUTION dans admin_logs. Sert à ne pas bloquer la réactivation
 * des comptes historiques validés avant l'existence du dépôt de documents. */
async function aDejaEteValidee(sb: SupabaseClient, institutionId: string, conditionsAccepteesLe: string | null): Promise<boolean> {
  if (conditionsAccepteesLe) return true;
  const { data, error } = await sb.from("admin_logs").select("id").eq("cible_id", institutionId).eq("action", "VALIDER_INSTITUTION").limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function verifierDocumentsAvantValidation(sb: SupabaseClient, institutionId: string): Promise<VerdictDocuments> {
  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("statut, statut_juridique, origine_type, conditions_prestataire_acceptees_le")
    .eq("id", institutionId)
    .maybeSingle();
  if (instErr) throw instErr;
  if (!inst) return { ok: false, error: "Établissement introuvable." };

  // Déjà validé : aucun changement de statut en jeu.
  if (inst.statut === "validee") return { ok: true };
  // Réactivation d'un compte déjà validé un jour : jamais re-contrôlé. Un
  // établissement suspendu SANS avoir jamais été validé ne passe pas par ce
  // raccourci (faille suspendre -> réactiver corrigée le 24/10/2026).
  if (inst.statut === "suspendue" && await aDejaEteValidee(sb, institutionId, inst.conditions_prestataire_acceptees_le)) {
    return { ok: true };
  }

  if (!inst.statut_juridique) {
    return { ok: false, error: "Validation impossible : le statut juridique de l'établissement n'est pas renseigné, ses documents requis ne peuvent pas être déterminés." };
  }

  let requis = getRequiredDocuments(inst.statut_juridique);
  if (inst.origine_type === "etrangere") {
    const { data: identite, error: identiteErr } = await sb
      .from("institution_identite_internationale")
      .select("statut_presence_guinee")
      .eq("institution_id", institutionId)
      .maybeSingle();
    if (identiteErr) throw identiteErr;
    requis = [...requis, ...getRequiredDocumentsInternational(identite?.statut_presence_guinee)];
  }
  if (requis.length === 0) {
    return { ok: false, error: "Validation impossible : aucun document requis n'est défini pour ce statut juridique. Vérifiez le profil de l'établissement." };
  }

  const { data: deposes, error: deposesErr } = await sb
    .from("documents_institution")
    .select("type, statut")
    .eq("institution_id", institutionId)
    .eq("statut_actif", true);
  if (deposesErr) throw deposesErr;

  // Une preuve compte si sa version active est reçue ou validée : un document
  // rejeté ou en complément demandé doit d'abord être renvoyé.
  const manquants = requis.filter(
    (doc) => !(deposes ?? []).some((d) => d.type === doc.type && (d.statut === "recu" || d.statut === "valide"))
  );
  if (manquants.length > 0) {
    return { ok: false, error: `Validation impossible : documents non soumis ou à renvoyer — ${manquants.map((m) => m.label).join(", ")}.` };
  }
  return { ok: true };
}
