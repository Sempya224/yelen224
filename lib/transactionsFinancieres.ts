import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { extraireContexteRequete } from "./journalActivite";

// Ledger financier — distinct de journal_activite (générique, polymorphe,
// aucune colonne montant typée). Insert non-bloquant, même esprit que
// lib/journalActivite.ts (cohérent avec le reste du code) : une erreur
// d'écriture ici ne doit jamais faire échouer l'action métier appelante.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export type TypeTransaction = "encaissement" | "remboursement" | "correction" | "annulation" | "ajustement";

export async function enregistrerTransaction(params: {
  institutionId: string;
  paidBookingId?: string;
  typeTransaction: TypeTransaction;
  montant: number;
  ancienneValeur?: Record<string, unknown>;
  nouvelleValeur?: Record<string, unknown>;
  motif?: string | null;
  membreId: string;
  membreNom: string;
  // Lot 1 (refonte "journal financier Enterprise", décision CEO 06/08/2026)
  // — contexte de requête (IP/appareil), même mécanisme que
  // journal_activite. Optionnel et rétrocompatible : les appelants qui ne
  // le passent pas obtiennent simplement une ligne sans contexte, jamais
  // une erreur.
  req?: NextRequest;
}): Promise<string | null> {
  // Retourne désormais l'id de la ligne insérée (Lot B, reçu Yelen —
  // recus.transaction_id doit pouvoir lier la transaction d'encaissement
  // qui l'a déclenché). Les appelants existants qui ignorent la valeur de
  // retour (fire-and-forget) restent inchangés, `Promise<string | null>`
  // est un sur-ensemble compatible de l'ancien `Promise<void>`.
  const { ip, userAgent, navigateur, os } = extraireContexteRequete(params.req);
  const { data, error } = await sb.from("transactions_financieres").insert({
    institution_id: params.institutionId,
    paid_booking_id: params.paidBookingId ?? null,
    type_transaction: params.typeTransaction,
    montant: params.montant,
    ancienne_valeur: params.ancienneValeur ?? null,
    nouvelle_valeur: params.nouvelleValeur ?? null,
    motif: params.motif ?? null,
    membre_id: params.membreId,
    membre_nom: params.membreNom,
    ip,
    user_agent: userAgent,
    navigateur,
    os,
  }).select("id").single();
  if (error) { console.error("[TransactionsFinancieres] Erreur insertion:", error.message); return null; }
  return data.id;
}
