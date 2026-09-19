-- Rôles personnalisés — restriction d'un rôle de base (16/09/2026, choix
-- délibéré après audit : 166 sites d'appel de can()/canAccessTab() dans le
-- code existant, tous synchrones sur un rôle fixe parmi 5 — une refonte
-- complète en rôles indépendants aurait exigé de les toucher un par un.
-- Ici : un membre garde un rôle système (admin/agent/comptable/superviseur/
-- dirigeant) mais peut se voir RETIRER certains domaines (jamais en
-- ajouter). NULL/tableau vide = aucune restriction = comportement
-- strictement identique à aujourd'hui pour tout membre existant.
ALTER TABLE institution_membres ADD COLUMN acces_restreints jsonb;
