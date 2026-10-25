-- Lot C — Vague 2, table 4/9 (18/10/2026) : avis.
-- Policy réelle : avis_citoyen_own (ALL, auth.uid()=citoyen_id) — anon n'a
-- jamais auth.uid() non-NULL, donc ne peut jamais satisfaire cette policy,
-- quel que soit le grant. authenticated gère ses propres avis : SELECT/
-- UPDATE (toggle masque, édition brouillon) /DELETE confirmés dans
-- app/compte/mes-avis/mes-avis-client.tsx. INSERT : non trouvé côté
-- client — la création passe par la Server Action service_role
-- (app/mes-rdv/actions.ts::soumettreAvis), jamais un insert direct
-- authenticated.
--
-- ⚠️ Signalé mais non traité ici (hors périmètre grants) : la lecture
-- publique des avis sur la fiche institution (InstitutionPublicClient.tsx)
-- se fait en direct depuis le navigateur, mais aucune policy ne permet de
-- voir les avis d'un AUTRE citoyen (seulement les siens) — probablement
-- déjà cassé aujourd'hui indépendamment de ce grant, à traiter dans un
-- chantier RLS séparé.
REVOKE ALL ON TABLE avis FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE avis TO authenticated;
