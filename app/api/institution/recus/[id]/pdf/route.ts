import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Lot C (reçu Yelen) — route minimale pour rendre le PDF généré
// testable dès ce lot, avant l'écran "Paiements" du Lot D. URL signée à
// durée limitée, même convention que documents-employes/citoyen_documents
// (jamais d'URL publique directe sur un bucket privé).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const { data: recu, error } = await sb
    .from("recus")
    .select("id,institution_id,statut,pdf_storage_path")
    .eq("id", id)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recu) return NextResponse.json({ error: "Reçu introuvable pour cette institution" }, { status: 404 });
  if (!recu.pdf_storage_path) return NextResponse.json({ error: "PDF pas encore disponible pour ce reçu" }, { status: 404 });

  const { data: signed, error: signErr } = await sb.storage.from("recus-paiement").createSignedUrl(recu.pdf_storage_path, 60);
  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });

  return NextResponse.json({ signedUrl: signed.signedUrl });
}
