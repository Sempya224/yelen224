-- GAP-17-01 (23/10/2026) — acquisition_events : fin de l'insertion publique
-- directe navigateur → Supabase.
--
-- Avant : policy `acquisition_events_insert` (FOR INSERT TO anon,
-- authenticated, WITH CHECK citoyen_id IS NULL OR citoyen_id = auth.uid()).
-- Ce trafic partait vers *.supabase.co sans jamais traverser une route
-- Yelen : aucune vérification que l'institution est active, aucun rate
-- limiting — un visiteur non authentifié pouvait fausser à volume illimité
-- les statistiques d'acquisition de n'importe quelle institution. (La FK
-- institution_id → institutions rejetait déjà un id inexistant.)
--
-- Après : l'insertion passe exclusivement par POST /api/acquisition/events
-- (validation du payload, institution `validee`, rate limiting par IP et
-- par institution, insert service_role). Même convention que les autres
-- tables sensibles du projet : RLS actif, aucune policy, service_role seul.
--
-- ⚠️ Ordre de déploiement : exécuter cette migration et déployer le code de
-- la route le plus près possible l'un de l'autre. Entre les deux, les
-- événements d'acquisition sont perdus (best-effort côté client, aucune
-- erreur visible pour le citoyen) — jamais d'impact fonctionnel.

DROP POLICY IF EXISTS acquisition_events_insert ON acquisition_events;

-- Défense en profondeur (même logique que les migrations Lot C grants du
-- 18/10/2026) : sans policy, RLS refuse déjà tout à anon/authenticated ; le
-- grant table retiré garantit que l'ajout futur d'une policy permissive par
-- erreur ne rouvrirait pas l'accès à lui seul. service_role non touché.
REVOKE ALL ON TABLE acquisition_events FROM anon, authenticated;

-- ─── Rate limiting persistant ───────────────────────────────────────────
-- Compteurs à fenêtre fixe d'une minute, partagés entre toutes les
-- instances serverless (une `Map` en mémoire ne l'est pas — constat
-- GAP-10-01). Clés posées par la route : `ip:<ip>` et `inst:<uuid>`.
-- L'IP brute n'est conservée que le temps de la fenêtre (purge > 1 h à
-- chaque appel), même convention de stockage que auth_ip_security.
CREATE TABLE IF NOT EXISTS acquisition_rate_limits (
  cle text NOT NULL,
  fenetre_debut timestamptz NOT NULL,
  compteur integer NOT NULL DEFAULT 0,
  PRIMARY KEY (cle, fenetre_debut)
);
ALTER TABLE acquisition_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE acquisition_rate_limits FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS acquisition_rate_limits_fenetre_idx ON acquisition_rate_limits(fenetre_debut);

-- Incrément atomique (INSERT ... ON CONFLICT DO UPDATE) de chaque clé pour
-- la minute en cours, renvoie le compteur à jour de chacune. Fenêtre
-- calculée côté base (date_trunc sur now()), jamais fournie par l'appelant.
CREATE OR REPLACE FUNCTION acquisition_incrementer_compteurs(p_cles text[])
RETURNS TABLE (cle text, compteur integer)
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  DELETE FROM public.acquisition_rate_limits
  WHERE fenetre_debut < now() - interval '1 hour';

  INSERT INTO public.acquisition_rate_limits AS a (cle, fenetre_debut, compteur)
  SELECT DISTINCT k, date_trunc('minute', now()), 1
  FROM unnest(p_cles) AS k
  ON CONFLICT (cle, fenetre_debut) DO UPDATE SET compteur = a.compteur + 1
  RETURNING a.cle, a.compteur;
$$;

-- Même discipline que GAP-06-04 (appliquer_recuperations_dues) : aucun
-- EXECUTE implicite pour PUBLIC/anon/authenticated, service_role seul.
REVOKE EXECUTE ON FUNCTION acquisition_incrementer_compteurs(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acquisition_incrementer_compteurs(text[]) TO service_role;
