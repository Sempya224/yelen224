import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { can } from "@/lib/institutionPermissions";
import { estChampDemande, formaterValeurDemande, LIBELLE_CHAMP, etatComplement, type TypeEvenementDemande } from "@/lib/changementsProfilAffichage";
import { LIBELLE_TYPE_DOCUMENT } from "@/lib/documentsInstitution";
import { chargerLibellesActivite } from "@/lib/changementsProfilServeur";

// Suivi, côté établissement, de ses propres demandes d'examen de changement de
// profil (docs/product/YELEN_REVERIFICATION_POLICY.md §3) : « en cours
// d'examen », « conforme » ou « à corriger » avec le commentaire de l'équipe
// Yelen. Lecture seule. L'institution vient EXCLUSIVEMENT de la session — jamais
// d'un paramètre de requête : aucun accès aux demandes d'un autre établissement.
// Colonnes explicites ; ni l'identité de l'administrateur examinateur, ni
// l'IP ni le user-agent ne sont exposés (l'équipe est présentée comme « Yelen »).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const MAX_DEMANDES = 20;

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(membre.role, "profil_entreprise.write", membre.accesRestreints)) {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }

  try {
    // ?resume=1 : uniquement le nombre de demandes encore en cours d'examen,
    // pour le badge rouge du header et du menu (interrogé périodiquement, donc
    // volontairement sans libellés ni valeurs).
    if (new URL(req.url).searchParams.get("resume") === "1") {
      const { count, error: countError } = await sb
        .from("institution_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", membre.institutionId)
        .eq("statut", "a_examiner");
      if (countError) throw countError;
      return NextResponse.json({ en_cours: count ?? 0 });
    }

    const { data, error } = await sb
      .from("institution_change_requests")
      .select("id,numero,champ,ancienne_valeur,nouvelle_valeur,statut,decision,commentaire_admin,decide_le,created_at")
      .eq("institution_id", membre.institutionId)
      .order("created_at", { ascending: false })
      .limit(MAX_DEMANDES);
    if (error) throw error;

    const lignes = data ?? [];
    const libelles = await chargerLibellesActivite(sb, lignes.flatMap(d => [d.ancienne_valeur, d.nouvelle_valeur]));

    // Échanges (compléments demandés / fournis) — l'équipe Yelen y apparaît sans
    // nom d'administrateur, les réponses de l'établissement sans nom de membre.
    const ouvertes = lignes.filter(d => d.statut === "a_examiner").map(d => d.id);
    const { data: evenementsRows, error: evenementsError } = ouvertes.length
      ? await sb.from("institution_change_request_events")
          .select("request_id,type,message,types_documents,created_at")
          .eq("institution_id", membre.institutionId)
          .in("request_id", ouvertes)
          .in("type", ["complement_demande", "complement_fourni"])
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (evenementsError) throw evenementsError;
    const evenementsParDemande = new Map<string, { type: TypeEvenementDemande; message: string | null; types_documents_libelles: string[]; created_at: string }[]>();
    for (const e of evenementsRows ?? []) {
      const liste = evenementsParDemande.get(e.request_id) ?? [];
      liste.push({
        type: e.type, message: e.message, created_at: e.created_at,
        types_documents_libelles: (e.types_documents ?? []).map((t: string) => LIBELLE_TYPE_DOCUMENT[t as keyof typeof LIBELLE_TYPE_DOCUMENT] ?? t),
      });
      evenementsParDemande.set(e.request_id, liste);
    }

    return NextResponse.json({
      demandes: lignes.map(d => {
        const champ = estChampDemande(d.champ) ? d.champ : null;
        return {
          id: d.id,
          numero: d.numero,
          champ: d.champ,
          champ_libelle: champ ? LIBELLE_CHAMP[champ] : String(d.champ),
          ancienne_affichage: champ ? formaterValeurDemande(champ, d.ancienne_valeur, libelles) : "—",
          nouvelle_affichage: champ ? formaterValeurDemande(champ, d.nouvelle_valeur, libelles) : "—",
          statut: d.statut,
          decision: d.decision,
          commentaire_admin: d.commentaire_admin,
          decide_le: d.decide_le,
          created_at: d.created_at,
          evenements: evenementsParDemande.get(d.id) ?? [],
          etat_complement: etatComplement(evenementsParDemande.get(d.id) ?? []),
        };
      }),
    });
  } catch (e) {
    console.error("[INSTITUTION CHANGEMENTS PROFIL GET]", e instanceof Error ? e.message : "erreur inconnue");
    return NextResponse.json({ error: "Impossible de charger le suivi de vos changements." }, { status: 500 });
  }
}
