import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";

// Rappel manuel de paiement (Facturation clients V3, 18/09/2026) — un
// vrai scheduler de rappels automatiques configurables est hors de portée
// de cette passe (chantier séparé) ; ce bouton notifie le citoyen
// immédiatement via la table notifications déjà existante, même pattern
// que supabase/functions/rappels-rdv/index.ts.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "facturation.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const { data: facture } = await sb.from("factures").select("id,numero,citoyen_id,montant_ttc,montant_paye,statut").eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!facture) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  if (facture.statut === "payee" || facture.statut === "annulee" || facture.statut === "remboursee") {
    return NextResponse.json({ error: "Cette facture ne nécessite pas de rappel" }, { status: 409 });
  }

  const reste = facture.montant_ttc - facture.montant_paye;
  await sb.from("notifications").insert({
    destinataire_id: facture.citoyen_id, destinataire_type: "citoyen", rdv_id: null,
    type: "facture_rappel", titre: "Rappel de paiement",
    message: `Votre facture ${facture.numero} de ${reste.toLocaleString("fr-FR")} reste à régler.`,
    lu: false,
  });

  await sb.from("facture_evenements").insert({ facture_id: id, type_evenement: "rappel_envoye", membre_id: membre.membreId });

  return NextResponse.json({ ok: true });
}
