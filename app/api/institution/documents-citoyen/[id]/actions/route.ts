import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can, canAccessTab } from "@/lib/institutionPermissions";
import { commencerVerification, validerDocument, refuserDocument, archiverDocument, creerDemande } from "@/lib/citoyenDocuments";
import { isDocumentMotifRefus } from "@/lib/citoyenDocumentsConstants";

// Documents clients — Lot 1 (case management, 09/08/2026). Un seul POST
// discriminé par `action` — même forme que
// app/api/institution/signalements/[id]/actions/route.ts. Chaque branche
// appelle le helper lib/citoyenDocuments.ts correspondant, jamais
// d'écriture directe dans cette route.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  // Lot 5 (audit sécurité 09/08/2026) : gate d'onglet ajoutée en défense en
  // profondeur — jusque-là seule can(role, "documents_clients.*") filtrait
  // plus bas, ce qui laissait un agent/dirigeant (onglet "none") distinguer
  // "ce document existe dans mon institution" (403) de "n'existe pas" (404)
  // avant même d'atteindre le check d'action. Aucune action réelle
  // possible dans les deux cas, mais coupé au même point que les autres
  // routes de ce module.
  if (canAccessTab(membre.role, "documents-clients") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  const { data: document } = await sb.from("citoyen_documents").select("id, citoyen_id, rdv_id, type, label, description")
    .eq("id", id).eq("institution_id", membre.institutionId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document introuvable pour cette institution" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const action = body?.action;

  const { data: membreRow } = await sb.from("institution_membres").select("prenom, nom").eq("id", membre.membreId).maybeSingle();
  const parMembre = { id: membre.membreId, nom: membreRow ? `${membreRow.prenom} ${membreRow.nom}` : "Membre" };

  if (action === "verifier") {
    if (!can(membre.role, "documents_clients.verify")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
    const resultat = await commencerVerification({ documentId: id, parMembre, req });
    return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
  }

  if (action === "valider") {
    if (!can(membre.role, "documents_clients.verify")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
    const resultat = await validerDocument({ documentId: id, parMembre, req });
    return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
  }

  if (action === "refuser") {
    if (!can(membre.role, "documents_clients.verify")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
    const motifRefus = body?.motifRefus;
    const motifRefusDetail = typeof body?.motifRefusDetail === "string" ? body.motifRefusDetail : null;
    if (typeof motifRefus !== "string" || !isDocumentMotifRefus(motifRefus)) {
      return NextResponse.json({ error: "motifRefus invalide" }, { status: 400 });
    }
    const resultat = await refuserDocument({ documentId: id, motifRefus, motifRefusDetail, parMembre, req });
    if (!resultat.ok) return NextResponse.json({ error: resultat.error }, { status: 400 });

    // Refus → nouvelle demande (brief §12/14) : optionnel, demandé
    // explicitement par l'appelant plutôt que systématique (un refus n'a
    // pas toujours vocation à être redemandé immédiatement).
    let nouvelleDemandeId: string | null = null;
    if (body?.creerNouvelleDemande === true) {
      const nouvelle = await creerDemande({
        institutionId: membre.institutionId, citoyenId: document.citoyen_id, rdvId: document.rdv_id,
        type: document.type, label: document.label, description: document.description,
        remplaceDocumentId: id, demandeParMembreId: membre.membreId,
        acteur: { type: "membre", id: membre.membreId, nom: parMembre.nom }, req,
      });
      if (nouvelle.ok) nouvelleDemandeId = nouvelle.id;
    }
    return NextResponse.json({ ok: true, nouvelleDemandeId });
  }

  if (action === "archiver") {
    if (!can(membre.role, "documents_clients.archive")) return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
    const resultat = await archiverDocument({ documentId: id, parMembre, req });
    return resultat.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: resultat.error }, { status: 400 });
  }

  return NextResponse.json({ error: "action invalide (verifier, valider, refuser, archiver)" }, { status: 400 });
}
