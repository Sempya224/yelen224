-- Course entre deux soumissions concurrentes du même numéro à l'inscription
-- citoyen (double appel client sur /api/citoyen/auth/register, corrigé le
-- 11/09/2026 côté app/inscription/page.tsx) : sans contrainte unique, les
-- deux requêtes passaient le SELECT "déjà enregistré" avant que l'une des
-- deux n'insère, créant un risque de doublon. Absence de doublon existant
-- vérifiée par Bryan avant cette migration (SELECT phone, COUNT(*) ... HAVING
-- COUNT(*) > 1 → 0 ligne).
alter table public.users
  add constraint users_phone_unique unique (phone);
