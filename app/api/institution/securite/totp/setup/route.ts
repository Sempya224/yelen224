import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 2FA par membre (chantier sécurité institution 25/07/2026, mirroring
// citoyen) — identité via le cookie de session JWT (getAuthenticatedMembre),
// jamais un membreId fourni tel quel. totp_enabled reste false tant que
// /totp/verify n'a pas confirmé un premier code.
export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request);
    if (!membre) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: row } = await supabaseAdmin.from("institution_membres").select("prenom, nom, identifiant").eq("id", membre.membreId).maybeSingle();

    const secret = await generateSecret();
    const label = row?.identifiant || (row ? `${row.prenom} ${row.nom}` : "Institution");
    const uri = generateURI({ issuer: "Yelen224", label, secret });
    const qrDataUrl = await QRCode.toDataURL(uri);

    const { error } = await supabaseAdmin
      .from("institution_membres")
      .update({ totp_secret: secret, totp_enabled: false })
      .eq("id", membre.membreId);
    if (error) throw error;

    return NextResponse.json({ qrDataUrl, secret });

  } catch (error) {
    console.error("[INSTITUTION TOTP SETUP ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
