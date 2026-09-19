// Supabase Edge Function — auto-réactivation des institutions dont la
// suspension à durée déterminée est arrivée à échéance (décision CEO
// 17/08/2026, refonte écran "Espace suspendu" — voir migration
// 20260817000001_institution_suspensions_revisions.sql). Planifiée par
// pg_cron toutes les heures (même mécanisme que
// supabase/functions/clock-in-daily-attendance : net.http_post + secret
// Vault 'service_role_key', déjà créé — pas besoin de le recréer).
//
// Ne concerne QUE les suspensions avec jusqu_au renseigné (duree_jours
// fourni par l'admin) — une suspension indéfinie (jusqu_au NULL, le
// comportement par défaut) reste active jusqu'à réactivation manuelle ou
// acceptation d'une révision, jamais touchée ici.
//
// Duplique volontairement la logique minimale d'insertion dans
// `notifications` (voir supabase/functions/rappels-rdv/index.ts) plutôt que
// d'importer lib/notificationEngine.ts (module Next.js, non importable
// depuis Deno) — même convention que rappels-rdv et
// clock-in-daily-attendance.

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
    .from("institution_suspensions")
    .select("id, institution_id, institutions(name)")
    .eq("statut", "active")
    .not("jusqu_au", "is", null)
    .lt("jusqu_au", new Date().toISOString());

  let reactivees = 0;
  const erreurs: string[] = [];

  for (const s of echues ?? []) {
    try {
      const instRel = s.institutions as unknown as { name: string } | { name: string }[] | null;
      const instNom = Array.isArray(instRel) ? instRel[0]?.name : instRel?.name;

      const { error: errInst } = await sb.from("institutions").update({ statut: "validee" }).eq("id", s.institution_id);
      if (errInst) throw errInst;

      const { error: errSusp } = await sb.from("institution_suspensions")
        .update({ statut: "levee", levee_par: "auto", levee_le: new Date().toISOString() })
        .eq("id", s.id);
      if (errSusp) throw errSusp;

      await sb.from("notifications").insert([{
        destinataire_id: s.institution_id,
        destinataire_type: "institution",
        rdv_id: null,
        type: "institution_reactivee",
        titre: salutation(instNom || "votre équipe"),
        message: "La période de suspension de votre établissement est arrivée à son terme. Votre établissement est de nouveau visible par les citoyens.",
        lu: false,
      }]);

      reactivees++;
    } catch (e) {
      erreurs.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, reactivees, erreurs }),
    { headers: { "Content-Type": "application/json" } },
  );
});
