import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Mirroring institution/auth/remember/check — ce token identifie seulement
// le compte, il ne délivre AUCUNE session. Il sert uniquement à savoir quel
// écran de déverrouillage rapide (PIN/biométrie) proposer au lieu de
// redemander le numéro + OTP ; la preuve d'identité réelle reste
// webauthn/auth-verify ou pin/verify (déjà côté serveur).
export async function POST(request: NextRequest) {
  try {
    const rawToken = request.cookies.get("yelen224_citoyen_remember")?.value;
    if (!rawToken) {
      return NextResponse.json({ error: "Aucun appareil mémorisé", code: "NO_REMEMBER_TOKEN" }, { status: 401 });
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const { data: remembered } = await supabaseAdmin
      .from("citoyen_remember_tokens")
      .select("citoyen_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!remembered || new Date(remembered.expires_at).getTime() < Date.now()) {
      const response = NextResponse.json({ error: "Appareil non reconnu ou expiré", code: "INVALID_OR_EXPIRED" }, { status: 401 });
      response.cookies.delete("yelen224_citoyen_remember");
      return response;
    }

    const { data: citoyen } = await supabaseAdmin
      .from("users")
      .select("id, prenom, nom, photo_url")
      .eq("id", remembered.citoyen_id)
      .single();

    if (!citoyen) {
      const response = NextResponse.json({ error: "Compte introuvable", code: "NOT_FOUND" }, { status: 404 });
      response.cookies.delete("yelen224_citoyen_remember");
      return response;
    }

    return NextResponse.json({ success: true, user: citoyen });
  } catch (error) {
    console.error("[CITOYEN REMEMBER CHECK ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
