import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Révoque UN appareil mémorisé ciblé par id, depuis l'écran Sécurité —
// mirroring institution/auth/webauthn/revoke et remember/revoke, adapté à
// l'auth citoyen (accessToken Supabase, même pattern que
// api/citoyen/securite/pin/route.ts) plutôt qu'un cookie de session JWT.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, tokenId } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!tokenId || typeof tokenId !== "string") {
      return NextResponse.json({ error: "Identifiant manquant", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    // Trusted Device (30/08/2026) — status='revoked' plutôt qu'un DELETE :
    // conserve l'historique de l'appareil dans la liste "Vos appareils"
    // (brief : "voir les appareils" implique une liste persistante, pas
    // une simple disparition). L'appareil ne pourra plus jamais repasser
    // par remember/check (filtré explicitement) ni être reconnu comme
    // 'trusted' à nouveau sans un tout nouvel enrôlement.
    //
    // Limite assumée, documentée (pas cachée) : ceci n'invalide QUE le
    // statut de confiance/le raccourci de connexion pour les prochaines
    // fois — une session déjà ouverte sur cet appareil précis (Supabase
    // Auth) n'est pas tuée instantanément par cette action (aucune
    // architecture de session par appareil pour le citoyen aujourd'hui,
    // contrairement à admin_sessions côté admin). Un vrai cloisonnement
    // par appareil demanderait de migrer les sessions citoyen vers un
    // modèle par session individuelle — hors périmètre de cette mission.
    //
    // .update() ne renvoie pas d'erreur si 0 ligne correspond — on vérifie
    // explicitement via .select() qu'une ligne appartenant à CE citoyen a
    // bien été modifiée, sinon un citoyen pourrait révoquer le token d'un
    // autre en devinant un id.
    const { data: revoked, error: updateError } = await supabaseAdmin
      .from("citoyen_remember_tokens")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("citoyen_id", user.id)
      .select("id");

    if (updateError) {
      console.error("[CITOYEN REMEMBER REVOKE ERROR]", updateError.code, updateError.message);
      return NextResponse.json({ error: "Erreur lors de la révocation", code: "DELETE_ERROR" }, { status: 500 });
    }
    if (!revoked || revoked.length === 0) {
      return NextResponse.json({ error: "Appareil introuvable", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN REMEMBER REVOKE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
