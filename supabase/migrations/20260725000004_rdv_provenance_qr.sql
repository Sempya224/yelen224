-- Mesure du retour du QR imprimable de l'onglet "Mon code QR"
-- (app/institution/[id]/dashboard/components/CodeQrTab.tsx) — demande
-- Bryan 25/07/2026 : prouver à l'institution la valeur réelle du QR plutôt
-- qu'un simple outil sans chiffres. Le QR pointe toujours vers la fiche
-- (`/institution/[id]?source=qr`, décision Bryan : voir les infos avant de
-- réserver reste important) — `provenance` capture seulement si la
-- réservation qui en découle vient de ce scan (sessionStorage côté citoyen,
-- best-effort, jamais bloquant pour la réservation elle-même).
ALTER TABLE rdv ADD COLUMN provenance text;
ALTER TABLE paid_bookings ADD COLUMN provenance text;
