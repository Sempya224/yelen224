-- Verrouillage persistant par compte institution (revue critique 30/08/2026,
-- même jour) — régression trouvée pendant la revue : le remplacement des
-- Map en mémoire par institutionId (pin/verify, verify-otp,
-- webauthn/auth-verify — 5 échecs / 5-15 min chacune) par le throttle
-- partagé device+IP (lib/security/authSecurity.ts) a supprimé toute
-- protection PAR COMPTE sans la remplacer : le cookie device est
-- entièrement contrôlé par le client (non envoyé = nouvel appareil), donc
-- un attaquant qui vise UNE institution précise peut faire tourner
-- device/IP à chaque tentative et ne jamais déclencher de blocage pour
-- cette institution, contrairement à avant.
--
-- Solution : un verrou partagé entre les 3 facteurs de connexion
-- institution (PIN/OTP/WebAuthn — ils authentifient le même compte, un
-- attaquant qui bascule entre facteurs ne doit pas repartir à zéro),
-- complémentaire au throttle device+IP existant, pas un remplacement —
-- même principe de défense en profondeur que membre/login.ts
-- (institution_membres.failed_attempts/locked_until) et employee_credentials.
-- Seuil : 5 échecs / 15 min, le plus strict des 3 anciens (celui du PIN,
-- la plus faible entropie des trois facteurs).

ALTER TABLE institutions ADD COLUMN login_failed_attempts int NOT NULL DEFAULT 0;
ALTER TABLE institutions ADD COLUMN login_locked_until timestamptz;
