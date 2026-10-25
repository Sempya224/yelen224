import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { enregistrerAction, getMembreNomPourJournal } from "@/lib/journalActivite";

// Réponse de l'établissement à une demande de complément de l'équipe Yelen
// (Lot 2, docs/product/YELEN_REVERIFICATION_POLICY.md). Les pièces elles-mêmes
// se déposent par l'onglet Documents existant (versionné, haché, visible dans le
// dossier de vérification) ; cette route enregistre seulement le message de
// réponse et signale à l'équipe que le complément est prêt à être réexaminé.
// Institution, membre : issus de la SESSION, jamais du corps. Écriture
// exclusivement via repondre_complement_changement_profil.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_MAX = 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "profil_entreprise.write", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Identifiant de demande invalide" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const message = (body as { message?: unknown } | null)?.message;
  if (message !== undefined && message !== null && typeof message !== "string") {
    return NextResponse.json({ error: "Message invalide" }, { status: 400 });
  }
  if (typeof message === "string" && message.trim().length > MESSAGE_MAX) {
    return NextResponse.json({ error: `Le message ne doit pas dépasser ${MESSAGE_MAX} caractères.` }, { status: 400 });
  }

  const { data, error } = await sb.rpc("repondre_complement_changement_profil", {
    p_demande_id: id,
    p_institution_id: membre.institutionId,
    p_membre_id: membre.membreId,
    p_message: typeof message === "string" ? message.trim() : null,
  });
  if (error) {
    if (error.message.includes("aucun complement n'est attendu") || error.message.includes("n'est plus a l'etat a_examiner")) {
      return NextResponse.json({ error: "Aucun complément n'est attendu pour cette demande.", code: "AUCUN_COMPLEMENT_ATTENDU" }, { status: 409 });
    }
    if (error.message.includes("demande inconnue")) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }
    console.error("[INSTITUTION CHANGEMENTS PROFIL] repondre_complement:", error.code);
    return NextResponse.json({ error: "Erreur lors de l'envoi de votre réponse." }, { status: 500 });
  }

  const r = (typeof data === "object" && data !== null ? data : {}) as { numero?: unknown; champ?: unknown };
  await enregistrerAction({
    institutionId: membre.institutionId, membreId: membre.membreId, membreNom: await getMembreNomPourJournal(membre.membreId),
    action: "changement_profil_complement_fourni", cibleTable: "institution_change_requests", cibleId: id,
    details: { numero: typeof r.numero === "string" ? r.numero : null, champ: typeof r.champ === "string" ? r.champ : null },
    req,
  });

  return NextResponse.json({ ok: true });
}
