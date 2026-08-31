-- Bug réel trouvé le 06/08/2026 (signalé par Bryan : un établissement avec
-- de vrais avis enregistrés affichait "aucun avis" partout dans l'app).
-- Cause : institutions.moyenne_avis/nb_avis n'ont jamais été recalculées
-- automatiquement — ni trigger DB, ni code applicatif (app/mes-rdv/page.tsx
-- insère directement dans `avis` sans jamais mettre à jour ces deux
-- colonnes). Elles restent donc figées à leur valeur par défaut (0/null)
-- depuis la création de chaque institution, quel que soit le nombre de
-- vrais avis soumis depuis.
--
-- Corrigé par un trigger DB (recalcul systématique, quel que soit le
-- chemin de code qui insère/modifie/supprime un avis à l'avenir — plus
-- fiable qu'un recalcul dispersé côté application). Exclut avis masqués et
-- brouillons du calcul, même règle que partout ailleurs dans le produit
-- ("Avis masqués/brouillons systématiquement exclus des vues institution
-- et de la fiche publique").
CREATE OR REPLACE FUNCTION recalculer_moyenne_avis_institution() RETURNS trigger AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  v_institution_id := COALESCE(NEW.institution_id, OLD.institution_id);
  UPDATE institutions
  SET
    nb_avis = (SELECT COUNT(*) FROM avis WHERE institution_id = v_institution_id AND masque = false AND brouillon = false),
    moyenne_avis = (SELECT COALESCE(ROUND(AVG(note)::numeric, 2), 0) FROM avis WHERE institution_id = v_institution_id AND masque = false AND brouillon = false)
  WHERE id = v_institution_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS avis_recalcul_moyenne_institution ON avis;
CREATE TRIGGER avis_recalcul_moyenne_institution
AFTER INSERT OR DELETE OR UPDATE OF note, masque, brouillon ON avis
FOR EACH ROW EXECUTE FUNCTION recalculer_moyenne_avis_institution();

-- Rattrapage unique : recalcule dès maintenant pour tous les avis déjà
-- soumis avant ce correctif (jamais pris en compte jusqu'ici).
UPDATE institutions i
SET
  nb_avis = sub.cnt,
  moyenne_avis = sub.avg_note
FROM (
  SELECT institution_id, COUNT(*) AS cnt, ROUND(AVG(note)::numeric, 2) AS avg_note
  FROM avis
  WHERE masque = false AND brouillon = false
  GROUP BY institution_id
) sub
WHERE i.id = sub.institution_id;

-- Établissements sans aucun avis valide (jamais eu, ou tous masqués/brouillons) :
-- remis explicitement à zéro pour ne pas garder une ancienne valeur fausse.
UPDATE institutions i
SET nb_avis = 0, moyenne_avis = 0
WHERE NOT EXISTS (
  SELECT 1 FROM avis a WHERE a.institution_id = i.id AND a.masque = false AND a.brouillon = false
);
