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
  | "preuve_domicile";

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
