// Supabase Edge Function — auto-réactivation des citoyens dont la
// restriction de rendez-vous à durée déterminée est arrivée à échéance
// (décision CEO 03/09/2026, voir migration
// 20260903000001_citoyen_rdv_restrictions.sql). Planifiée par pg_cron
// toutes les heures (même mécanisme que
// supabase/functions/institution-suspension-autoreactivate : net.http_post
// + secret Vault 'service_role_key', déjà créé — pas besoin de le recréer).
//
// Ne concerne QUE les restrictions temporaires (niveau IN ('restreint_7j',
// 'restreint_30j'), jusqu_au toujours renseigné pour ces deux paliers) —
// niveau='clos' (jusqu_au NULL) n'est jamais touché ici, seule une décision
// d'appel acceptée par un admin peut le lever (voir
// app/api/admin/rdv-restrictions/appel/route.ts).
//
// Duplique volontairement la logique minimale d'insertion dans
// `notifications` plutôt que d'importer lib/notificationEngine.ts (module
// Next.js, non importable depuis Deno) — même convention que
// institution-suspension-autoreactivate et rappels-rdv.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: echues } = await sb
    .from("citoyen_rdv_restrictions")
    .select("id, citoyen_id, users(prenom, nom)")
    .eq("statut", "active")
    .in("niveau", ["restreint_7j", "restreint_30j"])
    .not("jusqu_au", "is", null)
    .lt("jusqu_au", new Date().toISOString());

  let reactivees = 0;
  const erreurs: string[] = [];

  for (const r of echues ?? []) {
    try {
      const userRel = r.users as unknown as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
      const userRow = Array.isArray(userRel) ? userRel[0] : userRel;
      const prenom = userRow?.prenom || userRow?.nom || "Citoyen";

      const { error: errRestriction } = await sb.from("citoyen_rdv_restrictions")
        .update({ statut: "levee", levee_par: "auto", levee_le: new Date().toISOString() })
        .eq("id", r.id);
      if (errRestriction) throw errRestriction;

      await sb.from("notifications").insert([{
        destinataire_id: r.citoyen_id,
        destinataire_type: "citoyen",
        rdv_id: null,
        type: "rdv_restriction_levee",
        titre: salutation(prenom),
        message: "Votre accès aux rendez-vous et réservations est de nouveau disponible.",
        lu: false,
      }]);

      reactivees++;
    } catch (e) {
      erreurs.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, reactivees, erreurs }),
    { headers: { "Content-Type": "application/json" } },
  );
});
