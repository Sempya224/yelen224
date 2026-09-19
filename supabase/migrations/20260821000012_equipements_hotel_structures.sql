-- Équipements structurés Hôtel (chantier "Équipements structurés",
-- décision Bryan 21/08/2026) — remplace, pour l'hôtellerie uniquement, le
-- texte libre "Équipements & règles" (informations_importantes) par une
-- donnée exploitable. Séparation stricte établissement/chambre : un
-- groupe électrogène de l'hôtel ne signifie pas que chaque chambre a la
-- climatisation. Taxonomie complète (codes valides) dans
-- lib/hotelEquipements.tsx — colonnes ci-dessous ne sont que le stockage,
-- jamais de CHECK sur les valeurs (même discipline que le reste du
-- projet : validation toujours en application, pas en base — cf.
-- CLAUDE.md).
--
-- Additif, nullable, zéro impact sur les 14 autres secteurs : aucune
-- route/écran hors hôtel ne lit ni n'écrit ces colonnes.
--
-- IF NOT EXISTS (21/08/2026) — rendue idempotente après une 1re exécution
-- partielle (institutions.equipements_etablissement déjà créée, script
-- interrompu avant d'atteindre paid_services : erreur 42701 sur un
-- rejeu identique). Sûr à relancer autant de fois que nécessaire.
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS equipements_etablissement jsonb NULL; -- array de codes (ex. ["wifi","piscine"])

ALTER TABLE paid_services
  ADD COLUMN IF NOT EXISTS equipements_chambre jsonb NULL; -- array de codes, pertinent uniquement si est_chambre=true

-- Réversible :
-- ALTER TABLE institutions DROP COLUMN equipements_etablissement;
-- ALTER TABLE paid_services DROP COLUMN equipements_chambre;
