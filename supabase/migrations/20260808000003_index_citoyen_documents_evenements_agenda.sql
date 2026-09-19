-- Durcissement performance (audit "requêtes non bornées", 08/08/2026,
-- décision CEO) : citoyen_documents et evenements_agenda n'avaient aucun
-- index au-delà de leur clé primaire (confirmé par SELECT sur pg_indexes)
-- alors que app/api/institution/documents-citoyen/route.ts et
-- app/api/institution/agenda/route.ts filtrent systématiquement par
-- institution_id. Volume actuel trivial (1 et 4 lignes au moment de
-- l'audit) donc sans impact mesurable aujourd'hui — ajouté par anticipation
-- pendant que c'est gratuit, pas en réaction à un problème observé. Même
-- pattern que idx_rdv_institution (déjà présent, posé hors migrations).
CREATE INDEX idx_citoyen_documents_institution ON citoyen_documents(institution_id);
CREATE INDEX idx_evenements_agenda_institution ON evenements_agenda(institution_id);
