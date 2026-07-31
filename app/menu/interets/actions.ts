"use server";

import { createAuthedSupabaseClient } from "@/lib/supabase";
import type { CentreInteretId } from "@/lib/centresInteret";

export type InteretsActionResult = { ok: true } | { ok: false; error: string };

export async function updateCentresInteret(
  userId: string,
  accessToken: string,
  centresInteret: CentreInteretId[],
): Promise<InteretsActionResult> {
  if (!accessToken?.trim()) {
    return { ok: false, error: "Session expirée, reconnectez-vous." };
  }

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("users").update({ centres_interet: centresInteret }).eq("id", userId);

  if (error) {
    console.error("[interets] update users.centres_interet:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
