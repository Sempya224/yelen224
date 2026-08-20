import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { envoyerNotification, salutation } from "@/lib/notificationEngine";

// Action de décision du dossier de vérification (Trust Lot 2.5). Écriture
// exclusivement via prendre_decision_verification() — jamais un insert
// direct depuis cette route, conformément à la règle d'architecture posée
// au Lot 2.4 et reconduite ici (voir la migration 20260816000006).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const TITRES: Record<string, string> = {
  accordee: "Vérification accordée",
  complement_demande: "Complément demandé",
  rejetee: "Vérification refusée",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "institutions.verify");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

    const {
      axe, type_decision, niveau_preuve, justification, complement_demande_motif,
      expire_le, derniere_decision_vue_id, document_institution_ids,
    } = body;

    const { data: decision, error } = await sb.rpc("prendre_decision_verification", {
      p_institution_id: id,
      p_axe: axe,
      p_type_decision: type_decision,
      p_niveau_preuve: niveau_preuve ?? null,
      p_justification: justification,
      p_complement_demande_motif: complement_demande_motif ?? null,
      p_examinateur_admin_id: admin.adminId,
      p_expire_le: expire_le ?? null,
      p_derniere_decision_vue_id: derniere_decision_vue_id ?? null,
      p_document_institution_ids: Array.isArray(document_institution_ids) ? document_institution_ids : null,
    }).single() as { data: { id: string; decision_id: string } | null; error: { message: string } | null };

    if (error) {
      // Conflit de concurrence (verrouillage optimiste) — distingué
      // explicitement pour que l'écran sache qu'il doit recharger le
      // dossier plutôt que simplement afficher une erreur générique.
      if (error.message.includes("une autre décision a déjà été prise entretemps")) {
        return NextResponse.json({ error: error.message, code: "CONFLIT_CONCURRENCE" }, { status: 409 });
      }
      if (error.message.includes("n'est plus la version active")) {
        return NextResponse.json({ error: error.message, code: "PREUVE_PERIMEE" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!decision) return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });

    await sb.from("admin_logs").insert({
      admin_id: admin.adminId,
      action: "DECISION_VERIFICATION",
      cible_table: "verification_decisions",
      cible_id: decision.id,
      details: { institution_id: id, axe, type_decision, decision_id: decision.decision_id },
    });

    const { data: inst } = await sb.from("institutions").select("name").eq("id", id).maybeSingle();
    await envoyerNotification({
      destinataireId: id,
      destinataireType: "institution",
      rdvId: null,
      type: `institution_verification_${type_decision}`,
      titre: salutation(inst?.name || "votre équipe"),
      message: TITRES[type_decision]
        ? `${TITRES[type_decision]} pour l'axe ${axe === "identite" ? "identité" : "autorité"} — ${justification}`
        : "Une décision de vérification a été prise sur votre dossier.",
    });

    return NextResponse.json({ ok: true, decision });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
