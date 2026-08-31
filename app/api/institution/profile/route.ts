import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, type ActionKey } from "@/lib/institutionPermissions";
import { validerUrlExterne } from "@/lib/urlValidation";
import { SECTEUR_ID_LIST, STATUT_JURIDIQUE_ID_LIST } from "@/lib/institutionTaxonomy";
import { CODES_EQUIPEMENTS_ETABLISSEMENT } from "@/lib/hotelEquipements";
import { generateInstitutionSlug } from "@/lib/institutionSlug";

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
    .select("id,slug,name,category,secteur,activite_categorie_id,statut_juridique,ville,logo,badge_verifie,moyenne_avis,nb_avis,description,phone,whatsapp,email,website,created_at,statut,plan,adresse,quartier,latitude,longitude,disponibilites,disponibilites_modifie_le,disponibilites_modifie_par,banniere,annee_creation,capacite,capacite_par_creneau,langue,services,horaires,conditions_prestataire_acceptees_le,conditions_entreprise,informations_importantes,informations_legales,conditions_entreprise_le,informations_importantes_le,informations_legales_le,partenaire_statut,equipements_etablissement")
    .eq("id", institution_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nom du membre ayant modifié les disponibilités — requête séparée
  // plutôt qu'un embed PostgREST (institution_membres(prenom,nom) a cassé
  // le chargement complet du dashboard le 05/08/2026, cause exacte non
  // confirmée mais l'embed est le seul changement introduit à ce moment —
  // reverti par prudence, cette route est trop centrale pour prendre un
  // risque non nécessaire).
  let institution_membres: { prenom: string; nom: string } | null = null;
  if (data?.disponibilites_modifie_par) {
    const { data: membreData } = await sb
      .from("institution_membres")
      .select("prenom,nom")
      .eq("id", data.disponibilites_modifie_par)
      .maybeSingle();
    institution_membres = membreData ?? null;
  }

  // Chantier Taxonomie des activités (Phase 3, 20/08/2026) — institution_activites
  // n'est lisible en anon que pour une institution déjà `validee` (RLS,
  // migration 20260821000005) ; ce dashboard doit rester utilisable avant
  // validation, d'où une lecture service_role ici, même raison que le
  // client Supabase de ce fichier (commentaire d'en-tête).
  let activite_principale_id: string | null = null;
  let activite_principale_code: string | null = null;
  let activites_secondaires_ids: string[] = [];
  if (data) {
    const { data: actRows } = await sb
      .from("institution_activites")
      .select("activite_id,principale")
      .eq("institution_id", institution_id);
    activite_principale_id = actRows?.find(a => a.principale)?.activite_id ?? null;
    activites_secondaires_ids = (actRows ?? []).filter(a => !a.principale).map(a => a.activite_id);

    // Code de l'activité principale (ex. "hotellerie") — nécessaire pour le
    // gating d'écrans spécifiques côté dashboard (ex. onglet "Configuration
    // Hôtel", app/institution/[id]/dashboard/page.tsx), migré depuis
    // l'ancien inst.secteur === "hotel" (chantier Taxonomie des activités,
    // Phase 4, 20/08/2026 — bug réel trouvé par Bryan : institutions.secteur
    // n'est plus jamais écrite par le wizard depuis la Phase 2, ce gating
    // restait donc bloqué en faux pour toute institution créée depuis).
    if (activite_principale_id) {
      const { data: actRow } = await sb.from("activites").select("code").eq("id", activite_principale_id).maybeSingle();
      activite_principale_code = actRow?.code ?? null;
    }
  }

  return NextResponse.json({ institution: data ? { ...data, institution_membres, activite_principale_id, activite_principale_code, activites_secondaires_ids } : data });
}

// Champs éditables depuis l'onglet "Profil Entreprise". secteur et
// statut_juridique sont gérés séparément ci-dessous (validation stricte des
// valeurs + verrou sur statut_juridique, cf. commentaire sur PUT).
// site_web retiré (fusionné dans website, colonne supprimée en base).
const EDITABLE_FIELDS = ["name", "ville", "quartier", "adresse", "description", "logo", "website", "email", "phone", "whatsapp", "banniere", "annee_creation", "capacite", "capacite_par_creneau", "langue", "services", "horaires", "conditions_entreprise", "informations_importantes", "informations_legales", "latitude", "longitude", "equipements_etablissement"] as const;

// annee_creation, capacite, latitude, longitude sont des colonnes numériques
// côté base : un champ vide envoie "" en JSON, que Postgres rejette pour ces
// types ("invalid input syntax for type integer/numeric"). On convertit en
// null avant l'UPDATE — même règle appliquée à tout futur champ numérique du
// formulaire. capacite_par_creneau est NOT NULL (défaut 1, migration
// 20260720000005) : jamais convertie en null, une chaîne vide y est
// simplement rejetée par Postgres si elle arrivait (ne devrait jamais
// arriver, l'UI ne vide pas ce champ — cf. DisponibilitesTab.tsx).
const NUMERIC_FIELDS = new Set(["annee_creation", "capacite", "latitude", "longitude"]);

// Horodatage automatique par section "Conditions & Informations" —
// jamais fourni par le client, posé ici à chaque enregistrement de la
// section correspondante (affiché aux côtés de "Écrit par {établissement}"
// sur la fiche publique).
const DATE_STAMP_FIELDS: Record<string, string> = {
  conditions_entreprise: "conditions_entreprise_le",
  informations_importantes: "informations_importantes_le",
  informations_legales: "informations_legales_le",
};

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

  const fieldsPresent = [...EDITABLE_FIELDS.filter(f => f in body), ...(["secteur", "statut_juridique", "activite_categorie_id"] as const).filter(f => f in body)];
  for (const field of fieldsPresent) {
    if (!can(membre.role, actionForField(field))) {
      return NextResponse.json({ error: `Champ "${field}" non autorisé pour votre rôle` }, { status: 403 });
    }
  }

  const authInstId = membre.institutionId;
  const payload: Record<string, unknown> = {};
  // Renseigné seulement si activite_categorie_id + activite_principale_id
  // sont validés plus bas — la table institution_activites est écrite
  // après le succès de l'UPDATE institutions, jamais avant (cohérence).
  let activitesAEcrire: { principale: string; secondaires: string[] } | null = null;
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    let value = body[field];
    if (NUMERIC_FIELDS.has(field) && typeof value === "string" && value.trim() === "") {
      value = null;
    }
    payload[field] = value;
    if (field in DATE_STAMP_FIELDS) payload[DATE_STAMP_FIELDS[field]] = new Date().toISOString();
  }

  // P0 Stored XSS (17/08/2026, docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT_PHASE_0_5.md
  // §1) — website est le seul champ EDITABLE_FIELDS de type URL, validé en
  // allow-list stricte http(s) avant toute écriture. Jamais de schéma
  // deviné ici (contrairement à urlExterneSure côté affichage) : une
  // nouvelle saisie doit être propre dès le départ.
  if (typeof payload.website === "string") {
    const validation = validerUrlExterne(payload.website);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    payload.website = validation.url;
  }

  // Équipements structurés Hôtel (21/08/2026) — vocabulaire contrôlé
  // (lib/hotelEquipements.tsx), jamais un texte libre. Filtre silencieux
  // des codes inconnus plutôt qu'un rejet total de la requête (tolère un
  // client légèrement désynchronisé sans jamais stocker de valeur
  // arbitraire) ; dédoublonné. Champ nullable pour tous les secteurs,
  // seul ConfigurationHotelTab.tsx l'envoie en pratique.
  if (Array.isArray(payload.equipements_etablissement)) {
    const valides = payload.equipements_etablissement.filter(
      (code: unknown): code is string => typeof code === "string" && CODES_EQUIPEMENTS_ETABLISSEMENT.includes(code)
    );
    payload.equipements_etablissement = [...new Set(valides)];
  } else if (payload.equipements_etablissement !== undefined && payload.equipements_etablissement !== null) {
    return NextResponse.json({ error: "equipements_etablissement doit être un tableau" }, { status: 400 });
  }

  // Bornes géographiques réelles — filet de sécurité serveur même si la
  // valeur vient normalement du sélecteur carte contrôlé (LocationPicker),
  // jamais d'une saisie libre.
  if (typeof payload.latitude === "number" && (payload.latitude < -90 || payload.latitude > 90)) {
    return NextResponse.json({ error: "Latitude invalide" }, { status: 400 });
  }
  if (typeof payload.longitude === "number" && (payload.longitude < -180 || payload.longitude > 180)) {
    return NextResponse.json({ error: "Longitude invalide" }, { status: 400 });
  }

  // Legacy — encore utilisé par l'ancien sélecteur secteur de
  // ProfilEntrepriseTab.tsx tant que la Phase 3 (chantier Taxonomie des
  // activités) ne l'a pas basculé sur activite_categorie_id/
  // activite_principale_id ci-dessous. Ne pas retirer avant cette bascule
  // — le retirer maintenant ferait échouer silencieusement le bouton
  // "Enregistrer" existant (200 OK, aucun champ modifié).
  if ("secteur" in body) {
    if (typeof body.secteur !== "string" || !SECTEUR_ID_LIST.includes(body.secteur)) {
      return NextResponse.json({ error: "Secteur d'activité invalide" }, { status: 400 });
    }
    payload.secteur = body.secteur;
  }

  // Chantier Taxonomie des activités (Phase 2, 20/08/2026) — nouvelle
  // catégorie/activité principale/secondaires, contrôlées contre les
  // vraies lignes activite_categories/activites (même discipline que
  // register/route.ts). institutions.secteur reste inchangée par ce bloc.
  if ("activite_categorie_id" in body) {
    if (typeof body.activite_categorie_id !== "string") {
      return NextResponse.json({ error: "Catégorie d'activité invalide" }, { status: 400 });
    }
    const { data: categorieRow } = await sb
      .from("activite_categories")
      .select("id")
      .eq("id", body.activite_categorie_id)
      .eq("actif", true)
      .maybeSingle();
    if (!categorieRow) {
      return NextResponse.json({ error: "Catégorie d'activité invalide" }, { status: 400 });
    }
    payload.activite_categorie_id = body.activite_categorie_id;

    if ("activite_principale_id" in body || "activites_secondaires_ids" in body) {
      if (typeof body.activite_principale_id !== "string") {
        return NextResponse.json({ error: "Activité principale invalide" }, { status: 400 });
      }
      const secondaires: string[] = Array.isArray(body.activites_secondaires_ids)
        ? body.activites_secondaires_ids.filter((v: unknown): v is string => typeof v === "string")
        : [];
      if (secondaires.length > 3) {
        return NextResponse.json({ error: "Au maximum 3 activités secondaires" }, { status: 400 });
      }
      if (secondaires.includes(body.activite_principale_id)) {
        return NextResponse.json({ error: "Une activité secondaire ne peut pas être identique à l'activité principale" }, { status: 400 });
      }
      const activiteIdsAVerifier = [body.activite_principale_id, ...secondaires];
      const { data: activiteRows } = await sb
        .from("activites")
        .select("id")
        .in("id", activiteIdsAVerifier)
        .eq("categorie_id", body.activite_categorie_id)
        .eq("statut", "active");
      if (!activiteRows || activiteRows.length !== new Set(activiteIdsAVerifier).size) {
        return NextResponse.json({ error: "Activité invalide ou n'appartenant pas à la catégorie choisie" }, { status: 400 });
      }
      // Écrite seulement après le succès de l'UPDATE institutions
      // principal, pas ici — voir plus bas, pour ne jamais laisser
      // institution_activites divergent de institutions.activite_categorie_id
      // si l'UPDATE échoue après ce point.
      activitesAEcrire = { principale: body.activite_principale_id, secondaires };
    }
  }

  if ("statut_juridique" in body) {
    if (typeof body.statut_juridique !== "string" || !STATUT_JURIDIQUE_ID_LIST.includes(body.statut_juridique)) {
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

  // Renommage — le slug (racine des URLs /{slug}/{id}/{screen}, chantier
  // "URLs dynamiques institution" 28/08/2026) doit rester cohérent avec le
  // nom affiché. L'id reste seul canonique : régénérer le slug ici ne casse
  // aucune ancienne URL, le layout du dashboard redirige automatiquement
  // tout visiteur arrivant avec un slug périmé vers le slug à jour.
  if (typeof payload.name === "string" && payload.name.trim()) {
    const { data: current } = await sb.from("institutions").select("name").eq("id", authInstId).maybeSingle();
    if (current && current.name !== payload.name) {
      payload.slug = await generateInstitutionSlug(sb, payload.name, authInstId);
    }
  }

  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "Aucun champ éditable fourni" }, { status: 400 });

  const { error } = await sb.from("institutions").update(payload).eq("id", authInstId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // institution_activites n'est pas une colonne institutions — écrite ici,
  // seulement après le succès de l'UPDATE ci-dessus, remplace intégralement
  // les lignes existantes (principale + secondaires).
  if (activitesAEcrire) {
    const { error: deleteError } = await sb.from("institution_activites").delete().eq("institution_id", authInstId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    const { error: insertActivitesError } = await sb.from("institution_activites").insert([
      { institution_id: authInstId, activite_id: activitesAEcrire.principale, principale: true, ordre: 0 },
      ...activitesAEcrire.secondaires.map((id, i) => ({ institution_id: authInstId, activite_id: id, principale: false, ordre: i + 1 })),
    ]);
    if (insertActivitesError) return NextResponse.json({ error: insertActivitesError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
