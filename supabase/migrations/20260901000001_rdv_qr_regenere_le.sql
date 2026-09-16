-- QR gratuit à double expiration (01/09/2026, décision CEO) — remplace la
-- régénération illimitée à expiration 7 jours (sans rapport avec l'heure du
-- RDV) par un cycle borné : le QR expire 30 min après l'heure du RDV s'il
-- n'a pas été scanné, puis UNE seule régénération finale est autorisée,
-- valable 10 min. `qr_regenere_le` trace si cette régénération finale a déjà
-- eu lieu — tant qu'il est NULL, `generate/route.ts` peut encore l'accorder ;
-- une fois posé, le RDV est définitivement plus valide pour ce canal (aucune
-- nouvelle valeur de qr_expires_at n'est plus jamais écrite après ce point,
-- ce qui suffit à bloquer le scan côté validate/route.ts sans logique
-- supplémentaire). Nullable, aucun backfill : les RDV déjà en cours avec un
-- qr_token existant reprennent le nouveau cycle dès leur prochaine
-- génération, sans état intermédiaire à deviner.
ALTER TABLE public.rdv
  ADD COLUMN IF NOT EXISTS qr_regenere_le timestamptz;
