-- Refonte Enterprise écran Équipe (05/08/2026) — "Fonction" (intitulé de
-- poste libre, ex. "Directeur", "Secrétaire médicale") distinct du rôle
-- RBAC (admin/agent/comptable/superviseur/dirigeant) qui pilote les
-- permissions. Même distinction que employees.poste sur Clock In Shift.
-- Purement informatif, aucun impact sur les permissions.
ALTER TABLE institution_membres
  ADD COLUMN fonction text;
