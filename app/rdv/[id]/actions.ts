"use server";

import { supabase } from "@/lib/supabase";

export type CreateRdvResult = { ok: true } | { ok: false; error: string };

export async function createRdv(payload: {
  citoyenId: string;
  institutionId: string;
  dateRdv: string;
  heureRdv: string;
  objet: string;
  pourAutre: boolean;
  nomAutre: string | null;
  phoneAutre: string | null;
}): Promise<CreateRdvResult> {
  const c = payload.citoyenId?.trim();
  const i = payload.institutionId?.trim();
  if (!c || !i) {
    return { ok: false, error: "Session ou établissement invalide." };
  }
  const objet = payload.objet.trim();
  if (!objet) {
    return { ok: false, error: "L'objet de la visite est obligatoire." };
  }
  if (!payload.dateRdv?.trim() || !payload.heureRdv?.trim()) {
    return { ok: false, error: "Date et heure du rendez-vous requises." };
  }

  if (payload.pourAutre) {
    const n = payload.nomAutre?.trim() ?? "";
    const p = payload.phoneAutre?.trim() ?? "";
    if (!n || !p) {
      return {
        ok: false,
        error: "Nom et téléphone requis pour un rendez-vous pour autrui.",
      };
    }
  }

  const row: Record<string, unknown> = {
    citoyen_id: c,
    institution_id: i,
    date_rdv: payload.dateRdv.trim(),
    heure_rdv: payload.heureRdv.trim(),
    objet,
    statut: "en attente",
    pour_autre: payload.pourAutre,
    nom_autre: payload.pourAutre ? (payload.nomAutre ?? "").trim() : null,
    phone_autre: payload.pourAutre ? (payload.phoneAutre ?? "").trim() : null,
  };

  const { error } = await supabase.from("rdv").insert(row);

  if (error) {
    console.error("[rdv] insert:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
