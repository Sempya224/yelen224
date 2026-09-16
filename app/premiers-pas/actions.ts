"use server";

import { createAuthedSupabaseClient } from "@/lib/supabase";

export type OnboardingActionResult = { ok: true } | { ok: false; error: string };

async function updateColonneArray(
  userId: string,
  accessToken: string,
  colonne: "usage_intentions" | "attentes" | "acquisition_canal",
  valeurs: string[],
): Promise<OnboardingActionResult> {
  if (!accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("users").update({ [colonne]: valeurs }).eq("id", userId);

  if (error) {
    console.error(`[premiers-pas] update users.${colonne}:`, error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function updateUsageIntentions(userId: string, accessToken: string, valeurs: string[]) {
  return updateColonneArray(userId, accessToken, "usage_intentions", valeurs);
}

export async function updateAttentes(userId: string, accessToken: string, valeurs: string[]) {
  return updateColonneArray(userId, accessToken, "attentes", valeurs);
}

export async function updateAcquisitionCanal(userId: string, accessToken: string, valeurs: string[]) {
  return updateColonneArray(userId, accessToken, "acquisition_canal", valeurs);
}

// Posé à la sortie de la dernière étape (Acquisition), qu'elle ait été
// remplie ou passée — marque que ce citoyen a atteint la fin du parcours
// et ne doit plus jamais le revoir.
export async function marquerOnboardingTermine(userId: string, accessToken: string): Promise<OnboardingActionResult> {
  if (!accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("users").update({ onboarding_complete: true }).eq("id", userId);

  if (error) {
    console.error("[premiers-pas] update users.onboarding_complete:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
