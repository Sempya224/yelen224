-- Chantier "Préparer la venue du client" (fiche RDV institution) — le champ
-- rdv.guichet existait déjà (migration 20260720000001) mais n'était qu'un
-- input texte sans aucune conséquence côté citoyen. Décision CEO (13/10/2026) :
-- en faire une vraie action proposée par Yelen (popup "Préparer la venue",
-- visible uniquement sur un RDV accepté) qui peut en plus transmettre des
-- consignes au citoyen et notifier son envoi. Deux colonnes additives
-- nullables, aucun backfill, aucune contrainte — même profil que
-- disponibilites_modifie_le/annule_par : zéro risque sur les lignes
-- existantes, NULL pour tout RDV antérieur à cette migration (donnée
-- inconnue, jamais devinée).
ALTER TABLE rdv ADD COLUMN IF NOT EXISTS instructions_accueil text;
ALTER TABLE rdv ADD COLUMN IF NOT EXISTS preparation_confirmee_le timestamptz;
