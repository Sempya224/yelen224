-- Photo de profil citoyen (écran Mon profil, 17/07/2026)
-- storage.objects n'a AUCUNE policy RLS, sur aucun bucket (confirmé par
-- grep exhaustif des migrations). Contrairement aux institutions (JWT
-- custom, pas de session Supabase Auth — cf. CLAUDE.md /auth, contournées
-- via routes service_role), les citoyens ont une vraie session Supabase
-- Auth : auth.uid() est disponible côté client, donc la policy RLS
-- correcte suffit, pas besoin de route dédiée. Chemin déjà utilisé par le
-- code (app/profil/profil-client.tsx) : `${citoyen_id}/avatar-...`, d'où
-- le test sur le premier segment du chemin.
CREATE POLICY avatars_citoyen_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY avatars_citoyen_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
