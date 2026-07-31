import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SELECT_FIELDS = "id,titre,description_courte,description_longue,categorie,genre,partenaire_nom,partenaire_logo,cta_label,cta_url,statut,date_expiration,date_publication_prevue,motif_refus,soumis_le,valide_le,nb_clics,epingle,ordre,faits,avantages,limites,created_at,mis_a_jour_le";

// Liste des offres de sa propre institution.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await sb
    .from("offres")
    .select(SELECT_FIELDS)
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Création d'une offre — toujours en brouillon, jamais publiée directement
// (aucune modération possible tant qu'elle n'a pas été explicitement
// soumise, cf. PATCH [id] action="soumettre").
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "offres.write")) {
    return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  }
  if (membre.institutionId) {
    const { data: inst } = await sb.from("institutions").select("partenaire_statut").eq("id", membre.institutionId).maybeSingle();
    if (inst?.partenaire_statut !== "approuve") {
      return NextResponse.json({ error: "Partenariat non approuvé" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  if (!body.titre || !body.description_courte || !body.description_longue || !body.categorie) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const { data: inst } = await sb.from("institutions").select("name, logo").eq("id", membre.institutionId).maybeSingle();

  const { data, error } = await sb
    .from("offres")
    .insert({
      institution_id: membre.institutionId,
      titre: body.titre,
      description_courte: body.description_courte,
      description_longue: body.description_longue,
      categorie: body.categorie,
      genre: body.genre || "avantage_exclusif",
      partenaire_nom: inst?.name ?? "",
      partenaire_logo: inst?.logo ?? null,
      cta_label: body.cta_label || null,
      cta_url: body.cta_url || null,
      statut: "brouillon",
      faits: Array.isArray(body.faits) ? body.faits.slice(0, 4) : [],
      avantages: Array.isArray(body.avantages) ? body.avantages : [],
      limites: Array.isArray(body.limites) ? body.limites : [],
    })
    .select(SELECT_FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
