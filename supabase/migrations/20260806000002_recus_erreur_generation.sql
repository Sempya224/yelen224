-- Diagnostic — le reçu reste bloqué au statut 'cree' (PDF jamais généré)
-- depuis sa création, confirmé par Bryan via SQL le 06/08/2026 (2 lignes
-- de test, toutes deux sans pdf_storage_path). L'erreur exacte n'était
-- loggée que côté serveur (console.error), difficile à faire remonter.
-- Cette colonne la rend consultable par SQL, sans dépendre du terminal.
-- Nullable, jamais rétroactif sur les lignes déjà en échec (les 2 lignes
-- existantes resteront NULL tant qu'on ne relance pas une génération).
ALTER TABLE recus ADD COLUMN erreur_generation text;
