-- Migration : ajoute l'état "nouveau" au cycle de vie du RDV (demande
-- soumise par un citoyen, pas encore examinée par l'institution) — distinct
-- de "en_attente" qui signifie désormais "accepté par l'institution, en
-- attente du jour J" (cf. handleAccept dans le dashboard institution).
-- "absent" n'est PAS ajouté ici : la présence réelle du citoyen est déjà
-- suivie par la colonne rdv.presence_status (texte libre, alimentée par le
-- scan QR, cf. app/api/qr/validate/route.ts) — pas par l'enum statut_rdv.
ALTER TYPE statut_rdv ADD VALUE 'nouveau';
