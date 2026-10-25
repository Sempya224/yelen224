import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { reactiverCitoyenSiInactif } from "@/lib/activiteCitoyenne";

// Appelée côté client (app/login/page.tsx) juste après un
// supabase.auth.verifyOtp() réussi — connexion vérifiée fraîche (chantier
// COMPTES-INACTIFS.md, Phase 3, section 2.11.5). Ne sert QUE le point de
// réactivation : contrairement à auth.users.last_sign_in_at (déjà renseigné
// nativement par Supabase sans aucun code applicatif), rien ne déclenchait
// jusqu'ici la levée d'une suspension pour inactivité à ce moment précis.
// Volontairement jamais appelée depuis un simple chargement de page avec
// une session déjà ouverte — seule une vérification d'identité FRAÎCHE
// (ce qui vient de se produire avec verifyOtp) prouve l'activité récente.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await reactiverCitoyenSiInactif(sb, user.id);
  return NextResponse.json({ success: true });
}
