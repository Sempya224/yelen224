// Documents requis pour la vérification d'une institution — indexés
// uniquement sur institutions.statut_juridique (jamais secteur, décision
// tranchée). Source unique de vérité partagée par la route API
// (validation serveur du `type` soumis) et l'écran client (affichage).
// Les labels ne sont jamais stockés en base — dérivés d'ici à chaque
// lecture pour éviter toute staleness.

export type DocumentTypeSlug =
  | "nomination_habilitation"
  | "rccm"
  | "piece_identite"
  | "diplome_ordre"
  | "preuve_domicile"
  | "immatriculation_etrangere";

export interface DocumentRequirement {
  type: DocumentTypeSlug;
  label: string;
  description: string;
  formats: string;
  obligatoire: boolean;
}

export const DOCUMENTS_PAR_STATUT_JURIDIQUE: Record<string, DocumentRequirement[]> = {
  public: [
    {
      type: "nomination_habilitation",
      label: "Acte de nomination ou habilitation",
      description: "Document officiel attestant la nomination du responsable ou l'habilitation de la structure publique.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  prive_formel: [
    {
      type: "rccm",
      label: "Registre de Commerce (RCCM)",
      description: "Extrait du registre de commerce et du crédit mobilier.",
      formats: "PDF",
      obligatoire: true,
    },
    {
      type: "piece_identite",
      label: "Pièce d'identité du responsable",
      description: "Carte d'identité, passeport ou carte de résident du responsable de l'établissement.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  liberal: [
    {
      type: "diplome_ordre",
      label: "Diplôme et inscription à l'ordre professionnel",
      description: "Copie du diplôme et attestation d'inscription à l'ordre professionnel concerné.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
    {
      type: "piece_identite",
      label: "Pièce d'identité du responsable",
      description: "Carte d'identité, passeport ou carte de résident du responsable de l'établissement.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  individuel_informel: [
    {
      type: "piece_identite",
      label: "Pièce d'identité du responsable",
      description: "Carte d'identité, passeport ou carte de résident du responsable de l'établissement.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
    {
      type: "preuve_domicile",
      label: "Preuve de domicile",
      description: "Facture récente, attestation de résidence ou tout document prouvant l'adresse d'exercice.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
};

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png"];

export function getRequiredDocuments(statutJuridique: string | null | undefined): DocumentRequirement[] {
  if (!statutJuridique) return [];
  return DOCUMENTS_PAR_STATUT_JURIDIQUE[statutJuridique] || [];
}

// Chantier Taxonomie des activités (Phase 4, 20/08/2026) — documents requis
// EN PLUS de ceux dérivés de statut_juridique ci-dessus, uniquement pour une
// institution origine_type='etrangere'. Décision CEO du 20/08/2026 (spec
// §3ter.1) : aucune exigence administrative uniforme pour toute organisation
// étrangère — seul le justificatif d'immatriculation à l'étranger est
// formalisé ici comme document à déposer. Les preuves "d'activité réelle
// vers le marché guinéen" / "de mandat de représentation" citées par la
// spec pour certains statuts de présence restent un examen manuel au cas
// par cas côté admin (dossier de vérification), jamais un nouveau type de
// document inventé sans base réelle. `filiale` reçoit en plus son RCCM
// guinéen via le mécanisme existant (statut_juridique=prive_formel,
// DOCUMENTS_PAR_STATUT_JURIDIQUE ci-dessus, inchangé) — pas dupliqué ici.
export const DOCUMENTS_INTERNATIONAUX_PAR_STATUT_PRESENCE: Record<string, DocumentRequirement[]> = {
  societe_guineenne_groupe_etranger: [],
  filiale: [
    {
      type: "immatriculation_etrangere",
      label: "Immatriculation de la société mère à l'étranger",
      description: "Extrait du registre du commerce (ou équivalent) de la société mère dans son pays d'origine.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  succursale: [
    {
      type: "immatriculation_etrangere",
      label: "Immatriculation de la maison mère à l'étranger",
      description: "Extrait du registre du commerce (ou équivalent) de la maison mère dans son pays d'origine.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  bureau_representation: [
    {
      type: "immatriculation_etrangere",
      label: "Immatriculation de l'organisation à l'étranger",
      description: "Extrait du registre du commerce (ou équivalent) dans le pays d'origine. La preuve d'existence du bureau en Guinée (bail, autorisation d'ouverture) est examinée manuellement par l'équipe de vérification, hors dépôt de fichier standard.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  prestataire_depuis_etranger: [
    {
      type: "immatriculation_etrangere",
      label: "Immatriculation de l'organisation à l'étranger",
      description: "Extrait du registre du commerce (ou équivalent) dans le pays d'origine. La preuve d'activité réelle vers le marché guinéen (contrat, client, partenaire local) est examinée manuellement par l'équipe de vérification, hors dépôt de fichier standard.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  partenariat_representation_locale: [
    {
      type: "immatriculation_etrangere",
      label: "Immatriculation du mandant à l'étranger",
      description: "Extrait du registre du commerce (ou équivalent) du mandant dans son pays d'origine. La preuve du mandat de représentation est examinée manuellement par l'équipe de vérification, hors dépôt de fichier standard.",
      formats: "PDF, JPG, PNG",
      obligatoire: true,
    },
  ],
  autre_a_verifier: [],
};

export function getRequiredDocumentsInternational(statutPresenceGuinee: string | null | undefined): DocumentRequirement[] {
  if (!statutPresenceGuinee) return [];
  return DOCUMENTS_INTERNATIONAUX_PAR_STATUT_PRESENCE[statutPresenceGuinee] || [];
}
