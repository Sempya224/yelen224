import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { extraireContexteRequete } from "./journalActivite";
import {
  SIGNALEMENT_TRANSITIONS, SIGNALEMENT_ESCALADE_NIVEAUX,
  type SignalementStatut, type SignalementPriorite, type SignalementResolutionAction,
  type SignalementEscaladeNiveau, type SignalementEventType,
} from "./signalementsConstants";

// Signalements — Lot 1 (case management, décision CEO 08/08/2026). Source
// unique d'écriture pour signalements/signalement_events — aucune route ne
// doit jamais écrire ces deux tables directement, pour garantir qu'aucun
// événement d'audit ne peut être oublié. Miroir de lib/journalActivite.ts
// (même client service_role, même extraireContexteRequete pour IP/UA).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Acteur = { type: "membre" | "citoyen" | "system" | "admin_yelen"; id: string | null; nom: string };
type ActionResult = { ok: true } | { ok: false; error: string };

async function ajouterEvenement(params: {
  signalementId: string; institutionId: string; type: SignalementEventType; acteur: Acteur;
  ancienneValeur?: Record<string, unknown> | null; nouvelleValeur?: Record<string, unknown> | null;
  commentaire?: string | null; req?: NextRequest;
}): Promise<void> {
  const { ip, userAgent } = extraireContexteRequete(params.req);
  const { error } = await sb.from("signalement_events").insert({
    signalement_id: params.signalementId,
    institution_id: params.institutionId,
    type: params.type,
    acteur_type: params.acteur.type,
    membre_id: params.acteur.type === "membre" ? params.acteur.id : null,
    membre_nom: params.acteur.nom,
    ancienne_valeur: params.ancienneValeur ?? null,
    nouvelle_valeur: params.nouvelleValeur ?? null,
    commentaire: params.commentaire ?? null,
    ip,
    user_agent: userAgent,
  });
  if (error) console.error("[Signalements] Erreur insertion événement:", error.message);
}

export async function creerSignalement(params: {
  institutionId: string;
  typeSignaleur: "citoyen" | "institution" | "system";
  typeCible: "citoyen" | "institution";
  citoyenId: string | null;
  motif: string;
  description: string;
  rdvId?: string | null;
  incidentDate?: string | null;
  incidentHeure?: string | null;
  priorite?: SignalementPriorite;
  acteur: Acteur;
  req?: NextRequest;
}): Promise<{ ok: true; id: string; numeroPublic: string } | { ok: false; error: string }> {
  const { data, error } = await sb.from("signalements").insert({
    institution_id: params.institutionId,
    type_signaleur: params.typeSignaleur,
    type_cible: params.typeCible,
    citoyen_id: params.citoyenId,
    motif: params.motif,
    description: params.description,
    rdv_id: params.rdvId ?? null,
    incident_date: params.incidentDate ?? null,
    incident_heure: params.incidentHeure ?? null,
    priorite: params.priorite ?? "normale",
    statut: "nouveau",
  }).select("id, numero_public").single();

  if (error || !data) return { ok: false, error: error?.message || "Erreur lors de la création du signalement." };

  await ajouterEvenement({
    signalementId: data.id, institutionId: params.institutionId, type: "created", acteur: params.acteur,
    nouvelleValeur: { statut: "nouveau", priorite: params.priorite ?? "normale", motif: params.motif },
    req: params.req,
  });

  return { ok: true, id: data.id, numeroPublic: data.numero_public };
}

// Seul point d'écriture de signalements.statut — valide SIGNALEMENT_TRANSITIONS
// avant toute mutation (voir lib/signalementsConstants.ts pour le graphe et
// sa justification : légalité de transition en code, pas en trigger DB).
// eventType permet aux helpers de plus haut niveau (résoudre/clôturer/
// réouvrir) d'émettre un type d'événement plus précis que le générique
// "status_changed" — reopen contourne volontairement le graphe (les états
// terminaux ont une liste de transitions vide par design, la réouverture
// est l'exception documentée).
async function changerStatutInterne(params: {
  signalementId: string; nouveauStatut: SignalementStatut; acteur: Acteur;
  eventType?: SignalementEventType; commentaire?: string | null; req?: NextRequest;
  extraColumns?: Record<string, unknown>; bypassTransitionCheck?: boolean;
}): Promise<ActionResult> {
  const { data: courant, error: fetchError } = await sb
    .from("signalements").select("id, institution_id, statut")
    .eq("id", params.signalementId).maybeSingle();
  if (fetchError || !courant) return { ok: false, error: "Signalement introuvable." };

  const statutActuel = courant.statut as SignalementStatut;
  if (!params.bypassTransitionCheck && !SIGNALEMENT_TRANSITIONS[statutActuel]?.includes(params.nouveauStatut)) {
    return { ok: false, error: `Transition invalide : ${statutActuel} → ${params.nouveauStatut}.` };
  }

  const { error: updateError } = await sb.from("signalements")
    .update({ statut: params.nouveauStatut, ...params.extraColumns })
    .eq("id", params.signalementId);
  if (updateError) return { ok: false, error: updateError.message };

  await ajouterEvenement({
    signalementId: params.signalementId, institutionId: courant.institution_id,
    type: params.eventType ?? "status_changed", acteur: params.acteur,
    ancienneValeur: { statut: statutActuel }, nouvelleValeur: { statut: params.nouveauStatut },
    commentaire: params.commentaire, req: params.req,
  });

  return { ok: true };
}

export async function changerStatut(params: {
  signalementId: string; nouveauStatut: SignalementStatut; acteur: Acteur; commentaire?: string | null; req?: NextRequest;
  // Les actions admin_yelen (app/api/admin/signalements/[id]/resoudre|
  // ignorer) sont des gestes grossiers ("traiter ce cas"), pas une étape du
  // workflow fin institution — le graphe de transition (pensé pour ce
  // dernier) ne s'applique pas à cet acteur. Écran admin non redessiné dans
  // ce lot, voir CLAUDE.md /signalements-lot1.
  bypassTransitionCheck?: boolean;
}): Promise<ActionResult> {
  return changerStatutInterne(params);
}

export async function assignerSignalement(params: {
  signalementId: string; institutionId: string; assigneAMembreId: string; parMembre: { id: string; nom: string }; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: membre } = await sb.from("institution_membres").select("id, prenom, nom")
    .eq("id", params.assigneAMembreId).eq("institution_id", params.institutionId).maybeSingle();
  if (!membre) return { ok: false, error: "Membre introuvable pour cette institution." };

  const { error } = await sb.from("signalements").update({
    assigne_a_membre_id: params.assigneAMembreId,
    assigne_par_membre_id: params.parMembre.id,
    assigne_le: new Date().toISOString(),
  }).eq("id", params.signalementId);
  if (error) return { ok: false, error: error.message };

  await ajouterEvenement({
    signalementId: params.signalementId, institutionId: params.institutionId, type: "assigned",
    acteur: { type: "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    nouvelleValeur: { assigne_a: `${membre.prenom} ${membre.nom}` }, req: params.req,
  });
  return { ok: true };
}

export async function changerPriorite(params: {
  signalementId: string; institutionId: string; nouvellePriorite: SignalementPriorite;
  parMembre: { id: string | null; nom: string; isAdminYelen?: boolean }; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: courant } = await sb.from("signalements").select("priorite").eq("id", params.signalementId).maybeSingle();
  if (!courant) return { ok: false, error: "Signalement introuvable." };

  const { error } = await sb.from("signalements").update({ priorite: params.nouvellePriorite }).eq("id", params.signalementId);
  if (error) return { ok: false, error: error.message };

  await ajouterEvenement({
    signalementId: params.signalementId, institutionId: params.institutionId, type: "priority_changed",
    acteur: { type: params.parMembre.isAdminYelen ? "admin_yelen" : "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    ancienneValeur: { priorite: courant.priorite }, nouvelleValeur: { priorite: params.nouvellePriorite }, req: params.req,
  });
  return { ok: true };
}

export async function resoudreSignalement(params: {
  signalementId: string; resolutionAction: SignalementResolutionAction; resolutionExplication: string;
  parMembre: { id: string | null; nom: string; isAdminYelen?: boolean }; req?: NextRequest;
}): Promise<ActionResult> {
  return changerStatutInterne({
    signalementId: params.signalementId, nouveauStatut: "resolu", eventType: "resolved",
    acteur: { type: params.parMembre.isAdminYelen ? "admin_yelen" : "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    extraColumns: {
      resolution_action: params.resolutionAction,
      resolution_explication: params.resolutionExplication,
      resolu_par_membre_id: params.parMembre.isAdminYelen ? null : params.parMembre.id,
      resolu_le: new Date().toISOString(),
    },
    bypassTransitionCheck: params.parMembre.isAdminYelen === true,
    req: params.req,
  });
}

export async function cloturerSignalement(params: {
  signalementId: string; parMembre: { id: string | null; nom: string; isAdminYelen?: boolean }; req?: NextRequest;
}): Promise<ActionResult> {
  return changerStatutInterne({
    signalementId: params.signalementId, nouveauStatut: "cloture", eventType: "closed",
    acteur: { type: params.parMembre.isAdminYelen ? "admin_yelen" : "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    extraColumns: { cloture_par_membre_id: params.parMembre.isAdminYelen ? null : params.parMembre.id, cloture_le: new Date().toISOString() },
    bypassTransitionCheck: params.parMembre.isAdminYelen === true,
    req: params.req,
  });
}

// Réouverture : contourne volontairement SIGNALEMENT_TRANSITIONS (les états
// terminaux ont une liste de transitions vide par design — la réouverture
// est l'unique échappatoire documentée, toujours vers "en_cours"). Raison
// obligatoire, vérifiée ici plutôt que seulement côté route.
export async function reouvrirSignalement(params: {
  signalementId: string; raison: string; parMembre: { id: string | null; nom: string; isAdminYelen?: boolean }; req?: NextRequest;
}): Promise<ActionResult> {
  if (!params.raison.trim()) return { ok: false, error: "Une raison de réouverture est obligatoire." };
  return changerStatutInterne({
    signalementId: params.signalementId, nouveauStatut: "en_cours", eventType: "reopened",
    acteur: { type: params.parMembre.isAdminYelen ? "admin_yelen" : "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    commentaire: params.raison.trim(), bypassTransitionCheck: true, req: params.req,
  });
}

export async function escaladerSignalement(params: {
  signalementId: string; institutionId: string; nouveauNiveau: SignalementEscaladeNiveau;
  parMembre: { id: string | null; nom: string; isAdminYelen?: boolean }; commentaire?: string | null; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: courant } = await sb.from("signalements").select("escalade_niveau").eq("id", params.signalementId).maybeSingle();
  if (!courant) return { ok: false, error: "Signalement introuvable." };

  const actuel = courant.escalade_niveau as SignalementEscaladeNiveau;
  if (SIGNALEMENT_ESCALADE_NIVEAUX.indexOf(params.nouveauNiveau) <= SIGNALEMENT_ESCALADE_NIVEAUX.indexOf(actuel)) {
    return { ok: false, error: "Le niveau d'escalade doit être supérieur au niveau actuel." };
  }

  const { error } = await sb.from("signalements").update({ escalade_niveau: params.nouveauNiveau }).eq("id", params.signalementId);
  if (error) return { ok: false, error: error.message };

  await ajouterEvenement({
    signalementId: params.signalementId, institutionId: params.institutionId, type: "escalated",
    acteur: { type: params.parMembre.isAdminYelen ? "admin_yelen" : "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    ancienneValeur: { escalade_niveau: actuel }, nouvelleValeur: { escalade_niveau: params.nouveauNiveau },
    commentaire: params.commentaire, req: params.req,
  });
  return { ok: true };
}

export async function marquerDoublon(params: {
  signalementId: string; institutionId: string; principalSignalementId: string;
  parMembre: { id: string | null; nom: string; isAdminYelen?: boolean }; req?: NextRequest;
}): Promise<ActionResult> {
  if (params.signalementId === params.principalSignalementId) {
    return { ok: false, error: "Un signalement ne peut pas être son propre doublon." };
  }
  const { data: principal } = await sb.from("signalements").select("id")
    .eq("id", params.principalSignalementId).eq("institution_id", params.institutionId).maybeSingle();
  if (!principal) return { ok: false, error: "Signalement principal introuvable pour cette institution." };

  return changerStatutInterne({
    signalementId: params.signalementId, nouveauStatut: "doublon", eventType: "marked_duplicate",
    acteur: { type: params.parMembre.isAdminYelen ? "admin_yelen" : "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    extraColumns: { doublon_de_signalement_id: params.principalSignalementId },
    commentaire: `Doublon de ${params.principalSignalementId}`,
    bypassTransitionCheck: params.parMembre.isAdminYelen === true,
    req: params.req,
  });
}

export async function ajouterNote(params: {
  signalementId: string; institutionId: string; contenu: string; auteur: { membreId: string; nom: string }; req?: NextRequest;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!params.contenu.trim()) return { ok: false, error: "Le contenu de la note ne peut pas être vide." };

  const { data, error } = await sb.from("signalement_notes").insert({
    signalement_id: params.signalementId, institution_id: params.institutionId,
    auteur_membre_id: params.auteur.membreId, auteur_nom: params.auteur.nom, contenu: params.contenu.trim(),
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message || "Erreur lors de l'ajout de la note." };

  await ajouterEvenement({
    signalementId: params.signalementId, institutionId: params.institutionId, type: "note_added",
    acteur: { type: "membre", id: params.auteur.membreId, nom: params.auteur.nom }, req: params.req,
  });
  return { ok: true, id: data.id };
}

export async function ajouterPieceJointe(params: {
  signalementId: string; institutionId: string; storagePath: string; nomOriginal: string; typeMime: string; taille: number;
  auteur: { membreId: string | null; nom: string }; req?: NextRequest;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await sb.from("signalement_attachments").insert({
    signalement_id: params.signalementId, institution_id: params.institutionId,
    storage_path: params.storagePath, nom_original: params.nomOriginal, type_mime: params.typeMime, taille: params.taille,
    ajoute_par_membre_id: params.auteur.membreId, ajoute_par_nom: params.auteur.nom,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message || "Erreur lors de l'ajout de la pièce jointe." };

  await ajouterEvenement({
    signalementId: params.signalementId, institutionId: params.institutionId, type: "attachment_added",
    acteur: { type: params.auteur.membreId ? "membre" : "citoyen", id: params.auteur.membreId, nom: params.auteur.nom }, req: params.req,
  });
  return { ok: true, id: data.id };
}
