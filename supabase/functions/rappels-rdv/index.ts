// Supabase Edge Function — Chantier "Yelen Assistant" (20/07/2026), Lot C.
//
// Remplace l'ancien mécanisme de rappels (lib/notifications.ts::verifierRappels),
// qui ne se déclenchait que quand un citoyen ouvrait /mes-rdv (jamais côté
// institution, jamais si personne n'ouvrait l'app) et écrivait via le client
// anonyme (institution-side silencieusement bloqué par RLS). Cette fonction
// tourne côté serveur, planifiée par pg_cron (voir migration
// 20260724000009_cron_rappels_rdv.sql), et notifie citoyen ET institution.
//
// Duplique volontairement les templates de lib/notificationEngine.ts plutôt
// que de les importer : les Edge Functions tournent sur Deno, pas Node —
// importer un module écrit pour Next.js/Node depuis Deno n'est pas fiable
// (résolution de modules différente). Les textes doivent rester identiques
// aux 2 fichiers si le brief CEO change un jour.
//
// Phases couvertes (2 à 5 du brief CEO — 1/6/7/8 sont événementielles,
// câblées ailleurs, Lot B) : rappel_24h, rappel_2h, rappel_45min, rappel_15min.
// Chaque phase n'est envoyée qu'une seule fois par RDV (déduplication via
// une recherche dans `notifications` sur type+rdv_id avant d'envoyer).

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Phase = "rappel_24h" | "rappel_2h" | "rappel_45min" | "rappel_15min";

// Fenêtres en minutes avant le RDV — larges par rapport à l'intervalle du
// cron (5 min, voir migration) pour ne jamais rater un RDV, la
// déduplication empêche les envois multiples.
const FENETRES: { phase: Phase; min: number; max: number }[] = [
  { phase: "rappel_24h", min: 23 * 60 + 45, max: 24 * 60 + 15 },
  { phase: "rappel_2h", min: 105, max: 135 },
  { phase: "rappel_45min", min: 35, max: 55 },
  { phase: "rappel_15min", min: 5, max: 25 },
];

function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

function messages(phase: Phase, citoyenPrenom: string, institutionNom: string, heure: string) {
  switch (phase) {
    case "rappel_24h":
      return {
        citoyen: `Demain, vous serez accueilli par ${institutionNom} à ${heure}. Votre journée est déjà organisée. Je resterai à vos côtés jusqu'à votre arrivée.`,
        institution: `Votre planning de demain est prêt. ${citoyenPrenom} sera accueilli demain à ${heure}. Je vous rappellerai chaque visite importante au bon moment.`,
      };
    case "rappel_2h":
      return {
        citoyen: `Il reste environ 2 heures avant votre visite chez ${institutionNom}. Si vous devez préparer un document ou commencer votre déplacement, c'est le bon moment.`,
        institution: `Votre activité commence bientôt. Vérifiez que votre équipe est prête à accueillir les premiers visiteurs.`,
      };
    case "rappel_45min":
      return {
        citoyen: `Plus que 45 minutes avant votre arrivée chez ${institutionNom}. Si vous êtes en déplacement, vous êtes parfaitement dans les temps.`,
        institution: `Votre journée est bien engagée. ${citoyenPrenom} sera accueilli dans environ 45 minutes. Profitez de ce moment pour préparer son accueil.`,
      };
    case "rappel_15min":
      return {
        citoyen: `Vous arrivez bientôt. Toute l'équipe de ${institutionNom} est prête à vous recevoir.`,
        institution: `Votre prochain visiteur arrive dans environ 15 minutes. L'équipe peut désormais préparer son accueil.`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const now = Date.now();
  // Fenêtre de recherche large (0 à 25h) — chaque rdv réel est ensuite
  // classé dans sa phase exacte via FENETRES.
  const from = new Date(now).toISOString();
  const to = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  const { data: rdvs, error } = await sb
    .from("rdv")
    .select("id,citoyen_id,institution_id,date_rdv,heure_rdv,statut,presence_status,institutions!rdv_institution_id_fkey(name),users!rdv_citoyen_id_fkey(prenom,nom)")
    .eq("statut", "en_attente")
    .is("presence_status", null)
    .gte("date_rdv", from.slice(0, 10))
    .lte("date_rdv", to.slice(0, 10));

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let envoyes = 0;
  for (const rdv of rdvs ?? []) {
    const [hh, mm] = (rdv.heure_rdv || "00:00").split(":").map(Number);
    const [y, mo, d] = rdv.date_rdv.split("-").map(Number);
    const heureRdvMs = new Date(y, mo - 1, d, hh, mm || 0, 0, 0).getTime();
    const minutesAvant = (heureRdvMs - now) / 60000;

    const fenetre = FENETRES.find(f => minutesAvant >= f.min && minutesAvant <= f.max);
    if (!fenetre) continue;

    const { count } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("rdv_id", rdv.id)
      .eq("type", fenetre.phase);
    if (count && count > 0) continue; // déjà envoyé pour ce RDV

    const institutionsRel = rdv.institutions as unknown as { name: string } | { name: string }[] | null;
    const usersRel = rdv.users as unknown as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
    const instRow = Array.isArray(institutionsRel) ? institutionsRel[0] : institutionsRel;
    const userRow = Array.isArray(usersRel) ? usersRel[0] : usersRel;
    const citoyenPrenom = userRow?.prenom || userRow?.nom || "Citoyen";
    const institutionNom = instRow?.name ?? "l'établissement";
    const heure = (rdv.heure_rdv || "").slice(0, 5);
    const m = messages(fenetre.phase, citoyenPrenom, institutionNom, heure);

    await sb.from("notifications").insert([
      { destinataire_id: rdv.citoyen_id, destinataire_type: "citoyen", rdv_id: rdv.id, type: fenetre.phase, titre: salutation(citoyenPrenom), message: m.citoyen, lu: false },
      { destinataire_id: rdv.institution_id, destinataire_type: "institution", rdv_id: rdv.id, type: fenetre.phase, titre: salutation(institutionNom), message: m.institution, lu: false },
    ]);
    envoyes++;
  }

  return new Response(JSON.stringify({ ok: true, rdvs_examines: rdvs?.length ?? 0, rappels_envoyes: envoyes }), {
    headers: { "Content-Type": "application/json" },
  });
});
