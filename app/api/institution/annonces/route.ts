import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { flipAnnoncesPlanifiees } from "@/lib/annoncesAutoPublish";

// Lot A (refonte Communication → Annonces, 20/07/2026) — remplace les writes
// directs de CommunicationTab.tsx (supabase.from("annonces").insert/update/
// delete depuis le navigateur, clé anon) : `annonces` n'a aucune policy
// RLS d'écriture (voir migration 20260720000009_annonces_engagement.sql),
// donc ces écritures client étaient déjà bloquées par RLS ou, si les grants
// documentés dans CLAUDE.md sont toujours d'actualité, ouvertes à n'importe
// quel visiteur. Toutes les écritures institution passent maintenant par
// cette route service_role, institution_id dérivé du JWT, jamais du client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CHAMPS_ECRITURE = [
  "titre", "contenu", "type", "statut", "format", "media_urls", "image_url",
  "date_expiration", "date_publication", "epingle", "regions_cibles",
] as const;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await flipAnnoncesPlanifiees(sb, membre.institutionId);

  const { data: annonces, error } = await sb
    .from("annonces")
    .select("*")
    .eq("institution_id", membre.institutionId)
    .order("epingle", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!annonces?.length) return NextResponse.json({ annonces: [] });

  const ids = annonces.map((a) => a.id);

  // Engagement réel — agrégé en mémoire (échelle d'une institution, pas
  // besoin de vue SQL dédiée). Portée = citoyens distincts identifiés,
  // les vues anonymes comptent dans nb_vues mais pas dans la portée.
  const [{ data: vues }, { data: likes }, { data: commentaires }] = await Promise.all([
    sb.from("annonce_vues").select("annonce_id,citoyen_id").in("annonce_id", ids),
    sb.from("annonce_likes").select("annonce_id").in("annonce_id", ids),
    sb.from("annonce_commentaires").select("annonce_id").in("annonce_id", ids),
  ]);

  // Lot E1 (engagement citoyen, 16/07/2026) — `nb_vues` (colonne brute sur
  // `annonces`) n'est écrite par personne côté citoyen (RLS ne l'autorise pas
  // en écriture client) ; "Vues" est désormais un COUNT(*) réel sur
  // annonce_vues, sur le même principe que "portee" juste en dessous.
  const porteeMap = new Map<string, Set<string>>();
  const vuesMap = new Map<string, number>();
  (vues ?? []).forEach((v) => {
    vuesMap.set(v.annonce_id, (vuesMap.get(v.annonce_id) ?? 0) + 1);
    if (!v.citoyen_id) return;
    if (!porteeMap.has(v.annonce_id)) porteeMap.set(v.annonce_id, new Set());
    porteeMap.get(v.annonce_id)!.add(v.citoyen_id);
  });
  const countBy = (rows: { annonce_id: string }[] | null) => {
    const m = new Map<string, number>();
    (rows ?? []).forEach((r) => m.set(r.annonce_id, (m.get(r.annonce_id) ?? 0) + 1));
    return m;
  };
  const likesMap = countBy(likes);
  const commentairesMap = countBy(commentaires);

  const enriched = annonces.map((a) => ({
    ...a,
    nb_vues: vuesMap.get(a.id) ?? 0,
    portee: porteeMap.get(a.id)?.size ?? 0,
    nb_likes: likesMap.get(a.id) ?? 0,
    nb_commentaires: commentairesMap.get(a.id) ?? 0,
  }));

  return NextResponse.json({ annonces: enriched });
}

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communication.publish_annonce")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.titre?.trim() || !body?.contenu?.trim()) {
    return NextResponse.json({ error: "Le titre et le contenu sont obligatoires." }, { status: 400 });
  }

  const payload: Record<string, unknown> = { institution_id: membre.institutionId, nb_vues: 0, nb_clics: 0, nb_partages: 0 };
  for (const champ of CHAMPS_ECRITURE) if (champ in body) payload[champ] = body[champ];

  const { data, error } = await sb.from("annonces").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ annonce: data });
}

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communication.publish_annonce")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id requis" }, { status: 400 });

  const payload: Record<string, unknown> = {};
  for (const champ of CHAMPS_ECRITURE) if (champ in body) payload[champ] = body[champ];
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });

  const { data, error } = await sb
    .from("annonces").update(payload)
    .eq("id", id).eq("institution_id", membre.institutionId)
    .select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Annonce introuvable pour cette institution" }, { status: 404 });
  return NextResponse.json({ annonce: data });
}

export async function DELETE(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "communication.publish_annonce")) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data, error } = await sb
    .from("annonces").delete()
    .eq("id", id).eq("institution_id", membre.institutionId)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Annonce introuvable pour cette institution" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
