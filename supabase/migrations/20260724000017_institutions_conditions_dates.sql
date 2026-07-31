-- Date de dernière mise à jour par section (Conditions de l'entreprise /
-- Informations importantes / Informations légales) — affichée aux côtés
-- de "Écrit par {établissement}" sur la fiche publique. Mise à jour côté
-- serveur (api/institution/profile) à chaque enregistrement de la section
-- correspondante, jamais fournie par le client.
ALTER TABLE institutions
  ADD COLUMN conditions_entreprise_le timestamptz,
  ADD COLUMN informations_importantes_le timestamptz,
  ADD COLUMN informations_legales_le timestamptz;
