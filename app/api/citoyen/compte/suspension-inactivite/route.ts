import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { chargerSuspensionInactiviteActive } from "@/lib/inactiviteCitoyenne";

// Source de vérité structurée pour la porte de blocage côté citoyen
// (chantier COMPTES-INACTIFS.md, Phase 3) — miroir de GET
// /api/citoyen/rdv-restriction, même principe : ne jamais faire deviner au
// front un état qu'il n'a pas vraiment.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const suspension = await chargerSuspensionInactiviteActive(sb, user.id);
  if (!suspension) return NextResponse.json({ suspended: false });

  return NextResponse.json({
    suspended: true,
    reference: suspension.reference,
    motif: suspension.motif,
    createdAt: suspension.createdAt,
  });
}
