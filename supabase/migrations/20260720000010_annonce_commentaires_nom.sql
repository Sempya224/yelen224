-- Refonte Communication → Annonces, Lot E3 (commentaires, 16/07/2026)
-- Aucune lecture publique n'existe sur `users` (seule policy : citoyen_own_profile,
-- auth.uid() = id) — impossible de résoudre a posteriori le nom d'un autre
-- citoyen depuis la fiche publique. Le citoyen auteur peut en revanche lire
-- SA PROPRE ligne `users` au moment de poster son commentaire : on capture
-- nom/prénom une fois, à l'insertion, plutôt que d'ouvrir une lecture
-- publique sur `users` (décision Bryan 16/07/2026).
ALTER TABLE annonce_commentaires ADD COLUMN citoyen_nom text;

NOTIFY pgrst, 'reload schema';
