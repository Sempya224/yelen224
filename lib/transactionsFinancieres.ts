import { createClient } from "@supabase/supabase-js";

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
}): Promise<void> {
  const { error } = await sb.from("transactions_financieres").insert({
    institution_id: params.institutionId,
    paid_booking_id: params.paidBookingId ?? null,
    type_transaction: params.typeTransaction,
    montant: params.montant,
    ancienne_valeur: params.ancienneValeur ?? null,
    nouvelle_valeur: params.nouvelleValeur ?? null,
    motif: params.motif ?? null,
    membre_id: params.membreId,
    membre_nom: params.membreNom,
  });
  if (error) console.error("[TransactionsFinancieres] Erreur insertion:", error.message);
}
