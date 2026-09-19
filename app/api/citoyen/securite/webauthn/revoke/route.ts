import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Manquant depuis le Lot C (register/auth seulement) — nécessaire à l'écran
// Sécurité (Lot E) pour retirer un appareil biométrique. Mirroring
// institution/auth/webauthn/revoke, adapté à l'auth citoyen (accessToken
// Supabase, même pattern que api/citoyen/securite/pin/route.ts).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, credentialId } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!credentialId || typeof credentialId !== "string") {
      return NextResponse.json({ error: "Identifiant manquant", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    // .delete() ne renvoie pas d'erreur si 0 ligne correspond — on vérifie
    // explicitement via .select() qu'une ligne appartenant à CE citoyen a
    // bien été supprimée, sinon un citoyen pourrait révoquer le credential
    // d'un autre en devinant un id.
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .delete()
      .eq("id", credentialId)
      .eq("citoyen_id", user.id)
      .select("id");

    if (deleteError) {
      console.error("[CITOYEN WEBAUTHN REVOKE ERROR]", deleteError.code, deleteError.message);
      return NextResponse.json({ error: "Erreur lors de la révocation", code: "DELETE_ERROR" }, { status: 500 });
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Appareil introuvable", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN WEBAUTHN REVOKE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
