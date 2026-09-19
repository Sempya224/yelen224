-- ⚠️ HISTORIQUE (20/08/2026) : une version antérieure de ce fichier a été
-- exécutée en base (type_prestation/unite_prix/horaires text/localisation/
-- photo_url créés, est_chambre/photos/video_url/video_duree_secondes pas
-- encore). Le contenu ci-dessous reflète l'intention finale, mais NE PAS
-- LE RÉEXÉCUTER TEL QUEL (erreur 42701, colonnes déjà existantes) — voir
-- 20260821000011_paid_services_chambre_galerie_fix.sql pour le correctif
-- réellement exécuté, qui complète l'état réel de la base.
--
-- Chantier Services Hôtel V2 (audit docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md,
-- 20/08/2026) — colonnes additives nullables sur paid_services, décision CEO
-- "Option 2" (§F de l'audit) : paid_services reste inchangé en usage/
-- validation pour les 14 autres catégories (prix > 0 toujours obligatoire
-- côté route pour elles), ces colonnes ne sont renseignées que pour le
-- profil Hôtel. Aucune nouvelle table de familles : `categorie` (déjà
-- existante, texte libre) sert de famille, regroupement dynamique par
-- valeur réellement utilisée — conforme à
-- docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md §8 ("aucune nouvelle
-- structure de service nécessaire").
--
-- `horaires` en jsonb (retour Bryan 20/08/2026 : "pas du texte libre,
-- utilise celle du système") — même structure que institutions.horaires
-- (lib/horaires.ts::Horaire[] : {jour, ouvert, debut, fin}), même widget
-- de saisie que Profil Entreprise, jamais un texte réinventé.
ALTER TABLE paid_services
  ADD COLUMN type_prestation text NULL
    CHECK (type_prestation IN (
      'inclus', 'sur_demande', 'reservable', 'commandable',
      'supplement', 'horaires_limites', 'indisponible'
    )),
  ADD COLUMN unite_prix text NULL,      -- texte libre : "par nuit", "par personne", "forfait"...
  ADD COLUMN horaires jsonb NULL,       -- Horaire[] — même structure que institutions.horaires
  ADD COLUMN localisation text NULL,    -- texte libre : "Rez-de-chaussée", "2e étage"...
  -- Distingue une chambre (inventaire de base, obligatoire pour un
  -- hôtel — nom/description/prix/photos tous requis côté formulaire) d'une
  -- prestation (facultative). Retour Bryan 20/08/2026 : le premier écran
  -- "Chambres" (Offre générale relabellée, sans photo) était insuffisant
  -- pour représenter une vraie chambre — les chambres vivent maintenant
  -- ici, dans paid_services, plutôt que institutions.services (qui n'a
  -- jamais eu de champ photo). DEFAULT false : zéro impact sur les
  -- lignes existantes et les 14 autres secteurs.
  ADD COLUMN est_chambre boolean NOT NULL DEFAULT false,
  -- Galerie chambre (retour Bryan 20/08/2026 : "jusqu'à 5 images et une
  -- vidéo max 60s") — jsonb array de string plutôt qu'une nouvelle table
  -- (même discipline que annonces.media_urls déjà existant), max 5
  -- éléments validé côté route API, jamais côté DB (pas de CHECK sur la
  -- longueur d'un array jsonb, cohérent avec le reste du projet qui
  -- valide toujours en application). Remplace photo_url (jamais exécuté
  -- en base, aucune migration de données nécessaire).
  ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Vidéo optionnelle, 1 seule. La limite de 60s n'est vérifiable que
  -- côté navigateur (lecture de la durée avant upload) — aucun outil de
  -- probing vidéo serveur (ffprobe) dans ce projet, donc aucune
  -- contrainte DB ne peut l'exprimer. video_duree_secondes = valeur
  -- déclarative du navigateur, affichage uniquement, jamais une garantie.
  ADD COLUMN video_url text NULL,
  ADD COLUMN video_duree_secondes integer NULL;

-- Aucun changement de RLS : les policies existantes sur paid_services
-- (lecture publique is_active=true, écriture service_role via
-- api/institution/services/route.ts) couvrent déjà ces nouvelles colonnes
-- sans modification.
