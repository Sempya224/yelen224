import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre, evaluerActivationSecurite } from "@/lib/institutionAuth";

// Yelen Security Activation (16/09/2026) — voir lib/institutionAuth.ts pour
// le détail de la logique dérivée (aucune nouvelle colonne). Consommé par le
// dashboard institution pour décider s'il faut afficher le popup
// d'activation (avant l'échéance) ou l'écran de blocage plein écran (après).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const activation = await evaluerActivationSecurite(sb, membre.membreId);
  return NextResponse.json(activation);
}
