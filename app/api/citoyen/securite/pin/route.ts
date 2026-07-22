import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Statut du PIN pour l'écran Sécurité — ne renvoie jamais pin_hash, juste
// s'il est configuré (mirroring api/institution/security-status).
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("pin_hash").eq("id", user.id).single();
    return NextResponse.json({ success: true, pin_configured: !!citoyen?.pin_hash });
  } catch (error) {
    console.error("[CITOYEN PIN STATUS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

// Supprime le PIN — redemande le PIN actuel avant d'agir (défense en
// profondeur, même logique que api/institution/auth/pin DELETE) : la
// session Supabase prouve déjà l'identité, mais un téléphone déverrouillé
// volé ne devrait pas suffire à désactiver un verrou de sécurité sans
// re-saisie du code.
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide", code: "BAD_REQUEST" }, { status: 400 });

    const { accessToken, pin } = body;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }
    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ error: "Code PIN actuel requis", code: "MISSING_PIN" }, { status: 400 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("pin_hash").eq("id", user.id).single();
    if (!citoyen?.pin_hash) {
      return NextResponse.json({ error: "Aucun code configuré", code: "NOT_CONFIGURED" }, { status: 404 });
    }

    const valid = await bcrypt.compare(pin, citoyen.pin_hash);
    if (!valid) {
      return NextResponse.json({ error: "Code incorrect", code: "INVALID_PIN" }, { status: 401 });
    }

    const { error: updateError } = await supabaseAdmin.from("users").update({ pin_hash: null }).eq("id", user.id);
    if (updateError) {
      console.error("[CITOYEN PIN DELETE ERROR]", updateError.message);
      return NextResponse.json({ error: "Erreur lors de la suppression", code: "UPDATE_ERROR" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CITOYEN PIN DELETE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
