-- Yelen Geographic System (25/09/2026) — référentiel pays/villes
-- central, prépare le wizard Hôtel Pays → Ville → Établissements
-- (docs/product/YELEN_GEOGRAPHIC_SYSTEM_AUDIT.md).
--
-- Décisions CEO (audit §6, validées 25/09/2026) :
--  1. Scope Hôtel uniquement pour l'instant — institutions.ville/pays
--     et institution_identite_internationale.pays_origine restent
--     inchangés (texte libre), aucune FK ajoutée sur institutions ici.
--  2. La Guinée reste pilotée par lib/villes.ts (VILLES_GUINEE) — cities
--     ne contient QUE l'international, pour éviter une 2e source de
--     vérité (lib/villesCoordonnees.ts importe déjà le type
--     VilleGuinee). La jonction pays→ville côté code choisit
--     VILLES_GUINEE si iso2='GN', sinon interroge cities.
--  3. Seed ISO 3166-1 quasi complet (196 pays/territoires usuels),
--     enabled=false partout sauf la Guinée — existence dans le
--     référentiel ≠ disponibilité commerciale.
--  4. Aucune ville internationale au lancement — saisie manuelle au fil
--     de l'eau, aucune dépendance à un import externe (GeoNames etc.).
--
-- Pattern RLS : lecture publique nécessaire (wizard citoyen), écriture
-- service_role uniquement — même forme que activite_categories
-- (supabase/migrations/20260821000001_activite_categories.sql).
BEGIN;

CREATE TABLE countries (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  iso2        char(2) NOT NULL UNIQUE,
  iso3        char(3) NOT NULL UNIQUE,
  name        text NOT NULL,
  name_fr     text NOT NULL,
  region      text NOT NULL CHECK (region IN ('Afrique','Europe','Asie','Amerique_Nord','Amerique_Sud','Oceanie')),
  enabled     boolean NOT NULL DEFAULT false,
  cree_le     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cities (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id  uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name        text NOT NULL,
  admin_area  text,
  lat         numeric,
  lng         numeric,
  cree_le     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, name)
);

CREATE INDEX idx_cities_country_id ON cities(country_id);

-- ── Seed pays — ISO 3166-1, ~196 pays/territoires usuels ────────────
-- (Kosovo/Taïwan inclus avec leurs codes usuels XK/TW, non-ISO officiel
-- pour Kosovo mais largement utilisé en pratique — signalé au cas où.)

INSERT INTO countries (iso2, iso3, name, name_fr, region, enabled) VALUES
-- Afrique (54)
('DZ','DZA','Algeria','Algérie','Afrique',false),
('AO','AGO','Angola','Angola','Afrique',false),
('BJ','BEN','Benin','Bénin','Afrique',false),
('BW','BWA','Botswana','Botswana','Afrique',false),
('BF','BFA','Burkina Faso','Burkina Faso','Afrique',false),
('BI','BDI','Burundi','Burundi','Afrique',false),
('CV','CPV','Cabo Verde','Cap-Vert','Afrique',false),
('CM','CMR','Cameroon','Cameroun','Afrique',false),
('CF','CAF','Central African Republic','République centrafricaine','Afrique',false),
('TD','TCD','Chad','Tchad','Afrique',false),
('KM','COM','Comoros','Comores','Afrique',false),
('CG','COG','Congo','Congo','Afrique',false),
('CD','COD','DR Congo','République démocratique du Congo','Afrique',false),
('CI','CIV','Côte d''Ivoire','Côte d''Ivoire','Afrique',false),
('DJ','DJI','Djibouti','Djibouti','Afrique',false),
('EG','EGY','Egypt','Égypte','Afrique',false),
('GQ','GNQ','Equatorial Guinea','Guinée équatoriale','Afrique',false),
('ER','ERI','Eritrea','Érythrée','Afrique',false),
('SZ','SWZ','Eswatini','Eswatini','Afrique',false),
('ET','ETH','Ethiopia','Éthiopie','Afrique',false),
('GA','GAB','Gabon','Gabon','Afrique',false),
('GM','GMB','Gambia','Gambie','Afrique',false),
('GH','GHA','Ghana','Ghana','Afrique',false),
('GN','GIN','Guinea','Guinée','Afrique',true),
('GW','GNB','Guinea-Bissau','Guinée-Bissau','Afrique',false),
('KE','KEN','Kenya','Kenya','Afrique',false),
('LS','LSO','Lesotho','Lesotho','Afrique',false),
('LR','LBR','Liberia','Liberia','Afrique',false),
('LY','LBY','Libya','Libye','Afrique',false),
('MG','MDG','Madagascar','Madagascar','Afrique',false),
('MW','MWI','Malawi','Malawi','Afrique',false),
('ML','MLI','Mali','Mali','Afrique',false),
('MR','MRT','Mauritania','Mauritanie','Afrique',false),
('MU','MUS','Mauritius','Maurice','Afrique',false),
('MA','MAR','Morocco','Maroc','Afrique',false),
('MZ','MOZ','Mozambique','Mozambique','Afrique',false),
('NA','NAM','Namibia','Namibie','Afrique',false),
('NE','NER','Niger','Niger','Afrique',false),
('NG','NGA','Nigeria','Nigéria','Afrique',false),
('RW','RWA','Rwanda','Rwanda','Afrique',false),
('ST','STP','Sao Tome and Principe','Sao Tomé-et-Principe','Afrique',false),
('SN','SEN','Senegal','Sénégal','Afrique',false),
('SC','SYC','Seychelles','Seychelles','Afrique',false),
('SL','SLE','Sierra Leone','Sierra Leone','Afrique',false),
('SO','SOM','Somalia','Somalie','Afrique',false),
('ZA','ZAF','South Africa','Afrique du Sud','Afrique',false),
('SS','SSD','South Sudan','Soudan du Sud','Afrique',false),
('SD','SDN','Sudan','Soudan','Afrique',false),
('TZ','TZA','Tanzania','Tanzanie','Afrique',false),
('TG','TGO','Togo','Togo','Afrique',false),
('TN','TUN','Tunisia','Tunisie','Afrique',false),
('UG','UGA','Uganda','Ouganda','Afrique',false),
('ZM','ZMB','Zambia','Zambie','Afrique',false),
('ZW','ZWE','Zimbabwe','Zimbabwe','Afrique',false),

-- Asie (49, Taïwan inclus)
('AF','AFG','Afghanistan','Afghanistan','Asie',false),
('AM','ARM','Armenia','Arménie','Asie',false),
('AZ','AZE','Azerbaijan','Azerbaïdjan','Asie',false),
('BH','BHR','Bahrain','Bahreïn','Asie',false),
('BD','BGD','Bangladesh','Bangladesh','Asie',false),
('BT','BTN','Bhutan','Bhoutan','Asie',false),
('BN','BRN','Brunei','Brunei','Asie',false),
('KH','KHM','Cambodia','Cambodge','Asie',false),
('CN','CHN','China','Chine','Asie',false),
('CY','CYP','Cyprus','Chypre','Asie',false),
('GE','GEO','Georgia','Géorgie','Asie',false),
('IN','IND','India','Inde','Asie',false),
('ID','IDN','Indonesia','Indonésie','Asie',false),
('IR','IRN','Iran','Iran','Asie',false),
('IQ','IRQ','Iraq','Irak','Asie',false),
('IL','ISR','Israel','Israël','Asie',false),
('JP','JPN','Japan','Japon','Asie',false),
('JO','JOR','Jordan','Jordanie','Asie',false),
('KZ','KAZ','Kazakhstan','Kazakhstan','Asie',false),
('KW','KWT','Kuwait','Koweït','Asie',false),
('KG','KGZ','Kyrgyzstan','Kirghizistan','Asie',false),
('LA','LAO','Laos','Laos','Asie',false),
('LB','LBN','Lebanon','Liban','Asie',false),
('MY','MYS','Malaysia','Malaisie','Asie',false),
('MV','MDV','Maldives','Maldives','Asie',false),
('MN','MNG','Mongolia','Mongolie','Asie',false),
('MM','MMR','Myanmar','Myanmar','Asie',false),
('NP','NPL','Nepal','Népal','Asie',false),
('KP','PRK','North Korea','Corée du Nord','Asie',false),
('OM','OMN','Oman','Oman','Asie',false),
('PK','PAK','Pakistan','Pakistan','Asie',false),
('PS','PSE','Palestine','Palestine','Asie',false),
('PH','PHL','Philippines','Philippines','Asie',false),
('QA','QAT','Qatar','Qatar','Asie',false),
('SA','SAU','Saudi Arabia','Arabie saoudite','Asie',false),
('SG','SGP','Singapore','Singapour','Asie',false),
('KR','KOR','South Korea','Corée du Sud','Asie',false),
('LK','LKA','Sri Lanka','Sri Lanka','Asie',false),
('SY','SYR','Syria','Syrie','Asie',false),
('TJ','TJK','Tajikistan','Tadjikistan','Asie',false),
('TH','THA','Thailand','Thaïlande','Asie',false),
('TL','TLS','Timor-Leste','Timor oriental','Asie',false),
('TR','TUR','Turkey','Turquie','Asie',false),
('TM','TKM','Turkmenistan','Turkménistan','Asie',false),
('TW','TWN','Taiwan','Taïwan','Asie',false),
('AE','ARE','United Arab Emirates','Émirats arabes unis','Asie',false),
('UZ','UZB','Uzbekistan','Ouzbékistan','Asie',false),
('VN','VNM','Vietnam','Viêt Nam','Asie',false),
('YE','YEM','Yemen','Yémen','Asie',false),

-- Europe (44, Vatican + Kosovo inclus)
('AL','ALB','Albania','Albanie','Europe',false),
('AD','AND','Andorra','Andorre','Europe',false),
('AT','AUT','Austria','Autriche','Europe',false),
('BY','BLR','Belarus','Biélorussie','Europe',false),
('BE','BEL','Belgium','Belgique','Europe',false),
('BA','BIH','Bosnia and Herzegovina','Bosnie-Herzégovine','Europe',false),
('BG','BGR','Bulgaria','Bulgarie','Europe',false),
('HR','HRV','Croatia','Croatie','Europe',false),
('CZ','CZE','Czechia','Tchéquie','Europe',false),
('DK','DNK','Denmark','Danemark','Europe',false),
('EE','EST','Estonia','Estonie','Europe',false),
('FI','FIN','Finland','Finlande','Europe',false),
('FR','FRA','France','France','Europe',false),
('DE','DEU','Germany','Allemagne','Europe',false),
('GR','GRC','Greece','Grèce','Europe',false),
('HU','HUN','Hungary','Hongrie','Europe',false),
('IS','ISL','Iceland','Islande','Europe',false),
('IE','IRL','Ireland','Irlande','Europe',false),
('IT','ITA','Italy','Italie','Europe',false),
('XK','XKX','Kosovo','Kosovo','Europe',false),
('LV','LVA','Latvia','Lettonie','Europe',false),
('LI','LIE','Liechtenstein','Liechtenstein','Europe',false),
('LT','LTU','Lithuania','Lituanie','Europe',false),
('LU','LUX','Luxembourg','Luxembourg','Europe',false),
('MT','MLT','Malta','Malte','Europe',false),
('MD','MDA','Moldova','Moldavie','Europe',false),
('MC','MCO','Monaco','Monaco','Europe',false),
('ME','MNE','Montenegro','Monténégro','Europe',false),
('NL','NLD','Netherlands','Pays-Bas','Europe',false),
('MK','MKD','North Macedonia','Macédoine du Nord','Europe',false),
('NO','NOR','Norway','Norvège','Europe',false),
('PL','POL','Poland','Pologne','Europe',false),
('PT','PRT','Portugal','Portugal','Europe',false),
('RO','ROU','Romania','Roumanie','Europe',false),
('RU','RUS','Russia','Russie','Europe',false),
('SM','SMR','San Marino','Saint-Marin','Europe',false),
('RS','SRB','Serbia','Serbie','Europe',false),
('SK','SVK','Slovakia','Slovaquie','Europe',false),
('SI','SVN','Slovenia','Slovénie','Europe',false),
('ES','ESP','Spain','Espagne','Europe',false),
('SE','SWE','Sweden','Suède','Europe',false),
('CH','CHE','Switzerland','Suisse','Europe',false),
('UA','UKR','Ukraine','Ukraine','Europe',false),
('GB','GBR','United Kingdom','Royaume-Uni','Europe',false),
('VA','VAT','Vatican City','Vatican','Europe',false),

-- Amérique du Nord & Caraïbes (23)
('AG','ATG','Antigua and Barbuda','Antigua-et-Barbuda','Amerique_Nord',false),
('BS','BHS','Bahamas','Bahamas','Amerique_Nord',false),
('BB','BRB','Barbados','Barbade','Amerique_Nord',false),
('BZ','BLZ','Belize','Belize','Amerique_Nord',false),
('CA','CAN','Canada','Canada','Amerique_Nord',false),
('CR','CRI','Costa Rica','Costa Rica','Amerique_Nord',false),
('CU','CUB','Cuba','Cuba','Amerique_Nord',false),
('DM','DMA','Dominica','Dominique','Amerique_Nord',false),
('DO','DOM','Dominican Republic','République dominicaine','Amerique_Nord',false),
('SV','SLV','El Salvador','Salvador','Amerique_Nord',false),
('GD','GRD','Grenada','Grenade','Amerique_Nord',false),
('GT','GTM','Guatemala','Guatemala','Amerique_Nord',false),
('HT','HTI','Haiti','Haïti','Amerique_Nord',false),
('HN','HND','Honduras','Honduras','Amerique_Nord',false),
('JM','JAM','Jamaica','Jamaïque','Amerique_Nord',false),
('MX','MEX','Mexico','Mexique','Amerique_Nord',false),
('NI','NIC','Nicaragua','Nicaragua','Amerique_Nord',false),
('PA','PAN','Panama','Panama','Amerique_Nord',false),
('KN','KNA','Saint Kitts and Nevis','Saint-Kitts-et-Nevis','Amerique_Nord',false),
('LC','LCA','Saint Lucia','Sainte-Lucie','Amerique_Nord',false),
('VC','VCT','Saint Vincent and the Grenadines','Saint-Vincent-et-les-Grenadines','Amerique_Nord',false),
('TT','TTO','Trinidad and Tobago','Trinité-et-Tobago','Amerique_Nord',false),
('US','USA','United States','États-Unis','Amerique_Nord',false),

-- Amérique du Sud (12)
('AR','ARG','Argentina','Argentine','Amerique_Sud',false),
('BO','BOL','Bolivia','Bolivie','Amerique_Sud',false),
('BR','BRA','Brazil','Brésil','Amerique_Sud',false),
('CL','CHL','Chile','Chili','Amerique_Sud',false),
('CO','COL','Colombia','Colombie','Amerique_Sud',false),
('EC','ECU','Ecuador','Équateur','Amerique_Sud',false),
('GY','GUY','Guyana','Guyana','Amerique_Sud',false),
('PY','PRY','Paraguay','Paraguay','Amerique_Sud',false),
('PE','PER','Peru','Pérou','Amerique_Sud',false),
('SR','SUR','Suriname','Suriname','Amerique_Sud',false),
('UY','URY','Uruguay','Uruguay','Amerique_Sud',false),
('VE','VEN','Venezuela','Venezuela','Amerique_Sud',false),

-- Océanie (14)
('AU','AUS','Australia','Australie','Oceanie',false),
('FJ','FJI','Fiji','Fidji','Oceanie',false),
('KI','KIR','Kiribati','Kiribati','Oceanie',false),
('MH','MHL','Marshall Islands','Îles Marshall','Oceanie',false),
('FM','FSM','Micronesia','Micronésie','Oceanie',false),
('NR','NRU','Nauru','Nauru','Oceanie',false),
('NZ','NZL','New Zealand','Nouvelle-Zélande','Oceanie',false),
('PW','PLW','Palau','Palaos','Oceanie',false),
('PG','PNG','Papua New Guinea','Papouasie-Nouvelle-Guinée','Oceanie',false),
('WS','WSM','Samoa','Samoa','Oceanie',false),
('SB','SLB','Solomon Islands','Îles Salomon','Oceanie',false),
('TO','TON','Tonga','Tonga','Oceanie',false),
('TV','TUV','Tuvalu','Tuvalu','Oceanie',false),
('VU','VUT','Vanuatu','Vanuatu','Oceanie',false);

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY countries_public_read ON countries
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY cities_public_read ON cities
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON countries FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON cities FROM PUBLIC, anon, authenticated;

COMMIT;
