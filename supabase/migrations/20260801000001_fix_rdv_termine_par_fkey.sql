-- Correctif : rdv.termine_par pointait vers institutions(id) alors que le
-- code (app/api/institution/rdv/statut/route.ts) y écrit systematiquement
-- un id de institution_membres (membre.membreId, le membre du staff qui a
-- termine le RDV) -- jamais un id d'institution. Provoquait
-- "violates foreign key constraint rdv_termine_par_fkey" a chaque
-- terminaison de RDV (detecte par le CEO en test le 01/08/2026).
ALTER TABLE rdv DROP CONSTRAINT rdv_termine_par_fkey;
ALTER TABLE rdv ADD CONSTRAINT rdv_termine_par_fkey FOREIGN KEY (termine_par) REFERENCES institution_membres(id);
