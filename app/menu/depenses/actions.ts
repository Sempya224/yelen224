"use server";

import { createAuthedSupabaseClient } from "@/lib/supabase";
import { CATEGORIE_LABEL_DEPENSE, formatGNF, type CategorieDepenseId } from "@/lib/depenses";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";

export type DepenseActionResult = { ok: true } | { ok: false; error: string };

export async function ajouterDepense(
  userId: string,
  accessToken: string,
  payload: { categorie: CategorieDepenseId; montant: number; description: string | null; dateDepense: string; recurrence?: "aucune" | "hebdomadaire" | "mensuel"; recurrenceProchaine?: string | null },
): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  if (!Number.isFinite(payload.montant) || payload.montant <= 0) return { ok: false, error: "Montant invalide." };

  const supabase = createAuthedSupabaseClient(accessToken);
  const montant = Math.round(payload.montant);
  const { data: nouvelle, error } = await supabase.from("citoyen_depenses").insert({
    citoyen_id: userId,
    categorie: payload.categorie,
    montant,
    description: payload.description?.trim() || null,
    date_depense: payload.dateDepense,
    recurrence: payload.recurrence ?? "aucune",
    recurrence_prochaine_date: payload.recurrence && payload.recurrence !== "aucune" ? (payload.recurrenceProchaine ?? null) : null,
  }).select("id").single();

  if (error) {
    console.error("[depenses] insert citoyen_depenses:", error.message);
    return { ok: false, error: error.message };
  }

  const { data: citoyen } = await supabase.from("users").select("prenom").eq("id", userId).maybeSingle();
  await envoyerNotification({
    destinataireId: userId,
    destinataireType: "citoyen",
    rdvId: null,
    depenseId: nouvelle.id,
    type: "depense_ajoutee",
    titre: salutation(citoyen?.prenom || "cher client"),
    message: `Votre dépense de ${formatGNF(montant)} (${CATEGORIE_LABEL_DEPENSE[payload.categorie]}) a été ajoutée à votre historique.`,
  });

  return { ok: true };
}

// Lot 1 "Mes dépenses V2" (24/08/2026) — un budget par (citoyen, catégorie),
// `categorie: null` = objectif global (toutes catégories confondues,
// affiché en tête d'écran). Pas de contrainte d'unicité en base (voir
// migration 20260824000004) : upsert manuel, recherche puis update/insert.
// Réutilisé tel quel par le Lot 4 (budgets par catégorie).
export async function upsertBudget(
  userId: string,
  accessToken: string,
  payload: { categorie: CategorieDepenseId | null; montantLimite: number; periode: "hebdomadaire" | "mensuel"; seuilAlerte?: number | null },
): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  if (!Number.isFinite(payload.montantLimite) || payload.montantLimite <= 0) return { ok: false, error: "Montant invalide." };

  const supabase = createAuthedSupabaseClient(accessToken);
  let recherche = supabase.from("citoyen_budgets").select("id").eq("citoyen_id", userId).eq("actif", true);
  recherche = payload.categorie === null ? recherche.is("categorie", null) : recherche.eq("categorie", payload.categorie);
  const { data: existant } = await recherche.maybeSingle();

  const montantLimite = Math.round(payload.montantLimite);
  if (existant) {
    const { error } = await supabase.from("citoyen_budgets").update({
      montant_limite: montantLimite, periode: payload.periode, seuil_alerte: payload.seuilAlerte ?? null, updated_at: new Date().toISOString(),
    }).eq("id", existant.id);
    if (error) { console.error("[depenses] update citoyen_budgets:", error.message); return { ok: false, error: error.message }; }
  } else {
    const { error } = await supabase.from("citoyen_budgets").insert({
      citoyen_id: userId, categorie: payload.categorie, montant_limite: montantLimite, periode: payload.periode, seuil_alerte: payload.seuilAlerte ?? null,
    });
    if (error) { console.error("[depenses] insert citoyen_budgets:", error.message); return { ok: false, error: error.message }; }
  }
  return { ok: true };
}

// Lot 13 "Historique V2" (24/08/2026) — modification d'une dépense
// manuelle existante, même forme de payload que ajouterDepense (réutilisée
// telle quelle côté client pour le formulaire édition/ajout).
export async function modifierDepense(
  accessToken: string,
  id: string,
  payload: { categorie: CategorieDepenseId; montant: number; description: string | null; dateDepense: string; recurrence?: "aucune" | "hebdomadaire" | "mensuel"; recurrenceProchaine?: string | null },
): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  if (!Number.isFinite(payload.montant) || payload.montant <= 0) return { ok: false, error: "Montant invalide." };

  const supabase = createAuthedSupabaseClient(accessToken);
  const montant = Math.round(payload.montant);
  const { error } = await supabase.from("citoyen_depenses").update({
    categorie: payload.categorie,
    montant,
    description: payload.description?.trim() || null,
    date_depense: payload.dateDepense,
    recurrence: payload.recurrence ?? "aucune",
    recurrence_prochaine_date: payload.recurrence && payload.recurrence !== "aucune" ? (payload.recurrenceProchaine ?? null) : null,
  }).eq("id", id);

  if (error) {
    console.error("[depenses] update citoyen_depenses:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function supprimerDepense(accessToken: string, id: string): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("citoyen_depenses").delete().eq("id", id);
  if (error) {
    console.error("[depenses] delete citoyen_depenses:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function supprimerBudget(accessToken: string, id: string): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("citoyen_budgets").delete().eq("id", id);
  if (error) {
    console.error("[depenses] delete citoyen_budgets:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Lot 5 "Mes objectifs" (24/08/2026). `montant_actuel` n'existe pas en
// colonne (voir migration) — toujours dérivé par SUM sur
// citoyen_objectif_contributions, jamais stocké/dupliqué.
export async function creerObjectifFinancier(
  userId: string,
  accessToken: string,
  payload: { titre: string; montantCible: number; deadline: string | null; cadence: "hebdomadaire" | "mensuel" | "unique" | null },
): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  if (!payload.titre.trim()) return { ok: false, error: "Titre requis." };
  if (!Number.isFinite(payload.montantCible) || payload.montantCible <= 0) return { ok: false, error: "Montant cible invalide." };

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("citoyen_objectifs_financiers").insert({
    citoyen_id: userId, titre: payload.titre.trim(), montant_cible: Math.round(payload.montantCible),
    deadline: payload.deadline || null, cadence: payload.cadence,
  });
  if (error) { console.error("[depenses] insert citoyen_objectifs_financiers:", error.message); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function supprimerObjectifFinancier(accessToken: string, id: string): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("citoyen_objectifs_financiers").delete().eq("id", id);
  if (error) {
    console.error("[depenses] delete citoyen_objectifs_financiers:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Insère la contribution puis, si le total atteint (ou dépasse) la cible,
// bascule statut → 'atteint' — un seul aller simple, jamais de retour
// arrière automatique si une contribution est ensuite retirée (voir
// migration : "retirer" se fait par une contribution négative, le statut
// resterait "atteint" jusqu'à une action explicite du citoyen).
export async function ajouterContribution(
  userId: string,
  accessToken: string,
  payload: { objectifId: string; montant: number },
): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  if (!Number.isFinite(payload.montant) || payload.montant === 0) return { ok: false, error: "Montant invalide." };

  const supabase = createAuthedSupabaseClient(accessToken);
  const montant = Math.round(payload.montant);
  const { error: errInsert } = await supabase.from("citoyen_objectif_contributions").insert({
    objectif_id: payload.objectifId, citoyen_id: userId, montant,
  });
  if (errInsert) { console.error("[depenses] insert citoyen_objectif_contributions:", errInsert.message); return { ok: false, error: errInsert.message }; }

  const { data: objectif } = await supabase.from("citoyen_objectifs_financiers").select("montant_cible,statut").eq("id", payload.objectifId).maybeSingle();
  if (objectif && objectif.statut === "actif") {
    const { data: contributions } = await supabase.from("citoyen_objectif_contributions").select("montant").eq("objectif_id", payload.objectifId);
    const total = (contributions ?? []).reduce((s, c) => s + c.montant, 0);
    if (total >= objectif.montant_cible) {
      await supabase.from("citoyen_objectifs_financiers").update({ statut: "atteint", updated_at: new Date().toISOString() }).eq("id", payload.objectifId);
    }
  }
  return { ok: true };
}

// Lot 8 "Dépense récurrente" — "J'ai payé, renouveler" sur une dépense
// modèle (recurrence != 'aucune') : enregistre une dépense réelle
// aujourd'hui (recurrence 'aucune' — ce n'est pas elle le modèle) et
// avance recurrence_prochaine_date du modèle d'un intervalle. Pas de
// génération automatique en tâche de fond dans ce lot (voir Lot 12) —
// action explicite du citoyen uniquement.
export async function renouvelerDepenseRecurrente(userId: string, accessToken: string, depenseId: string): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  const supabase = createAuthedSupabaseClient(accessToken);
  const { data: modele } = await supabase.from("citoyen_depenses").select("categorie,montant,description,recurrence,recurrence_prochaine_date").eq("id", depenseId).maybeSingle();
  if (!modele || modele.recurrence === "aucune") return { ok: false, error: "Cette dépense n'est pas récurrente." };

  const { error: errInsert } = await supabase.from("citoyen_depenses").insert({
    citoyen_id: userId, categorie: modele.categorie, montant: modele.montant, description: modele.description,
    date_depense: new Date().toISOString().slice(0, 10), recurrence: "aucune",
  });
  if (errInsert) { console.error("[depenses] insert renouvellement:", errInsert.message); return { ok: false, error: errInsert.message }; }

  const base = new Date(modele.recurrence_prochaine_date ?? new Date());
  if (modele.recurrence === "hebdomadaire") base.setDate(base.getDate() + 7); else base.setMonth(base.getMonth() + 1);
  const { error: errUpdate } = await supabase.from("citoyen_depenses").update({ recurrence_prochaine_date: base.toISOString().slice(0, 10) }).eq("id", depenseId);
  if (errUpdate) { console.error("[depenses] update recurrence_prochaine_date:", errUpdate.message); return { ok: false, error: errUpdate.message }; }

  return { ok: true };
}
