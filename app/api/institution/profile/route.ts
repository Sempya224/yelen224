import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, type ActionKey } from "@/lib/institutionPermissions";

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

  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (membre.institutionId !== institution_id) return NextResponse.json({ error: "Accès interdit" }, { status: 403 });

  const { data, error } = await sb
    .from("institutions")
    .select("id,name,category,secteur,statut_juridique,ville,logo,badge_verifie,moyenne_avis,nb_avis,description,phone,whatsapp,email,website,created_at,statut,plan,adresse,quartier,disponibilites,banniere,annee_creation,capacite,capacite_par_creneau,langue,services,horaires,conditions_prestataire_acceptees_le,conditions_entreprise,informations_importantes,informations_legales,conditions_entreprise_le,informations_importantes_le,informations_legales_le,partenaire_statut")
    .eq("id", institution_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ institution: data });
}

// Champs éditables depuis l'onglet "Profil Entreprise". secteur et
// statut_juridique sont gérés séparément ci-dessous (validation stricte des
// valeurs + verrou sur statut_juridique, cf. commentaire sur PUT).
// site_web retiré (fusionné dans website, colonne supprimée en base).
const EDITABLE_FIELDS = ["name", "ville", "quartier", "adresse", "description", "logo", "website", "email", "phone", "whatsapp", "banniere", "annee_creation", "capacite", "capacite_par_creneau", "langue", "services", "horaires", "conditions_entreprise", "informations_importantes", "informations_legales"] as const;

// annee_creation et capacite sont des colonnes integer côté base : un champ
// texte vide envoie "" en JSON, que Postgres rejette pour ce type
// ("invalid input syntax for type integer"). On convertit en null avant
// l'UPDATE — même règle appliquée à tout futur champ numérique du formulaire.
// capacite_par_creneau est NOT NULL (défaut 1, migration 20260720000005) :
// jamais convertie en null, une chaîne vide y est simplement rejetée par
// Postgres si elle arrivait (ne devrait jamais arriver, l'UI ne vide pas ce
// champ — cf. DisponibilitesTab.tsx).
const NUMERIC_FIELDS = new Set(["annee_creation", "capacite"]);

// Horodatage automatique par section "Conditions & Informations" —
// jamais fourni par le client, posé ici à chaque enregistrement de la
// section correspondante (affiché aux côtés de "Écrit par {établissement}"
// sur la fiche publique).
const DATE_STAMP_FIELDS: Record<string, string> = {
  conditions_entreprise: "conditions_entreprise_le",
  informations_importantes: "informations_importantes_le",
  informations_legales: "informations_legales_le",
};

// Mêmes listes que app/api/institution/auth/register/route.ts — jamais faire
// confiance aux valeurs envoyées par le client.
const SECTEURS = ["sante", "administratif", "financier", "juridique", "beaute_bien_etre", "commerce", "artisanat", "services_divers"];
const STATUTS_JURIDIQUES = ["public", "prive_formel", "liberal", "individuel_informel"];

// Gating par groupe de champs — cette route n'a pas un seul propriétaire
// fonctionnel : "services" appartient à Services (comptable/superviseur y ont
// accès), "capacite_par_creneau" à Disponibilités (superviseur seulement en
// plus de l'admin), le reste au Profil Entreprise (admin uniquement). Un
// membre ne peut envoyer que les champs de son propre périmètre — 403
// explicite listant le premier champ refusé, jamais un drop silencieux.
const FIELD_ACTION: Record<string, ActionKey> = { services: "services.write", capacite_par_creneau: "disponibilites.write" };
function actionForField(field: string): ActionKey {
  return FIELD_ACTION[field] ?? "profil_entreprise.write";
}

export async function PUT(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const fieldsPresent = [...EDITABLE_FIELDS.filter(f => f in body), ...(["secteur", "statut_juridique"] as const).filter(f => f in body)];
  for (const field of fieldsPresent) {
    if (!can(membre.role, actionForField(field))) {
      return NextResponse.json({ error: `Champ "${field}" non autorisé pour votre rôle` }, { status: 403 });
    }
  }

  const authInstId = membre.institutionId;
  const payload: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    let value = body[field];
    if (NUMERIC_FIELDS.has(field) && typeof value === "string" && value.trim() === "") {
      value = null;
    }
    payload[field] = value;
    if (field in DATE_STAMP_FIELDS) payload[DATE_STAMP_FIELDS[field]] = new Date().toISOString();
  }

  if ("secteur" in body) {
    if (typeof body.secteur !== "string" || !SECTEURS.includes(body.secteur)) {
      return NextResponse.json({ error: "Secteur d'activité invalide" }, { status: 400 });
    }
    payload.secteur = body.secteur;
  }

  if ("statut_juridique" in body) {
    if (typeof body.statut_juridique !== "string" || !STATUTS_JURIDIQUES.includes(body.statut_juridique)) {
      return NextResponse.json({ error: "Statut juridique invalide" }, { status: 400 });
    }

    // Les documents requis sont dérivés uniquement de statut_juridique (voir
    // lib/documentsInstitution.ts) — une fois qu'au moins un document a été
    // soumis, changer ce statut désynchroniserait silencieusement ce qui a
    // déjà été examiné. On verrouille dans ce cas, sauf si la valeur envoyée
    // est identique à l'existante (pas un vrai changement).
    const { data: current } = await sb.from("institutions").select("statut_juridique").eq("id", authInstId).maybeSingle();
    if (current?.statut_juridique && current.statut_juridique !== body.statut_juridique) {
      const { count } = await sb
        .from("documents_institution")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", authInstId);
      if (count && count > 0) {
        return NextResponse.json(
          { error: "Statut juridique verrouillé : des documents ont déjà été soumis avec ce statut. Contactez le support Yelen224 pour le corriger." },
          { status: 409 }
        );
      }
    }
    payload.statut_juridique = body.statut_juridique;
  }

  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Aucun champ éditable fourni" }, { status: 400 });

  const { error } = await sb.from("institutions").update(payload).eq("id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
