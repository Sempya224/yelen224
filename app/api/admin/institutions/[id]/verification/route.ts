import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { getRequiredDocuments } from "@/lib/documentsInstitution";

// Dossier de vérification admin (Trust Lot 2.5) — vue de preuves, jamais
// une simple fiche institution. Colonnes explicites partout (jamais
// select("*") sur les tables sensibles), URL signées 60s générées ici
// (storage.objects RLS confirmé actif + zéro policy, accès exclusivement
// service_role — voir docs/product/YELEN_TRUST_VERIFICATION_ADMIN_WORKFLOW.md
// section 1.5).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeAdmin(req, "institutions.verify");
    const { id } = await params;

    const { data: institution, error: instErr } = await sb
      .from("institutions")
      .select("id, name, statut, statut_juridique, secteur, badge_verifie, niveau_confiance, created_at")
      .eq("id", id)
      .maybeSingle();
    if (instErr) throw instErr;
    if (!institution) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });

    const [responsableRes, documentsRes, decisionsRes] = await Promise.all([
      sb.from("institution_responsables").select("prenom, nom, role, phone, email").eq("institution_id", id).maybeSingle(),
      sb.from("documents_institution")
        .select("id, type, nom, statut, motif_rejet, soumis_le, examine_le, examine_par, numero_version, statut_actif, remplace_version_id, storage_path, soumis_par_membre_id, hash_integrite")
        .eq("institution_id", id)
        .order("type", { ascending: true })
        .order("numero_version", { ascending: false }),
      sb.from("verification_decisions")
        .select("id, decision_id, axe, type_decision, niveau_preuve, examinateur_nom, decide_le, justification, expire_le, complement_demande_motif, decision_precedente_id, revoque_decision_id")
        .eq("institution_id", id)
        .order("decide_le", { ascending: false }),
    ]);
    if (documentsRes.error) throw documentsRes.error;
    if (decisionsRes.error) throw decisionsRes.error;

    // URL signées — uniquement pour les documents (actifs et historiques,
    // "chaque information doit permettre de remonter à sa source").
    const documents = await Promise.all((documentsRes.data ?? []).map(async (d) => {
      const { data: signed } = await sb.storage.from("documents").createSignedUrl(d.storage_path, 60);
      return {
        id: d.id, type: d.type, nom: d.nom, statut: d.statut, motif_rejet: d.motif_rejet,
        soumis_le: d.soumis_le, examine_le: d.examine_le, numero_version: d.numero_version,
        statut_actif: d.statut_actif, remplace_version_id: d.remplace_version_id,
        hash_integrite: d.hash_integrite,
        url: signed?.signedUrl || null,
      };
    }));

    // Snapshots de décision, préchargés en une seule requête puis répartis
    // par décision (évite N+1 sur potentiellement beaucoup de décisions).
    const decisionIds = (decisionsRes.data ?? []).map((d) => d.id);
    const { data: preuvesRows, error: preuvesErr } = decisionIds.length
      ? await sb.from("verification_decision_preuves")
          .select("decision_id, document_institution_id, type_snapshot, numero_version_snapshot, statut_snapshot, examine_par_nom_snapshot")
          .in("decision_id", decisionIds)
      : { data: [], error: null };
    if (preuvesErr) throw preuvesErr;

    const decisions = (decisionsRes.data ?? []).map((dec) => ({
      ...dec,
      preuves: (preuvesRows ?? []).filter((p) => p.decision_id === dec.id),
    }));

    const parAxe = (axe: "identite" | "autorite") => {
      const pourCetAxe = decisions.filter((d) => d.axe === axe);
      return {
        actuelle: pourCetAxe[0] ?? null, // déjà trié decide_le DESC
        historique: pourCetAxe,
      };
    };

    return NextResponse.json({
      institution,
      responsable: responsableRes.data ?? null,
      requis: getRequiredDocuments(institution.statut_juridique),
      documents,
      decisions: { identite: parAxe("identite"), autorite: parAxe("autorite") },
    });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
