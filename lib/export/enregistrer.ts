// Enregistrement d'un export (module d'export commun, 24/10/2026).
//
// Ordre : lecture de la clé (échec explicite) → réservation de la référence
// → empreinte et signature de l'enveloppe complète (qui contient la référence
// et la date) → insertion BLOQUANTE dans `exports` → journal d'activité NON
// bloquant. Sans ligne dans `exports`, aucun document n'est livré : l'appelant
// doit laisser remonter l'erreur et répondre 500 « Export indisponible ».
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enregistrerAction } from "@/lib/journalActivite";
import { calculerHashContenu, normaliserValeur, type EnveloppeExport } from "./canonique";
import { lireCleSignature, signerHash } from "./signature";

export class ErreurEnregistrementExport extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurEnregistrementExport";
  }
}

export type DemandeEnregistrementExport = {
  institutionId: string;
  auteurId: string | null;
  auteurNom: string;
  role: string;
  type: string;
  format: string;
  // Écran d'origine (ex. "journal", "transactions").
  ecran: string;
  filtres: Record<string, unknown>;
  versionGabarit: string;
  // Lignes EXACTEMENT telles qu'exportées dans le fichier (valeurs après
  // masquage éventuel) : c'est ce qui est signé.
  lignes: Record<string, unknown>[];
  // Action du journal d'activité (ex. "export_journal"). Une action absente de
  // lib/journalTaxonomie.ts est rangée en catégorie « autre ».
  actionJournal: string;
  req?: NextRequest;
};

export type ExportEnregistre = {
  id: string;
  reference: string;
  hash: string;
  signature: string;
  creeLe: string;
  nbLignes: number;
  cleVersion: number;
  // Enveloppe signée, pour produire l'annexe « Données certifiées ».
  enveloppe: EnveloppeExport;
};

// Client service_role créé à l'usage (et non à l'import) : les modules de
// signature et de canonisation restent importables sans variables Supabase.
function clientServeur() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// Export préparé : référence réservée, empreinte et signature calculées, RIEN encore
// écrit dans `exports`. Permet de rendre le fichier d'abord (avec référence et
// empreinte), puis de confirmer l'enregistrement : un rendu qui échoue ne laisse
// aucun export enregistré sans fichier livré (seule la référence réservée est
// perdue : un trou de séquence, sans conséquence). Le contenu signé ne dépend pas du
// rendu, seulement des lignes, de la référence et de la date.
export type ExportPrepare = Omit<ExportEnregistre, "id"> & { confirmer: () => Promise<ExportEnregistre> };

// Ordre classique : préparer puis confirmer immédiatement (utilisé par le Journal).
export async function enregistrerExport(p: DemandeEnregistrementExport): Promise<ExportEnregistre> {
  return (await preparerExport(p)).confirmer();
}

export async function preparerExport(p: DemandeEnregistrementExport): Promise<ExportPrepare> {
  // Lève ErreurCleSignature (variable absente, vide ou trop courte) AVANT toute
  // écriture : pas de référence consommée pour un export qui ne peut pas être signé.
  const { cle, version } = lireCleSignature();
  const sb = clientServeur();

  const { data: reference, error: refErr } = await sb.rpc("exports_generer_reference");
  if (refErr || typeof reference !== "string") {
    console.error("[Export] Réservation de référence impossible:", refErr?.code);
    throw new ErreurEnregistrementExport("Export indisponible");
  }

  const creeLe = new Date().toISOString();
  // Les filtres sont normalisés une fois : ce qui est stocké, signé et
  // journalisé est identique.
  const filtres = normaliserValeur(p.filtres) as Record<string, unknown> | null ?? {};
  const enveloppe: EnveloppeExport = {
    reference, type: p.type, format: p.format, institution_id: p.institutionId, auteur_id: p.auteurId,
    role: p.role, filtres, nb_lignes: p.lignes.length, version_gabarit: p.versionGabarit, cree_le: creeLe, lignes: p.lignes,
  };
  const hash = calculerHashContenu(enveloppe);
  const signature = signerHash(hash, cle);

  const confirmer = async (): Promise<ExportEnregistre> => {
    const { data: ligne, error: insErr } = await sb
      .from("exports")
      .insert({
        reference, institution_id: p.institutionId, auteur_id: p.auteurId, auteur_nom: p.auteurNom, role: p.role,
        type: p.type, format: p.format, ecran: p.ecran, filtres, nb_lignes: p.lignes.length,
        version_gabarit: p.versionGabarit, hash_contenu: hash, signature_hmac: signature, cle_version: version, cree_le: creeLe,
      })
      .select("id")
      .single();
    if (insErr || !ligne) {
      console.error("[Export] Insertion impossible:", insErr?.code);
      throw new ErreurEnregistrementExport("Export indisponible");
    }

    // Non bloquant (enregistrerAction ne lève jamais) : la preuve de l'export
    // est déjà dans `exports`, le journal d'activité n'en est que le reflet.
    await enregistrerAction({
      institutionId: p.institutionId,
      membreId: p.auteurId,
      membreNom: p.auteurNom,
      action: p.actionJournal,
      cibleTable: "exports",
      cibleId: ligne.id,
      details: { reference, ecran: p.ecran, format: p.format, nb_lignes: p.lignes.length, filtres, hash },
      req: p.req,
    });

    return { id: ligne.id, reference, hash, signature, creeLe, nbLignes: p.lignes.length, cleVersion: version, enveloppe };
  };

  return { reference, hash, signature, creeLe, nbLignes: p.lignes.length, cleVersion: version, enveloppe, confirmer };
}
