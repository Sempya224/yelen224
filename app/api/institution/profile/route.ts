import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre, estReauthRecente, INSTITUTION_REAUTH_WINDOW_MS } from "@/lib/institutionAuth";
import { extraireIpClient } from "@/lib/edgeSecurity";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import {
  estCleRpcProfil, versCoordonnee, champsSensiblesModifies, estErreurReauthRpc, extraireDemandesCreees,
  extraireDemandesAvecId, valeursAvantApres, appliquerPropositions, extraireListeChamps, champsEnAttente,
  type CleRpcProfil, type ProfilSensibleActuel,
} from "@/lib/institutionProfilSensible";
import { can, type ActionKey } from "@/lib/institutionPermissions";
import { validerUrlExterne } from "@/lib/urlValidation";
import { nettoyerTextePublic } from "@/lib/texteBrut";
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
    .select("id,slug,name,category,secteur,activite_categorie_id,statut_juridique,ville,logo,badge_verifie,moyenne_avis,nb_avis,description,phone,whatsapp,email,website,created_at,statut,plan,adresse,quartier,latitude,longitude,disponibilites,disponibilites_modifie_le,disponibilites_modifie_par,banniere,annee_creation,capacite,capacite_par_creneau,langue,services,horaires,conditions_prestataire_acceptees_le,conditions_entreprise,informations_importantes,informations_legales,conditions_entreprise_le,informations_importantes_le,informations_legales_le,conditions_entreprise_creee_le,informations_importantes_creee_le,informations_legales_creee_le,partenaire_statut,equipements_etablissement")
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

  // Publication différée (docs/product/YELEN_REVERIFICATION_POLICY.md) :
  // institutions.* = valeurs PUBLIÉES, vues par les citoyens. Cette route sert
  // l'espace de l'établissement lui-même (membre authentifié, même institution) :
  // il y voit SA proposition en attente (nom, adresse, localisation, activité)
  // à la place de la valeur publiée, et `champs_en_attente` liste ce qui n'est
  // pas encore publié. Requête séparée (jamais d'embed PostgREST sur cette route
  // centrale) ; en cas d'échec on sert les valeurs publiées plutôt que de casser
  // le tableau de bord entier.
  let overlay: Record<string, unknown> = {};
  let champs_en_attente: string[] = [];
  if (data) {
    const { data: propositions, error: propositionsError } = await sb
      .from("institution_change_requests")
      .select("champ,nouvelle_valeur")
      .eq("institution_id", institution_id)
      .eq("statut", "a_examiner");
    if (propositionsError) {
      console.error("[INSTITUTION PROFILE GET] propositions en attente:", propositionsError.code);
    } else if (propositions && propositions.length > 0) {
      const publie: ProfilSensibleActuel = {
        name: data.name ?? null, ville: data.ville ?? null, adresse: data.adresse ?? null,
        latitude: typeof data.latitude === "number" ? data.latitude : null,
        longitude: typeof data.longitude === "number" ? data.longitude : null,
        activite_categorie_id: data.activite_categorie_id ?? null,
        activite_principale_id,
      };
      const effectif = appliquerPropositions(publie, propositions);
      overlay = {
        name: effectif.name ?? data.name, ville: effectif.ville, adresse: effectif.adresse,
        latitude: effectif.latitude, longitude: effectif.longitude,
        activite_categorie_id: effectif.activite_categorie_id,
      };
      if (effectif.activite_principale_id !== activite_principale_id) {
        activite_principale_id = effectif.activite_principale_id;
        activite_principale_code = null;
        if (activite_principale_id) {
          const { data: actRow } = await sb.from("activites").select("code").eq("id", activite_principale_id).maybeSingle();
          activite_principale_code = actRow?.code ?? null;
        }
      }
      champs_en_attente = champsEnAttente(propositions);
    }
  }

  return NextResponse.json({ institution: data ? { ...data, ...overlay, institution_membres, activite_principale_id, activite_principale_code, activites_secondaires_ids, champs_en_attente } : data });
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

// Plafond de longueur des 3 textes publics (en caractères).
const TEXTE_PUBLIC_MAX = 5000;

// Date de première écriture (migration 20260831000001) — posée une seule
// fois, jamais réécrite ensuite (contrairement à DATE_STAMP_FIELDS
// ci-dessus, mis à jour à chaque sauvegarde). Permet à la fiche publique
// d'afficher "Écrit le X" distinctement de "Mis à jour le Y".
const CREATION_STAMP_FIELDS: Record<string, string> = {
  conditions_entreprise: "conditions_entreprise_creee_le",
  informations_importantes: "informations_importantes_creee_le",
  informations_legales: "informations_legales_creee_le",
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
    if (!can(membre.role, actionForField(field), membre.accesRestreints)) {
      return NextResponse.json({ error: `Champ "${field}" non autorisé pour votre rôle` }, { status: 403 });
    }
  }

  const authInstId = membre.institutionId;
  const payload: Record<string, unknown> = {};
  // Niveau B (docs/product/YELEN_REVERIFICATION_POLICY.md) : nom, ville,
  // adresse, coordonnées, catégorie + activité principale (et secondaires,
  // niveau A mais écrites avec la principale). Jamais écrits par cette route
  // directement : transmis à la fonction SQL appliquer_modifications_sensibles
  // qui applique la modification ET crée les demandes d'examen dans une seule
  // transaction, après revérification de la réauthentification en base.
  // `payload` ne contient donc plus que des champs de niveau A.
  const champsRpc: Partial<Record<CleRpcProfil, unknown>> = {};
  // Un seul horodatage pour toute la requête — réutilisé pour _le ET,
  // sur une première écriture, pour _creee_le : les deux doivent être
  // rigoureusement identiques ce jour-là, sinon la fiche publique
  // afficherait à tort "mis à jour" quelques millisecondes après la
  // création (deux `new Date()` distincts ne tombent jamais pile égaux).
  const nowIso = new Date().toISOString();
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    let value = body[field];
    if (estCleRpcProfil(field)) {
      champsRpc[field] = value;
      continue;
    }
    if (NUMERIC_FIELDS.has(field) && typeof value === "string" && value.trim() === "") {
      value = null;
    }
    payload[field] = value;
    if (field in DATE_STAMP_FIELDS) payload[DATE_STAMP_FIELDS[field]] = nowIso;
  }

  // Les 3 textes publics "Conditions & Informations" : chaîne obligatoire
  // (une chaîne vide = section vidée) et plafond de longueur — jusque-là
  // n'importe quel type et n'importe quelle taille étaient écrits tels quels.
  const champsTexte = Object.keys(DATE_STAMP_FIELDS).filter(f => f in payload);
  for (const f of champsTexte) {
    const v = payload[f];
    if (typeof v !== "string") {
      return NextResponse.json({ error: "Le texte doit être une chaîne de caractères." }, { status: 400 });
    }
    // Normalisé avant le contrôle de longueur : le plafond s'applique au
    // texte réellement stocké. Un octet nul dans le JSON ferait sinon
    // échouer l'UPDATE Postgres en 500.
    const propre = nettoyerTextePublic(v);
    if (propre.length > TEXTE_PUBLIC_MAX) {
      return NextResponse.json({ error: `Le texte ne doit pas dépasser ${TEXTE_PUBLIC_MAX} caractères (${propre.length} saisis).` }, { status: 400 });
    }
    payload[f] = propre;
  }
  // Valeurs avant écriture, pour ne journaliser que les vrais changements.
  let valeursAvantTexte: Record<string, unknown> | null = null;
  if (champsTexte.length > 0) {
    const { data: avantTexte } = await sb.from("institutions").select(champsTexte.join(",")).eq("id", authInstId).maybeSingle();
    valeursAvantTexte = (avantTexte ?? null) as Record<string, unknown> | null;
  }

  // Date de première écriture — posée seulement si elle n'existe pas déjà
  // (jamais réécrite ensuite), voir CREATION_STAMP_FIELDS ci-dessus. Une
  // seule lecture groupée des colonnes concernées, pas une par champ.
  const champsCreationConcernes = Object.keys(CREATION_STAMP_FIELDS).filter(f => f in payload);
  if (champsCreationConcernes.length > 0) {
    const colonnesCreation = champsCreationConcernes.map(f => CREATION_STAMP_FIELDS[f]);
    const { data: currentCreation } = await sb.from("institutions").select(colonnesCreation.join(",")).eq("id", authInstId).maybeSingle();
    const currentCreationRow = (currentCreation ?? {}) as Record<string, unknown>;
    for (const field of champsCreationConcernes) {
      const colonne = CREATION_STAMP_FIELDS[field];
      if (!currentCreationRow[colonne]) payload[colonne] = nowIso;
    }
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

  // Validation des champs de niveau B avant tout appel — la fonction SQL
  // refait ces contrôles (défense en profondeur), mais un message clair 400 est
  // préférable à une exception SQL.
  if ("name" in champsRpc && (typeof champsRpc.name !== "string" || !champsRpc.name.trim())) {
    return NextResponse.json({ error: "Le nom de l'institution est requis." }, { status: 400 });
  }
  if ("ville" in champsRpc && (typeof champsRpc.ville !== "string" || !champsRpc.ville.trim())) {
    return NextResponse.json({ error: "La ville est requise." }, { status: 400 });
  }
  if ("adresse" in champsRpc && champsRpc.adresse !== null && typeof champsRpc.adresse !== "string") {
    return NextResponse.json({ error: "Adresse invalide" }, { status: 400 });
  }
  // Bornes géographiques réelles — filet de sécurité serveur même si la
  // valeur vient normalement du sélecteur carte contrôlé (LocationPicker),
  // jamais d'une saisie libre. Une chaîne vide devient null (comme avant).
  for (const [cle, borne, libelle] of [["latitude", 90, "Latitude invalide"], ["longitude", 180, "Longitude invalide"]] as const) {
    if (!(cle in champsRpc)) continue;
    const valeur = versCoordonnee(champsRpc[cle]);
    if (valeur === undefined || (valeur !== null && (valeur < -borne || valeur > borne))) {
      return NextResponse.json({ error: libelle }, { status: 400 });
    }
    champsRpc[cle] = valeur;
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
    champsRpc.activite_categorie_id = body.activite_categorie_id;

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
      // Écrites par la fonction SQL dans la même transaction que
      // institutions.activite_categorie_id : institution_activites ne peut
      // jamais diverger de la catégorie si une étape échoue.
      champsRpc.activite_principale_id = body.activite_principale_id;
      champsRpc.activites_secondaires_ids = secondaires;
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

  const aDesChampsNiveauB = Object.keys(champsRpc).length > 0;
  if (Object.keys(payload).length === 0 && !aDesChampsNiveauB) {
    return NextResponse.json({ error: "Aucun champ éditable fourni" }, { status: 400 });
  }

  let demandesCreees: { numero: string; champ: string }[] = [];
  // Champs appliqués directement (établissement pas encore public : rien à protéger).
  let champsAppliques: string[] = [];

  if (aDesChampsNiveauB) {
    // Valeurs actuelles — nécessaires pour (1) répondre 403 REAUTH_REQUIRED
    // AVANT toute écriture quand un changement sensible est réellement détecté,
    // (2) décider si le slug doit être régénéré. Le diff faisant foi est celui
    // de la fonction SQL (recalculé sous verrou) ; celui-ci n'est qu'un
    // filtre précoce. Requêtes séparées, jamais d'embed PostgREST (route centrale).
    const { data: actuelRow, error: actuelError } = await sb
      .from("institutions")
      .select("name,ville,adresse,latitude,longitude,activite_categorie_id")
      .eq("id", authInstId)
      .maybeSingle();
    const { data: activitesRows, error: activitesError } = await sb
      .from("institution_activites")
      .select("activite_id,principale")
      .eq("institution_id", authInstId);
    if (actuelError || activitesError || !actuelRow) {
      console.error("[INSTITUTION PROFILE PUT] lecture valeurs actuelles:", actuelError?.code ?? activitesError?.code ?? "institution introuvable");
      return NextResponse.json({ error: "Erreur lors de l'enregistrement." }, { status: 500 });
    }
    const publie: ProfilSensibleActuel = {
      name: actuelRow.name ?? null,
      ville: actuelRow.ville ?? null,
      adresse: actuelRow.adresse ?? null,
      latitude: typeof actuelRow.latitude === "number" ? actuelRow.latitude : null,
      longitude: typeof actuelRow.longitude === "number" ? actuelRow.longitude : null,
      activite_categorie_id: actuelRow.activite_categorie_id ?? null,
      activite_principale_id: activitesRows?.find(a => a.principale)?.activite_id ?? null,
    };

    // Publication différée : institutions.* = valeurs PUBLIÉES. Ce que
    // l'établissement voit (et modifie) est la valeur EFFECTIVE = publiée,
    // surchargée par ses propositions en attente. Le diff se fait donc contre
    // l'effectif : renvoyer telle quelle une proposition en attente n'est pas un
    // nouveau changement sensible (pas de réauthentification redemandée).
    const { data: propositionsRows, error: propositionsError } = await sb
      .from("institution_change_requests")
      .select("champ,nouvelle_valeur")
      .eq("institution_id", authInstId)
      .eq("statut", "a_examiner");
    if (propositionsError) {
      console.error("[INSTITUTION PROFILE PUT] lecture propositions en attente:", propositionsError.code);
      return NextResponse.json({ error: "Erreur lors de l'enregistrement." }, { status: 500 });
    }
    const actuel = appliquerPropositions(publie, propositionsRows ?? []);

    if (champsSensiblesModifies(actuel, champsRpc).length > 0 && !estReauthRecente(membre)) {
      return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: "REAUTH_REQUIRED" }, { status: 403 });
    }

    // Renommage — le slug (racine des URLs /{slug}/{id}/{screen}, chantier
    // "URLs dynamiques institution" 28/08/2026) doit rester cohérent avec le
    // nom affiché. L'id reste seul canonique : régénérer le slug ici ne casse
    // aucune ancienne URL, le layout du dashboard redirige automatiquement
    // tout visiteur arrivant avec un slug périmé vers le slug à jour. La
    // fonction SQL ne l'applique que si le nom change réellement (hors simple
    // changement de casse/espaces).
    const slug = typeof champsRpc.name === "string" && actuel.name !== champsRpc.name
      ? await generateInstitutionSlug(sb, champsRpc.name, authInstId)
      : null;

    // institution, membre et session viennent EXCLUSIVEMENT de la session
    // authentifiée — jamais du corps de la requête. Aucun PIN / mot de passe
    // ne transite ici (la réauthentification a eu lieu via auth/reauth).
    const { data: rpcData, error: rpcError } = await sb.rpc("appliquer_modifications_sensibles", {
      p_institution_id: authInstId,
      p_membre_id: membre.membreId,
      p_session_id: membre.sid,
      p_champs: champsRpc,
      p_slug: slug,
      p_ip: extraireIpClient(req),
      p_user_agent: req.headers.get("user-agent"),
      p_fenetre_reauth_secondes: Math.floor(INSTITUTION_REAUTH_WINDOW_MS / 1000),
    });
    if (rpcError) {
      if (estErreurReauthRpc(rpcError)) {
        return NextResponse.json({ error: "Pour votre sécurité, confirmez à nouveau votre identité pour continuer.", code: "REAUTH_REQUIRED" }, { status: 403 });
      }
      console.error("[INSTITUTION PROFILE PUT] appliquer_modifications_sensibles:", rpcError.code);
      return NextResponse.json({ error: "Erreur lors de l'enregistrement." }, { status: 500 });
    }
    demandesCreees = extraireDemandesCreees(rpcData);
    champsAppliques = extraireListeChamps(rpcData, "appliquees");

    // Journal d'activité interne : une ligne par champ sensible réellement
    // modifié (cible = la demande d'examen). Non bloquant — enregistrerAction
    // n'échoue jamais l'action métier, la modification est déjà enregistrée.
    const demandesJournal = extraireDemandesAvecId(rpcData);
    if (demandesJournal.length > 0 || champsAppliques.length > 0) {
      const membreNom = await getMembreNomPourJournal(membre.membreId);
      for (const champ of champsAppliques) {
        const valeurs = valeursAvantApres(champ, publie, champsRpc);
        await enregistrerAction({
          institutionId: authInstId, membreId: membre.membreId, membreNom,
          action: "changement_profil_sensible", cibleTable: "institutions", cibleId: authInstId,
          details: { champ, publie_directement: true },
          ancienneValeur: valeurs?.avant ?? null, nouvelleValeur: valeurs?.apres ?? null,
          req,
        });
      }
      for (const d of demandesJournal) {
        const valeurs = valeursAvantApres(d.champ, publie, champsRpc);
        await enregistrerAction({
          institutionId: authInstId, membreId: membre.membreId, membreNom,
          action: "changement_profil_sensible", cibleTable: "institution_change_requests", cibleId: d.id,
          details: { champ: d.champ, numero: d.numero },
          ancienneValeur: valeurs?.avant ?? null, nouvelleValeur: valeurs?.apres ?? null,
          req,
        });
      }
    }
  }

  // Champs de niveau A — enregistrement immédiat, inchangé. Exécuté APRÈS la
  // fonction SQL : si cette écriture échoue, le niveau B reste enregistré et un
  // rejeu ne crée aucune demande supplémentaire (le diff est alors vide).
  if (Object.keys(payload).length > 0) {
    const { error } = await sb.from("institutions").update(payload).eq("id", authInstId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Journal d'activité des 3 textes publics : auteur (membre), IP et
  // user-agent via enregistrerAction. Le contenu n'est pas recopié dans le
  // journal (jusqu'à 5000 caractères par ligne), seulement présence et
  // longueur avant/après. Non bloquant, une ligne par texte réellement modifié.
  const textesModifies = champsTexte.filter(f => (valeursAvantTexte?.[f] ?? "") !== payload[f]);
  if (textesModifies.length > 0) {
    const membreNom = await getMembreNomPourJournal(membre.membreId);
    const resume = (v: unknown) => {
      const t = typeof v === "string" ? v : "";
      return { renseigne: t.trim().length > 0, longueur: t.length };
    };
    for (const champ of textesModifies) {
      await enregistrerAction({
        institutionId: authInstId, membreId: membre.membreId, membreNom,
        action: "modification_texte_public", cibleTable: "institutions", cibleId: authInstId,
        details: { champ },
        ancienneValeur: resume(valeursAvantTexte?.[champ]), nouvelleValeur: resume(payload[champ]),
        req,
      });
    }
  }

  return NextResponse.json({ ok: true, demandes: demandesCreees, appliques: champsAppliques });
}
