import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { chargerRestrictionActive } from "@/lib/rdvRestrictions";

// Source de vérité structurée pour l'écran de restriction citoyen (décision
// CEO 03/09/2026) — miroir direct de GET /api/institution/suspension (même
// principe : ne jamais faire deviner au front un état qu'il n'a pas
// vraiment, ni inventer une donnée absente).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const restriction = await chargerRestrictionActive(sb, user.id);
  if (!restriction) return NextResponse.json({ restricted: false });

  // "Vos rendez-vous concernés" (brief : uniquement les RDV pertinents pour
  // CETTE restriction, jamais tout l'historique Yelen) — même point de
  // repère (checkpoint) que le trigger citoyen_rdv_evaluer_restriction :
  // le dernier appel accepté sur une clôture de ce citoyen, s'il existe.
  const { data: dernierAppelAccepte } = await sb
    .from("citoyen_rdv_restrictions")
    .select("levee_le")
    .eq("citoyen_id", user.id)
    .eq("niveau", "clos")
    .eq("levee_par", "revision")
    .order("levee_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  const checkpoint = dernierAppelAccepte?.levee_le ?? null;

  let rdvQuery = sb
    .from("rdv")
    .select("id, date_rdv, presence_confirmed_at, institutions!rdv_institution_id_fkey(name)")
    .eq("citoyen_id", user.id)
    .eq("presence_status", "absent")
    .order("presence_confirmed_at", { ascending: false })
    .limit(20);
  if (checkpoint) rdvQuery = rdvQuery.gt("presence_confirmed_at", checkpoint);
  const { data: rdvAbsents } = await rdvQuery;

  type RdvAbsentRow = { id: string; date_rdv: string; presence_confirmed_at: string | null; institutions: { name: string | null } | { name: string | null }[] | null };
  const rendezVousConcernes = ((rdvAbsents ?? []) as unknown as RdvAbsentRow[]).map((r) => {
    const inst = Array.isArray(r.institutions) ? r.institutions[0] : r.institutions;
    return { id: r.id, dateRdv: r.date_rdv, institution: inst?.name ?? "l'établissement" };
  });

  // Appel en cours/traité (uniquement pertinent pour niveau='clos', voir
  // décision produit — la table reste accédée de la même façon quel que
  // soit le niveau, elle est simplement toujours vide pour 7j/30j).
  const { data: appel } = await sb
    .from("citoyen_rdv_appels")
    .select("reference, statut, message, created_at, decision_motif, decision_le")
    .eq("restriction_id", restriction.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    restricted: true,
    reference: restriction.reference,
    niveau: restriction.niveau,
    absencesTotal: restriction.absencesTotal,
    jusquAu: restriction.jusquAu,
    createdAt: restriction.createdAt,
    rendezVousConcernes,
    appel: appel
      ? {
          reference: appel.reference,
          statut: appel.statut,
          message: appel.message,
          createdAt: appel.created_at,
          decisionMotif: appel.decision_motif,
          decisionLe: appel.decision_le,
        }
      : null,
  });
}
