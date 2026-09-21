import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Détail complet d'une facture client (lignes + paiements + activité) —
// remplace le paramètre ?id= de la route liste (Facturation clients V3,
// 18/09/2026).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "facturation", membre.accesRestreints) === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { data: facture, error } = await sb
    .from("factures")
    .select("id,numero,statut,cree_depuis,citoyen_id,created_at,date_echeance,montant_ht,taux_taxe,montant_ttc,montant_paye,users(nom,prenom,phone,email)")
    .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!facture) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });

  const [{ data: lignesRaw }, { data: paiementsRaw }, { data: evenementsRaw }] = await Promise.all([
    sb.from("facture_lignes").select("id,description,quantite,prix_unitaire,remise,montant_total,ordre").eq("facture_id", id).order("ordre", { ascending: true }),
    sb.from("facture_paiements").select("id,montant,methode,date_paiement,reference,note,preuve_url,institution_membres(prenom,nom)").eq("facture_id", id).order("date_paiement", { ascending: false }),
    sb.from("facture_evenements").select("id,type_evenement,details,created_at,institution_membres(prenom,nom)").eq("facture_id", id).order("created_at", { ascending: false }),
  ]);

  const users = facture.users as unknown as { nom: string | null; prenom: string | null; phone: string | null; email: string | null } | null;
  const nomMembre = (m: { prenom: string | null; nom: string | null } | null) => m ? [m.prenom, m.nom].filter(Boolean).join(" ").trim() || null : null;

  const LIBELLES_EVENEMENT: Record<string, string> = {
    creee: "Facture créée", envoyee: "Facture envoyée au client", paiement_recu: "Paiement reçu",
    rappel_envoye: "Rappel envoyé", annulee: "Facture annulée", remboursee: "Facture remboursée",
  };

  return NextResponse.json({
    facture: {
      id: facture.id, numero: facture.numero, statut: facture.statut, creeDepuis: facture.cree_depuis, citoyenId: facture.citoyen_id,
      citoyenNom: [users?.prenom, users?.nom].filter(Boolean).join(" ").trim() || users?.phone || "Client",
      citoyenPhone: users?.phone ?? null, citoyenEmail: users?.email ?? null,
      dateEmission: facture.created_at, dateEcheance: facture.date_echeance, montantHt: facture.montant_ht, tauxTaxe: facture.taux_taxe,
      montantTtc: facture.montant_ttc, montantPaye: facture.montant_paye, createdAt: facture.created_at,
      lignes: (lignesRaw ?? []).map((l: { id: string; description: string; quantite: number; prix_unitaire: number; remise: number; montant_total: number; ordre: number }) => ({
        id: l.id, description: l.description, quantite: l.quantite, prixUnitaire: l.prix_unitaire, remise: l.remise, montantTotal: l.montant_total, ordre: l.ordre,
      })),
      paiements: (paiementsRaw ?? []).map((p: { id: string; montant: number; methode: string; date_paiement: string; reference: string | null; note: string | null; preuve_url: string | null; institution_membres: { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null }) => ({
        id: p.id, montant: p.montant, methode: p.methode, datePaiement: p.date_paiement, reference: p.reference, note: p.note, preuveUrl: p.preuve_url,
        enregistreParNom: nomMembre(Array.isArray(p.institution_membres) ? p.institution_membres[0] ?? null : p.institution_membres),
      })),
      evenements: (evenementsRaw ?? []).map((e: { id: string; type_evenement: string; details: unknown; created_at: string; institution_membres: { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null }) => ({
        id: e.id, type: e.type_evenement, libelle: LIBELLES_EVENEMENT[e.type_evenement] ?? e.type_evenement, date: e.created_at,
        auteurNom: nomMembre(Array.isArray(e.institution_membres) ? e.institution_membres[0] ?? null : e.institution_membres),
      })),
    },
  });
}
