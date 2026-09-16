import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const RAISONS_VALIDES = ["non_utilise", "confidentialite", "fonctionnalites_manquantes", "deuxieme_compte", "autre"];

// Capture le feedback de l'écran 1 du parcours "Supprimer mon compte" —
// écrit AVANT la suppression réelle (deleteCitoyenAccount), toujours
// appelé avec le compte encore existant. citoyen_id passe à null quand le
// compte est supprimé ensuite (ON DELETE SET NULL, migration
// 20260912000002) — la ligne de feedback survit, seul le lien disparaît.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, raison, detail } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (raison !== undefined && raison !== null && !RAISONS_VALIDES.includes(raison)) {
      return NextResponse.json({ error: "Raison invalide", code: "INVALID_RAISON" }, { status: 400 });
    }
    if (detail !== undefined && detail !== null && typeof detail !== "string") {
      return NextResponse.json({ error: "Détail invalide", code: "INVALID_DETAIL" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { error } = await supabaseAdmin.from("citoyen_suppression_feedback").insert({
      citoyen_id: user.id,
      raison: raison || null,
      detail: typeof detail === "string" && detail.trim() ? detail.trim() : null,
    });
    if (error) {
      console.error("[CITOYEN SUPPRESSION FEEDBACK ERROR]", error.message);
      return NextResponse.json({ error: "Impossible d'enregistrer votre retour", code: "INSERT_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN SUPPRESSION FEEDBACK ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
