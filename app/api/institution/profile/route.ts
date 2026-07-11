import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedInstitutionId } from "@/lib/institutionAuth";

// Contourne RLS via service role — les institutions n'ont pas de session
// Supabase Auth (JWT custom, cf. CLAUDE.md /auth), donc côté client elles
// arrivent toujours en rôle anon. La policy RLS publique sur `institutions`
// ne couvre que statut='validee', ce qui bloquait une institution consultant
// son propre dashboard tant qu'elle n'est pas validée (406 PGRST116).
// Vérification JWT de session — cf. lib/institutionAuth.ts.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const institution_id = searchParams.get("institution_id");
  if (!institution_id) return NextResponse.json({ error: "institution_id requis" }, { status: 400 });

  const authInstId = await getAuthenticatedInstitutionId(req);
  if (!authInstId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (authInstId !== institution_id) return NextResponse.json({ error: "Accès interdit" }, { status: 403 });

  const { data, error } = await sb
    .from("institutions")
    .select("id,name,category,secteur,statut_juridique,ville,logo,badge_verifie,moyenne_avis,nb_avis,description,phone,whatsapp,email,website,created_at,statut,plan,adresse,quartier,disponibilites,banniere,annee_creation,capacite,langue,services,horaires")
    .eq("id", institution_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ institution: data });
}

// Champs éditables depuis l'onglet "Profil Entreprise" — statut_juridique et
// secteur restent en lecture seule ici (impact sur la validation Yelen /
// documents requis, à traiter avec cet écran-là plus tard, pas ici).
// site_web retiré (fusionné dans website, colonne supprimée en base).
const EDITABLE_FIELDS = ["name", "ville", "quartier", "adresse", "description", "logo", "website", "email", "phone", "whatsapp", "banniere", "annee_creation", "capacite", "langue", "services", "horaires"] as const;

export async function PUT(req: NextRequest) {
  const authInstId = await getAuthenticatedInstitutionId(req);
  if (!authInstId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const payload: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) payload[field] = body[field];
  }
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Aucun champ éditable fourni" }, { status: 400 });

  const { error } = await sb.from("institutions").update(payload).eq("id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
