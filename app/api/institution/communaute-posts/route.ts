import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { POST_CATEGORIES } from "@/lib/communauteCategories";

// Publications institution dans Yelen Community (22/08/2026, retour Bryan)
// — mirroring exact de app/api/citoyen/posts (service_role, dénormalisation
// à l'écriture) et de app/api/institution/annonces (auth JWT institution,
// institution_id jamais fourni par le client). Même modération que les
// posts citoyens : statut='en_attente_validation', validée dans
// app/admin/posts. Les champs auteur (author_nom/author_photo_url/
// author_verifie) réutilisent les colonnes dénormalisées existantes de
// `posts`, suffisantes pour une institution (nom/logo/badge_verifie).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_IMAGES = 4;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await sb
    .from("posts")
    .select("id, categorie, contenu, images, statut, motif_refus, nb_partages, created_at")
    .eq("institution_auteur_id", membre.institutionId)
    .eq("auteur_type", "institution")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compte likes/commentaires par post (23/08/2026, Community Pro Vue
  // d'ensemble/Performance) — post_likes/post_comments sont agnostiques de
  // l'auteur (mêmes tables que app/api/citoyen/posts/[id]/interactions),
  // agrégées ici en JS plutôt qu'un GROUP BY SQL, volume institution
  // toujours trivial.
  const ids = (data ?? []).map(p => p.id);
  const debutMois = new Date();
  debutMois.setUTCDate(1);
  debutMois.setUTCHours(0, 0, 0, 0);

  let nbLikesPar = new Map<string, number>();
  let nbCommentairesPar = new Map<string, number>();
  // Impressions/vues par post (23/08/2026, Chaîne Yelen Performance) —
  // post_impressions = post présent dans le fil chargé, post_vues = post
  // réellement ouvert en détail (voir chargerFilCommunaute/ouvrirPostDetail
  // dans app/page.tsx). Même agrégation JS que likes/commentaires
  // ci-dessus, lignes déjà fetchées réutilisées pour la portée et
  // l'audience active plus bas.
  let nbImpressionsPar = new Map<string, number>();
  let nbVuesPar = new Map<string, number>();
  let impressionsRows: { post_id: string; citoyen_id: string | null }[] = [];
  let vuesRows: { post_id: string; citoyen_id: string | null; created_at: string }[] = [];
  if (ids.length > 0) {
    const [{ data: likesRows }, { data: commentsRows }, { data: impRows }, { data: vRows }] = await Promise.all([
      sb.from("post_likes").select("post_id").in("post_id", ids),
      sb.from("post_comments").select("post_id").in("post_id", ids),
      sb.from("post_impressions").select("post_id, citoyen_id").in("post_id", ids),
      sb.from("post_vues").select("post_id, citoyen_id, created_at").in("post_id", ids),
    ]);
    nbLikesPar = (likesRows ?? []).reduce((m, r) => m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1), new Map<string, number>());
    nbCommentairesPar = (commentsRows ?? []).reduce((m, r) => m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1), new Map<string, number>());
    impressionsRows = impRows ?? [];
    vuesRows = vRows ?? [];
    nbImpressionsPar = impressionsRows.reduce((m, r) => m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1), new Map<string, number>());
    nbVuesPar = vuesRows.reduce((m, r) => m.set(r.post_id, (m.get(r.post_id) ?? 0) + 1), new Map<string, number>());
  }
  // Portée par post (23/08/2026, onglet Performance) — citoyens distincts
  // et non-anonymes parmi les impressions DE CE POST, calculée sur
  // impressionsRows déjà fetché ci-dessus (aucune requête supplémentaire).
  // Jamais une somme des portées par post pour l'agrégat institution
  // (citoyensDistincts plus bas reste calculé sur l'ensemble, pas une
  // somme, pour ne jamais compter deux fois un même citoyen).
  const citoyensParPost = new Map<string, Set<string>>();
  for (const r of impressionsRows) {
    if (r.citoyen_id === null) continue;
    const set = citoyensParPost.get(r.post_id) ?? new Set<string>();
    set.add(r.citoyen_id);
    citoyensParPost.set(r.post_id, set);
  }

  const posts = (data ?? []).map(p => ({
    ...p,
    nb_likes: nbLikesPar.get(p.id) ?? 0,
    nb_commentaires: nbCommentairesPar.get(p.id) ?? 0,
    nb_impressions: nbImpressionsPar.get(p.id) ?? 0,
    nb_vues: nbVuesPar.get(p.id) ?? 0,
    nb_portee: citoyensParPost.get(p.id)?.size ?? 0,
  }));

  // Portée = citoyens distincts et non-anonymes parmi les impressions —
  // définition la plus large de "reach", calculée sur les lignes déjà
  // fetchées ci-dessus, aucune requête supplémentaire.
  const citoyensDistincts = new Set(impressionsRows.map(r => r.citoyen_id).filter((id): id is string => id !== null));
  const performance = {
    impressions_total: impressionsRows.length,
    vues_total: vuesRows.length,
    portee: citoyensDistincts.size,
  };

  // audience_active_ce_mois (23/08/2026, retour Bryan : le stub "Audience
  // active" est devenu obsolète dès que post_vues a existé — on a
  // maintenant exactement la donnée qu'il fallait) — citoyens distincts
  // ayant réellement ouvert au moins une publication depuis le 1er du
  // mois, calculé sur vuesRows déjà fetché ci-dessus, aucune requête
  // supplémentaire. Même ancre calendaire que nouveaux_ce_mois/
  // abonnes_perdus_ce_mois, pour que les 3 tuiles Audience parlent de la
  // même période.
  const debutMoisMs = debutMois.getTime();
  const audienceActiveCeMois = new Set(
    vuesRows
      .filter(r => r.citoyen_id !== null && new Date(r.created_at).getTime() >= debutMoisMs)
      .map(r => r.citoyen_id as string)
  ).size;

  // Chaîne Yelen — audience réelle (23/08/2026, Community Pro Vue
  // d'ensemble/Audience). nb_abonnes maintenu par trigger DB
  // (recalculer_nb_abonnes_institution), jamais recalculé ici.
  // nouveaux_ce_mois = compte réel des abonnements créés depuis le 1er du
  // mois en cours, pas une valeur dérivée/estimée.
  // abonnes_perdus_ce_mois (23/08/2026) — citoyen_abonnements reste un
  // hard-delete, seul citoyen_abonnement_events garde une trace des
  // désabonnements (journal append-only, voir sa migration).
  const [{ data: instAudience }, { count: nouveauxCeMois }, { count: abonnesPerdusCeMois }] = await Promise.all([
    sb.from("institutions").select("nb_abonnes").eq("id", membre.institutionId).maybeSingle(),
    sb.from("citoyen_abonnements").select("id", { count: "exact", head: true }).eq("institution_id", membre.institutionId).gte("created_at", debutMois.toISOString()),
    sb.from("citoyen_abonnement_events").select("id", { count: "exact", head: true }).eq("institution_id", membre.institutionId).eq("type", "desabonne").gte("created_at", debutMois.toISOString()),
  ]);
  const audience = {
    nb_abonnes: instAudience?.nb_abonnes ?? 0,
    nouveaux_ce_mois: nouveauxCeMois ?? 0,
    abonnes_perdus_ce_mois: abonnesPerdusCeMois ?? 0,
    audience_active_ce_mois: audienceActiveCeMois,
  };

  return NextResponse.json({ posts, audience, performance });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communaute_pro.publish")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { contenu, images, categorie } = body as { contenu?: string; images?: string[]; categorie?: string };
  const contenuPropre = typeof contenu === "string" ? contenu.trim() : "";
  const imagesPropres = Array.isArray(images) ? images.filter(u => typeof u === "string" && u).slice(0, MAX_IMAGES) : [];
  if (!contenuPropre && imagesPropres.length === 0) {
    return NextResponse.json({ error: "Ajoutez un texte ou au moins une image" }, { status: 400 });
  }
  if (typeof categorie !== "string" || !POST_CATEGORIES.includes(categorie as (typeof POST_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Choisissez une catégorie pour votre publication" }, { status: 400 });
  }

  const { data: institution, error: instErr } = await sb
    .from("institutions")
    .select("name, logo, badge_verifie, created_at")
    .eq("id", membre.institutionId)
    .maybeSingle();
  if (instErr || !institution) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });

  const { data, error } = await sb
    .from("posts")
    .insert({
      auteur_type: "institution",
      institution_auteur_id: membre.institutionId,
      categorie,
      author_nom: institution.name,
      author_photo_url: institution.logo,
      author_verifie: institution.badge_verifie ?? false,
      author_membre_depuis: institution.created_at,
      contenu: contenuPropre || null,
      images: imagesPropres,
      statut: "en_attente_validation",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
