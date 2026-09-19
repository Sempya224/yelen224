import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verify } from "otplib";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { genererCodesSecours } from "@/lib/totpBackupCodes";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Confirme le premier code TOTP saisi (voir /totp/setup) — active
// réellement la 2FA pour ce membre et génère les codes de secours,
// affichés une seule fois (seuls leurs hash bcrypt sont conservés).
export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request);
    if (!membre) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const code = body?.code;
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Entrez le code à 6 chiffres affiché par votre application d'authentification.", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const { data: row } = await supabaseAdmin.from("institution_membres").select("totp_secret").eq("id", membre.membreId).maybeSingle();
    if (!row?.totp_secret) {
      return NextResponse.json({ error: "Aucune configuration 2FA en attente — recommencez depuis le début.", code: "NOT_FOUND" }, { status: 400 });
    }

    const result = await verify({ secret: row.totp_secret, token: code.trim(), epochTolerance: 30 });
    if (!result.valid) {
      return NextResponse.json({ error: "Ce code est incorrect ou a expiré. Vérifiez l'heure de votre téléphone et réessayez avec le nouveau code affiché.", code: "INVALID_CODE" }, { status: 401 });
    }

    const { clair, hashes } = await genererCodesSecours();

    const { error } = await supabaseAdmin
      .from("institution_membres")
      .update({ totp_enabled: true, totp_backup_codes: hashes })
      .eq("id", membre.membreId);
    if (error) throw error;

    return NextResponse.json({ success: true, backupCodes: clair });

  } catch (error) {
    console.error("[INSTITUTION TOTP VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
