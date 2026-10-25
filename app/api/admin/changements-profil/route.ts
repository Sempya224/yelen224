import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { estChampDemande, formaterValeurDemande, LIBELLE_CHAMP, etatComplement, type TypeEvenementDemande } from "@/lib/changementsProfilAffichage";
import { LIBELLE_TYPE_DOCUMENT } from "@/lib/documentsInstitution";
import { chargerLibellesActivite } from "@/lib/changementsProfilServeur";

// File d'examen des changements sensibles de profil d'établissement
// (docs/product/YELEN_REVERIFICATION_POLICY.md). Route de LECTURE seule : la
// décision passe exclusivement par ./[id]/decision (fonction SQL
// decider_changement_profil). Gardée par institutions.verify, comme le reste
// de la console de vérification. Colonnes explicites — jamais d'IP ni de
// user-agent (inutiles à la décision), jamais select("*"). Requêtes séparées,
// jamais d'embed PostgREST.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "institutions.verify");
    const { searchParams } = new URL(req.url);
    const statut = searchParams.get("statut") === "examinee" ? "examinee" : "a_examiner";
    const limitParsed = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : 50, 200);

    const { data: demandes, error } = await sb
      .from("institution_change_requests")
      .select("id,numero,institution_id,champ,ancienne_valeur,nouvelle_valeur,membre_nom,statut,decision,decide_par_nom,decide_le,commentaire_admin,created_at")
      .eq("statut", statut)
      // À examiner : les plus anciennes d'abord (file d'attente) ; examinées : les plus récentes d'abord.
      .order(statut === "a_examiner" ? "created_at" : "decide_le", { ascending: statut === "a_examiner" })
      .limit(limit);
    if (error) throw error;

    const { count: totalAExaminer, error: countError } = await sb
      .from("institution_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("statut", "a_examiner");
    if (countError) throw countError;

    const lignes = demandes ?? [];
    const institutionIds = [...new Set(lignes.map(d => d.institution_id))];
    const { data: institutions, error: instError } = institutionIds.length
      ? await sb.from("institutions").select("id,name,statut").in("id", institutionIds)
      : { data: [], error: null };
    if (instError) throw instError;
    const nomParInstitution = new Map((institutions ?? []).map(i => [i.id as string, i.name as string]));
    const statutParInstitution = new Map((institutions ?? []).map(i => [i.id as string, String(i.statut)]));

    // Traduction des identifiants d'activité en libellés (champ "activite").
    const libelles = await chargerLibellesActivite(sb, lignes.flatMap(d => [d.ancienne_valeur, d.nouvelle_valeur]));

    // Journal d'échanges (compléments demandés / fournis) des demandes listées.
    const idsDemandes = lignes.map(d => d.id);
    const { data: evenementsRows, error: evenementsError } = idsDemandes.length
      ? await sb.from("institution_change_request_events")
          .select("request_id,type,acteur_nom,message,types_documents,suspension_reference,created_at")
          .in("request_id", idsDemandes)
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (evenementsError) throw evenementsError;
    const evenementsParDemande = new Map<string, { type: TypeEvenementDemande; acteur_nom: string; message: string | null; types_documents: string[]; suspension_reference: string | null; created_at: string }[]>();
    for (const e of evenementsRows ?? []) {
      const liste = evenementsParDemande.get(e.request_id) ?? [];
      liste.push({ type: e.type, acteur_nom: e.acteur_nom, message: e.message, types_documents: e.types_documents ?? [], suspension_reference: e.suspension_reference ?? null, created_at: e.created_at });
      evenementsParDemande.set(e.request_id, liste);
    }

    // Pièces déposées par l'établissement depuis la dernière demande de complément
    // (onglet Documents existant) — information dérivée, aucune donnée de plus.
    const dernieresDemandes = new Map<string, string>();
    for (const d of lignes) {
      const demandes = (evenementsParDemande.get(d.id) ?? []).filter(e => e.type === "complement_demande");
      if (demandes.length > 0) dernieresDemandes.set(d.id, demandes[demandes.length - 1].created_at);
    }
    const depuis = [...dernieresDemandes.values()].sort()[0];
    const { data: documentsRows, error: documentsError } = depuis
      ? await sb.from("documents_institution").select("institution_id,soumis_le").in("institution_id", institutionIds).gt("soumis_le", depuis)
      : { data: [], error: null };
    if (documentsError) throw documentsError;

    return NextResponse.json({
      total_a_examiner: totalAExaminer ?? 0,
      demandes: lignes.map(d => {
        const champ = estChampDemande(d.champ) ? d.champ : null;
        const evenements = evenementsParDemande.get(d.id) ?? [];
        const derniere = dernieresDemandes.get(d.id);
        return {
          id: d.id,
          numero: d.numero,
          institution_id: d.institution_id,
          institution_name: nomParInstitution.get(d.institution_id) ?? null,
          institution_statut: statutParInstitution.get(d.institution_id) ?? null,
          champ: d.champ,
          champ_libelle: champ ? LIBELLE_CHAMP[champ] : String(d.champ),
          ancienne_affichage: champ ? formaterValeurDemande(champ, d.ancienne_valeur, libelles) : "—",
          nouvelle_affichage: champ ? formaterValeurDemande(champ, d.nouvelle_valeur, libelles) : "—",
          membre_nom: d.membre_nom,
          statut: d.statut,
          decision: d.decision,
          decide_par_nom: d.decide_par_nom,
          decide_le: d.decide_le,
          commentaire_admin: d.commentaire_admin,
          created_at: d.created_at,
          evenements: evenements.map(e => ({
            type: e.type, acteur_nom: e.acteur_nom, message: e.message, created_at: e.created_at, suspension_reference: e.suspension_reference,
            types_documents_libelles: e.types_documents.map(t => LIBELLE_TYPE_DOCUMENT[t as keyof typeof LIBELLE_TYPE_DOCUMENT] ?? t),
          })),
          etat_complement: etatComplement(evenements),
          documents_depuis_demande: derniere
            ? (documentsRows ?? []).filter(x => x.institution_id === d.institution_id && x.soumis_le > derniere).length
            : 0,
        };
      }),
    });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
