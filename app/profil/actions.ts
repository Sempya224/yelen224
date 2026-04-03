"use server";

import { supabase } from "@/lib/supabase";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

/**
 * Met à jour prenom, nom, name (nom complet) et optionnellement avatar_url.
 */
export async function updateCitoyenProfile(
  userId: string,
  prenom: string,
  nom: string,
  avatarUrl?: string | null,
): Promise<ProfileActionResult> {
  const p = prenom.trim();
  const n = nom.trim();
  if (!p || !n) {
    return { ok: false, error: "Prénom et nom sont obligatoires." };
  }

  const fullName = `${p} ${n}`.trim();

  const updatePayload: Record<string, unknown> = {
    prenom: p,
    nom: n,
    name: fullName,
  };
  if (avatarUrl !== undefined) {
    updatePayload.avatar_url = avatarUrl;
  }

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

export async function deleteCitoyenAccount(userId: string): Promise<ProfileActionResult> {
  const { error } = await supabase.from("users").delete().eq("id", userId);

  if (error) {
    console.error("[profil] delete users:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
