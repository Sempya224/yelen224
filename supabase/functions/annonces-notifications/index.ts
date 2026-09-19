// Supabase Edge Function — "Home V2 / mécaniques d'engagement" (22/08/2026,
// Lot 5). Notifie chaque citoyen "concerné" (historique de RDV OU favori
// avec l'institution) quand une annonce est publiée — même règle
// "concerné" que /api/citoyen/assistant (union RDV + favoris), juste
// inversée : on part de l'institution pour trouver les citoyens, pas
// l'inverse.
//
// Pourquoi un cron plutôt qu'un branchement direct sur la publication :
// une annonce peut passer à statut='publiee' par 3 chemins différents
// (POST direct, PATCH d'un brouillon, auto-publication planifiée via
// lib/annoncesAutoPublish.ts déclenchée paresseusement au prochain GET) —
// un scan périodique est plus robuste que de dupliquer la détection aux
// 3 endroits. Tourne toutes les 30 minutes (pas besoin de la précision
// RDV), fenêtre de 7 jours sur `created_at` pour ne jamais notifier en
// masse de vieilles annonces déjà publiées au premier déploiement.
//
// Déduplication PAR CITOYEN via `notifications.annonce_id` + `destinataire_id`
// (colonne ajoutée par la migration 20260822000006) — si un citoyen devient
// "concerné" après coup (nouveau favori sur une annonce déjà publiée cette
// semaine), il est notifié à la prochaine exécution, jamais deux fois pour
// la même annonce.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type AnnonceRow = { id: string; titre: string; institution_id: string; institutions: { name: string } | { name: string }[] | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const now = new Date().toISOString();
  const septJoursAvant = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: annonces, error } = await sb
    .from("annonces")
    .select("id,titre,institution_id,institutions(name)")
    .eq("statut", "publiee")
    .gte("created_at", septJoursAvant)
    .or(`date_expiration.is.null,date_expiration.gt.${now}`);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let notificationsEnvoyees = 0;
  for (const a of (annonces ?? []) as AnnonceRow[]) {
    const [{ data: rdvRows }, { data: favRows }, { data: dejaNotifies }] = await Promise.all([
      sb.from("rdv").select("citoyen_id").eq("institution_id", a.institution_id),
      sb.from("citoyen_favoris").select("citoyen_id").eq("institution_id", a.institution_id),
      sb.from("notifications").select("destinataire_id").eq("annonce_id", a.id),
    ]);

    const concernes = new Set<string>([
      ...(rdvRows ?? []).map((r) => r.citoyen_id as string),
      ...(favRows ?? []).map((f) => f.citoyen_id as string),
    ]);
    const dejaNotifiesSet = new Set((dejaNotifies ?? []).map((n) => n.destinataire_id as string));
    const aNotifier = [...concernes].filter((id) => !dejaNotifiesSet.has(id));
    if (aNotifier.length === 0) continue;

    const instRel = a.institutions;
    const instNom = (Array.isArray(instRel) ? instRel[0]?.name : instRel?.name) ?? "Un établissement";

    const { error: insErr } = await sb.from("notifications").insert(
      aNotifier.map((citoyenId) => ({
        destinataire_id: citoyenId,
        destinataire_type: "citoyen",
        annonce_id: a.id,
        type: "annonce_publiee",
        titre: `${instNom} a publié une annonce`,
        message: a.titre,
        lu: false,
      }))
    );
    if (!insErr) notificationsEnvoyees += aNotifier.length;
    else console.error("[annonces-notifications] insert error:", insErr.message);
  }

  return new Response(JSON.stringify({ ok: true, annonces_examinees: annonces?.length ?? 0, notifications_envoyees: notificationsEnvoyees }), {
    headers: { "Content-Type": "application/json" },
  });
});
