import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Mesure du retour du QR imprimable/lien copié depuis "Mon code QR" (retour
// Bryan 25/07/2026) — compte les rdv/paid_bookings dont `provenance = 'qr'`
// pour l'institution du membre authentifié. service_role car les
// institutions n'ont pas de session Supabase Auth (JWT custom, cf.
// CLAUDE.md /auth), même contournement RLS que les autres routes institution.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "codeqr", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  // `rdv` seule suffit : toute réservation (gratuite ou payante) y crée une
  // ligne — la payante en crée une seconde dans `paid_bookings` (données de
  // paiement), compter les deux aurait doublé les payantes.
  const { count, error } = await sb.from("rdv").select("id", { count: "exact", head: true })
    .eq("institution_id", membre.institutionId).eq("provenance", "qr");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
