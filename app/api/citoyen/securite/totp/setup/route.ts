import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Même garde que pin/set/route.ts — identité via accessToken vérifié,
// jamais un userId fourni tel quel. totp_enabled reste false tant que
// /totp/verify n'a pas confirmé un premier code.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("phone").eq("id", user.id).maybeSingle();

    const secret = await generateSecret();
    const uri = generateURI({ issuer: "Yelen224", label: citoyen?.phone || user.id, secret });
    const qrDataUrl = await QRCode.toDataURL(uri);

    const { error } = await supabaseAdmin
      .from("users")
      .update({ totp_secret: secret, totp_enabled: false })
      .eq("id", user.id);
    if (error) throw error;

    return NextResponse.json({ qrDataUrl, secret });

  } catch (error) {
    console.error("[CITOYEN TOTP SETUP ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
