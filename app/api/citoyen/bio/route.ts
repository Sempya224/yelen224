import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const BIO_MAX = 160;

// Bio "Yelen Community" (22/08/2026, retour Bryan : "juste pour Yelen
// Community"), users.bio. Lecture par id — n'importe quel auteur consulté
// depuis le popup profil, aucune policy de lecture publique sur `users`
// (même garde que app/api/citoyen/posts/route.ts). Écriture réservée au
// propriétaire, id dérivé du token, jamais du corps de requête.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });

  const { data, error } = await sb.from("users").select("bio").eq("id", userId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bio: data?.bio ?? null });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { accessToken, bio } = body as { accessToken?: string; bio?: string };
  if (typeof accessToken !== "string" || !accessToken) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const bioPropre = typeof bio === "string" ? bio.trim() : "";
  if (bioPropre.length > BIO_MAX) return NextResponse.json({ error: `Bio trop longue (max ${BIO_MAX} caractères)` }, { status: 400 });

  const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !user) return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });

  const { error } = await sb.from("users").update({ bio: bioPropre || null }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, bio: bioPropre || null });
}
