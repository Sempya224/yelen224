import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Ledger financier en lecture seule — jamais écrit directement par un
// membre, alimenté par lib/transactionsFinancieres.ts depuis les routes
// paiements/factures.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "transactions") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  let query = sb
    .from("transactions_financieres")
    .select("id,type_transaction,montant,ancienne_valeur,nouvelle_valeur,motif,membre_nom,paid_booking_id,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (type) query = query.eq("type_transaction", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data ?? [] });
}
