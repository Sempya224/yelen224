import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revokerRememberTokenCitoyen } from "@/lib/auth/citoyenSession";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Miroir de app/api/institution/auth/logout/route.ts : la session Supabase
// elle-même est détruite côté client via supabase.auth.signOut() (lib/auth/
// logoutCitoyen.ts) — cette route ne gère que la moitié serveur du logout,
// le token "se souvenir de moi" du device courant, comme pour l'institution.
export async function POST(request: NextRequest) {
  try {
    await revokerRememberTokenCitoyen(supabaseAdmin, request);
    const response = NextResponse.json({ success: true });
    response.cookies.delete("yelen224_citoyen_remember");
    return response;
  } catch (error) {
    console.error("[CITOYEN LOGOUT ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
