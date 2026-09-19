-- Refonte Enterprise écran Disponibilités (mission CEO 05/08/2026,
-- Product Hardening — voir CLAUDE.md /programme-yelen-v2-enterprise-
-- hardening). Le nouveau header veut afficher "Dernière modification :
-- [heure] par [membre]" — cette information n'était tracée nulle part
-- (institutions.disponibilites était mis à jour sans horodatage ni auteur).
-- Zéro donnée inventée : on ajoute les deux colonnes plutôt que d'afficher
-- une valeur fictive.
ALTER TABLE institutions
  ADD COLUMN disponibilites_modifie_le timestamptz,
  ADD COLUMN disponibilites_modifie_par uuid REFERENCES institution_membres(id) ON DELETE SET NULL;
