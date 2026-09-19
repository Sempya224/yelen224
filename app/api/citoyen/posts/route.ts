import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST_CATEGORIES } from "@/lib/communauteCategories";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

// Publication citoyenne "Yelen Community" — l'identité est vérifiée ici
// via sb.auth.getUser(accessToken), jamais un id fourni tel quel par le
// client (même garde que app/api/citoyen/profil/photo/route.ts). Toute
// nouvelle publication part en statut "en_attente_validation" — seule la
// modération admin (app/api/admin/posts) peut la publier.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_IMAGES = 4;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { accessToken, contenu, images, categorie } = body as { accessToken?: string; contenu?: string; images?: string[]; categorie?: string };
  if (typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const contenuPropre = typeof contenu === "string" ? contenu.trim() : "";
  const imagesPropres = Array.isArray(images) ? images.filter(u => typeof u === "string" && u).slice(0, MAX_IMAGES) : [];
  if (!contenuPropre && imagesPropres.length === 0) {
    return NextResponse.json({ error: "Ajoutez un texte ou au moins une image" }, { status: 400 });
  }
  if (typeof categorie !== "string" || !POST_CATEGORIES.includes(categorie as (typeof POST_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Choisissez une catégorie pour votre publication" }, { status: 400 });
  }

  const user = await verifierCitoyenToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: "Session invalide ou expirée" }, { status: 401 });
  }

  // Seuls les citoyens avec Yelen ID vérifié peuvent publier — les
  // champs auteur affichés sur la carte sont dénormalisés ici, jamais
  // fournis par le client (aucune policy de lecture publique sur `users`
  // n'existe pour permettre un join à la volée côté citoyen).
  const { data: profil, error: profilErr } = await sb
    .from("users")
    .select("nom, prenom, photo_url, created_at, identite_verifiee")
    .eq("id", user.id)
    .maybeSingle();
  if (profilErr || !profil) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  if (!profil.identite_verifiee) {
    return NextResponse.json({ error: "Seuls les membres avec une identité Yelen vérifiée peuvent publier" }, { status: 403 });
  }

  const authorNom = [profil.prenom, profil.nom].filter(Boolean).join(" ").trim() || "Membre Yelen";

  const { data, error } = await sb
    .from("posts")
    .insert({
      auteur_id: user.id,
      categorie,
      author_nom: authorNom,
      author_photo_url: profil.photo_url ?? null,
      author_verifie: true,
      author_membre_depuis: profil.created_at,
      contenu: contenuPropre || null,
      images: imagesPropres,
      statut: "en_attente_validation",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
