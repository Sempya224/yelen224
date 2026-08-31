// ⚠️ MODULE SERVEUR UNIQUEMENT — ne jamais importer depuis un fichier
// "use client". Utilise SUPABASE_SERVICE_ROLE_KEY (secret), même garde
// que lib/notificationEngine.ts.
//
// Yelen Rewards — Phase 1 (décision CEO 26/07/2026, plan revu par 6
// analyses indépendantes : Security, Fraud, Backend, Product Rules, UX,
// QA). Ce moteur est le SEUL point d'écriture de reward_events/
// points_transactions (RLS sans policy sur ces deux tables — voir
// migrations 20260726000001 et 000003).
//
// Règle de sécurité non négociable : accorderPoints() n'accepte JAMAIS un
// montant de points fourni par l'appelant — le montant vient toujours de
// reward_rules.points_delta, jamais d'un paramètre. Et cette fonction ne
// doit JAMAIS être exposée derrière une route citoyen générique du type
// "réclamer des points" : elle n'est appelée qu'en effet de bord d'une
// transition d'état déjà de confiance, faite par du code serveur qui a
// lui-même relu la ligne source depuis la base (ex.
// app/api/institution/rdv/statut/route.ts, authentifié institution,
// jamais depuis un champ fourni par le citoyen).
//
// Idempotence à deux niveaux (voir migrations 000001 et 000003) :
// reward_events.UNIQUE(source_type, source_id, event_type) empêche
// d'ingérer deux fois le même fait réel ; points_transactions.UNIQUE(
// reward_event_id) empêche d'écrire deux fois pour le même événement. Les
// deux inserts utilisent upsert+ignoreDuplicates (ON CONFLICT DO NOTHING
// côté Postgres) — jamais un SELECT préalable suivi d'un INSERT, qui
// laisserait une fenêtre de race condition.
//
// Best-effort par conception (comme notifierArrivee/logRdvEvent) : une
// erreur ici ne doit jamais faire échouer l'action métier qui l'a
// déclenchée (marquer un RDV terminé doit réussir même si l'attribution
// de points échoue) — toujours logguée, jamais levée.
import { createClient } from "@supabase/supabase-js";
import { envoyerNotification, salutation } from "./notificationEngine";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export type RewardSourceType =
  | "rdv"
  | "citoyen_demarche"
  | "profil"
  | "identite"
  | "document"
  | "parrainage"
  | "usage_fonctionnalite"
  | "contribution_communaute";

export type AccorderPointsParams = {
  citoyenId: string;
  sourceType: RewardSourceType;
  sourceId: string;
  /** Doit correspondre à reward_rules.code (ex. "rdv_complete", "rdv_no_show"). */
  eventType: string;
  payload?: Record<string, unknown>;
};

/**
 * Tente d'accorder des points pour un événement. No-op silencieux si :
 * la règle n'existe pas, est inactive (actif=false), ou si ce fait précis
 * a déjà été récompensé (idempotence). Ne lève jamais.
 */
export async function accorderPoints(params: AccorderPointsParams): Promise<void> {
  try {
    const { data: rule, error: ruleErr } = await sb
      .from("reward_rules")
      .select("id, points_delta, actif, label, conditions")
      .eq("code", params.eventType)
      .maybeSingle();

    if (ruleErr) {
      console.error("[rewardsEngine] lecture reward_rules échouée:", ruleErr.message);
      return;
    }
    if (!rule || !rule.actif) return;

    // Plafond anti-abus (22/08/2026, décision CEO) — seul type de condition
    // supporté à ce jour, cohérent avec la philosophie déjà écrite dans la
    // migration reward_rules ("ajouter une règle sur un type de condition
    // déjà supporté = une ligne insérée, jamais du code"). Compte les
    // reward_events déjà émis pour ce citoyen + ce type d'événement sur la
    // fenêtre glissante — jamais un compteur dénormalisé qui pourrait
    // diverger de la source de vérité (reward_events).
    const conditions = (rule.conditions ?? {}) as { max_par_periode?: { count: number; jours: number } };
    if (conditions.max_par_periode) {
      const depuis = new Date(Date.now() - conditions.max_par_periode.jours * 86400000).toISOString();
      const { count: nbRecents, error: capErr } = await sb
        .from("reward_events")
        .select("id", { count: "exact", head: true })
        .eq("citoyen_id", params.citoyenId)
        .eq("event_type", params.eventType)
        .gte("created_at", depuis);
      if (capErr) {
        console.error("[rewardsEngine] vérification plafond échouée:", capErr.message);
        return;
      }
      if ((nbRecents ?? 0) >= conditions.max_par_periode.count) return; // plafond atteint, no-op silencieux
    }

    const { data: insertedEvents, error: eventErr } = await sb
      .from("reward_events")
      .upsert(
        {
          citoyen_id: params.citoyenId,
          source_type: params.sourceType,
          source_id: params.sourceId,
          event_type: params.eventType,
          payload: params.payload ?? {},
        },
        { onConflict: "source_type,source_id,event_type", ignoreDuplicates: true }
      )
      .select("id");

    if (eventErr) {
      console.error("[rewardsEngine] insertion reward_events échouée:", eventErr.message);
      return;
    }
    // Aucune ligne retournée = l'événement existait déjà (ON CONFLICT DO
    // NOTHING) => déjà récompensé, no-op volontaire, pas une erreur.
    if (!insertedEvents || insertedEvents.length === 0) return;
    const eventId = insertedEvents[0].id as string;

    const { error: txErr } = await sb
      .from("points_transactions")
      .upsert(
        {
          citoyen_id: params.citoyenId,
          reward_event_id: eventId,
          rule_id: rule.id,
          points_delta: rule.points_delta,
          reason: rule.label,
          source_type: params.sourceType,
          source_id: params.sourceId,
        },
        { onConflict: "reward_event_id", ignoreDuplicates: true }
      );

    if (txErr) {
      console.error("[rewardsEngine] insertion points_transactions échouée:", txErr.message);
      return;
    }

    const { data: citoyen } = await sb.from("users").select("prenom").eq("id", params.citoyenId).maybeSingle();
    const signe = rule.points_delta >= 0 ? "+" : "";
    await envoyerNotification({
      destinataireId: params.citoyenId,
      destinataireType: "citoyen",
      rdvId: params.sourceType === "rdv" ? params.sourceId : null,
      type: "reward_points",
      titre: salutation(citoyen?.prenom || "cher client"),
      message: `${signe}${rule.points_delta} points Yelen Rewards — ${rule.label}.`,
    });
  } catch (err) {
    console.error("[rewardsEngine] erreur inattendue:", err);
  }
}
