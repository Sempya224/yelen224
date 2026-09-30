import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Phase 4, "couche d'intégration Yelen" du brief CEO (§17) — suggestions
// déterministes (zéro LLM, même discipline que GET /api/citoyen/assistant)
// pour transformer un signal Yelen déjà existant en tâche dans "Ma
// semaine". Purement en lecture — "claim" une suggestion se fait via le
// POST /api/institution/taches déjà existant, aucune nouvelle route
// d'écriture nécessaire ici.
//
// Audit avant code (26/09/2026) : sur les 6 déclencheurs du brief, 2 n'ont
// aucune assise dans le schéma réel — citoyen_demarches n'a ni
// institution_id ni membre_id (RLS auth.uid()=citoyen_id uniquement), et
// posts.auteur_id référence toujours un citoyen, jamais institution_membres
// — une institution n'a techniquement aucune visibilité sur ces deux
// objets. Non construits, ce n'est pas un oubli. RDV terminé / "client
// rencontré" écartés aussi : aucun signal ne distingue "sans suivi
// programmé" d'un RDV normalement clos, brancher ça générerait une
// suggestion pour chaque RDV terminé (bruit garanti). Les 2 signaux réels
// et proprement membre-scopés retenus : documents clients en attente
// (`citoyen_documents.demande_par_membre_id`) et signalements assignés
// (`signalements.assigne_a_membre_id`).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export type Suggestion = {
  id: string;
  type: "rdv_absent" | "document_attente" | "signalement_assigne";
  titre: string;
  citoyen_id: string | null;
  rdv_id: string | null;
};

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "ma-semaine") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;
  const suggestions: Suggestion[] = [];

  // ─── RDV manqués — n'exposer ce signal qu'aux rôles qui ont déjà accès
  // aux RDV ailleurs dans le dashboard (comptable a "rdv": "none" dans
  // TAB_MATRIX) : cette route ne doit jamais devenir une fuite qui
  // contourne une frontière RBAC déjà posée. Même principe pour les 2
  // blocs suivants, chacun gaté par la permission de son propre écran.
  const peutVoirRdv = canAccessTab(membre.role, "rdv") !== "none" || canAccessTab(membre.role, "valider-rdv") !== "none";
  if (peutVoirRdv) {
    const { data: rdvRaw } = await sb
      .from("rdv")
      .select("id,date_rdv,citoyen_id")
      .eq("institution_id", authInstId)
      .eq("presence_status", "absent")
      .order("date_rdv", { ascending: false })
      .limit(20);

    if (rdvRaw?.length) {
      const rdvIds = rdvRaw.map(r => r.id);
      // Un RDV déjà transformé en tâche de suivi (par n'importe quel membre)
      // ne doit plus être suggéré — évite les suivis en double.
      const { data: tachesExistantes } = await sb.from("taches").select("rdv_id").eq("institution_id", authInstId).in("rdv_id", rdvIds);
      const dejaSuivis = new Set((tachesExistantes ?? []).map(t => t.rdv_id));
      const candidats = rdvRaw.filter(r => !dejaSuivis.has(r.id)).slice(0, 5);

      if (candidats.length) {
        const citoyenIds = [...new Set(candidats.map(r => r.citoyen_id).filter(Boolean))];
        const { data: usersD } = citoyenIds.length ? await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds) : { data: [] };
        const uMap = new Map((usersD ?? []).map(u => [u.id, u]));
        for (const r of candidats) {
          suggestions.push({
            id: `rdv_absent_${r.id}`, type: "rdv_absent",
            titre: `Relancer ${buildNom(uMap.get(r.citoyen_id))} (RDV manqué du ${r.date_rdv})`,
            citoyen_id: r.citoyen_id, rdv_id: r.id,
          });
        }
      }
    }
  }

  // ─── Documents clients en attente, demandés par CE membre — les plus
  // proches de leur date limite d'abord (nullsFirst: false laisse les
  // documents sans date_limite en dernier, jamais prioritaires sur un
  // vrai délai).
  const peutVoirDocuments = canAccessTab(membre.role, "documents-clients") !== "none";
  if (peutVoirDocuments) {
    const { data: docsRaw } = await sb
      .from("citoyen_documents")
      .select("id,label,citoyen_id,rdv_id,date_limite")
      .eq("institution_id", authInstId)
      .eq("demande_par_membre_id", membre.membreId)
      .eq("statut", "en_attente")
      .order("date_limite", { ascending: true, nullsFirst: false })
      .limit(5);

    if (docsRaw?.length) {
      const citoyenIds = [...new Set(docsRaw.map(d => d.citoyen_id).filter(Boolean))];
      const { data: usersD } = citoyenIds.length ? await sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds) : { data: [] };
      const uMap = new Map((usersD ?? []).map(u => [u.id, u]));
      for (const d of docsRaw) {
        suggestions.push({
          id: `document_attente_${d.id}`, type: "document_attente",
          titre: `Relancer ${buildNom(uMap.get(d.citoyen_id))} pour « ${d.label} »`,
          citoyen_id: d.citoyen_id, rdv_id: d.rdv_id,
        });
      }
    }
  }

  // ─── Signalements assignés à CE membre, non résolus — priorité
  // critique/haute d'abord.
  const peutVoirSignalements = canAccessTab(membre.role, "signalements") !== "none";
  if (peutVoirSignalements) {
    const { data: sigRaw } = await sb
      .from("signalements")
      .select("id,numero_public,statut,priorite")
      .eq("institution_id", authInstId)
      .eq("assigne_a_membre_id", membre.membreId)
      .in("statut", ["nouveau", "a_traiter", "en_cours", "en_attente"])
      .limit(20);

    // Tri par sévérité réelle en JS — "priorite" est un text (pas un enum
    // ordonné), un ORDER BY SQL alphabétique classerait "critique" avant
    // "faible" avant "haute", un ordre faux.
    const RANG_PRIORITE: Record<string, number> = { critique: 0, haute: 1, normale: 2, faible: 3 };
    const candidats = [...(sigRaw ?? [])].sort((a, b) => (RANG_PRIORITE[a.priorite] ?? 9) - (RANG_PRIORITE[b.priorite] ?? 9)).slice(0, 5);

    for (const s of candidats) {
      suggestions.push({
        id: `signalement_assigne_${s.id}`, type: "signalement_assigne",
        titre: `Traiter le signalement ${s.numero_public}`,
        citoyen_id: null, rdv_id: null,
      });
    }
  }

  return NextResponse.json({ suggestions });
}
