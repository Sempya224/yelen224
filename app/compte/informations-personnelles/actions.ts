"use server";

import { createAuthedSupabaseClient } from "@/lib/supabase";

export type InfosPersoActionResult = { ok: true } | { ok: false; error: string };

export type InfosPersoPayload = {
  prenom: string;
  nom: string;
  ville?: string | null;
  photoUrl?: string | null;
  dateNaissance?: string | null;
  sexe?: "homme" | "femme" | null;
  nationalite?: string | null;
  profession?: string | null;
  adresse?: string | null;
  email?: string | null;
};

// Champs éditables réels de `public.users` (cf. CLAUDE.md /schema, vérifié
// par SQL le 18/07/2026) — `phone` volontairement absent : c'est
// l'identifiant de connexion du citoyen, sa modification exige une
// vérification OTP dédiée, pas un simple champ de formulaire (hors scope
// de cet écran, décision produit 18/07/2026).
export async function updateInfosPersonnelles(
  userId: string,
  accessToken: string,
  payload: InfosPersoPayload,
): Promise<InfosPersoActionResult> {
  const prenom = payload.prenom.trim();
  const nom = payload.nom.trim();
  if (!prenom || !nom) {
    return { ok: false, error: "Prénom et nom sont obligatoires." };
  }
  if (!accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }

  const updatePayload: Record<string, unknown> = {
    prenom,
    nom,
    ville: payload.ville?.trim() || null,
    date_naissance: payload.dateNaissance || null,
    sexe: payload.sexe || null,
    nationalite: payload.nationalite?.trim() || null,
    profession: payload.profession?.trim() || null,
    adresse: payload.adresse?.trim() || null,
    email: payload.email?.trim() || null,
  };
  if (payload.photoUrl !== undefined) {
    updatePayload.photo_url = payload.photoUrl;
  }

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("users").update(updatePayload).eq("id", userId);

  if (error) {
    console.error("[informations-personnelles] update users:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
