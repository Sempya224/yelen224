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
    .select("partenaire_statut,secteur")
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

  const partenaire_statut = inst?.partenaire_statut ?? "aucun";
  const stats = await getStatsPartenariat(
    partenaire_statut === "approuve" ? membre.institutionId : null,
    inst?.secteur ?? null
  );

  return NextResponse.json({ partenaire_statut, derniere_demande: demande ?? null, stats });
}

// Preuve sociale réelle pour la vitrine du programme (PartenariatTab) — zéro
// chiffre inventé : agrégats calculés à la volée, jamais persistés/mis en cache.
// `institutionsSimilaires` n'est calculé que pour une institution déjà
// partenaire (ownId non nul) — alimente MonPartenariatTab.
async function getStatsPartenariat(ownId: string | null, ownSecteur: string | null) {
  const { data: partenaires } = await sb
    .from("institutions")
    .select("id,name,logo,secteur")
    .eq("partenaire_statut", "approuve");

  const partenaires_actifs = partenaires?.length ?? 0;
  const secteurs_actifs = new Set((partenaires ?? []).map(p => p.secteur).filter(Boolean)).size;
  const logos = (partenaires ?? [])
    .filter(p => p.logo)
    .slice(0, 6)
    .map(p => ({ name: p.name, logo: p.logo as string }));

  const { data: demandesTranchees } = await sb
    .from("institution_partenariat_demandes")
    .select("created_at,date_decision")
    .not("date_decision", "is", null);

  let delai_moyen_jours: number | null = null;
  const delais = (demandesTranchees ?? [])
    .map(d => (new Date(d.date_decision as string).getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24))
    .filter(v => Number.isFinite(v) && v >= 0);
  if (delais.length >= 3) {
    delai_moyen_jours = Math.round((delais.reduce((a, b) => a + b, 0) / delais.length) * 10) / 10;
  }

  let institutions_similaires: { id: string; name: string; logo: string | null; secteur: string | null; offres_actives: number }[] = [];
  if (ownId && ownSecteur) {
    const candidats = (partenaires ?? []).filter(p => p.id !== ownId && p.secteur === ownSecteur).slice(0, 4);
    if (candidats.length > 0) {
      const { data: offresCandidats } = await sb
        .from("offres")
        .select("institution_id")
        .eq("statut", "publiee")
        .in("institution_id", candidats.map(c => c.id));
      const compte: Record<string, number> = {};
      for (const o of offresCandidats ?? []) compte[o.institution_id] = (compte[o.institution_id] ?? 0) + 1;
      institutions_similaires = candidats.map(c => ({ id: c.id, name: c.name, logo: c.logo, secteur: c.secteur, offres_actives: compte[c.id] ?? 0 }));
    }
  }

  return { partenaires_actifs, secteurs_actifs, delai_moyen_jours, logos, institutions_similaires };
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
