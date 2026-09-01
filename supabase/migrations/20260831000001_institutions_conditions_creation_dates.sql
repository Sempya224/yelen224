-- Date de première écriture par section "Conditions & Informations",
-- distincte de la date de dernière modification déjà suivie par
-- conditions_entreprise_le/informations_importantes_le/informations_legales_le
-- (migration 20260724000017, réécrite à chaque enregistrement). Posée une
-- seule fois côté serveur (api/institution/profile), jamais réécrite
-- ensuite — permet d'afficher "Écrit le X" ET "Mis à jour le Y" séparément
-- sur la fiche publique au lieu d'une seule date ambiguë.
ALTER TABLE institutions
  ADD COLUMN conditions_entreprise_creee_le timestamptz,
  ADD COLUMN informations_importantes_creee_le timestamptz,
  ADD COLUMN informations_legales_creee_le timestamptz;
