-- Chantier RDV (19/07/2026) : deux ajouts distincts sur `rdv`, demandés par Bryan.
--
-- 1) duree_minutes — la durée du service réservé est déjà une donnée réelle et
--    configurée par l'institution (paid_services.duree_minutes pour les services
--    payants, institutions.services[].duree_minutes pour l'Offre générale
--    gratuite — vérifié dans ServicesTab.tsx, champ obligatoire dans les deux
--    cas). Elle n'était jamais recopiée sur la ligne rdv elle-même, donc jamais
--    visible côté dashboard institution. Recopiée à la réservation (valeur figée
--    au moment du booking, comme heure_rdv/objet — un changement ultérieur du
--    service ne doit pas modifier rétroactivement un RDV déjà pris).
--
-- 2) description_besoin — la réservation ne demandait jamais au citoyen de
--    décrire son besoin en langage libre (l'objet ne contient que le nom du
--    service). Nouveau champ optionnel, rempli par le citoyen à la réservation.

alter table public.rdv
  add column if not exists duree_minutes integer,
  add column if not exists description_besoin text;

comment on column public.rdv.duree_minutes is 'Durée prévue (minutes), recopiée du service au moment de la réservation. NULL si le service n''en définit pas.';
comment on column public.rdv.description_besoin is 'Description libre du besoin, saisie par le citoyen à la réservation (optionnel).';
