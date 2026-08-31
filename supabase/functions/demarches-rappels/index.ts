// Supabase Edge Function — "Home V2 / mécaniques d'engagement" (22/08/2026,
// Lot 3). Mirroring exact de supabase/functions/rappels-rdv : planifiée par
// pg_cron (voir migration 20260822000002_cron_rappels_demarches.sql),
// notifie le citoyen quand une démarche personnelle approche de son
// échéance ou vient de la dépasser sans être cochée.
//
// Duplique volontairement le calcul de "prochaine échéance" déjà unifié
// côté Next.js (lib/citoyenDemarchesRappels.ts::deriverRappelsDemarches)
// plutôt que de l'importer — même justification que rappels-rdv : les Edge
// Functions tournent sur Deno, pas Node, l'import d'un module écrit pour
// Next.js n'est pas fiable depuis Deno. Garder les deux logiques
// identiques si l'une change un jour (retard = date < aujourd'hui,
// échéance proche = date dans les 7 jours).
//
// Contrairement à rappels-rdv (RDV horodatés, fenêtres à la minute), une
// échéance de démarche est une simple date — cette fonction tourne une
// fois par jour (voir migration), pas toutes les 5 minutes. Déduplication
// via `notifications.demarche_id` + `type` (colonne ajoutée par la
// migration 20260822000001, même principe que `rdv_id` pour les RDV) —
// une fenêtre large ("< aujourd'hui" / "dans les 2 jours") est donc sans
// risque de doublon même si le cron manque un jour.
//
// Lot 5 "Mes démarches → organisation personnelle" (24/08/2026) — rappels
// configurables : `citoyen_demarches.rappel_jours_avant` (migration
// 20260824000002) remplace la fenêtre fixe de 2 jours quand il est
// renseigné (comportement par défaut inchangé sinon, zéro régression sur
// les démarches créées avant ce lot). Ajout d'une seconde boucle,
// indépendante, pour les rappels au niveau d'une étape précise
// (`citoyen_demarche_etapes.rappel_jours_avant`) — dédupliquée via
// `notifications.etape_id` (migration 20260824000003), un rappel d'étape
// n'a de sens que si elle a sa propre `date_echeance` et un délai
// explicitement configuré (pas de défaut implicite ici, contrairement à
// la démarche).

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Phase = "demarche_echeance" | "demarche_retard" | "etape_echeance" | "etape_retard";

function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

function messages(phase: Phase, titre: string, jours: number) {
  if (phase === "demarche_retard") {
    return jours <= 1
      ? `Votre démarche « ${titre} » a une échéance passée depuis hier. Un pas de plus dès que vous êtes prêt.`
      : `Votre démarche « ${titre} » a une échéance passée depuis ${jours} jours. Un pas de plus dès que vous êtes prêt.`;
  }
  if (phase === "demarche_echeance") {
    return jours === 0
      ? `Votre démarche « ${titre} » arrive à échéance aujourd'hui.`
      : jours === 1
      ? `Votre démarche « ${titre} » arrive à échéance demain.`
      : `Votre démarche « ${titre} » arrive à échéance dans ${jours} jours.`;
  }
  if (phase === "etape_retard") {
    return jours <= 1
      ? `L'étape « ${titre} » a une échéance passée depuis hier.`
      : `L'étape « ${titre} » a une échéance passée depuis ${jours} jours.`;
  }
  return jours === 0
    ? `L'étape « ${titre} » arrive à échéance aujourd'hui.`
    : jours === 1
    ? `L'étape « ${titre} » arrive à échéance demain.`
    : `L'étape « ${titre} » arrive à échéance dans ${jours} jours.`;
}

type EtapeRow = { id: string; libelle: string; fait: boolean; date_echeance: string | null; rappel_jours_avant: number | null };
type DemarcheRow = {
  id: string;
  citoyen_id: string;
  titre: string;
  date_cible: string | null;
  rappel_jours_avant: number | null;
  users: { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
  citoyen_demarche_etapes: EtapeRow[] | null;
};

// Même règle que prochaineDate() de lib/citoyenDemarchesRappels.ts : la
// démarche a des étapes → la plus proche échéance non cochée parmi elles ;
// sinon (démarche "échéance simple") → date_cible.
function prochaineDate(d: DemarcheRow): Date | null {
  const etapes = d.citoyen_demarche_etapes ?? [];
  if (etapes.length > 0) {
    const dates = etapes.filter(e => !e.fait && e.date_echeance).map(e => new Date(e.date_echeance as string));
    if (dates.length === 0) return null;
    return dates.sort((a, b) => a.getTime() - b.getTime())[0];
  }
  return d.date_cible ? new Date(d.date_cible) : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);

  const { data: demarches, error } = await sb
    .from("citoyen_demarches")
    .select("id,citoyen_id,titre,date_cible,rappel_jours_avant,users!citoyen_demarches_citoyen_id_fkey(prenom,nom),citoyen_demarche_etapes(id,libelle,fait,date_echeance,rappel_jours_avant)")
    .eq("statut", "en_cours");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let envoyes = 0;
  for (const d of (demarches ?? []) as unknown as DemarcheRow[]) {
    const userRel = d.users;
    const userRow = Array.isArray(userRel) ? userRel[0] : userRel;
    const prenom = userRow?.prenom || userRow?.nom || "Citoyen";

    // Démarche — fenêtre "échéance proche" configurable (Lot 5) : le
    // délai choisi par le citoyen remplace le défaut de 2 jours, sans
    // rien changer pour les démarches jamais configurées.
    const cible = prochaineDate(d);
    if (cible) {
      const fenetreJours = d.rappel_jours_avant ?? 2;
      const limiteEcheance = new Date(aujourdHui); limiteEcheance.setDate(limiteEcheance.getDate() + fenetreJours);
      const enRetard = cible < aujourdHui;
      const echeanceProche = !enRetard && cible <= limiteEcheance;

      if (enRetard || echeanceProche) {
        const phase: Phase = enRetard ? "demarche_retard" : "demarche_echeance";
        const jours = Math.abs(Math.round((aujourdHui.getTime() - cible.getTime()) / 86400000));

        const { count } = await sb
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("demarche_id", d.id)
          .eq("type", phase);

        if (!count || count === 0) {
          await sb.from("notifications").insert({
            destinataire_id: d.citoyen_id,
            destinataire_type: "citoyen",
            demarche_id: d.id,
            type: phase,
            titre: salutation(prenom),
            message: messages(phase, d.titre, jours),
            lu: false,
          });
          envoyes++;
        }
      }
    }

    // Étapes — rappel indépendant, uniquement si explicitement configuré
    // (pas de fenêtre par défaut ici, contrairement à la démarche) et si
    // l'étape a sa propre date_echeance.
    for (const e of d.citoyen_demarche_etapes ?? []) {
      if (e.fait || !e.date_echeance || e.rappel_jours_avant === null) continue;
      const cibleEtape = new Date(e.date_echeance);
      const limiteEtape = new Date(aujourdHui); limiteEtape.setDate(limiteEtape.getDate() + e.rappel_jours_avant);
      const enRetard = cibleEtape < aujourdHui;
      const echeanceProche = !enRetard && cibleEtape <= limiteEtape;
      if (!enRetard && !echeanceProche) continue;

      const phase: Phase = enRetard ? "etape_retard" : "etape_echeance";
      const jours = Math.abs(Math.round((aujourdHui.getTime() - cibleEtape.getTime()) / 86400000));

      const { count } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("etape_id", e.id)
        .eq("type", phase);
      if (count && count > 0) continue;

      await sb.from("notifications").insert({
        destinataire_id: d.citoyen_id,
        destinataire_type: "citoyen",
        demarche_id: d.id,
        etape_id: e.id,
        type: phase,
        titre: salutation(prenom),
        message: messages(phase, e.libelle, jours),
        lu: false,
      });
      envoyes++;
    }
  }

  return new Response(JSON.stringify({ ok: true, demarches_examinees: demarches?.length ?? 0, rappels_envoyes: envoyes }), {
    headers: { "Content-Type": "application/json" },
  });
});
