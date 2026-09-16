import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre, estReauthRecente } from "@/lib/institutionAuth";
import { genererCodesSecours } from "@/lib/totpBackupCodes";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Régénération des codes de secours 2FA (16/09/2026) — jusqu'ici la seule
// façon d'obtenir un nouveau jeu était de désactiver puis réactiver la 2FA
// en entier. "Modifier un moyen de récupération" est explicitement une
// action sensible du moteur de réauthentification (estReauthRecente) :
// les anciens codes sont immédiatement invalidés (remplacés), jamais
// cumulés.
export async function POST(request: NextRequest) {
  const membre = await getAuthenticatedMembre(request);
  if (!membre) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
  if (!estReauthRecente(membre)) {
    return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: "REAUTH_REQUIRED" }, { status: 403 });
  }

  const { data: row } = await supabaseAdmin.from("institution_membres").select("totp_enabled").eq("id", membre.membreId).maybeSingle();
  if (!row?.totp_enabled) {
    return NextResponse.json({ error: "La 2FA n'est pas activée — aucun code de récupération à régénérer.", code: "NOT_FOUND" }, { status: 400 });
  }

  const { clair, hashes } = await genererCodesSecours();
  const { error } = await supabaseAdmin.from("institution_membres").update({ totp_backup_codes: hashes }).eq("id", membre.membreId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, backupCodes: clair });
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
