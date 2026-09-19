import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Annuaire "Professionnels" — recherche Community, Lot 3 (09/09/2026).
// Jamais l'ensemble des utilisateurs Yelen (RLS `users` interdit de toute
// façon une lecture croisée citoyen→citoyen) : uniquement les citoyens
// ayant déjà publié dans Community — leur nom/photo/badge sont déjà
// publics via le fil (colonnes author_* dénormalisées sur `posts`).
// `profession`/`ville` viennent de `users` (service_role, champs publics
// non sensibles déjà visibles nulle part côté client aujourd'hui — d'où
// l'authentification requise malgré tout, même convention que le reste
// des routes citoyen).
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    const user = await verifierCitoyenToken(accessToken);
    if (!user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });

    const { data: posts, error: postsError } = await supabaseAdmin
      .from("posts")
      .select("auteur_id, author_nom, author_photo_url, author_verifie, author_membre_depuis")
      .eq("auteur_type", "citoyen")
      .eq("statut", "publiee")
      .order("created_at", { ascending: false })
      .limit(500);
    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 });

    type Base = { id: string; nom: string; photo: string | null; verifie: boolean; membreDepuis: string };
    const parAuteur = new Map<string, Base>();
    for (const p of posts ?? []) {
      if (!p.auteur_id || parAuteur.has(p.auteur_id)) continue;
      parAuteur.set(p.auteur_id, { id: p.auteur_id, nom: p.author_nom, photo: p.author_photo_url, verifie: p.author_verifie, membreDepuis: p.author_membre_depuis });
    }
    const ids = [...parAuteur.keys()];
    if (ids.length === 0) return NextResponse.json({ success: true, professionnels: [] });

    const { data: users, error: usersError } = await supabaseAdmin.from("users").select("id, profession, ville").in("id", ids);
    if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });
    const usersById = new Map((users ?? []).map(u => [u.id, u]));

    const professionnels = ids.map(id => {
      const base = parAuteur.get(id)!;
      const u = usersById.get(id);
      return { ...base, profession: u?.profession ?? null, ville: u?.ville ?? null };
    });

    return NextResponse.json({ success: true, professionnels });
  } catch (error) {
    console.error("[COMMUNAUTE PROFESSIONNELS GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
