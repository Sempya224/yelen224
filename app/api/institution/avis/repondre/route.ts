import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";

// Lot E (chantier Avis + Favoris citoyen) — seule route qui peut écrire
// dans avis.reponse_institution/reponse_le (colonnes protégées par le
// trigger avis_proteger_reponse_institution_trigger, migration
// 20260724000003 : bloqué pour tout rôle sauf service_role). Complète le
// citoyen_id via cet accès service_role, jamais via un id fourni tel quel
// par le client.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "avis.repondre")) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const body = await req.json().catch(() => null);
  const avisId = body?.avisId;
  const reponse = body?.reponse;
  if (typeof avisId !== "string" || typeof reponse !== "string" || !reponse.trim()) {
    return NextResponse.json({ error: "avisId et reponse requis" }, { status: 400 });
  }

  // N'autorise la réponse que sur un avis appartenant réellement à cette
  // institution, publié (brouillon=false) — empêche de répondre à l'avis
  // d'une autre institution en devinant un id, et de répondre à un
  // brouillon que le citoyen n'a pas encore publié.
  const { data: avisRow } = await sb
    .from("avis")
    .select("id, citoyen_id, rdv_id")
    .eq("id", avisId)
    .eq("institution_id", authInstId)
    .eq("brouillon", false)
    .maybeSingle();
  if (!avisRow) return NextResponse.json({ error: "Avis introuvable pour cette institution" }, { status: 404 });

  const { error } = await sb
    .from("avis")
    .update({ reponse_institution: reponse.trim(), reponse_le: new Date().toISOString() })
    .eq("id", avisId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await enregistrerAction({
    institutionId: authInstId,
    membreId: membre.membreId,
    membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "avis_repondu",
    cibleTable: "avis",
    cibleId: avisId,
    details: { citoyen_id: avisRow.citoyen_id },
    req,
  });

  const [{ data: instRow }, { data: citoyenRow }] = await Promise.all([
    sb.from("institutions").select("name").eq("id", authInstId).maybeSingle(),
    sb.from("users").select("prenom").eq("id", avisRow.citoyen_id).maybeSingle(),
  ]);
  await envoyerNotification({
    destinataireId: avisRow.citoyen_id,
    destinataireType: "citoyen",
    rdvId: avisRow.rdv_id,
    type: "avis_reponse",
    titre: salutation(citoyenRow?.prenom || "cher client"),
    message: `${instRow?.name ?? "L'établissement"} a répondu à votre avis. Consultez la réponse depuis Mes avis.`,
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
