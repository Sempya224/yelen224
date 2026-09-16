import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { validerUrlExterne } from "@/lib/urlValidation";

// Chantier Taxonomie des activités (Phase 4, 20/08/2026) — bloc "Identité
// internationale" (spec §3ter), pour les institutions origine_type=
// 'etrangere' uniquement. institution_identite_internationale n'a
// volontairement aucune policy RLS (migration 20260821000008, même
// convention que documents_institution) — accès exclusivement via cette
// route service_role, jamais un accès direct client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STATUT_PRESENCE_GUINEE_LIST = [
  "societe_guineenne_groupe_etranger", "filiale", "succursale", "bureau_representation",
  "prestataire_depuis_etranger", "partenariat_representation_locale", "autre_a_verifier",
] as const;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const authInstId = membre.institutionId;

  const [{ data: inst }, { data: identite }] = await Promise.all([
    sb.from("institutions").select("origine_type").eq("id", authInstId).maybeSingle(),
    sb.from("institution_identite_internationale").select("*").eq("institution_id", authInstId).maybeSingle(),
  ]);

  return NextResponse.json({ origine_type: inst?.origine_type ?? "guinee", identite: identite ?? null });
}

// Champs éditables — même gating que le reste du Profil Entreprise
// (profil_entreprise.write, voir api/institution/profile/route.ts).
export async function PUT(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "profil_entreprise.write", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  if ("origine_type" in body) {
    if (body.origine_type !== "guinee" && body.origine_type !== "etrangere") {
      return NextResponse.json({ error: "Origine invalide" }, { status: 400 });
    }
    const { error } = await sb.from("institutions").update({ origine_type: body.origine_type }).eq("id", authInstId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const identiteFields = [
    "pays_origine", "denomination_legale_officielle", "nom_commercial_international",
    "numero_immatriculation_origine", "type_identifiant_registre", "nom_registre_origine",
    "siege_social_origine", "site_web_officiel", "type_structure_internationale",
    "statut_presence_guinee", "zone_intervention",
  ];
  if (identiteFields.some((f) => f in body)) {
    if (typeof body.pays_origine !== "string" || !body.pays_origine.trim()) {
      return NextResponse.json({ error: "Pays d'origine requis" }, { status: 400 });
    }
    if (typeof body.denomination_legale_officielle !== "string" || !body.denomination_legale_officielle.trim()) {
      return NextResponse.json({ error: "Dénomination légale officielle requise" }, { status: 400 });
    }
    if (typeof body.statut_presence_guinee !== "string" || !(STATUT_PRESENCE_GUINEE_LIST as readonly string[]).includes(body.statut_presence_guinee)) {
      return NextResponse.json({ error: "Statut de présence en Guinée invalide" }, { status: 400 });
    }

    // P0 Stored XSS (17/08/2026, même discipline que website dans
    // api/institution/profile/route.ts) — seul champ URL de ce bloc.
    let siteWebOfficiel: string | null = null;
    if (typeof body.site_web_officiel === "string" && body.site_web_officiel.trim()) {
      const validation = validerUrlExterne(body.site_web_officiel);
      if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
      siteWebOfficiel = validation.url || null;
    }

    const str = (v: unknown): string | null => (typeof v === "string" && v.trim()) ? v.trim() : null;

    const payload = {
      institution_id: authInstId,
      pays_origine: body.pays_origine.trim(),
      denomination_legale_officielle: body.denomination_legale_officielle.trim(),
      nom_commercial_international: str(body.nom_commercial_international),
      numero_immatriculation_origine: str(body.numero_immatriculation_origine),
      type_identifiant_registre: str(body.type_identifiant_registre),
      nom_registre_origine: str(body.nom_registre_origine),
      siege_social_origine: str(body.siege_social_origine),
      site_web_officiel: siteWebOfficiel,
      type_structure_internationale: str(body.type_structure_internationale),
      statut_presence_guinee: body.statut_presence_guinee,
      zone_intervention: str(body.zone_intervention),
      modifie_le: new Date().toISOString(),
    };
    const { error } = await sb.from("institution_identite_internationale").upsert(payload, { onConflict: "institution_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
