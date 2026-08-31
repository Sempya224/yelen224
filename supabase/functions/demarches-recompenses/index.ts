// Supabase Edge Function — "Home V2 / mécaniques d'engagement" (22/08/2026,
// Lot 4). Attribue les points Yelen Rewards "demarche_completed" (+10,
// décision CEO, plafond 5/30 jours) quand une démarche personnelle passe à
// "terminee".
//
// Pourquoi un cron et pas un appel direct à lib/rewardsEngine.ts::accorderPoints()
// depuis l'écran : marquer une démarche "terminée" est aujourd'hui une
// écriture CLIENT directe (app/compte/mes-demarches/mes-demarches-client.tsx,
// policy RLS auth.uid()=citoyen_id) — accorderPoints() est explicitement
// interdit d'appel ailleurs que depuis du code serveur qui a relu le fait
// en base (règle de sécurité non négociable, voir lib/rewardsEngine.ts).
// Duplique donc volontairement la même logique (idempotence + plafond),
// même justification Deno-vs-Node que rappels-rdv/demarches-rappels.
//
// Idempotence à deux niveaux, identique à accorderPoints() : reward_events
// UNIQUE(source_type,source_id,event_type) empêche un double octroi pour la
// même démarche ; le plafond (conditions.max_par_periode) est vérifié par
// un comptage réel sur reward_events, jamais un compteur dénormalisé.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const EVENT_TYPE = "demarche_completed";

function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

type Rule = { id: string; points_delta: number; actif: boolean; label: string; conditions: { max_par_periode?: { count: number; jours: number } } | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: rule, error: ruleErr } = await sb
    .from("reward_rules")
    .select("id,points_delta,actif,label,conditions")
    .eq("code", EVENT_TYPE)
    .maybeSingle() as { data: Rule | null; error: { message: string } | null };
  if (ruleErr) return new Response(JSON.stringify({ error: ruleErr.message }), { status: 500 });
  if (!rule || !rule.actif) return new Response(JSON.stringify({ ok: true, actif: false }), { headers: { "Content-Type": "application/json" } });

  const { data: demarches, error } = await sb
    .from("citoyen_demarches")
    .select("id,citoyen_id")
    .eq("statut", "terminee");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const conditions = rule.conditions ?? {};
  let accordes = 0;

  for (const d of (demarches ?? []) as { id: string; citoyen_id: string }[]) {
    // Plafond anti-abus — vérifié AVANT toute écriture, sur la fenêtre
    // glissante réelle (jamais un compteur qui pourrait diverger).
    if (conditions.max_par_periode) {
      const depuis = new Date(Date.now() - conditions.max_par_periode.jours * 86400000).toISOString();
      const { count: nbRecents } = await sb
        .from("reward_events")
        .select("id", { count: "exact", head: true })
        .eq("citoyen_id", d.citoyen_id)
        .eq("event_type", EVENT_TYPE)
        .gte("created_at", depuis);
      if ((nbRecents ?? 0) >= conditions.max_par_periode.count) continue;
    }

    const { data: insertedEvents, error: eventErr } = await sb
      .from("reward_events")
      .upsert(
        { citoyen_id: d.citoyen_id, source_type: "citoyen_demarche", source_id: d.id, event_type: EVENT_TYPE, payload: {} },
        { onConflict: "source_type,source_id,event_type", ignoreDuplicates: true }
      )
      .select("id");
    if (eventErr || !insertedEvents || insertedEvents.length === 0) continue; // déjà récompensée ou erreur
    const eventId = insertedEvents[0].id as string;

    const { error: txErr } = await sb
      .from("points_transactions")
      .upsert(
        { citoyen_id: d.citoyen_id, reward_event_id: eventId, rule_id: rule.id, points_delta: rule.points_delta, reason: rule.label, source_type: "citoyen_demarche", source_id: d.id },
        { onConflict: "reward_event_id", ignoreDuplicates: true }
      );
    if (txErr) { console.error("[demarches-recompenses] points_transactions:", txErr.message); continue; }

    const { data: citoyen } = await sb.from("users").select("prenom").eq("id", d.citoyen_id).maybeSingle();
    const signe = rule.points_delta >= 0 ? "+" : "";
    await sb.from("notifications").insert({
      destinataire_id: d.citoyen_id,
      destinataire_type: "citoyen",
      demarche_id: d.id,
      type: "reward_points",
      titre: salutation(citoyen?.prenom || "cher client"),
      message: `${signe}${rule.points_delta} points Yelen Rewards — ${rule.label}.`,
      lu: false,
    });
    accordes++;
  }

  return new Response(JSON.stringify({ ok: true, demarches_examinees: demarches?.length ?? 0, recompenses_accordees: accordes }), {
    headers: { "Content-Type": "application/json" },
  });
});
