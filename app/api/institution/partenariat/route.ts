import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Statut + dernière demande de partenariat de sa propre institution —
// alimente l'écran Partenaires (PartenariatTab).
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("partenaire_statut")
    .eq("id", membre.institutionId)
    .maybeSingle();
  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });

  const { data: demande } = await sb
    .from("institution_partenariat_demandes")
    .select("id,statut,motif_refus,date_decision,created_at")
    .eq("institution_id", membre.institutionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ partenaire_statut: inst?.partenaire_statut ?? "aucun", derniere_demande: demande ?? null });
}

// Soumission d'une demande de partenariat. Gatée par profil_entreprise.write
// (admin uniquement) — décision engageant l'institution dans son ensemble,
// même périmètre que les autres actions stratégiques du Profil Entreprise.
export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "profil_entreprise.write")) {
    return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const required = ["description_organisation", "type_offres", "impact_communaute", "categorie", "contact_nom", "contact_email"] as const;
  for (const f of required) {
    if (typeof body[f] !== "string" || !body[f].trim()) {
      return NextResponse.json({ error: `Champ "${f}" requis` }, { status: 400 });
    }
  }
  if (body.conditions_acceptees !== true) {
    return NextResponse.json({ error: "Les conditions du partenariat doivent être acceptées" }, { status: 400 });
  }

  const { data: inst, error: instErr } = await sb
    .from("institutions")
    .select("website, partenaire_statut")
    .eq("id", membre.institutionId)
    .maybeSingle();
  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });
  if (!inst?.website?.trim()) {
    return NextResponse.json({ error: "Un site web officiel est requis dans votre Profil Entreprise avant de rejoindre le partenariat Yelen" }, { status: 400 });
  }
  if (inst.partenaire_statut === "en_attente" || inst.partenaire_statut === "approuve") {
    return NextResponse.json({ error: "Une demande est déjà en attente ou déjà approuvée" }, { status: 409 });
  }

  const { data: demande, error } = await sb
    .from("institution_partenariat_demandes")
    .insert({
      institution_id: membre.institutionId,
      description_organisation: body.description_organisation,
      type_offres: body.type_offres,
      impact_communaute: body.impact_communaute,
      categorie: body.categorie,
      site_web: inst.website,
      contact_nom: body.contact_nom,
      contact_email: body.contact_email,
      contact_telephone: body.contact_telephone || null,
      infos_complementaires: body.infos_complementaires || null,
      conditions_acceptees: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("institutions").update({ partenaire_statut: "en_attente" }).eq("id", membre.institutionId);

  return NextResponse.json({ demande });
}
