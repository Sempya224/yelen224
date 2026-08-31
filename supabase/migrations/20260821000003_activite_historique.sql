-- Chantier Taxonomie des activités — Phase 1, migration 3/8. Journal
-- append-only de toute modification apportée à `activites` (label,
-- description, statut, regulatory_status) — 5ᵉ occurrence du même
-- patron d'immuabilité déjà établi dans ce projet (journal_activite,
-- signalement_events, document_events, verification_decisions). Rempli
-- automatiquement par trigger AFTER UPDATE sur `activites` — jamais par
-- une écriture applicative qui pourrait être oubliée, garantit qu'aucune
-- modification (même depuis le SQL Editor) n'échappe à la trace.
CREATE TABLE activite_historique (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  activite_id           uuid NOT NULL REFERENCES activites(id),
  champ                 text NOT NULL,
  ancienne_valeur       text,
  nouvelle_valeur       text,
  modifie_par_admin_id  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  modifie_le            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activite_historique_activite_idx ON activite_historique (activite_id, modifie_le DESC);

-- L'admin auteur du changement est transmis via un paramètre de session
-- transactionnel (app.admin_id, posé par la route API juste avant l'UPDATE
-- sur `activites`) — même mécanisme que current_setting déjà utilisé pour
-- les échappatoires d'immuabilité de ce projet, réutilisé ici pour un usage
-- différent (attribution d'auteur, pas un contournement).
CREATE OR REPLACE FUNCTION activites_tracer_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  BEGIN
    v_admin_id := NULLIF(current_setting('app.admin_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_admin_id := NULL;
  END;

  IF NEW.label IS DISTINCT FROM OLD.label THEN
    INSERT INTO activite_historique (activite_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_admin_id)
    VALUES (NEW.id, 'label', OLD.label, NEW.label, v_admin_id);
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO activite_historique (activite_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_admin_id)
    VALUES (NEW.id, 'description', OLD.description, NEW.description, v_admin_id);
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO activite_historique (activite_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_admin_id)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, v_admin_id);
  END IF;
  IF NEW.regulatory_status IS DISTINCT FROM OLD.regulatory_status THEN
    INSERT INTO activite_historique (activite_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_admin_id)
    VALUES (NEW.id, 'regulatory_status', OLD.regulatory_status, NEW.regulatory_status, v_admin_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER activites_tracer_modification_trigger
  AFTER UPDATE ON activites
  FOR EACH ROW EXECUTE FUNCTION activites_tracer_modification();

-- activite_historique elle-même est totalement immuable — aucune
-- correction en place, jamais (même patron que verification_decisions).
CREATE OR REPLACE FUNCTION activite_historique_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_activite_historique', true) = 'on' THEN
    RAISE WARNING 'activite_historique: modification manuelle exceptionnelle autorisée (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'activite_historique est immuable : impossible de modifier ou supprimer une entrée (id=%).', OLD.id;
END;
$$;

CREATE TRIGGER activite_historique_immuable
  BEFORE UPDATE OR DELETE ON activite_historique
  FOR EACH ROW EXECUTE FUNCTION activite_historique_interdire_modification();

ALTER TABLE activite_historique ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que documents_institution/verification_decisions.
REVOKE ALL ON activite_historique FROM PUBLIC, anon, authenticated;

-- RPC dédiée pour toute modification de `activites` — pose app.admin_id
-- (lu par le trigger ci-dessus) puis exécute l'UPDATE dans la même
-- transaction, seule façon fiable de capturer l'auteur réel sans
-- dépendre d'un SET LOCAL géré côté client. SECURITY DEFINER,
-- search_path fixé, EXECUTE réservé à service_role — même discipline que
-- prendre_decision_verification/decider_demande_activite. Ne modifie
-- volontairement que label/description/statut/regulatory_status/
-- regulatory_source — jamais categorie_id ni code (renommage contrôlé,
-- pas une ré-affectation de catégorie, cf. spec §9 "renommage contrôlé").
CREATE OR REPLACE FUNCTION public.modifier_activite(
  p_activite_id uuid,
  p_admin_id uuid,
  p_label text,
  p_description text,
  p_statut text,
  p_regulatory_status text,
  p_regulatory_source text
) RETURNS public.activites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_actif boolean;
  v_activite public.activites;
BEGIN
  IF p_activite_id IS NULL THEN
    RAISE EXCEPTION 'modifier_activite: p_activite_id requis';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'modifier_activite: p_admin_id requis';
  END IF;
  IF p_label IS NULL OR length(trim(p_label)) = 0 THEN
    RAISE EXCEPTION 'modifier_activite: label requis';
  END IF;
  IF p_statut NOT IN ('active','desactivee') THEN
    RAISE EXCEPTION 'modifier_activite: statut invalide (%)', p_statut;
  END IF;
  IF p_regulatory_status NOT IN ('non_regulated','regulated','license_required','accreditation_required','professional_order','verification_required') THEN
    RAISE EXCEPTION 'modifier_activite: regulatory_status invalide (%)', p_regulatory_status;
  END IF;

  SELECT is_active INTO v_admin_actif FROM public.admin_users WHERE id = p_admin_id;
  IF v_admin_actif IS NULL OR NOT v_admin_actif THEN
    RAISE EXCEPTION 'modifier_activite: admin inconnu ou inactif (admin_id=%)', p_admin_id;
  END IF;

  PERFORM set_config('app.admin_id', p_admin_id::text, true);

  UPDATE public.activites
  SET label = p_label,
      description = p_description,
      statut = p_statut,
      regulatory_status = p_regulatory_status,
      regulatory_source = p_regulatory_source
  WHERE id = p_activite_id
  RETURNING * INTO v_activite;

  IF v_activite.id IS NULL THEN
    RAISE EXCEPTION 'modifier_activite: activité inconnue (activite_id=%)', p_activite_id;
  END IF;

  RETURN v_activite;
END;
$$;

REVOKE ALL ON FUNCTION public.modifier_activite(uuid,uuid,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.modifier_activite(uuid,uuid,text,text,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.modifier_activite(uuid,uuid,text,text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.modifier_activite(uuid,uuid,text,text,text,text,text) TO service_role;
