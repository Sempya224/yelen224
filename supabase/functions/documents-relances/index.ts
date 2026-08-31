// Supabase Edge Function — "Home V2 / mécaniques d'engagement" (22/08/2026,
// Lot 3). Mirroring rappels-rdv/demarches-rappels : planifiée par pg_cron
// (voir migration 20260822000002_cron_rappels_demarches.sql, même
// planification quotidienne réutilisée pour ce job), relance le citoyen
// si un document demandé par une institution est toujours en_attente
// après 3 puis 7 jours. L'alerte INITIALE existe déjà (notifierDocumentDemande,
// lib/notificationEngine.ts, appelée à la création de la demande côté
// app/api/institution/documents-citoyen/route.ts) — cette fonction ne la
// duplique pas, elle ajoute uniquement les deux relances si le citoyen n'a
// toujours pas répondu.
//
// Déduplication via `notifications.citoyen_document_id` + `type` (colonne
// ajoutée par la migration 20260822000001) — `rdv_id` seul ne suffit pas
// ici, plusieurs documents peuvent être demandés sur un même RDV.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Phase = "document_relance_j3" | "document_relance_j7";
const SEUILS: { phase: Phase; joursMin: number }[] = [
  { phase: "document_relance_j7", joursMin: 7 },
  { phase: "document_relance_j3", joursMin: 3 },
];

function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

type DocRow = {
  id: string;
  citoyen_id: string;
  label: string;
  created_at: string;
  institutions: { name: string } | { name: string }[] | null;
  users: { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const now = Date.now();
  const { data: docs, error } = await sb
    .from("citoyen_documents")
    .select("id,citoyen_id,label,created_at,institutions(name),users!citoyen_documents_citoyen_id_fkey(prenom,nom)")
    .eq("sens", "demande")
    .eq("statut", "en_attente");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let envoyes = 0;
  for (const d of (docs ?? []) as unknown as DocRow[]) {
    const joursEcoules = (now - new Date(d.created_at).getTime()) / 86400000;
    // Le plus grand seuil atteint d'abord (SEUILS trié J7 avant J3) — un
    // document en attente depuis 9 jours ne doit recevoir que la relance
    // J7, jamais les deux le même jour si le cron a été interrompu entre
    // J3 et J7.
    const seuil = SEUILS.find(s => joursEcoules >= s.joursMin);
    if (!seuil) continue;

    const { count } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("citoyen_document_id", d.id)
      .eq("type", seuil.phase);
    if (count && count > 0) continue; // déjà envoyé pour ce document/phase

    // Une relance J7 déjà envoyée rend une relance J3 inutile (le citoyen a
    // déjà été notifié plus récemment) — ne pas redescendre en dessous de
    // ce qui a potentiellement déjà été couvert par un run précédent.
    if (seuil.phase === "document_relance_j3") {
      const { count: countJ7 } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("citoyen_document_id", d.id)
        .eq("type", "document_relance_j7");
      if (countJ7 && countJ7 > 0) continue;
    }

    const institutionsRel = d.institutions;
    const usersRel = d.users;
    const instRow = Array.isArray(institutionsRel) ? institutionsRel[0] : institutionsRel;
    const userRow = Array.isArray(usersRel) ? usersRel[0] : usersRel;
    const prenom = userRow?.prenom || userRow?.nom || "Citoyen";
    const institutionNom = instRow?.name ?? "l'établissement";

    await sb.from("notifications").insert({
      destinataire_id: d.citoyen_id,
      destinataire_type: "citoyen",
      citoyen_document_id: d.id,
      type: seuil.phase,
      titre: salutation(prenom),
      message: `${institutionNom} attend toujours « ${d.label} », demandé il y a ${Math.floor(joursEcoules)} jours. Vous pouvez le téléverser depuis Mes documents.`,
      lu: false,
    });
    envoyes++;
  }

  return new Response(JSON.stringify({ ok: true, documents_examines: docs?.length ?? 0, relances_envoyees: envoyes }), {
    headers: { "Content-Type": "application/json" },
  });
});
