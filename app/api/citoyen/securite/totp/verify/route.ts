import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verify } from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function genererCodeSecours(): string {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

// Confirme le premier code TOTP saisi (voir /totp/setup) — active
// réellement la 2FA et génère les codes de secours, affichés une seule
// fois (seuls leurs hash bcrypt sont conservés).
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

    const { data: citoyen } = await supabaseAdmin.from("users").select("totp_secret").eq("id", user.id).maybeSingle();
    if (!citoyen?.totp_secret) {
      return NextResponse.json({ error: "Aucune configuration 2FA en attente — recommencez depuis le début.", code: "NOT_FOUND" }, { status: 400 });
    }

    const result = await verify({ secret: citoyen.totp_secret, token: code.trim(), epochTolerance: 30 });
    if (!result.valid) {
      return NextResponse.json({ error: "Code invalide", code: "INVALID_CODE" }, { status: 401 });
    }

    const codesEnClair = Array.from({ length: 8 }, genererCodeSecours);
    const codesHashes = await Promise.all(codesEnClair.map(c => bcrypt.hash(c, 10)));

    const { error } = await supabaseAdmin
      .from("users")
      .update({ totp_enabled: true, totp_backup_codes: codesHashes })
      .eq("id", user.id);
    if (error) throw error;

    return NextResponse.json({ success: true, backupCodes: codesEnClair });

  } catch (error) {
    console.error("[CITOYEN TOTP VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
