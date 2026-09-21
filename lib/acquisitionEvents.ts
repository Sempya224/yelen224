"use client";

import { supabase } from "@/lib/supabase";
import type { AcquisitionSource } from "./acquisitionSource";

// Identifiant visiteur anonyme — n'existait nulle part dans le projet
// avant ce chantier (grep confirmé). Seul moyen de distinguer
// nouveaux/récurrents pour un citoyen non connecté (la majorité du
// trafic public, Yelen exigeant une connexion OTP). Pur UUID aléatoire,
// aucune donnée personnelle, 1 an — même discipline try/catch que tout
// accès localStorage du projet (Safari navigation privée peut lever).
const VISITEUR_ID_KEY = "yelen224_visiteur_id";

export function obtenirVisiteurId(): string | null {
  try {
    let id = localStorage.getItem(VISITEUR_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITEUR_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

// Insert best-effort, jamais bloquant pour l'UI — même discipline que
// l'insert institution_vues (app/institution/[id]/page.tsx) : une erreur
// réseau ou RLS ne doit jamais empêcher la navigation du citoyen.
export async function enregistrerEvenementAcquisition(institutionId: string, eventType: string, source: AcquisitionSource): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("acquisition_events").insert({
      institution_id: institutionId,
      event_type: eventType,
      source,
      citoyen_id: session?.user?.id ?? null,
      visiteur_id: obtenirVisiteurId(),
    });
  } catch { /* best-effort, jamais bloquant */ }
}
