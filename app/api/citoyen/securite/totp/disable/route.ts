import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verify } from "otplib";
import bcrypt from "bcryptjs";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Pas de mot de passe côté citoyen pour reconfirmer l'identité (contraste
// avec l'admin) — la preuve de possession du 2e facteur lui-même (un
// code TOTP ou de secours valide) sert de confirmation pour désactiver.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    const code = body?.code;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Code requis", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("totp_secret, totp_backup_codes").eq("id", user.id).maybeSingle();
    if (!citoyen?.totp_secret) {
      return NextResponse.json({ error: "La 2FA n'est pas activée.", code: "NOT_FOUND" }, { status: 400 });
    }

    let codeValide = (await verify({ secret: citoyen.totp_secret, token: code.trim(), epochTolerance: 30 })).valid;
    if (!codeValide && Array.isArray(citoyen.totp_backup_codes)) {
      for (const hash of citoyen.totp_backup_codes as string[]) {
        if (await bcrypt.compare(code.trim(), hash)) { codeValide = true; break; }
      }
    }
    if (!codeValide) {
      return NextResponse.json({ error: "Code invalide", code: "INVALID_CODE" }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ totp_secret: null, totp_enabled: false, totp_backup_codes: null })
      .eq("id", user.id);
    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[CITOYEN TOTP DISABLE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
