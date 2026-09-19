import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Soumission d'une demande de révision de suspension (décision CEO
// 17/08/2026, "Demander une révision"). N'importe quel membre authentifié
// peut soumettre — la contrainte d'unicité (une seule révision en_attente
// par suspension, imposée en base ET vérifiée ici) empêche déjà tout abus
// de double soumission, peu importe qui appuie sur le bouton.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 10) {
    return NextResponse.json({ error: "Merci de détailler votre demande (10 caractères minimum)" }, { status: 400 });
  }

  const { data: inst } = await sb.from("institutions").select("statut").eq("id", membre.institutionId).maybeSingle();
  if (!inst || inst.statut !== "suspendue") {
    return NextResponse.json({ error: "Votre établissement n'est pas suspendu" }, { status: 400 });
  }

  const { data: suspension } = await sb
    .from("institution_suspensions")
    .select("id")
    .eq("institution_id", membre.institutionId)
    .eq("statut", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!suspension) {
    return NextResponse.json({ error: "Aucune suspension active retrouvée — contactez le support" }, { status: 404 });
  }

  const { data: existante } = await sb
    .from("institution_suspension_revisions")
    .select("id")
    .eq("suspension_id", suspension.id)
    .eq("statut", "en_attente")
    .maybeSingle();
  if (existante) {
    return NextResponse.json({ error: "Une révision est déjà en cours d'examen pour cette suspension" }, { status: 409 });
  }

  const { data: revision, error } = await sb
    .from("institution_suspension_revisions")
    .insert({ suspension_id: suspension.id, institution_id: membre.institutionId, message })
    .select("id, reference")
    .single();
  // Filet de sécurité : si deux demandes concurrentes passent la vérification
  // ci-dessus en même temps, l'index unique partiel en base rejette la 2e
  // (erreur 23505) — traduit ici en message clair plutôt qu'un 500 générique.
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Une révision est déjà en cours d'examen pour cette suspension" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await enregistrerAction({
    institutionId: membre.institutionId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "revision_suspension_demandee",
    cibleTable: "institution_suspension_revisions",
    cibleId: revision.id,
    details: { reference: revision.reference },
    req,
  });

  return NextResponse.json({ success: true, reference: revision.reference });
}
