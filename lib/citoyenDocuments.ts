import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { extraireContexteRequete } from "./journalActivite";
import {
  DOCUMENT_TRANSITIONS, type DocumentStatut, type DocumentEventType,
  type DocumentMotifRefus,
} from "./citoyenDocumentsConstants";

// Documents clients — Lot 1 (case management, décision CEO 09/08/2026).
// Source unique d'écriture pour citoyen_documents/document_events — aucune
// route ne doit jamais écrire ces deux tables directement, pour garantir
// qu'aucun événement d'audit ne peut être oublié. Miroir exact de
// lib/signalements.ts (même client service_role, même
// extraireContexteRequete pour IP/UA).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Acteur = { type: "membre" | "citoyen" | "system"; id: string | null; nom: string | null };
type ActionResult = { ok: true } | { ok: false; error: string };

async function ajouterEvenement(params: {
  documentId: string; institutionId: string; citoyenId: string; type: DocumentEventType; acteur: Acteur;
  ancienneValeur?: Record<string, unknown> | null; nouvelleValeur?: Record<string, unknown> | null;
  commentaire?: string | null; req?: NextRequest;
}): Promise<void> {
  const { ip, userAgent } = extraireContexteRequete(params.req);
  const { error } = await sb.from("document_events").insert({
    document_id: params.documentId,
    institution_id: params.institutionId,
    citoyen_id: params.citoyenId,
    type: params.type,
    acteur_type: params.acteur.type,
    membre_id: params.acteur.type === "membre" ? params.acteur.id : null,
    membre_nom: params.acteur.type === "membre" ? params.acteur.nom : null,
    ancienne_valeur: params.ancienneValeur ?? null,
    nouvelle_valeur: params.nouvelleValeur ?? null,
    commentaire: params.commentaire ?? null,
    ip,
    user_agent: userAgent,
  });
  if (error) console.error("[Documents] Erreur insertion événement:", error.message);
}

export async function creerDemande(params: {
  institutionId: string; citoyenId: string; rdvId: string; type: string; label: string; description?: string | null;
  dateLimite?: string | null; demandeParMembreId: string; remplaceDocumentId?: string | null;
  acteur: Acteur; req?: NextRequest;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await sb.from("citoyen_documents").insert({
    institution_id: params.institutionId,
    citoyen_id: params.citoyenId,
    rdv_id: params.rdvId,
    sens: "demande",
    type: params.type,
    label: params.label,
    description: params.description ?? null,
    statut: "en_attente",
    date_limite: params.dateLimite ?? null,
    demande_par_membre_id: params.demandeParMembreId,
    remplace_document_id: params.remplaceDocumentId ?? null,
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message || "Erreur lors de la création de la demande." };

  await ajouterEvenement({
    documentId: data.id, institutionId: params.institutionId, citoyenId: params.citoyenId, type: "created", acteur: params.acteur,
    nouvelleValeur: { sens: "demande", statut: "en_attente", type: params.type, label: params.label },
    req: params.req,
  });
  return { ok: true, id: data.id };
}

export async function creerEnvoi(params: {
  institutionId: string; citoyenId: string; rdvId: string; type: string; label: string; description?: string | null;
  url: string; typeMime: string; taille: number; demandeParMembreId: string;
  acteur: Acteur; req?: NextRequest;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await sb.from("citoyen_documents").insert({
    institution_id: params.institutionId,
    citoyen_id: params.citoyenId,
    rdv_id: params.rdvId,
    sens: "envoi",
    type: params.type,
    label: params.label,
    description: params.description ?? null,
    statut: "disponible",
    url: params.url,
    type_mime: params.typeMime,
    taille: params.taille,
    demande_par_membre_id: params.demandeParMembreId,
    traite_le: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message || "Erreur lors de l'envoi du document." };

  await ajouterEvenement({
    documentId: data.id, institutionId: params.institutionId, citoyenId: params.citoyenId, type: "created", acteur: params.acteur,
    nouvelleValeur: { sens: "envoi", statut: "disponible", type: params.type, label: params.label },
    req: params.req,
  });
  return { ok: true, id: data.id };
}

// Seul point d'écriture de citoyen_documents.statut — valide
// DOCUMENT_TRANSITIONS avant toute mutation (même discipline que
// lib/signalements.ts::changerStatutInterne).
async function changerStatutInterne(params: {
  documentId: string; nouveauStatut: DocumentStatut; acteur: Acteur;
  eventType: DocumentEventType; commentaire?: string | null; req?: NextRequest;
  extraColumns?: Record<string, unknown>;
}): Promise<ActionResult> {
  const { data: courant, error: fetchError } = await sb
    .from("citoyen_documents").select("id, institution_id, citoyen_id, statut")
    .eq("id", params.documentId).maybeSingle();
  if (fetchError || !courant) return { ok: false, error: "Document introuvable." };

  const statutActuel = courant.statut as DocumentStatut;
  if (!DOCUMENT_TRANSITIONS[statutActuel]?.includes(params.nouveauStatut)) {
    return { ok: false, error: `Transition invalide : ${statutActuel} → ${params.nouveauStatut}.` };
  }

  const { error: updateError } = await sb.from("citoyen_documents")
    .update({ statut: params.nouveauStatut, ...params.extraColumns })
    .eq("id", params.documentId);
  if (updateError) return { ok: false, error: updateError.message };

  await ajouterEvenement({
    documentId: params.documentId, institutionId: courant.institution_id, citoyenId: courant.citoyen_id,
    type: params.eventType, acteur: params.acteur,
    ancienneValeur: { statut: statutActuel }, nouvelleValeur: { statut: params.nouveauStatut },
    commentaire: params.commentaire, req: params.req,
  });
  return { ok: true };
}

// Transition citoyen : le citoyen a téléversé sa réponse à une demande.
// Vérifie explicitement sens='demande' — un document 'envoi' n'a jamais de
// réception attendue du citoyen.
export async function enregistrerReception(params: {
  documentId: string; url: string; typeMime: string; taille: number; acteur: Acteur; req?: NextRequest;
}): Promise<ActionResult> {
  const { data: courant } = await sb.from("citoyen_documents").select("sens, statut").eq("id", params.documentId).maybeSingle();
  if (!courant) return { ok: false, error: "Document introuvable." };
  if (courant.sens !== "demande") return { ok: false, error: "Ce document n'attend pas de réponse du citoyen." };

  return changerStatutInterne({
    documentId: params.documentId, nouveauStatut: "recu", eventType: "uploaded", acteur: params.acteur,
    extraColumns: { url: params.url, type_mime: params.typeMime, taille: params.taille, traite_le: new Date().toISOString() },
    req: params.req,
  });
}

export async function commencerVerification(params: {
  documentId: string; parMembre: { id: string; nom: string }; req?: NextRequest;
}): Promise<ActionResult> {
  return changerStatutInterne({
    documentId: params.documentId, nouveauStatut: "a_verifier", eventType: "verification_started",
    acteur: { type: "membre", id: params.parMembre.id, nom: params.parMembre.nom }, req: params.req,
  });
}

export async function validerDocument(params: {
  documentId: string; parMembre: { id: string; nom: string }; req?: NextRequest;
}): Promise<ActionResult> {
  return changerStatutInterne({
    documentId: params.documentId, nouveauStatut: "valide", eventType: "validated",
    acteur: { type: "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    extraColumns: { valide_par_membre_id: params.parMembre.id, valide_le: new Date().toISOString() },
    req: params.req,
  });
}

export async function refuserDocument(params: {
  documentId: string; motifRefus: DocumentMotifRefus; motifRefusDetail?: string | null;
  parMembre: { id: string; nom: string }; req?: NextRequest;
}): Promise<ActionResult> {
  if (params.motifRefus === "autre" && !params.motifRefusDetail?.trim()) {
    return { ok: false, error: "Une explication est requise pour le motif \"Autre\"." };
  }
  return changerStatutInterne({
    documentId: params.documentId, nouveauStatut: "refuse", eventType: "rejected",
    acteur: { type: "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    commentaire: params.motifRefusDetail ?? null,
    extraColumns: {
      motif_refus: params.motifRefus,
      motif_refus_detail: params.motifRefusDetail?.trim() || null,
      refuse_par_membre_id: params.parMembre.id,
      refuse_le: new Date().toISOString(),
    },
    req: params.req,
  });
}

export async function archiverDocument(params: {
  documentId: string; parMembre: { id: string; nom: string }; req?: NextRequest;
}): Promise<ActionResult> {
  return changerStatutInterne({
    documentId: params.documentId, nouveauStatut: "archive", eventType: "archived",
    acteur: { type: "membre", id: params.parMembre.id, nom: params.parMembre.nom },
    extraColumns: { archive_par_membre_id: params.parMembre.id, archive_le: new Date().toISOString() },
    req: params.req,
  });
}

// Consultation/téléchargement ne changent jamais le statut — simples
// événements d'audit (brief §18 : même une consultation doit pouvoir être
// enregistrée pour un document sensible).
export async function enregistrerConsultation(params: {
  documentId: string; institutionId: string; citoyenId: string; acteur: Acteur; req?: NextRequest;
}): Promise<void> {
  await ajouterEvenement({
    documentId: params.documentId, institutionId: params.institutionId, citoyenId: params.citoyenId,
    type: "viewed", acteur: params.acteur, req: params.req,
  });
}

export async function enregistrerTelechargement(params: {
  documentId: string; institutionId: string; citoyenId: string; acteur: Acteur; req?: NextRequest;
}): Promise<void> {
  await ajouterEvenement({
    documentId: params.documentId, institutionId: params.institutionId, citoyenId: params.citoyenId,
    type: "downloaded", acteur: params.acteur, req: params.req,
  });
}
