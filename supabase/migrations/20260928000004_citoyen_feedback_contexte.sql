-- "Tous les projets" ? — mini Help Center + feedback contextualisé (brief
-- Bryan 28/09/2026). Réutilise citoyen_feedback (20260824000001) plutôt
-- qu'une nouvelle table : ajoute seulement de quoi qualifier le retour
-- (type) et capturer automatiquement le contexte (écran, filtres actifs,
-- nombre de projets affichés) sans le demander à l'utilisateur. `type`
-- reste text libre (pas d'enum Postgres), comme le reste de cette table —
-- nullable pour ne jamais casser les lignes déjà envoyées depuis
-- /compte/feedback (aucun type, aucun contexte).
ALTER TABLE citoyen_feedback ADD COLUMN type text;
ALTER TABLE citoyen_feedback ADD COLUMN contexte jsonb;
