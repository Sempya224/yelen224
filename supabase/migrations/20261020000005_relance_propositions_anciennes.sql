-- PROPOSEE - NON EXECUTEE. Relance automatique des propositions anciennes - voir
-- docs/product/YELEN_REVERIFICATION_POLICY.md.
--
-- Une proposition de changement de profil qui reste sans activite (ni creation,
-- ni complement demande, ni complement fourni) pendant 7 jours, puis 14 jours,
-- declenche UNE notification a l'etablissement par palier :
--   - si l'equipe Yelen attend sa reponse a un complement : rappel de repondre ;
--   - sinon : "toujours en cours d'examen", les citoyens voient l'ancienne valeur.
-- AUCUNE publication automatique : la valeur publiee ne change jamais ici.
-- Etablissements non publics (suspendue, en_attente, refusee) : pas de relance.
-- Un nouvel echange (complement demande ou fourni) redemarre l'horloge.
-- Chaque relance est tracee dans le journal d'echanges de la demande (type
-- 'relance_envoyee', acteur 'systeme', immuable) ; le marqueur relance_7j /
-- relance_14j garantit une seule relance par palier et par periode d'activite.
-- Notification in-app uniquement (comme les autres jobs SQL du projet : un job SQL
-- ne peut pas envoyer de push).
--
-- Chaines en ASCII : les accents des messages sont ecrits en U&'\00e9' (syntaxe
-- d'echappement Unicode de PostgreSQL) parce que l'editeur SQL de Supabase tronque
-- les collages contenant des caracteres accentues.
--
-- Rollback : select cron.unschedule('yelen-relance-propositions');
--            DROP FUNCTION IF EXISTS public.relancer_propositions_anciennes();

ALTER TABLE public.institution_change_request_events DROP CONSTRAINT IF EXISTS institution_change_request_events_type_check;
ALTER TABLE public.institution_change_request_events ADD CONSTRAINT institution_change_request_events_type_check CHECK (type IN ('complement_demande', 'complement_fourni', 'acces_restreint', 'relance_envoyee'));
ALTER TABLE public.institution_change_request_events DROP CONSTRAINT IF EXISTS institution_change_request_events_acteur_type_check;
ALTER TABLE public.institution_change_request_events ADD CONSTRAINT institution_change_request_events_acteur_type_check CHECK (acteur_type IN ('admin', 'membre', 'systeme'));

CREATE OR REPLACE FUNCTION public.relancer_propositions_anciennes() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                   record;
  v_activite          timestamptz;
  v_jours             numeric;
  v_niveau            integer;
  v_marqueur          text;
  v_attend_etablissement boolean;
  v_nom               text;
  v_libelle           text;
  v_message           text;
  v_n                 integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('relance_propositions'));
  FOR r IN
    SELECT q.id, q.institution_id, q.champ, q.created_at
    FROM public.institution_change_requests q
    JOIN public.institutions i ON i.id = q.institution_id
    WHERE q.statut = 'a_examiner' AND i.statut::text = 'validee'
    ORDER BY q.created_at
  LOOP
    v_activite := greatest(r.created_at, coalesce((SELECT max(e.created_at) FROM public.institution_change_request_events e WHERE e.request_id = r.id AND e.type IN ('complement_demande', 'complement_fourni')), r.created_at));
    v_jours := extract(epoch FROM (now() - v_activite)) / 86400;
    v_niveau := CASE WHEN v_jours >= 14 THEN 14 WHEN v_jours >= 7 THEN 7 ELSE 0 END;
    CONTINUE WHEN v_niveau = 0;
    v_marqueur := 'relance_' || v_niveau || 'j';
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.institution_change_request_events e WHERE e.request_id = r.id AND e.type = 'relance_envoyee' AND e.message = v_marqueur AND e.created_at >= v_activite);
    v_attend_etablissement := coalesce((SELECT e.type = 'complement_demande' FROM public.institution_change_request_events e WHERE e.request_id = r.id AND e.type IN ('complement_demande', 'complement_fourni') ORDER BY e.created_at DESC, e.id DESC LIMIT 1), false);
    v_nom := (SELECT i.name FROM public.institutions i WHERE i.id = r.institution_id);
    v_libelle := CASE r.champ WHEN 'name' THEN 'Nom' WHEN 'ville' THEN 'Ville' WHEN 'adresse' THEN 'Adresse' WHEN 'coordonnees' THEN U&'Coordonn\00e9es' WHEN 'activite' THEN U&'Cat\00e9gorie et activit\00e9' ELSE 'profil' END;
    IF v_attend_etablissement THEN
      v_message := U&'L\0027\00e9quipe Yelen attend votre r\00e9ponse pour votre modification (' || v_libelle || U&'). D\00e9posez les pi\00e8ces demand\00e9es dans l\0027onglet Documents, puis r\00e9pondez depuis l\0027\00e9cran Entreprise. Les citoyens continuent de voir l\0027information pr\00e9c\00e9dente.';
    ELSE
      v_message := U&'Votre modification (' || v_libelle || U&') est toujours en cours d\0027examen par l\0027\00e9quipe Yelen depuis ' || floor(v_jours)::text || U&' jours. Les citoyens continuent de voir l\0027information pr\00e9c\00e9dente. Nous revenons vers vous d\00e8s que possible.';
    END IF;
    INSERT INTO public.institution_change_request_events (request_id, institution_id, type, acteur_type, acteur_nom, message) VALUES (r.id, r.institution_id, 'relance_envoyee', 'systeme', 'Systeme Yelen', v_marqueur);
    INSERT INTO public.notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu) VALUES (r.institution_id, 'institution', NULL, 'changement_profil_relance', 'Bonjour, ' || coalesce(v_nom, ''), v_message, false);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.relancer_propositions_anciennes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relancer_propositions_anciennes() TO service_role;

SELECT cron.schedule('yelen-relance-propositions', '0 8 * * *', 'SELECT public.relancer_propositions_anciennes();');

-- Verifier : select * from cron.job where jobname = 'yelen-relance-propositions';
-- Historique : select * from cron.job_run_details order by start_time desc limit 20;
-- Desactiver : select cron.unschedule('yelen-relance-propositions');
