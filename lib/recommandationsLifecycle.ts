import { createClient } from "@supabase/supabase-js";
import type { PeriodeJours } from "./analyseAggregation";
import { calculerVueEnsemble } from "./analyseAggregation";
import { calculerAnalyseTunnel } from "./analyseTunnel";
import { genererRecommandations, SEUIL_VOLUME_MINIMUM_POURCENTAGE, type RdvOuvert } from "./recommandationsInstitution";
import { decisionCycleVie, transitionManuelleAutorisee, isStatutRecommandation, type StatutRecommandation } from "./recommandationsCycleVie";

export { isStatutRecommandation, type StatutRecommandation } from "./recommandationsCycleVie";

// Service de cycle de vie (Phase 3, architecture validée CEO 13/10/2026) —
// couche 3 de l'architecture à 5 couches, entre le moteur pur
// (lib/recommandationsInstitution.ts, couche 2) et l'API (couche 4). Décide
// via lib/recommandationsCycleVie.ts (fonctions pures), agit ici via Supabase.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ───────────────────────────────────────────────────────────────────────
// Lecture
// ───────────────────────────────────────────────────────────────────────
export type RecommandationPersistee = {
  id: string;
  type: string;
  priorite: "critique" | "attention";
  constat: string;
  donnees_json: Record<string, unknown>;
  periode_jours: number;
  action_label: string | null;
  action_cible: string | null;
  statut: StatutRecommandation;
  created_at: string;
  actualisee_le: string;
  consultee_le: string | null;
  traitee_le: string | null;
  expiree_le: string | null;
};

export async function listerRecommandations(institutionId: string): Promise<RecommandationPersistee[]> {
  const { data } = await sb
    .from("institution_recommandations")
    .select("id,type,priorite,constat,donnees_json,periode_jours,action_label,action_cible,statut,created_at,actualisee_le,consultee_le,traitee_le,expiree_le")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false });
  return (data ?? []) as RecommandationPersistee[];
}

export type ResultatActualisation = {
  // Même seuil que les règles B/C du moteur (SEUIL_VOLUME_MINIMUM_POURCENTAGE)
  // — distingue pour l'écran "vos indicateurs sont stables" (volume
  // suffisant, aucun signal) de "pas assez de données pour conclure"
  // (volume insuffisant), jamais la même phrase pour les deux (décision
  // CEO section 8 : états distincts).
  volumeSuffisant: boolean;
};

// ───────────────────────────────────────────────────────────────────────
// Actualisation — recalcule les signaux (via le moteur pur) et synchronise
// l'état persistant ligne par ligne selon decisionCycleVie().
// ───────────────────────────────────────────────────────────────────────
export async function actualiserRecommandations(institutionId: string, periodeJours: PeriodeJours): Promise<ResultatActualisation> {
  const [vueEnsemble, analyseTunnel, rdvRes, lignesRes] = await Promise.all([
    calculerVueEnsemble(institutionId, periodeJours),
    calculerAnalyseTunnel(institutionId, periodeJours),
    sb.from("rdv").select("id,statut,presence_status,date_rdv,heure_rdv").eq("institution_id", institutionId).in("statut", ["nouveau", "en_attente"]),
    sb.from("institution_recommandations").select("id,cle_deduplication,statut").eq("institution_id", institutionId),
  ]);

  const rdvOuverts = (rdvRes.data ?? []) as RdvOuvert[];
  const candidats = genererRecommandations({ vueEnsemble, analyseTunnel, rdvOuverts, periodeJours });
  const candidatsParCle = new Map(candidats.map(c => [c.cleDeduplication, c]));

  type LigneExistante = { id: string; cle_deduplication: string; statut: string };
  const lignesParCle = new Map(((lignesRes.data ?? []) as LigneExistante[]).map(l => [l.cle_deduplication, l]));

  const maintenant = new Date().toISOString();
  const toutesLesCles = new Set([...candidatsParCle.keys(), ...lignesParCle.keys()]);

  for (const cle of toutesLesCles) {
    const candidat = candidatsParCle.get(cle) ?? null;
    const ligne = lignesParCle.get(cle) ?? null;
    const statutExistant = ligne && isStatutRecommandation(ligne.statut) ? ligne.statut : null;
    const action = decisionCycleVie(statutExistant, candidat !== null);

    if (action === "ignorer" || action === "laisser_traitee") continue;

    if (action === "creer" && candidat) {
      await sb.from("institution_recommandations").insert({
        institution_id: institutionId,
        type: candidat.type,
        cle_deduplication: candidat.cleDeduplication,
        priorite: candidat.priorite,
        constat: candidat.constat,
        donnees_json: candidat.donnees,
        periode_jours: candidat.periode.jours,
        action_label: candidat.action?.label ?? null,
        action_cible: candidat.action?.cible ?? null,
        statut: "nouvelle",
        actualisee_le: maintenant,
      });
    } else if (action === "reactiver" && candidat && ligne) {
      await sb.from("institution_recommandations").update({
        statut: "nouvelle",
        priorite: candidat.priorite,
        constat: candidat.constat,
        donnees_json: candidat.donnees,
        action_label: candidat.action?.label ?? null,
        action_cible: candidat.action?.cible ?? null,
        actualisee_le: maintenant,
        consultee_le: null,
        traitee_le: null,
        expiree_le: null,
      }).eq("id", ligne.id);
    } else if (action === "rafraichir" && candidat && ligne) {
      await sb.from("institution_recommandations").update({
        priorite: candidat.priorite,
        constat: candidat.constat,
        donnees_json: candidat.donnees,
        action_label: candidat.action?.label ?? null,
        action_cible: candidat.action?.cible ?? null,
        actualisee_le: maintenant,
      }).eq("id", ligne.id);
    } else if (action === "expirer" && ligne) {
      await sb.from("institution_recommandations").update({ statut: "expiree", expiree_le: maintenant }).eq("id", ligne.id);
    }
  }

  const volumeSuffisant = vueEnsemble.rdvGeneres.valeur !== null && vueEnsemble.rdvGeneres.valeur >= SEUIL_VOLUME_MINIMUM_POURCENTAGE;
  return { volumeSuffisant };
}

// ───────────────────────────────────────────────────────────────────────
// Transition manuelle (PATCH) — l'appelant (route API) doit déjà avoir
// vérifié l'authentification, le rôle et que `id` appartient bien à
// `institutionId` avant d'appeler cette fonction n'est PAS suffisant à lui
// seul : cette fonction revérifie elle-même l'institution_id en base (IDOR),
// jamais une confiance aveugle dans ce que la route a déjà filtré.
// ───────────────────────────────────────────────────────────────────────
export type ResultatTransition = { ok: true } | { ok: false; raison: "introuvable" | "transition_invalide" };

export async function changerStatutRecommandation(
  institutionId: string,
  id: string,
  statutCible: StatutRecommandation,
  membreId: string
): Promise<ResultatTransition> {
  const { data: ligne } = await sb
    .from("institution_recommandations")
    .select("id,statut")
    .eq("id", id)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (!ligne || !isStatutRecommandation(ligne.statut)) return { ok: false, raison: "introuvable" };
  if (!transitionManuelleAutorisee(ligne.statut, statutCible)) return { ok: false, raison: "transition_invalide" };

  const maintenant = new Date().toISOString();
  const patch: Record<string, unknown> = { statut: statutCible };
  if (statutCible === "consultee") { patch.consultee_le = maintenant; patch.consultee_par = membreId; }
  if (statutCible === "traitee") {
    patch.traitee_le = maintenant;
    patch.traitee_par = membreId;
    if (ligne.statut === "nouvelle") { patch.consultee_le = maintenant; patch.consultee_par = membreId; }
  }

  await sb.from("institution_recommandations").update(patch).eq("id", id).eq("institution_id", institutionId);
  return { ok: true };
}
