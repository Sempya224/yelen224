// État d'attention Yelen — Lot 2 (25/08/2026). Point de lecture unique de
// l'état d'attention d'un citoyen — même motif d'authentification que
// app/api/citoyen/suivis/route.ts (service_role après vérification du
// token, jamais de citoyen_id fourni par le client). Le calcul lui-même
// (lib/attentionEngine.ts) reste pur et déjà prouvé par les 20 scénarios
// — cette route ne fait qu'assembler l'état réel puis l'y faire passer.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { construireCitizenState } from "@/lib/citizenStateBuilder";
import { calculerEtatDattention } from "@/lib/attentionEngine";
import { lireMemoire, mettreAJourMemoire } from "@/lib/attentionMemory";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const user = await verifierCitoyenToken(accessToken);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const [state, memoire] = await Promise.all([
      construireCitizenState(supabaseAdmin, user.id),
      lireMemoire(supabaseAdmin, user.id),
    ]);
    const resultat = calculerEtatDattention(state, memoire);
    // Fire-and-forget côté citoyen : un échec ici ne doit jamais empêcher
    // l'affichage de l'état déjà calculé, seulement priver la prochaine
    // lecture d'une mise à jour de mémoire.
    void mettreAJourMemoire(supabaseAdmin, user.id, state).catch((e) => console.error("[CITOYEN ATTENTION] mémoire:", e));

    return NextResponse.json(resultat);
  } catch (error) {
    console.error("[CITOYEN ATTENTION ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
