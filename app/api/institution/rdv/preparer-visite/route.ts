import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { notifierPreparationVisite, logRdvEvent } from "@/lib/notificationEngine";

// Remplace l'ancienne route /api/institution/rdv/guichet (retirée, seul
// appelant était le bloc input texte sans conséquence de la fiche RDV) —
// chantier "Préparer la venue du client" (13/10/2026) : en plus d'écrire
// guichet/instructions_accueil, cette route déclenche une vraie notification
// citoyen quand l'institution choisit "Informer le client maintenant".
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function PATCH(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "rdv.write", membre.accesRestreints)) return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rdvId = body?.rdv_id;
  const guichet = typeof body?.guichet === "string" ? body.guichet.trim().slice(0, 100) : "";
  const instructions = typeof body?.instructions === "string" ? body.instructions.trim().slice(0, 300) : "";
  const notifier = body?.notifier === true;

  if (typeof rdvId !== "string" || !guichet) {
    return NextResponse.json({ error: "rdv_id et guichet requis" }, { status: 400 });
  }

  const { data: rdvAvant } = await sb
    .from("rdv")
    .select("id,citoyen_id,institutions!rdv_institution_id_fkey(name),users!rdv_citoyen_id_fkey(prenom,nom,phone)")
    .eq("id", rdvId)
    .eq("institution_id", membre.institutionId)
    .maybeSingle();
  if (!rdvAvant) return NextResponse.json({ error: "RDV introuvable pour cette institution" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { error } = await sb
    .from("rdv")
    .update({
      guichet,
      instructions_accueil: instructions || null,
      ...(notifier ? { preparation_confirmee_le: nowIso } : {}),
    })
    .eq("id", rdvId)
    .eq("institution_id", membre.institutionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (notifier) {
    const inst = rdvAvant.institutions as unknown as { name: string } | null;
    const citoyen = rdvAvant.users as unknown as { prenom: string | null; nom: string | null; phone: string | null } | null;
    await notifierPreparationVisite({
      citoyenId: rdvAvant.citoyen_id,
      citoyenPrenom: citoyen?.prenom ?? null,
      institutionNom: inst?.name ?? "l'institution",
      guichet,
      instructions: instructions || null,
      rdvId,
    });
    await logRdvEvent({
      rdvId, auteurId: membre.membreId, auteurType: "institution", action: "preparation",
      metadata: { guichet, instructions: instructions || null },
    });
  }

  return NextResponse.json({
    ok: true,
    guichet,
    instructions_accueil: instructions || null,
    preparation_confirmee_le: notifier ? nowIso : null,
  });
}
