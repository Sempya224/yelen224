import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Sheet "Interactions" d'une publication "Yelen Community" (22/08/2026,
// retour Bryan, référence LinkedIn : "Tous / J'aime / Commentaires").
// post_likes/post_comments ont une policy de lecture publique mais ne
// dénormalisent pas le statut vérifié — aucune policy de lecture publique
// n'existe sur `users` pour joindre ce champ à la volée côté client (même
// contrainte que app/api/citoyen/posts/route.ts) : service_role ici
// uniquement pour résoudre les profils, lecture seule, aucune
// authentification requise (même niveau que .../[id]/partager). Les
// partages restent hors de ce sheet : compteur anonyme sans citoyen_id.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Profil = { id: string; nom: string | null; prenom: string | null; photo_url: string | null; identite_verifiee: boolean | null };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: likes, error: likesErr }, { data: comments, error: commentsErr }] = await Promise.all([
    sb.from("post_likes").select("citoyen_id, created_at").eq("post_id", id).order("created_at", { ascending: false }),
    sb.from("post_comments").select("citoyen_id, created_at").eq("post_id", id).order("created_at", { ascending: false }),
  ]);
  if (likesErr) return NextResponse.json({ error: likesErr.message }, { status: 500 });
  if (commentsErr) return NextResponse.json({ error: commentsErr.message }, { status: 500 });

  // Un même citoyen peut commenter plusieurs fois — on ne garde que
  // l'interaction la plus récente par citoyen pour l'onglet Commentaires.
  const dernierCommentairePar = new Map<string, string>();
  for (const c of comments ?? []) {
    if (!dernierCommentairePar.has(c.citoyen_id)) dernierCommentairePar.set(c.citoyen_id, c.created_at);
  }

  const idsUniques = Array.from(new Set([...(likes ?? []).map(l => l.citoyen_id), ...dernierCommentairePar.keys()]));
  if (idsUniques.length === 0) return NextResponse.json({ tous: [], likes: [], commentateurs: [] });

  const { data: profils, error: profilsErr } = await sb
    .from("users")
    .select("id, nom, prenom, photo_url, identite_verifiee")
    .in("id", idsUniques);
  if (profilsErr) return NextResponse.json({ error: profilsErr.message }, { status: 500 });
  const parId = new Map((profils ?? []).map((p: Profil) => [p.id, p]));

  function resoudre(citoyenId: string) {
    const p = parId.get(citoyenId);
    return {
      citoyen_id: citoyenId,
      nom: p ? ([p.prenom, p.nom].filter(Boolean).join(" ").trim() || "Membre Yelen") : "Membre Yelen",
      photo_url: p?.photo_url ?? null,
      verifie: p?.identite_verifiee ?? false,
    };
  }

  const listeLikes = (likes ?? []).map(l => ({ ...resoudre(l.citoyen_id), types: ["like"] as const, created_at: l.created_at }));
  const listeCommentateurs = Array.from(dernierCommentairePar.entries()).map(([citoyenId, createdAt]) => ({ ...resoudre(citoyenId), types: ["commentaire"] as const, created_at: createdAt }));

  const tousPar = new Map<string, { citoyen_id: string; nom: string; photo_url: string | null; verifie: boolean; types: ("like" | "commentaire")[]; created_at: string }>();
  for (const l of listeLikes) tousPar.set(l.citoyen_id, { ...l, types: ["like"] });
  for (const c of listeCommentateurs) {
    const existant = tousPar.get(c.citoyen_id);
    if (existant) {
      existant.types.push("commentaire");
      if (c.created_at > existant.created_at) existant.created_at = c.created_at;
    } else {
      tousPar.set(c.citoyen_id, { ...c, types: ["commentaire"] });
    }
  }
  const tous = Array.from(tousPar.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ tous, likes: listeLikes, commentateurs: listeCommentateurs });
}
