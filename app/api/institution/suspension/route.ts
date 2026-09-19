import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Source de vérité structurée pour l'écran "Espace suspendu" (décision CEO
// 17/08/2026) — remplace le mécanisme provisoire qui relisait le texte de
// la dernière notification. Voir migration
// 20260817000001_institution_suspensions_revisions.sql.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: inst } = await sb.from("institutions").select("statut").eq("id", membre.institutionId).maybeSingle();
  if (!inst || inst.statut !== "suspendue") {
    return NextResponse.json({ suspended: false });
  }

  const { data: suspension } = await sb
    .from("institution_suspensions")
    .select("id, motif, reference, created_at, jusqu_au")
    .eq("institution_id", membre.institutionId)
    .eq("statut", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!suspension) {
    // Institution suspendue avant ce chantier (jamais tracée dans
    // institution_suspensions) — aucune donnée structurée disponible,
    // l'écran doit rester honnête plutôt que d'inventer un motif.
    return NextResponse.json({ suspended: true, motif: null, reference: null, createdAt: null, jusquAu: null, revision: null });
  }

  const { data: revision } = await sb
    .from("institution_suspension_revisions")
    .select("reference, statut, message, created_at, decision_motif, decision_le")
    .eq("suspension_id", suspension.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    suspended: true,
    motif: suspension.motif,
    reference: suspension.reference,
    createdAt: suspension.created_at,
    jusquAu: suspension.jusqu_au,
    revision: revision ? {
      reference: revision.reference,
      statut: revision.statut,
      message: revision.message,
      createdAt: revision.created_at,
      decisionMotif: revision.decision_motif,
      decisionLe: revision.decision_le,
    } : null,
  });
}
