-- Lot B — correctif trouvé en test réel (18/10/2026). La migration
-- 20261018000010 met support_tickets.citoyen_id à NULL lors d'une
-- suppression de compte citoyen (anonymisation, cohérente avec
-- avis/rdv/points_transactions). Mais support_tickets_une_seule_origine
-- (version 3 voies, 20260924000001_support_tickets_public.sql) exige
-- EXACTEMENT une origine (citoyen_id XOR institution_id XOR
-- visiteur_email) — un ticket citoyen anonymisé n'a alors plus aucune des
-- 3, la somme tombe à 0 au lieu de 1, et la cascade de suppression échoue
-- avec "new row for relation support_tickets violates check constraint
-- support_tickets_une_seule_origine" (confirmé par test réel contre la
-- route POST /api/citoyen/confidentialite/suppression/executer).
--
-- Correctif : relâcher la contrainte à "au plus 1" plutôt que "exactement
-- 1". La garantie d'origine réellement importante ("jamais 2 origines à
-- la fois sur un même ticket") reste intacte ; seul le cas "0 origine"
-- devient légitime, et seulement après anonymisation (aucune route de
-- création de ticket n'insère jamais les 3 colonnes à NULL — validé côté
-- application, pas remis en cause par ce changement de contrainte DB).
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_une_seule_origine;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_une_seule_origine
  CHECK (
    (CASE WHEN citoyen_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN institution_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN visiteur_email IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );
