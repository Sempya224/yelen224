-- Chantier Taxonomie des activités — correctif bloquant découvert en Phase
-- 2 (bascule du wizard) : la migration 20260821000002 n'a semé que la
-- catégorie Technologie (seule au contenu sourcé/validé) — les 14 autres
-- catégories étaient vides, rendant le wizard IMPOSSIBLE à compléter pour
-- toute institution hors technologie (aucune activité principale
-- sélectionnable). Sème donc le squelette "à valider"
-- (docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md §7) — confiance
-- volontairement plus faible que la Technologie, marqué comme tel dans
-- chaque description, à consolider dans un second passage (mécanisme
-- "Autre activité" déjà en place, Phase 1, pour absorber les manques au
-- fil de l'eau).
--
-- regulatory_status : seules les activités déjà sourcées dans la spec
-- §10bis reçoivent une valeur autre que non_regulated (banque,
-- microfinance, assurance, avocat, pharmacie, clinique/hôpital,
-- établissement d'enseignement, sécurité privée) — les autres restent
-- non_regulated par défaut, honnêteté du niveau de confiance conservée.
INSERT INTO activites (categorie_id, code, label, description, regulatory_status, regulatory_source, ordre)
SELECT c.id, v.code, v.label, v.description, v.regulatory_status, v.regulatory_source, v.ordre_seed
FROM (VALUES
  -- Institutions publiques & services administratifs
  ('institutions_publiques_administratif', 'mairie', 'Mairie', 'Administration municipale.', 'non_regulated', NULL, 1),
  ('institutions_publiques_administratif', 'prefecture', 'Préfecture', 'Administration préfectorale.', 'non_regulated', NULL, 2),
  ('institutions_publiques_administratif', 'ambassade_consulat', 'Ambassade / Consulat', 'Représentation diplomatique étrangère en Guinée.', 'non_regulated', NULL, 3),
  ('institutions_publiques_administratif', 'service_etat_civil', 'Service d''état civil', 'Actes de naissance, mariage, décès.', 'non_regulated', NULL, 4),
  ('institutions_publiques_administratif', 'administration_fiscale', 'Administration fiscale', 'Services des impôts et taxes.', 'non_regulated', NULL, 5),

  -- Santé & services médicaux — statuts réglementaires sourcés spec §10bis (à confirmer précisément pour clinique)
  ('sante_medical', 'hopital', 'Hôpital', 'Établissement de soins hospitaliers.', 'license_required', 'Ministère de la Santé et de l''Hygiène Publique — autorisation spécifique non vérifiée précisément dans ce mandat, déduite du cadre applicable aux pharmacies (SOURCE SECTORIELLE, à confirmer).', 1),
  ('sante_medical', 'clinique', 'Clinique', 'Établissement de soins privé.', 'license_required', 'Ministère de la Santé et de l''Hygiène Publique (SOURCE SECTORIELLE, à confirmer).', 2),
  ('sante_medical', 'cabinet_medical', 'Cabinet médical', 'Exercice médical individuel ou de groupe.', 'professional_order', 'Ordre National des Médecins et Pharmaciens de Guinée.', 3),
  ('sante_medical', 'pharmacie', 'Pharmacie', 'Officine de vente de médicaments.', 'license_required', 'Loi L/2018/024/AN, Ministère de la Santé, Ordre National des Pharmaciens de Guinée (ONPG).', 4),
  ('sante_medical', 'laboratoire_analyses', 'Laboratoire d''analyses', 'Analyses médicales.', 'non_regulated', NULL, 5),

  -- Finance, assurance & paiements — sourcés BCRG (spec §10bis)
  ('finance_assurance_paiements', 'banque', 'Banque', 'Établissement bancaire.', 'license_required', 'BCRG, mission de supervision des banques.', 1),
  ('finance_assurance_paiements', 'microfinance', 'Microfinance', 'Institution de finance inclusive.', 'license_required', 'Loi relative aux Institutions Financières Inclusives en République de Guinée, BCRG.', 2),
  ('finance_assurance_paiements', 'assurance', 'Assurance', 'Compagnie d''assurance.', 'license_required', 'BCRG, supervision confirmée (banques/assurances/microfinance).', 3),
  ('finance_assurance_paiements', 'transfert_argent_mobile_money', 'Transfert d''argent / mobile money', 'Services de transfert et paiement mobile.', 'non_regulated', NULL, 4),
  ('finance_assurance_paiements', 'bureau_change', 'Bureau de change', 'Change de devises.', 'non_regulated', NULL, 5),

  -- Droit, comptabilité & conseil professionnel — resserré aux ordres (spec §4 règle de frontière)
  ('droit_comptabilite_conseil', 'cabinet_avocats', 'Cabinet d''avocats', 'Exercice de la profession d''avocat.', 'professional_order', 'Ordre des Avocats de Guinée.', 1),
  ('droit_comptabilite_conseil', 'notaire', 'Notaire', 'Exercice de la profession de notaire.', 'professional_order', 'Non vérifié spécifiquement dans ce mandat (INFÉRENCE PRODUIT YELEN — à confirmer).', 2),
  ('droit_comptabilite_conseil', 'cabinet_comptable', 'Cabinet comptable', 'Expertise comptable.', 'professional_order', 'Non vérifié spécifiquement pour la Guinée dans ce mandat (INFÉRENCE PRODUIT YELEN — à confirmer).', 3),
  ('droit_comptabilite_conseil', 'huissier', 'Huissier', 'Exercice de la profession d''huissier de justice.', 'professional_order', 'Non vérifié spécifiquement dans ce mandat (INFÉRENCE PRODUIT YELEN — à confirmer).', 4),

  -- Éducation, formation & recherche — sourcé service-public.gov.gn (spec §10bis)
  ('education_formation_recherche', 'ecole', 'École', 'Établissement d''enseignement pré-universitaire.', 'accreditation_required', 'Ministère de l''Enseignement Pré-Universitaire, agrément via Direction Préfectorale/Communale de l''Éducation.', 1),
  ('education_formation_recherche', 'universite', 'Université', 'Établissement d''enseignement supérieur.', 'accreditation_required', 'Ministère de l''Enseignement Supérieur, procédure de création d''institution privée.', 2),
  ('education_formation_recherche', 'centre_formation_professionnelle', 'Centre de formation professionnelle', 'Formation professionnelle et technique.', 'non_regulated', NULL, 3),
  ('education_formation_recherche', 'institut_recherche', 'Institut de recherche', 'Recherche scientifique et académique.', 'non_regulated', NULL, 4),

  -- Hébergement, restauration & événements — Hôtellerie = continuité secteur=hotel (spec §4)
  ('hebergement_restauration_evenements', 'hotellerie', 'Hôtellerie', 'Hébergement touristique ou d''affaires.', 'non_regulated', NULL, 1),
  ('hebergement_restauration_evenements', 'restaurant', 'Restaurant', 'Restauration sur place.', 'non_regulated', NULL, 2),
  ('hebergement_restauration_evenements', 'organisateur_evenements', 'Organisateur d''événements', 'Organisation d''événements.', 'non_regulated', NULL, 3),
  ('hebergement_restauration_evenements', 'traiteur', 'Traiteur', 'Restauration événementielle.', 'non_regulated', NULL, 4),

  -- Transport, logistique & mobilité
  ('transport_logistique_mobilite', 'transport_personnes', 'Transport de personnes', 'Transport de voyageurs.', 'non_regulated', NULL, 1),
  ('transport_logistique_mobilite', 'transit_dedouanement', 'Transit / dédouanement', 'Formalités douanières et transit.', 'non_regulated', NULL, 2),
  ('transport_logistique_mobilite', 'livraison_messagerie', 'Livraison / messagerie', 'Livraison de colis et courrier.', 'non_regulated', NULL, 3),
  ('transport_logistique_mobilite', 'location_vehicules', 'Location de véhicules', 'Location de véhicules.', 'non_regulated', NULL, 4),

  -- BTP, immobilier & services techniques — échelle chantier (spec §4 règle de frontière avec Artisanat)
  ('btp_immobilier_technique', 'entreprise_btp', 'Entreprise BTP', 'Construction et gros œuvre.', 'non_regulated', NULL, 1),
  ('btp_immobilier_technique', 'agence_immobiliere', 'Agence immobilière', 'Transaction et gestion immobilière.', 'non_regulated', NULL, 2),
  ('btp_immobilier_technique', 'bureau_etudes_techniques', 'Bureau d''études techniques', 'Études techniques et d''ingénierie.', 'non_regulated', NULL, 3),
  ('btp_immobilier_technique', 'electricite_plomberie_chantier', 'Électricité / plomberie (échelle chantier)', 'Installation technique à l''échelle d''un chantier/bâtiment.', 'non_regulated', NULL, 4),

  -- Agriculture, élevage & services ruraux
  ('agriculture_elevage_rural', 'exploitation_agricole', 'Exploitation agricole', 'Production agricole.', 'non_regulated', NULL, 1),
  ('agriculture_elevage_rural', 'cooperative_agricole', 'Coopérative agricole', 'Coopérative de producteurs.', 'non_regulated', NULL, 2),
  ('agriculture_elevage_rural', 'veterinaire', 'Vétérinaire', 'Soins vétérinaires.', 'non_regulated', NULL, 3),
  ('agriculture_elevage_rural', 'fourniture_intrants_agricoles', 'Fourniture d''intrants agricoles', 'Semences, engrais, matériel agricole.', 'non_regulated', NULL, 4),

  -- Artisanat, fabrication & réparation — échelle individuelle/atelier (spec §4)
  ('artisanat_fabrication_reparation', 'menuiserie_ameublement_sur_mesure', 'Menuiserie / ameublement sur mesure', 'Fabrication de mobilier sur mesure.', 'non_regulated', NULL, 1),
  ('artisanat_fabrication_reparation', 'couture_mode', 'Couture / mode', 'Confection sur mesure.', 'non_regulated', NULL, 2),
  ('artisanat_fabrication_reparation', 'reparation_automobile', 'Réparation automobile', 'Garage et réparation de véhicules.', 'non_regulated', NULL, 3),
  ('artisanat_fabrication_reparation', 'fabrication_artisanale', 'Fabrication artisanale', 'Fabrication d''objets artisanaux.', 'non_regulated', NULL, 4),
  ('artisanat_fabrication_reparation', 'electricien_plombier_independant', 'Électricien / plombier indépendant', 'Installation technique ponctuelle (échelle résidentielle).', 'non_regulated', NULL, 5),

  -- Beauté, bien-être & sport
  ('beaute_bien_etre_sport', 'coiffure', 'Coiffure', 'Salon de coiffure.', 'non_regulated', NULL, 1),
  ('beaute_bien_etre_sport', 'institut_beaute_spa', 'Institut de beauté / spa', 'Soins esthétiques et bien-être.', 'non_regulated', NULL, 2),
  ('beaute_bien_etre_sport', 'salle_sport', 'Salle de sport', 'Fitness et remise en forme.', 'non_regulated', NULL, 3),
  ('beaute_bien_etre_sport', 'coach_sportif', 'Coach sportif', 'Accompagnement sportif individuel.', 'non_regulated', NULL, 4),

  -- Communication, médias & création — création/stratégie (spec §4 règle de frontière avec Technologie)
  ('communication_medias_creation', 'agence_communication', 'Agence de communication', 'Stratégie et création de communication.', 'non_regulated', NULL, 1),
  ('communication_medias_creation', 'studio_production', 'Studio de production', 'Production audiovisuelle.', 'non_regulated', NULL, 2),
  ('communication_medias_creation', 'media_presse', 'Média / presse', 'Organe de presse.', 'non_regulated', NULL, 3),
  ('communication_medias_creation', 'graphisme_design', 'Graphisme / design', 'Création graphique et design.', 'non_regulated', NULL, 4),

  -- Services aux entreprises & externalisation — accueille le "conseil" générique (spec §4)
  ('services_entreprises_externalisation', 'centre_appels', 'Centre d''appels', 'Service client externalisé.', 'non_regulated', NULL, 1),
  ('services_entreprises_externalisation', 'recrutement_rh', 'Recrutement / RH', 'Ressources humaines et recrutement.', 'non_regulated', NULL, 2),
  ('services_entreprises_externalisation', 'nettoyage_professionnel', 'Nettoyage professionnel', 'Services de nettoyage pour entreprises.', 'non_regulated', NULL, 3),
  ('services_entreprises_externalisation', 'securite_privee', 'Sécurité privée', 'Gardiennage et sécurité.', 'license_required', 'Décret D/2020/216/PRG (26/08/2020), Ministère de la Sécurité et de la Protection Civile.', 4),
  ('services_entreprises_externalisation', 'conseil_gestion', 'Conseil en gestion', 'Conseil stratégique/management non réglementé.', 'non_regulated', NULL, 5),

  -- Associations, ONG & organisations professionnelles
  ('associations_ong_organisations', 'ong', 'ONG', 'Organisation non gouvernementale.', 'non_regulated', NULL, 1),
  ('associations_ong_organisations', 'association_communautaire', 'Association communautaire', 'Association à but non lucratif.', 'non_regulated', NULL, 2),
  ('associations_ong_organisations', 'organisation_professionnelle_syndicat', 'Organisation professionnelle / syndicat', 'Organisation professionnelle ou syndicale.', 'non_regulated', NULL, 3)
) AS v(categorie_code, code, label, description, regulatory_status, regulatory_source, ordre_seed)
JOIN activite_categories c ON c.code = v.categorie_code;
