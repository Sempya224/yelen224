"use server";

import { createAuthedSupabaseClient } from "@/lib/supabase";
import type { CategorieDepenseId } from "@/lib/depenses";

export type DepenseActionResult = { ok: true } | { ok: false; error: string };

export async function ajouterDepense(
  userId: string,
  accessToken: string,
  payload: { categorie: CategorieDepenseId; montant: number; description: string | null; dateDepense: string },
): Promise<DepenseActionResult> {
  if (!accessToken?.trim()) return { ok: false, error: "Session expirée, reconnectez-vous." };
  if (!Number.isFinite(payload.montant) || payload.montant <= 0) return { ok: false, error: "Montant invalide." };

  const supabase = createAuthedSupabaseClient(accessToken);
  const { error } = await supabase.from("citoyen_depenses").insert({
    citoyen_id: userId,
    categorie: payload.categorie,
    montant: Math.round(payload.montant),
    description: payload.description?.trim() || null,
    date_depense: payload.dateDepense,
  });

  if (error) {
    console.error("[depenses] insert citoyen_depenses:", error.message);
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
