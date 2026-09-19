import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const PIN_REGEX = /^\d{4,8}$/;

// Mirroring exact de la logique institution (api/institution/auth/pin/set) —
// codes trop faibles rejetés même s'ils respectent le format.
function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111, 222222...
  const ascending = pin.split("").every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) + 1);
  const descending = pin.split("").every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) - 1);
  return ascending || descending; // 1234, 4321, 123456...
}

// Contrairement à l'institution (PIN = mécanisme de login), le citoyen a
// déjà une session Supabase Auth réelle au moment d'appeler cette route —
// l'identité vient donc de l'accessToken vérifié via sb.auth.getUser(),
// jamais d'un userId fourni tel quel par le client (même garde que
// app/api/citoyen/profil/photo/route.ts et app/profil/actions.ts).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, pin } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!pin || typeof pin !== "string" || !PIN_REGEX.test(pin)) {
      return NextResponse.json({ error: "Le code doit contenir entre 4 et 8 chiffres.", code: "INVALID_FORMAT" }, { status: 400 });
    }
    if (isWeakPin(pin)) {
      return NextResponse.json({ error: "Ce code est trop simple (chiffres répétés ou suite logique). Choisissez-en un autre.", code: "WEAK_PIN" }, { status: 400 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const pinHash = await bcrypt.hash(pin, 12);

    const { data: avant } = await supabaseAdmin.from("users").select("pin_hash, prenom").eq("id", user.id).maybeSingle();
    const dejaConfigure = !!avant?.pin_hash;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("users")
      .update({ pin_hash: pinHash })
      .eq("id", user.id)
      .select("id");

    if (updateError) {
      console.error("[CITOYEN PIN SET ERROR]", updateError.message);
      return NextResponse.json({ error: "Erreur lors de l'enregistrement du code", code: "UPDATE_ERROR" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Compte introuvable", code: "NOT_FOUND" }, { status: 404 });
    }

    await envoyerNotification({
      destinataireId: user.id,
      destinataireType: "citoyen",
      rdvId: null,
      type: "securite_pin_modifie",
      titre: salutation(avant?.prenom || "cher client"),
      message: dejaConfigure
        ? "Votre code PIN a été modifié. Si vous n'êtes pas à l'origine de ce changement, sécurisez votre compte immédiatement."
        : "Votre code PIN a été configuré. Il vous permet un déverrouillage rapide de l'application.",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN PIN SET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
