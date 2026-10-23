-- Mission A (22/10/2026) — lien explicite réservation payante <-> RDV jumeau.
-- Avant : le rattachement se faisait par créneau (date + heure), sans citoyen,
-- ce qui pouvait mélanger deux citoyens au même horaire. Désormais
-- paid_bookings.rdv_id pointe directement vers le RDV.
-- Exécutée manuellement en dev par Bryan le 22/10/2026 ; ce fichier consigne
-- le SQL exécuté. Le trigger a été prouvé par une réservation créée après la
-- migration (rdv_id rempli à la création).

-- 1) Colonne + index (non unique : aucune contrainte d'unicité sans accord)
ALTER TABLE public.paid_bookings
  ADD COLUMN IF NOT EXISTS rdv_id uuid REFERENCES public.rdv(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS paid_bookings_rdv_id_idx
  ON public.paid_bookings (rdv_id) WHERE rdv_id IS NOT NULL;

-- 2) Trigger : lie la réservation payante à son RDV jumeau dès la création.
--    SECURITY DEFINER : exception assumée, UPDATE ciblé sur la clé exacte
--    (code de confirmation + citoyen + institution).
CREATE OR REPLACE FUNCTION public.lier_paid_booking_a_rdv() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.qr_token IS NOT NULL THEN
    UPDATE public.paid_bookings
       SET rdv_id = NEW.id
     WHERE rdv_id IS NULL
       AND confirmation_code = NEW.qr_token
       AND citoyen_id = NEW.citoyen_id
       AND institution_id = NEW.institution_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lier_paid_booking_a_rdv ON public.rdv;
CREATE TRIGGER trg_lier_paid_booking_a_rdv
  AFTER INSERT ON public.rdv
  FOR EACH ROW EXECUTE FUNCTION public.lier_paid_booking_a_rdv();

-- 3) Rétro-remplissage prudent : uniquement quand une réservation désigne
--    exactement UN RDV et que ce RDV n'est désigné que par elle.
WITH candidats AS (
  SELECT pb.id AS paid_booking_id, r.id AS rdv_id,
         count(*) OVER (PARTITION BY pb.id) AS nb_rdv,
         count(*) OVER (PARTITION BY r.id)  AS nb_reservations
  FROM public.paid_bookings pb
  JOIN public.rdv r
    ON r.qr_token       = pb.confirmation_code
   AND r.citoyen_id     = pb.citoyen_id
   AND r.institution_id = pb.institution_id
   AND r.date_rdv       = pb.date_rdv
   AND r.heure_rdv      = pb.heure_rdv
  WHERE pb.rdv_id IS NULL
)
UPDATE public.paid_bookings pb
   SET rdv_id = c.rdv_id
  FROM candidats c
 WHERE pb.id = c.paid_booking_id AND c.nb_rdv = 1 AND c.nb_reservations = 1;

-- 4) Retour arrière
-- DROP TRIGGER IF EXISTS trg_lier_paid_booking_a_rdv ON public.rdv;
-- DROP FUNCTION IF EXISTS public.lier_paid_booking_a_rdv();
-- DROP INDEX IF EXISTS public.paid_bookings_rdv_id_idx;
-- ALTER TABLE public.paid_bookings DROP COLUMN IF EXISTS rdv_id;
