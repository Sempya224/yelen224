"use client";

import { supabase } from "@/lib/supabase";
import type { AcquisitionEventType, AcquisitionSource } from "./acquisitionSource";

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

// Envoi best-effort, jamais bloquant pour l'UI — une erreur réseau, un
// refus (400/404/429) ou une indisponibilité ne doit jamais empêcher la
// navigation du citoyen.
//
// GAP-17-01 (23/10/2026) : plus d'insert direct dans acquisition_events
// (policy anon retirée) — tout passe par POST /api/acquisition/events, qui
// valide le payload, l'institution et le débit. `citoyen_id` n'est plus
// envoyé : le serveur le dérive du jeton transmis en Authorization.
// `keepalive` : l'événement part même si la page change juste après le
// clic (prise de RDV, partage).
export async function enregistrerEvenementAcquisition(institutionId: string, eventType: AcquisitionEventType, source: AcquisitionSource): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/acquisition/events", {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        institution_id: institutionId,
        event_type: eventType,
        source,
        visiteur_id: obtenirVisiteurId(),
      }),
    });
  } catch { /* best-effort, jamais bloquant */ }
}
