"use server";

import { supabase } from "@/lib/supabase";

function normalizeGnPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d;
}

export type RegisterCitoyenResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Crée (ou retrouve) un citoyen dans `users` avec le numéro complet +224…
 * Colonne Supabase : `phone`.
 */
export async function registerCitoyenPhone(formData: FormData): Promise<RegisterCitoyenResult> {
  const raw = String(formData.get("phone") ?? "").trim();
  const digits = normalizeGnPhone(raw);
  if (digits.length < 7) {
    return { ok: false, error: "Numéro invalide." };
  }

  const fullPhone = `+224${digits}`;

  const { data: existing, error: selErr } = await supabase
    .from("users")
    .select("id")
    .eq("phone", fullPhone)
    .maybeSingle();

  if (selErr) {
    console.error("[inscription] select users:", selErr.message);
    return { ok: false, error: selErr.message };
  }

  if (existing?.id) {
    return { ok: true, userId: String(existing.id) };
  }

  const { data: created, error: insErr } = await supabase
    .from("users")
    .insert({ phone: fullPhone })
    .select("id")
    .single();

  if (insErr) {
    console.error("[inscription] insert users:", insErr.message);
    return { ok: false, error: insErr.message };
  }

  if (!created?.id) {
    return { ok: false, error: "Réponse serveur inattendue." };
  }

  return { ok: true, userId: String(created.id) };
}
