import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deriverRappelsDemarches, type DemarcheRappel, type EtapeRappel } from "@/lib/citoyenDemarchesRappels";
import { calculerDepenseDominante } from "@/lib/depenses";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAuthenticatedCitoyenId(request: NextRequest): Promise<string | null> {
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) return null;
  return user.id;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const CATEGORIE_DEPENSE_LABEL: Record<string, string> = {
  sante: "Santé", transport: "Transport", alimentation: "Alimentation", logement: "Logement",
  education: "Éducation", loisirs: "Loisirs", autre: "Autre",
};

const INTERET_LABEL: Record<string, string> = {
  "santé": "Santé", "administratif": "Administratif", "financier": "Institutions financières",
  "juridique": "Juridique", "beauté_bien_etre": "Beauté & bien-être", "commerce": "Commerce",
  "artisanat": "Artisanat", "services_divers": "Services divers",
  "epargne": "Épargne & tontines", "mobile_money": "Mobile money", "credit": "Microfinance & crédit",
  "revenus": "Revenus & activité", "budget": "Budget", "fraudes": "Fraudes & protection",
};

export type Suivi = {
  id: string;
  type: "rdv" | "avis" | "documents" | "demarche_retard" | "demarche_echeance" | "depense" | "interet";
  titre: string;
  description: string;
  action: { kind: "lien"; href: string } | { kind: "creer_demarche"; titre: string; categorie: "personnel" | "professionnel" };
};

// "Suivis" — chantier refonte "Mes démarches" du 26/07/2026 (décision CEO :
// écran majeur d'engagement, doit analyser l'activité réelle du citoyen
// pour proposer des suivis/démarches). Même discipline que /api/citoyen/
// assistant (zéro LLM, règles déterministes — le calcul retard/échéance des
// démarches partage désormais le même moteur que l'Accueil et l'Assistant,
// voir lib/citoyenDemarchesRappels.ts) mais étendu avec deux signaux propres
// à cet écran : la catégorie de dépense la plus
// élevée du mois (citoyen_depenses + paid_bookings, même logique que
// app/menu/depenses) et un rappel basé sur les centres d'intérêt
// sélectionnés — affiché seulement si le citoyen n'a encore AUCUNE
// démarche (sinon on ne peut pas prouver honnêtement qu'il "manque"
// quelque chose, donc on se tait plutôt que d'inventer un manque).
export async function GET(request: NextRequest) {
  try {
    const citoyenId = await getAuthenticatedCitoyenId(request);
    if (!citoyenId) return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });

    const todayISO = toISODate(new Date());
    const INSTITUTION_FIELDS = "id, name, category, logo";

    const [
      { data: upcomingRows },
      { data: avisAttenteRows },
      { data: demarchesRows },
      { data: documentsRows },
      { data: depensesRows },
      { data: paidRows },
      { data: userRow },
    ] = await Promise.all([
      supabaseAdmin.from("rdv").select(`id, date_rdv, heure_rdv, objet, statut, institutions!rdv_institution_id_fkey ( ${INSTITUTION_FIELDS} )`).eq("citoyen_id", citoyenId).in("statut", ["en_attente", "confirme"]).gte("date_rdv", todayISO).order("date_rdv", { ascending: true }),
      supabaseAdmin.from("rdv").select("id").eq("citoyen_id", citoyenId).eq("statut", "termine").eq("avis_demande", true),
      supabaseAdmin.from("citoyen_demarches").select(`id, titre, statut, date_cible, categorie, priorite, institutions ( name ), etapes:citoyen_demarche_etapes ( libelle, date_echeance, fait, ordre )`).eq("citoyen_id", citoyenId),
      supabaseAdmin.from("citoyen_documents").select("id").eq("citoyen_id", citoyenId).eq("sens", "demande").eq("statut", "en_attente"),
      supabaseAdmin.from("citoyen_depenses").select("categorie, montant, date_depense").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("paid_bookings").select("montant_paye, created_at").eq("citoyen_id", citoyenId).in("statut", ["confirme", "termine"]),
      supabaseAdmin.from("users").select("centres_interet").eq("id", citoyenId).maybeSingle(),
    ]);

    // Même moteur déterministe que la carte "Rappels démarches" de l'Accueil
    // (app/page.tsx, lib/citoyenDemarchesRappels.ts::deriverRappelsDemarches)
    // et que /api/citoyen/assistant — source de vérité unique du calcul
    // retard/échéance, plus dupliquée inline ici.
    type DemarcheRow = { id: string; titre: string; statut: string; date_cible: string | null; categorie: "personnel" | "professionnel" | null; priorite: "faible" | "normale" | "importante" | "urgente"; institutions: { name: string } | { name: string }[] | null; etapes: EtapeRappel[] | null };
    const demarchesEnCours = (demarchesRows ?? []).filter((d) => d.statut === "en_cours") as unknown as DemarcheRow[];
    const demarcheRappels: DemarcheRappel[] = demarchesEnCours.map((d) => {
      const instRel = d.institutions;
      const institutionNom = Array.isArray(instRel) ? instRel[0]?.name ?? null : instRel?.name ?? null;
      return { id: d.id, titre: d.titre, institutionNom, dateCible: d.date_cible, etapes: d.etapes ?? [], categorie: d.categorie, priorite: d.priorite };
    });
    const rappelsDemarches = deriverRappelsDemarches(demarcheRappels);
    const enRetardCount = rappelsDemarches.filter((r) => r.enRetard).length;
    const echeanceProcheCount = rappelsDemarches.filter((r) => !r.enRetard && r.echeanceProche).length;

    // Dépense la plus élevée du mois en cours — même moteur que
    // /api/citoyen/assistant désormais (lib/depenses.ts::calculerDepenseDominante).
    const depenseDominante = calculerDepenseDominante(depensesRows ?? [], paidRows ?? []);
    const topCategorie = depenseDominante?.categorie ?? null;
    const topMontant = depenseDominante?.montant ?? 0;

    const centresInteret = (userRow?.centres_interet ?? []) as string[];

    const suivis: Suivi[] = [];

    if (upcomingRows && upcomingRows.length > 0) {
      type UpcomingRow = { date_rdv: string; heure_rdv: string | null; institutions: { name: string } | null };
      const r = upcomingRows[0] as unknown as UpcomingRow;
      const inst = r.institutions?.name ?? "votre établissement";
      suivis.push({
        id: "rdv", type: "rdv", titre: "Un rendez-vous approche",
        description: `${inst}, le ${new Date(r.date_rdv).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}${r.heure_rdv ? ` à ${r.heure_rdv.slice(0, 5)}` : ""}.`,
        action: { kind: "lien", href: "/mes-rdv" },
      });
    }
    if ((avisAttenteRows?.length ?? 0) > 0) {
      const n = avisAttenteRows!.length;
      suivis.push({
        id: "avis", type: "avis", titre: n > 1 ? `${n} avis à laisser` : "Un avis à laisser",
        description: "Un rendez-vous terminé attend votre retour — ça aide les autres citoyens à choisir.",
        action: { kind: "lien", href: "/compte/mes-avis" },
      });
    }
    if ((documentsRows?.length ?? 0) > 0) {
      const n = documentsRows!.length;
      suivis.push({
        id: "documents", type: "documents", titre: n > 1 ? `${n} documents demandés` : "Un document demandé",
        description: "Un établissement attend un document de votre part.",
        action: { kind: "lien", href: "/compte/documents-telecharges" },
      });
    }
    if (enRetardCount > 0) {
      suivis.push({
        id: "demarche_retard", type: "demarche_retard", titre: enRetardCount > 1 ? `${enRetardCount} démarches en retard` : "Une démarche en retard",
        description: "Une échéance est passée sans être cochée.",
        action: { kind: "lien", href: "#demarches" },
      });
    }
    if (echeanceProcheCount > 0) {
      suivis.push({
        id: "demarche_echeance", type: "demarche_echeance", titre: echeanceProcheCount > 1 ? `${echeanceProcheCount} échéances approchent` : "Une échéance approche",
        description: "Dans les 7 prochains jours.",
        action: { kind: "lien", href: "#demarches" },
      });
    }
    if (topCategorie && topMontant > 0) {
      const label = CATEGORIE_DEPENSE_LABEL[topCategorie] ?? topCategorie;
      suivis.push({
        id: "depense", type: "depense", titre: `${label}, votre plus grosse dépense du mois`,
        description: "Fixez-vous un objectif concret et suivez-le ici, étape par étape.",
        action: { kind: "creer_demarche", titre: `Réduire mes dépenses ${label.toLowerCase()}`, categorie: "personnel" },
      });
    }
    if (centresInteret.length > 0 && (demarchesRows?.length ?? 0) === 0) {
      const label = INTERET_LABEL[centresInteret[0]] ?? centresInteret[0];
      suivis.push({
        id: "interet", type: "interet", titre: `Vous vous intéressez à ${label}`,
        description: "Créez votre première démarche pour commencer à suivre ce qui compte pour vous.",
        action: { kind: "creer_demarche", titre: label, categorie: "personnel" },
      });
    }

    return NextResponse.json({ success: true, suivis });
  } catch (error) {
    console.error("[CITOYEN SUIVIS GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
