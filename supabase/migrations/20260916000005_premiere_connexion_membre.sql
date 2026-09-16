-- Sas de confiance de première connexion pour les membres invités
-- (16/09/2026). Trois besoins réels identifiés en auditant le flux
-- existant (MembreLoginSection.tsx) : tracer qui a créé le compte,
-- prouver un consentement réellement daté (mirroring users.cgu_acceptee_le
-- côté citoyen), et donner à l'institution un vrai signal si un membre
-- indique ne pas reconnaître l'organisation qui l'a invité.

alter table institution_membres
  add column if not exists invite_par_membre_id uuid references institution_membres(id) on delete set null,
  add column if not exists relation_confirmee_le timestamptz,
  add column if not exists cgu_acceptee_le timestamptz;

comment on column institution_membres.invite_par_membre_id is
  'Membre (souvent admin) ayant créé ce compte — nullable, absent pour tout compte créé avant cette migration.';
comment on column institution_membres.relation_confirmee_le is
  'Horodatage de la confirmation "je reconnais cette organisation" au premier accès.';
comment on column institution_membres.cgu_acceptee_le is
  'Horodatage de l''acceptation des CGU/politique de confidentialité au premier accès.';
