-- Lot A — Fondations messagerie v2 (chantier "Messagerie" du 19/07/2026,
-- décision Bryan) : refonte du flux citoyen↔institution + nouveau canal
-- citoyen↔Yelen / institution↔Yelen (support plateforme, inexistant à ce
-- jour — vérifié par audit exhaustif du code avant d'écrire ce fichier).
--
-- Décision produit tranchée avec Bryan avant cette migration : une
-- conversation citoyen↔institution est désormais scopée à UN rdv précis
-- (messages.rdv_id), pas à la paire (citoyen, institution) comme
-- aujourd'hui. Elle se ferme définitivement dès que ce rdv atteint un
-- statut terminal (termine/annule/refuse) — plus aucun envoi possible des
-- deux côtés. Un nouveau rdv avec la même institution ouvre une
-- conversation neuve ; les anciennes restent visibles en lecture seule
-- dans l'historique (même mirroring que rdvsHistorique dans
-- app/mes-rdv/page.tsx pour la liste des statuts terminaux).

-- ── messages : ajout du scope rdv + support image ──
ALTER TABLE messages ADD COLUMN rdv_id uuid REFERENCES rdv(id) ON DELETE SET NULL;
-- Nullable : les messages existants n'ont aucun moyen fiable d'être
-- rattachés a posteriori à un rdv précis (plusieurs rdv possibles entre
-- les mêmes deux parties, aucune donnée ne permet de trancher sans
-- deviner) — laissés à NULL, traités par l'application comme des
-- conversations historiques figées (lecture seule, jamais rouvertes).
-- Tout nouveau message applicatif doit désormais fournir un rdv_id.
CREATE INDEX idx_messages_rdv_id ON messages(rdv_id);

ALTER TABLE messages ADD COLUMN image_url text;
ALTER TABLE messages ADD COLUMN type text NOT NULL DEFAULT 'texte' CHECK (type IN ('texte', 'image'));
ALTER TABLE messages ADD CONSTRAINT messages_contenu_ou_image CHECK (contenu IS NOT NULL OR image_url IS NOT NULL);

-- Garde-fou en base (pas seulement applicatif) : la policy RLS existante
-- messages_citoyen_own est un ALL sur (auth.uid() = expediteur_citoyen_id
-- OR destinataire_citoyen_id), donc un citoyen pourrait sinon insérer un
-- message avec un rdv_id arbitraire (pas le sien, ou un rdv déjà
-- terminé) en appelant l'API Supabase directement. Ce trigger vérifie que
-- le rdv appartient bien aux deux mêmes parties que le message ET n'est
-- pas dans un état terminal — jamais contourné par un citoyen authentifié,
-- contrairement à une simple vérification côté application. service_role
-- (écriture institution, cf. app/api/institution/messages) reste exempté :
-- déjà validé par citoyenAppartientInstitution() côté route.
CREATE OR REPLACE FUNCTION messages_valider_rdv_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_statut statut_rdv;
  v_citoyen_id uuid;
  v_institution_id uuid;
BEGIN
  IF NEW.rdv_id IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT statut, citoyen_id, institution_id INTO v_statut, v_citoyen_id, v_institution_id
  FROM rdv WHERE id = NEW.rdv_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'messages.rdv_id : rendez-vous introuvable.';
  END IF;
  IF v_citoyen_id IS DISTINCT FROM COALESCE(NEW.expediteur_citoyen_id, NEW.destinataire_citoyen_id) THEN
    RAISE EXCEPTION 'messages.rdv_id : ce rendez-vous n''appartient pas à ce citoyen.';
  END IF;
  IF v_institution_id IS DISTINCT FROM COALESCE(NEW.expediteur_institution_id, NEW.destinataire_institution_id) THEN
    RAISE EXCEPTION 'messages.rdv_id : ce rendez-vous ne concerne pas cette institution.';
  END IF;
  IF v_statut IN ('termine', 'annule', 'refuse') THEN
    RAISE EXCEPTION 'Ce rendez-vous est terminé — la conversation est fermée, aucun nouvel envoi n''est possible.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_valider_rdv_conversation_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_valider_rdv_conversation();

-- ── messages_yelen_citoyen : conversation citoyen ↔ support Yelen ──
-- Distincte de `messages` (qui reste réservée à citoyen ↔ institution) :
-- pas d'institution partie prenante, jamais fermée (contrairement à une
-- conversation liée à un rdv), toujours ouverte à l'envoi côté citoyen.
CREATE TABLE messages_yelen_citoyen (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expediteur text NOT NULL CHECK (expediteur IN ('citoyen', 'yelen')),
  admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL, -- admin ayant répondu côté Yelen, NULL si expediteur='citoyen'
  contenu text,
  image_url text,
  type text NOT NULL DEFAULT 'texte' CHECK (type IN ('texte', 'image')),
  lu boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CHECK (contenu IS NOT NULL OR image_url IS NOT NULL)
);
ALTER TABLE messages_yelen_citoyen ENABLE ROW LEVEL SECURITY;

-- RLS façon `avis`/`rdv` (auth.uid() = citoyen_id), pas le style
-- service_role-only des tables de sécurité : un message n'est pas un
-- secret, et le citoyen doit pouvoir écrire directement (cohérent avec
-- messages_citoyen_own déjà en place). Pas de policy DELETE (aucun besoin
-- de suppression aujourd'hui) : RLS refuse par défaut.
CREATE POLICY messages_yelen_citoyen_select ON messages_yelen_citoyen
  FOR SELECT USING (auth.uid() = citoyen_id);
CREATE POLICY messages_yelen_citoyen_insert ON messages_yelen_citoyen
  FOR INSERT WITH CHECK (auth.uid() = citoyen_id);
CREATE POLICY messages_yelen_citoyen_update ON messages_yelen_citoyen
  FOR UPDATE USING (auth.uid() = citoyen_id) WITH CHECK (auth.uid() = citoyen_id);

-- Garde-fous : un citoyen possède (au sens RLS) aussi bien ses propres
-- messages que les réponses de Yelen dans son fil (même citoyen_id) — sans
-- ces triggers il pourrait usurper l'identité "yelen"/un admin à l'insert,
-- ou altérer une réponse déjà reçue en la faisant passer pour un update de
-- lecture. service_role (routes admin) reste exempté.
CREATE OR REPLACE FUNCTION messages_yelen_citoyen_proteger_identite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (NEW.expediteur <> 'citoyen' OR NEW.admin_id IS NOT NULL) THEN
    RAISE EXCEPTION 'messages_yelen_citoyen : seul le support Yelen (service_role) peut envoyer en tant que "yelen".';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_yelen_citoyen_proteger_identite_trigger
  BEFORE INSERT ON messages_yelen_citoyen
  FOR EACH ROW EXECUTE FUNCTION messages_yelen_citoyen_proteger_identite();

CREATE OR REPLACE FUNCTION messages_yelen_citoyen_proteger_contenu() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (
    NEW.contenu IS DISTINCT FROM OLD.contenu OR NEW.image_url IS DISTINCT FROM OLD.image_url
    OR NEW.type IS DISTINCT FROM OLD.type OR NEW.expediteur IS DISTINCT FROM OLD.expediteur
    OR NEW.admin_id IS DISTINCT FROM OLD.admin_id OR NEW.citoyen_id IS DISTINCT FROM OLD.citoyen_id
  ) THEN
    RAISE EXCEPTION 'messages_yelen_citoyen : seule la colonne "lu" est modifiable après envoi.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_yelen_citoyen_proteger_contenu_trigger
  BEFORE UPDATE ON messages_yelen_citoyen
  FOR EACH ROW EXECUTE FUNCTION messages_yelen_citoyen_proteger_contenu();

-- ── messages_yelen_institution : conversation institution ↔ support Yelen ──
-- Auth institution = JWT custom, pas Supabase Auth (cf. CLAUDE.md /auth) :
-- RLS activé, AUCUNE policy, comme documents_institution/citoyen_documents
-- — accès exclusivement service_role, autorisation vérifiée côté route API
-- (getAuthenticatedMembre + permission).
CREATE TABLE messages_yelen_institution (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL, -- membre ayant envoyé, NULL si expediteur='yelen'
  expediteur text NOT NULL CHECK (expediteur IN ('institution', 'yelen')),
  admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  contenu text,
  image_url text,
  type text NOT NULL DEFAULT 'texte' CHECK (type IN ('texte', 'image')),
  lu boolean NOT NULL DEFAULT false,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CHECK (contenu IS NOT NULL OR image_url IS NOT NULL)
);
ALTER TABLE messages_yelen_institution ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_messages_yelen_citoyen_citoyen ON messages_yelen_citoyen(citoyen_id, cree_le);
CREATE INDEX idx_messages_yelen_institution_institution ON messages_yelen_institution(institution_id, cree_le);

-- ⚠️ ACTION REQUISE DE BRYAN avant tout test d'envoi d'image : créer
-- manuellement un bucket Storage PRIVÉ nommé "messagerie-images" dans le
-- dashboard Supabase (Storage > New bucket, "Public" décoché) — mirroring
-- le bucket privé "documents-citoyens" (URLs signées à durée limitée,
-- jamais d'URL publique directe pour une image échangée en conversation
-- privée).
