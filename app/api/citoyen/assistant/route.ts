import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deriverRappelsDemarches, type DemarcheRappel, type EtapeRappel, type RappelDemarche } from "@/lib/citoyenDemarchesRappels";
import { calculerDepenseDominante } from "@/lib/depenses";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthenticatedCitoyenId(request: NextRequest): Promise<string | null> {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const user = await verifierCitoyenToken(accessToken);
  return user?.id ?? null;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Lot A (chantier "Mon Assistant") — un seul appel agrégeant tout ce que le
// bandeau affiche : RDV à venir, RDV terminés en attente d'avis
// (avis_demande=true, même règle que app/mes-rdv/page.tsx), et les annonces
// publiées par les établissements "concernés" (union des institutions avec
// lesquelles le citoyen a un historique de RDV et de ses favoris). Les
// annonces n'ont pas de policy RLS publique (voir app/api/annonces-publiques/
// route.ts, déjà en service_role) — d'où une route dédiée plutôt qu'un fetch
// direct client comme pour rdv/citoyen_favoris.
//
// Étendu le 22/07/2026 (plan rétention v2, item 5 — "Résumé de mon espace")
// : plutôt que de construire un second bandeau redondant, ce widget déjà en
// place est le bon endroit pour faire remonter démarches en retard/à
// échéance proche et documents en attente — mêmes règles déterministes,
// zéro appel LLM. Le calcul retard/échéance partage désormais le même
// moteur que la carte "Rappels démarches" de l'Accueil et que
// /api/citoyen/suivis (lib/citoyenDemarchesRappels.ts), plus de copie
// inline divergente entre les trois.
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const todayISO = toISODate(new Date());
    const INSTITUTION_FIELDS = "id, name, category, logo";

    const [{ data: upcomingRows }, { data: avisAttenteRows }, { data: rdvHistorique }, { data: favorisRows }, { data: demarchesRows }, { data: documentsRows }, { data: depensesRows }, { data: paidRows }, { data: userRow }, { count: nbDemarchesTotal }] = await Promise.all([
      supabaseAdmin
        .from("rdv")
        .select(`id, date_rdv, heure_rdv, objet, statut, institutions!rdv_institution_id_fkey ( ${INSTITUTION_FIELDS} )`)
        .eq("citoyen_id", citoyenId)
        .in("statut", ["en_attente", "confirme"])
        .gte("date_rdv", todayISO)
        .order("date_rdv", { ascending: true }),
      supabaseAdmin
        .from("rdv")
        .select(`id, date_rdv, heure_rdv, objet, statut, institutions!rdv_institution_id_fkey ( ${INSTITUTION_FIELDS} )`)
        .eq("citoyen_id", citoyenId)
        .eq("statut", "termine")
        .eq("avis_demande", true)
        .order("date_rdv", { ascending: false }),
      supabaseAdmin
        .from("rdv")
        .select("institution_id")
        .eq("citoyen_id", citoyenId),
      supabaseAdmin
        .from("citoyen_favoris")
        .select("institution_id")
        .eq("citoyen_id", citoyenId),
      supabaseAdmin
        .from("citoyen_demarches")
        .select(`id, titre, date_cible, categorie, priorite, institutions ( name ), etapes:citoyen_demarche_etapes ( libelle, date_echeance, fait, ordre )`)
        .eq("citoyen_id", citoyenId)
        .eq("statut", "en_cours"),
      supabaseAdmin
        .from("citoyen_documents")
        .select(`id, label, institution_id, institutions ( ${INSTITUTION_FIELDS} )`)
        .eq("citoyen_id", citoyenId)
        .eq("sens", "demande")
        .eq("statut", "en_attente"),
      supabaseAdmin
        .from("citoyen_depenses")
        .select("categorie, montant, date_depense")
        .eq("citoyen_id", citoyenId),
      supabaseAdmin
        .from("paid_bookings")
        .select("montant_paye, created_at")
        .eq("citoyen_id", citoyenId)
        .in("statut", ["confirme", "termine"]),
      // "Votre parcours Yelen" (retour Bryan 27/08/2026) — champs de
      // complétude profil identiques à CHAMPS_PROFIL_COMPLET de
      // app/compte/informations-personnelles/actions.ts (source de vérité
      // du bonus Yelen Rewards "profil_complete") ; dupliqué ici plutôt
      // qu'importé car ce fichier est "use server" (seules des Server
      // Actions async peuvent en être exportées, pas une constante).
      supabaseAdmin
        .from("users")
        .select("prenom, nom, ville, date_naissance, sexe, nationalite, profession, adresse, email, photo_url, identite_verifiee")
        .eq("id", citoyenId)
        .maybeSingle(),
      // Total tous statuts confondus (pas seulement "en_cours" comme
      // demarchesRows plus haut) — une démarche clôturée compte toujours
      // comme "première démarche créée".
      supabaseAdmin
        .from("citoyen_demarches")
        .select("id", { count: "exact", head: true })
        .eq("citoyen_id", citoyenId),
    ]);

    // "Votre argent" (Home V2) — même moteur que /api/citoyen/suivis
    // (lib/depenses.ts::calculerDepenseDominante).
    const depenseDominante = calculerDepenseDominante(depensesRows ?? [], paidRows ?? []);

    // "Votre parcours Yelen" (retour Bryan 27/08/2026, brief "Up Next") —
    // état purement dérivé de faits réels, jamais un compteur frontend
    // séparé. "établissement découvert" interprété comme "au moins un
    // favori" (citoyen_favoris) faute de tout tracking de consultation de
    // fiche établissement dans le produit — seule donnée réelle disponible
    // représentant une vraie découverte active, décision à confirmer par
    // Bryan si un signal plus précis existe/est souhaité.
    const CHAMPS_PROFIL_COMPLET = ["prenom", "nom", "ville", "date_naissance", "sexe", "nationalite", "profession", "adresse", "email", "photo_url"] as const;
    const profileCompleted = !!userRow && CHAMPS_PROFIL_COMPLET.every((c) => !!(userRow as unknown as Record<string, unknown>)[c]);
    const identityVerified = !!userRow?.identite_verifiee;
    const firstProcedureCreated = (nbDemarchesTotal ?? 0) > 0;
    const firstExpenseCompleted = (depensesRows ?? []).length > 0;
    const firstEstablishmentDiscovered = (favorisRows ?? []).length > 0;
    const etapesParcours = [
      { code: "profile_completed" as const, complete: profileCompleted },
      { code: "identity_verified" as const, complete: identityVerified },
      { code: "first_procedure_created" as const, complete: firstProcedureCreated },
      { code: "first_expense_completed" as const, complete: firstExpenseCompleted },
      { code: "first_establishment_discovered" as const, complete: firstEstablishmentDiscovered },
    ];
    const parcours = {
      etapes: etapesParcours,
      completees: etapesParcours.filter((e) => e.complete).length,
      total: etapesParcours.length,
    };

    // Filtre défensif (retour Bryan 23/08/2026, bug réel constaté : "Mon
    // Assistant" redemandait un avis déjà publié) — `rdv.avis_demande`
    // aurait dû repasser à `false` via notifier-publication/route.ts au
    // moment de la publication, mais ce correctif ne date que du
    // 15/08/2026 (voir son commentaire) : les RDV dont l'avis a été publié
    // avant cette date restent bloqués à `avis_demande=true` en base tant
    // que Bryan n'a pas rejoué la correction SQL une fois. Recroise donc
    // ici avec la table `avis` (source de vérité réelle) plutôt que de ne
    // faire confiance qu'au flag, pour ne plus jamais réafficher un avis
    // déjà laissé — même si le flag se dérègle à nouveau.
    let avisAttente = avisAttenteRows ?? [];
    if (avisAttente.length > 0) {
      const { data: avisExistants } = await supabaseAdmin
        .from("avis")
        .select("rdv_id")
        .in("rdv_id", avisAttente.map((r) => r.id))
        .eq("brouillon", false);
      const rdvAvecAvis = new Set((avisExistants ?? []).map((a) => a.rdv_id));
      avisAttente = avisAttente.filter((r) => !rdvAvecAvis.has(r.id));
    }

    const institutionIds = Array.from(new Set([
      ...(rdvHistorique ?? []).map((r) => r.institution_id),
      ...(favorisRows ?? []).map((f) => f.institution_id),
    ]));

    // Démarches en retard / à échéance proche — même moteur déterministe
    // que la carte "Rappels démarches" de l'Accueil (app/page.tsx,
    // lib/citoyenDemarchesRappels.ts::deriverRappelsDemarches), plus
    // dupliqué inline ici (source de vérité unique, retard/échéance à 7
    // jours calculés une seule fois pour tout le produit).
    type DemarcheRow = { id: string; titre: string; date_cible: string | null; categorie: "personnel" | "professionnel" | null; priorite: "faible" | "normale" | "importante" | "urgente"; institutions: { name: string } | { name: string }[] | null; etapes: EtapeRappel[] | null };
    const demarcheRappels: DemarcheRappel[] = (demarchesRows ?? []).map((d) => {
      const row = d as unknown as DemarcheRow;
      const instRel = row.institutions;
      const institutionNom = Array.isArray(instRel) ? instRel[0]?.name ?? null : instRel?.name ?? null;
      return { id: row.id, titre: row.titre, institutionNom, dateCible: row.date_cible, etapes: row.etapes ?? [], categorie: row.categorie, priorite: row.priorite };
    });
    const rappelsDemarches = deriverRappelsDemarches(demarcheRappels);
    // 24/08/2026 — champs étendus (au-delà de {id, titre}) pour permettre à
    // Mon Assistant (components/MonAssistant.tsx) de rendre la même carte
    // moderne que la liste "Mes démarches" (DemarcheCarte), plutôt que la
    // ligne générique précédente.
    const demarcheVersCarte = (r: RappelDemarche) => ({
      id: r.id, titre: r.titre, sousTexte: r.sousTexte, priorite: r.priorite, categorie: r.categorie,
      institutionNom: r.institutionNom, etapesFaites: r.etapesFaites, etapesTotal: r.etapesTotal,
    });
    const demarchesEnRetard = rappelsDemarches.filter((r) => r.enRetard).map(demarcheVersCarte);
    const demarchesEcheanceProche = rappelsDemarches.filter((r) => !r.enRetard && r.echeanceProche).map(demarcheVersCarte);

    let annonces: Record<string, unknown>[] = [];
    if (institutionIds.length > 0) {
      const { data: annonceRows } = await supabaseAdmin
        .from("annonces")
        .select(`id, titre, contenu, type, format, media_urls, image_url, created_at, date_expiration, institution_id, institutions ( ${INSTITUTION_FIELDS} )`)
        .in("institution_id", institutionIds)
        .eq("statut", "publiee")
        .order("created_at", { ascending: false })
        .limit(10);

      const now = new Date();
      annonces = (annonceRows ?? []).filter(
        (a) => !a.date_expiration || new Date(a.date_expiration as string) > now
      );
    }

    return NextResponse.json({
      success: true,
      upcoming: upcomingRows ?? [],
      avisAttente,
      annonces,
      demarchesEnRetard,
      demarchesEcheanceProche,
      documentsAttente: documentsRows ?? [],
      depenseDominante,
      parcours,
    });
  } catch (error) {
    console.error("[CITOYEN ASSISTANT GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
