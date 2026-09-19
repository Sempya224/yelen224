import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";
import { chargerRestrictionActive } from "@/lib/rdvRestrictions";

// Soumission d'une demande de "Faire appel" (décision CEO 03/09/2026) —
// miroir de POST /api/institution/suspension/revision. Disponible
// UNIQUEMENT sur une restriction niveau='clos' (jamais 7j/30j, décision
// produit explicite : la contestation ne concerne que la clôture
// définitive, section 12 du brief).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(request: NextRequest) {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const user = await verifierCitoyenToken(accessToken);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 10) {
    return NextResponse.json({ error: "Merci de détailler votre demande (10 caractères minimum)" }, { status: 400 });
  }

  const restriction = await chargerRestrictionActive(sb, user.id);
  if (!restriction || restriction.niveau !== "clos") {
    return NextResponse.json({ error: "Aucune clôture active retrouvée pour votre compte" }, { status: 400 });
  }

  const { data: existant } = await sb
    .from("citoyen_rdv_appels")
    .select("id")
    .eq("restriction_id", restriction.id)
    .eq("statut", "en_attente")
    .maybeSingle();
  if (existant) {
    return NextResponse.json({ error: "Une demande est déjà en cours d'examen pour cette clôture" }, { status: 409 });
  }

  const { data: appel, error } = await sb
    .from("citoyen_rdv_appels")
    .insert({ restriction_id: restriction.id, citoyen_id: user.id, message })
    .select("id, reference")
    .single();
  // Filet de sécurité : index unique partiel en base si deux demandes
  // concurrentes passent la vérification ci-dessus en même temps.
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Une demande est déjà en cours d'examen pour cette clôture" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, reference: appel.reference });
}
