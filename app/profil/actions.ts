"use server";

import { createAuthedSupabaseClient } from "@/lib/supabase";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

/**
 * Met à jour prenom, nom et optionnellement photo_url.
 * `name` et `avatar_url` retirés : aucune des deux colonnes n'existe sur
 * `users` (vraies colonnes : prenom, nom, photo_url — cf. CLAUDE.md /schema).
 * Le payload précédent faisait échouer systématiquement l'update (PostgREST
 * rejette un UPDATE sur colonne inconnue) — aucune modification de profil
 * citoyen n'était donc jamais réellement enregistrée, silencieusement.
 */
export async function updateCitoyenProfile(
  userId: string,
  prenom: string,
  nom: string,
  accessToken: string,
  photoUrl?: string | null,
  ville?: string | null,
): Promise<ProfileActionResult> {
  const p = prenom.trim();
  const n = nom.trim();
  if (!p || !n) {
    return { ok: false, error: "Prénom et nom sont obligatoires." };
  }
  if (!accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }

  const updatePayload: Record<string, unknown> = {
    prenom: p,
    nom: n,
  };
  if (photoUrl !== undefined) {
    updatePayload.photo_url = photoUrl;
  }
  if (ville !== undefined) {
    updatePayload.ville = ville?.trim() || null;
  }

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase
    .from("users")
    .update(updatePayload)
    .eq("id", userId);

  if (error) {
    console.error("[profil] update users:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteCitoyenAccount(userId: string, accessToken: string): Promise<ProfileActionResult> {
  if (!accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }
  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("users").delete().eq("id", userId);

  if (error) {
    console.error("[profil] delete users:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
