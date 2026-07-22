-- Journal d'activité — Lot C : recherche universelle + filtres serveur.
-- Colonne générée (calculée automatiquement par Postgres à chaque insert,
-- aucun changement requis dans lib/journalActivite.ts) qui concatène les
-- champs texte déjà présents sur la ligne — couvre membre, action, cible,
-- référence d'audit, IP. Ne couvre PAS encore les champs libres embarqués
-- dans "details" au-delà de leur représentation JSON brute (ex. un numéro
-- de téléphone présent dans details sera trouvé, mais pas normalisé/formaté).
ALTER TABLE journal_activite
  ADD COLUMN recherche_texte text GENERATED ALWAYS AS (
    lower(
      coalesce(membre_nom, '') || ' ' ||
      coalesce(action, '') || ' ' ||
      coalesce(cible_table, '') || ' ' ||
      coalesce(audit_id, '') || ' ' ||
      coalesce(ip, '') || ' ' ||
      coalesce(details::text, '')
    )
  ) STORED;

-- Pas d'index dédié pour l'instant (volume actuel très faible, institution_id
-- filtre déjà l'essentiel) — à ajouter (pg_trgm + index GIN) si la table
-- grossit significativement et que la recherche devient lente.
