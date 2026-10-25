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

    // Faille corrigée le 24/10/2026 : la fonction SQL accepte n'importe quelle
    // preuve ACTIVE, y compris une pièce rejetée ou en complément demandé — un
    // admin pouvait donc accorder la vérification en citant une preuve que
    // l'équipe avait elle-même refusée. Une vérification accordée ne peut
    // s'appuyer que sur des pièces reçues ou validées.
    if (type_decision === "accordee" && Array.isArray(document_institution_ids) && document_institution_ids.length > 0) {
      const { data: citees, error: citeesErr } = await sb.from("documents_institution")
        .select("id, type, statut").in("id", document_institution_ids.filter((v: unknown): v is string => typeof v === "string")).eq("institution_id", id);
      if (citeesErr) return NextResponse.json({ error: citeesErr.message }, { status: 500 });
      const refusees = (citees ?? []).filter((d) => d.statut === "rejete" || d.statut === "complement_demande");
      if (refusees.length > 0) {
        return NextResponse.json({ error: `Vérification impossible : ${refusees.map((d) => d.type).join(", ")} est rejeté ou en attente d'un complément. Attendez le renvoi du document.`, code: "PREUVE_REFUSEE" }, { status: 400 });
      }
    }

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

    // B1 (24/10/2026) — le statut de chaque preuve citée suit la décision :
    // aucun code n'écrivait jamais documents_institution.statut hors 'recu',
    // donc l'établissement ne voyait jamais ni rejet ni complément au niveau
    // document. Le trigger documents_institution_immuable_partiel autorise
    // exactement cette écriture, une seule fois, depuis 'recu' ; le filtre
    // statut='recu' rend l'opération sans effet sur une preuve déjà tranchée
    // (ex. citée par les deux axes). Non transactionnel avec la décision
    // (insert-only déjà validé) : en cas d'échec, la décision reste valide et
    // on le signale explicitement plutôt que de masquer l'écart.
    const idsCites: string[] = Array.isArray(document_institution_ids) ? document_institution_ids.filter((v: unknown): v is string => typeof v === "string") : [];
    let documentsMisAJour: string[] = [];
    let erreurStatutDocuments: string | null = null;
    if (idsCites.length > 0) {
      const statutDocument = type_decision === "accordee" ? "valide" : type_decision === "rejetee" ? "rejete" : "complement_demande";
      const motifDocument = type_decision === "accordee" ? null : type_decision === "rejetee" ? justification : complement_demande_motif;
      const { data: maj, error: majErr } = await sb.from("documents_institution")
        .update({ statut: statutDocument, motif_rejet: motifDocument, examine_le: new Date().toISOString(), examine_par: admin.adminId })
        .in("id", idsCites).eq("institution_id", id).eq("statut", "recu").eq("statut_actif", true)
        .select("id");
      if (majErr) erreurStatutDocuments = majErr.message;
      else documentsMisAJour = (maj ?? []).map((d) => d.id);
    }

    await sb.from("admin_logs").insert({
      admin_id: admin.adminId,
      action: "DECISION_VERIFICATION",
      cible_table: "verification_decisions",
      cible_id: decision.id,
      details: { institution_id: id, axe, type_decision, decision_id: decision.decision_id, documents_mis_a_jour: documentsMisAJour, erreur_statut_documents: erreurStatutDocuments },
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

    // 200 même si le statut des documents n'a pas pu être mis à jour : la
    // décision, elle, est enregistrée et la notification partie. L'écran admin
    // affiche l'avertissement au lieu d'un faux "tout est bon".
    return NextResponse.json({ ok: true, decision, documents_mis_a_jour: documentsMisAJour, avertissement_documents: erreurStatutDocuments });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
