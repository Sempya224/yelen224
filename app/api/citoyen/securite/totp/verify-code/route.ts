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

// Vérification "pure" d'un code TOTP déjà actif — contrairement à
// /totp/verify (confirme l'activation initiale) et /totp/disable
// (désactive la 2FA), cette route ne modifie rien : elle sert à confirmer
// l'identité avant une action sensible (suppression de compte). Consomme
// un code de secours s'il est utilisé, comme le fait déjà
// /auth/totp/login-verify pour la connexion.
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
      return NextResponse.json({ error: "Double authentification non configurée", code: "NOT_CONFIGURED" }, { status: 404 });
    }

    let valide = (await verify({ secret: citoyen.totp_secret, token: code.trim(), epochTolerance: 30 })).valid;
    if (!valide && Array.isArray(citoyen.totp_backup_codes)) {
      const codes: string[] = citoyen.totp_backup_codes;
      for (let i = 0; i < codes.length; i++) {
        if (await bcrypt.compare(code.trim(), codes[i])) {
          valide = true;
          const restants = [...codes];
          restants.splice(i, 1);
          await supabaseAdmin.from("users").update({ totp_backup_codes: restants }).eq("id", user.id);
          break;
        }
      }
    }

    if (!valide) {
      return NextResponse.json({ error: "Code incorrect", code: "INVALID_CODE" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN TOTP VERIFY-CODE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
