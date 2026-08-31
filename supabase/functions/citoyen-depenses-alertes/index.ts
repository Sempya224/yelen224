// Supabase Edge Function — "Mes dépenses V2" (24/08/2026, Lot 12).
// Mirroring du pattern demarches-rappels : planifiée par pg_cron (voir
// migration 20260824000006_cron_depenses_alertes.sql), 3 boucles
// indépendantes, un seul type de seuil chacune — zéro appel LLM (règles
// déterministes, même philosophie que lib/citoyenTendances.ts côté Next.js).
//
// Duplique volontairement les calculs déjà faits côté client
// (depenses-client.tsx Lots 4/5/9) plutôt que de les importer — Edge
// Functions tournent sur Deno, pas Node (même justification que
// demarches-rappels). Garder les deux logiques identiques si l'une change :
// - Budget dépassé (Lot 4) : total du mois par catégorie (ou global si
//   `categorie` NULL) STRICTEMENT supérieur à `montant_limite`, peu importe
//   `periode` (comportement du Lot 4 client, pas une invention ici).
// - Objectif proche de l'échéance (Lot 5) : `deadline` dans les 7 jours,
//   `statut = 'actif'`, contributions encore insuffisantes.
// - Dépense récurrente à venir (Lot 8) : `recurrence_prochaine_date` dans
//   les 2 jours (même fenêtre par défaut que demarches-rappels).
//
// Déduplication à 2 vitesses, volontairement différente par cas (une seule
// règle universelle ne marche pas ici, voir plan de chantier) :
// - Budget : le montant dépensé change chaque jour → dédup sur
//   `budget_id + type + created_at >= début du mois civil` (un seul rappel
//   par budget par mois, pas un par jour de dépassement).
// - Objectif : rien ne change avant la prochaine contribution → dédup
//   `objectif_id + type` sans fenêtre (comme demarche_echeance), un seul
//   rappel tant que l'état ne change pas.
// - Récurrence : le message contient la date absolue de l'échéance
//   (jamais "dans X jours", qui changerait chaque jour et casserait la
//   dédup) → dédup `depense_id + type + message` exact. Après renouvellement
//   (recurrence_prochaine_date avance), le message change → nouveau rappel
//   naturellement, sans nouvelle colonne.

import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Phase = "depense_budget_depasse" | "depense_objectif_echeance" | "depense_recurrente_a_venir";

function formatGNF(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} GNF`;
}

function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit, ${nom}`;
  if (h < 12) return `Bonjour, ${nom}`;
  if (h < 18) return `Bon après-midi, ${nom}`;
  return `Bonsoir, ${nom}`;
}

const CATEGORIE_LABEL: Record<string, string> = {
  sante: "Santé", transport: "Transport", alimentation: "Alimentation", logement: "Logement",
  education: "Éducation", loisirs: "Loisirs", autre: "Autre",
};

function debutMoisCivil(): string {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function dejaNotifieCeMois(colonne: "budget_id", id: string, type: Phase): Promise<boolean> {
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true })
    .eq(colonne, id).eq("type", type).gte("created_at", debutMoisCivil());
  return !!count && count > 0;
}

async function dejaNotifieSansFenetre(colonne: "objectif_id", id: string, type: Phase): Promise<boolean> {
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true })
    .eq(colonne, id).eq("type", type);
  return !!count && count > 0;
}

async function dejaNotifieMemeMessage(depenseId: string, type: Phase, message: string): Promise<boolean> {
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true })
    .eq("depense_id", depenseId).eq("type", type).eq("message", message);
  return !!count && count > 0;
}

type UserRow = { prenom: string | null; nom: string | null };
function prenomDe(rel: UserRow | UserRow[] | null): string {
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.prenom || row?.nom || "Citoyen";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const anneeMois = { y: aujourdHui.getFullYear(), m: aujourdHui.getMonth() };
  let envoyes = 0;

  // --- 1. Budgets dépassés (catégorie ou global) --------------------------
  type BudgetRow = { id: string; citoyen_id: string; categorie: string | null; montant_limite: number; actif: boolean; users: UserRow | UserRow[] | null };
  const { data: budgets, error: errBudgets } = await sb
    .from("citoyen_budgets")
    .select("id,citoyen_id,categorie,montant_limite,actif,users!citoyen_budgets_citoyen_id_fkey(prenom,nom)")
    .eq("actif", true);
  if (errBudgets) return new Response(JSON.stringify({ error: errBudgets.message }), { status: 500 });

  for (const b of (budgets ?? []) as unknown as BudgetRow[]) {
    let requete = sb.from("citoyen_depenses").select("montant").eq("citoyen_id", b.citoyen_id)
      .gte("date_depense", `${anneeMois.y}-${String(anneeMois.m + 1).padStart(2, "0")}-01`)
      .lte("date_depense", aujourdHui.toISOString().slice(0, 10));
    requete = b.categorie ? requete.eq("categorie", b.categorie) : requete;
    const { data: lignes } = await requete;
    const total = (lignes ?? []).reduce((s, l) => s + (l as { montant: number }).montant, 0);
    if (total <= b.montant_limite) continue;

    if (await dejaNotifieCeMois("budget_id", b.id, "depense_budget_depasse")) continue;

    const prenom = prenomDe(b.users);
    const libelle = b.categorie ? CATEGORIE_LABEL[b.categorie] ?? b.categorie : "mensuel";
    await sb.from("notifications").insert({
      destinataire_id: b.citoyen_id, destinataire_type: "citoyen", budget_id: b.id,
      type: "depense_budget_depasse", titre: salutation(prenom),
      message: b.categorie
        ? `Vous avez dépassé votre budget ${libelle} ce mois-ci : ${formatGNF(total)} dépensés pour une limite de ${formatGNF(b.montant_limite)}. Ajustez vos prochaines dépenses de cette catégorie si besoin.`
        : `Vous avez dépassé votre objectif mensuel : ${formatGNF(total)} dépensés pour une limite de ${formatGNF(b.montant_limite)}. Voici comment ajuster la suite du mois.`,
      lu: false,
    });
    envoyes++;
  }

  // --- 2. Objectifs proches de leur échéance -------------------------------
  type ObjectifRow = { id: string; citoyen_id: string; titre: string; montant_cible: number; deadline: string; users: UserRow | UserRow[] | null };
  const limiteObjectif = new Date(aujourdHui); limiteObjectif.setDate(limiteObjectif.getDate() + 7);
  const { data: objectifs, error: errObjectifs } = await sb
    .from("citoyen_objectifs_financiers")
    .select("id,citoyen_id,titre,montant_cible,deadline,users!citoyen_objectifs_financiers_citoyen_id_fkey(prenom,nom)")
    .eq("statut", "actif")
    .not("deadline", "is", null)
    .lte("deadline", limiteObjectif.toISOString().slice(0, 10))
    .gte("deadline", aujourdHui.toISOString().slice(0, 10));
  if (errObjectifs) return new Response(JSON.stringify({ error: errObjectifs.message }), { status: 500 });

  for (const o of (objectifs ?? []) as unknown as ObjectifRow[]) {
    const { data: contributions } = await sb.from("citoyen_objectif_contributions").select("montant").eq("objectif_id", o.id);
    const actuel = (contributions ?? []).reduce((s, c) => s + (c as { montant: number }).montant, 0);
    if (actuel >= o.montant_cible) continue;

    if (await dejaNotifieSansFenetre("objectif_id", o.id, "depense_objectif_echeance")) continue;

    const prenom = prenomDe(o.users);
    const dateLabel = new Date(o.deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    await sb.from("notifications").insert({
      destinataire_id: o.citoyen_id, destinataire_type: "citoyen", objectif_id: o.id,
      type: "depense_objectif_echeance", titre: salutation(prenom),
      message: `Votre objectif « ${o.titre} » arrive à échéance le ${dateLabel} — il vous manque encore ${formatGNF(o.montant_cible - actuel)} pour l'atteindre.`,
      lu: false,
    });
    envoyes++;
  }

  // --- 3. Dépenses récurrentes à venir (fenêtre 2 jours, même défaut que
  // demarches-rappels) --------------------------------------------------
  type DepenseRow = { id: string; citoyen_id: string; categorie: string; montant: number; description: string | null; recurrence_prochaine_date: string; users: UserRow | UserRow[] | null };
  const limiteRecurrence = new Date(aujourdHui); limiteRecurrence.setDate(limiteRecurrence.getDate() + 2);
  const { data: recurrentes, error: errRecurrentes } = await sb
    .from("citoyen_depenses")
    .select("id,citoyen_id,categorie,montant,description,recurrence_prochaine_date,users!citoyen_depenses_citoyen_id_fkey(prenom,nom)")
    .neq("recurrence", "aucune")
    .not("recurrence_prochaine_date", "is", null)
    .lte("recurrence_prochaine_date", limiteRecurrence.toISOString().slice(0, 10))
    .gte("recurrence_prochaine_date", aujourdHui.toISOString().slice(0, 10));
  if (errRecurrentes) return new Response(JSON.stringify({ error: errRecurrentes.message }), { status: 500 });

  for (const d of (recurrentes ?? []) as unknown as DepenseRow[]) {
    const prenom = prenomDe(d.users);
    const dateLabel = new Date(d.recurrence_prochaine_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const libelle = d.description || CATEGORIE_LABEL[d.categorie] || d.categorie;
    const message = `Votre dépense récurrente « ${libelle} » (${formatGNF(d.montant)}) est prévue le ${dateLabel}. Vous pourrez l'enregistrer en un geste depuis son détail.`;

    if (await dejaNotifieMemeMessage(d.id, "depense_recurrente_a_venir", message)) continue;

    await sb.from("notifications").insert({
      destinataire_id: d.citoyen_id, destinataire_type: "citoyen", depense_id: d.id,
      type: "depense_recurrente_a_venir", titre: salutation(prenom), message, lu: false,
    });
    envoyes++;
  }

  return new Response(JSON.stringify({ ok: true, alertes_envoyees: envoyes }), {
    headers: { "Content-Type": "application/json" },
  });
});
