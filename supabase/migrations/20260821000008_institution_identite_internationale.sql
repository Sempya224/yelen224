-- Chantier Taxonomie des activités — Phase 1, migration 8/8. Identité
-- internationale des organisations étrangères (spec §3ter) — schéma
-- additif pur, branché à l'implémentation (Phase 4 du plan) sur le
-- système Yelen Trust déjà existant (documents_institution/
-- verification_decisions, axe='identite') plutôt que sur un nouveau
-- mécanisme de vérification parallèle. Peut être livrée dès la Phase 1
-- (schéma pur) même si son branchement UI/formulaire est Phase 4.
CREATE TABLE institution_identite_internationale (
  institution_id                  uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  pays_origine                    text NOT NULL,
  denomination_legale_officielle  text NOT NULL,
  nom_commercial_international    text,
  numero_immatriculation_origine  text,
  type_identifiant_registre       text,
  nom_registre_origine            text,
  siege_social_origine            text,
  site_web_officiel               text,
  type_structure_internationale   text,
  statut_presence_guinee          text NOT NULL CHECK (statut_presence_guinee IN (
    'societe_guineenne_groupe_etranger', 'filiale', 'succursale',
    'bureau_representation', 'prestataire_depuis_etranger',
    'partenariat_representation_locale', 'autre_a_verifier'
  )),
  zone_intervention                text,
  cree_le                          timestamptz NOT NULL DEFAULT now(),
  modifie_le                       timestamptz
);

ALTER TABLE institution_identite_internationale ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que documents_institution/verification_decisions (spec
-- §3ter : "même convention que documents_institution").
REVOKE ALL ON institution_identite_internationale FROM PUBLIC, anon, authenticated;
