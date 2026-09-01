import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthenticatedCitoyenId(request: NextRequest): Promise<string | null> {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const user = await verifierCitoyenToken(accessToken);
  return user?.id ?? null;
}

// Lot D — miroir citoyen de app/api/institution/recus/[id]/pdf/route.ts,
// même convention (URL signée 60s, jamais d'URL publique directe sur le
// bucket privé "recus-paiement"), scopé citoyen_id au lieu de institution_id.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const citoyenId = await getAuthenticatedCitoyenId(request);
  if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

  const { id } = await params;
  const { data: recu, error } = await supabaseAdmin
    .from("recus")
    .select("id,citoyen_id,statut,pdf_storage_path")
    .eq("id", id)
    .eq("citoyen_id", citoyenId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recu) return NextResponse.json({ error: "Reçu introuvable" }, { status: 404 });
  if (!recu.pdf_storage_path) return NextResponse.json({ error: "PDF pas encore disponible pour ce reçu" }, { status: 404 });

  const { data: signed, error: signErr } = await supabaseAdmin.storage.from("recus-paiement").createSignedUrl(recu.pdf_storage_path, 60);
  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });

  return NextResponse.json({ signedUrl: signed.signedUrl });
}
