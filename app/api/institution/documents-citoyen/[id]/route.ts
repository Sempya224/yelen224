import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Documents clients — Lot 1 (case management, 09/08/2026). Socle backend
// pour l'écran détail (Lot 3) : document + historique d'événements
// d'audit (document_events).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "documents-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  // Lot 5 (audit sécurité 09/08/2026) : select explicite plutôt que "*" —
  // "*" renvoyait ip/user_agent/url (document_events) et url (interne,
  // chemin Storage) au navigateur institution sans jamais être consommés
  // par l'UI, exposition PII inutile (IP réelle du citoyen/du membre à
  // chaque événement) au-delà du strict nécessaire à l'écran.
  const { data: document, error } = await sb.from("citoyen_documents")
    .select("id,institution_id,citoyen_id,rdv_id,sens,type,label,description,statut,taille,type_mime,created_at,traite_le,date_limite,motif_refus,motif_refus_detail,remplace_document_id,demande_par_membre_id,rdv(date_rdv,objet)")
    .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });

  const { data: citoyenRow } = await sb.from("users").select("nom,prenom,phone").eq("id", document.citoyen_id).maybeSingle();
  const citoyen_nom = citoyenRow ? [citoyenRow.prenom, citoyenRow.nom].filter(Boolean).join(" ") || citoyenRow.phone : "Citoyen";

  const { data: events } = await sb.from("document_events")
    .select("id,audit_id,type,acteur_type,membre_nom,commentaire,created_at")
    .eq("document_id", id).order("created_at", { ascending: true });

  return NextResponse.json({ document: { ...document, citoyen_nom }, events: events ?? [] });
}
