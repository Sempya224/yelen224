import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { estRecent, suggestionDemarcheTerminee, suggestionAvisPositif, type PostSuggestion } from "@/lib/postSuggestions";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Suggestions de publication du composeur Communauté (22/08/2026) —
// dérivées de la vraie activité du citoyen (voir lib/postSuggestions.ts),
// même convention auth que app/api/citoyen/activites/route.ts.
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const user = await verifierCitoyenToken(accessToken);
    if (!user) return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    const citoyenId = user.id;

    const [{ data: demarches }, { data: avisRows }] = await Promise.all([
      supabaseAdmin.from("citoyen_demarches").select("id,titre,statut,termine_le").eq("citoyen_id", citoyenId).eq("statut", "terminee").not("termine_le", "is", null),
      supabaseAdmin.from("avis").select("id,institution_id,note,titre,commentaire,created_at").eq("citoyen_id", citoyenId).eq("brouillon", false).gte("note", 4),
    ]);

    const suggestions: PostSuggestion[] = [];

    for (const d of demarches ?? []) {
      if (d.termine_le && estRecent(d.termine_le)) {
        suggestions.push(suggestionDemarcheTerminee({ id: d.id, titre: d.titre, termine_le: d.termine_le }));
      }
    }

    const avisRecents = (avisRows ?? []).filter(a => estRecent(a.created_at));
    if (avisRecents.length > 0) {
      const institutionIds = [...new Set(avisRecents.map(a => a.institution_id))];
      const { data: institutions } = await supabaseAdmin.from("institutions").select("id,name").in("id", institutionIds);
      const instMap = new Map((institutions ?? []).map(i => [i.id, i.name]));
      for (const a of avisRecents) {
        suggestions.push(suggestionAvisPositif({
          id: a.id, institutionNom: instMap.get(a.institution_id) ?? "cet établissement",
          note: a.note, commentaire: a.commentaire, titre: a.titre, createdAt: a.created_at,
        }));
      }
    }

    suggestions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    console.error("[CITOYEN POST SUGGESTIONS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
