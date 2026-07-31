import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
// assistant (zéro LLM, règles déterministes, dupliquées volontairement —
// pas de module partagé client/serveur dans ce projet) mais étendu avec
// deux signaux propres à cet écran : la catégorie de dépense la plus
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
      supabaseAdmin.from("citoyen_demarches").select("id, titre, statut, date_cible").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("citoyen_documents").select("id").eq("citoyen_id", citoyenId).eq("sens", "demande").eq("statut", "en_attente"),
      supabaseAdmin.from("citoyen_depenses").select("categorie, montant, date_depense").eq("citoyen_id", citoyenId),
      supabaseAdmin.from("paid_bookings").select("montant_paye, created_at").eq("citoyen_id", citoyenId).in("statut", ["confirme", "termine"]),
      supabaseAdmin.from("users").select("centres_interet").eq("id", citoyenId).maybeSingle(),
    ]);

    const demarchesEnCours = (demarchesRows ?? []).filter((d) => d.statut === "en_cours");
    const demarcheIds = demarchesEnCours.map((d) => d.id);
    const { data: etapesRows } = demarcheIds.length
      ? await supabaseAdmin.from("citoyen_demarche_etapes").select("demarche_id, fait, date_echeance").in("demarche_id", demarcheIds)
      : { data: [] as { demarche_id: string; fait: boolean; date_echeance: string | null }[] };
    const etapesParDemarche = new Map<string, { fait: boolean; date_echeance: string | null }[]>();
    for (const e of etapesRows ?? []) {
      if (!etapesParDemarche.has(e.demarche_id)) etapesParDemarche.set(e.demarche_id, []);
      etapesParDemarche.get(e.demarche_id)!.push({ fait: e.fait, date_echeance: e.date_echeance });
    }
    const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
    const dansSeptJours = new Date(aujourdHui); dansSeptJours.setDate(dansSeptJours.getDate() + 7);
    let enRetardCount = 0, echeanceProcheCount = 0;
    for (const d of demarchesEnCours) {
      const mesEtapes = etapesParDemarche.get(d.id) ?? [];
      const dates = mesEtapes.length > 0
        ? mesEtapes.filter((e) => !e.fait && e.date_echeance).map((e) => new Date(e.date_echeance as string))
        : d.date_cible ? [new Date(d.date_cible)] : [];
      if (dates.length === 0) continue;
      if (dates.some((dt) => dt < aujourdHui)) enRetardCount++;
      else if (dates.some((dt) => dt >= aujourdHui && dt <= dansSeptJours)) echeanceProcheCount++;
    }

    // Dépense la plus élevée du mois en cours — mêmes règles que
    // app/menu/depenses/depenses-client.tsx (manuelles + RDV payés).
    const parCategorie = new Map<string, number>();
    for (const d of depensesRows ?? []) {
      const date = new Date(d.date_depense);
      if (date.getFullYear() === aujourdHui.getFullYear() && date.getMonth() === aujourdHui.getMonth()) {
        parCategorie.set(d.categorie, (parCategorie.get(d.categorie) ?? 0) + d.montant);
      }
    }
    for (const p of paidRows ?? []) {
      const date = new Date(p.created_at);
      if (date.getFullYear() === aujourdHui.getFullYear() && date.getMonth() === aujourdHui.getMonth()) {
        parCategorie.set("yelen", (parCategorie.get("yelen") ?? 0) + (p.montant_paye ?? 0));
      }
    }
    let topCategorie: string | null = null, topMontant = 0;
    for (const [cat, montant] of parCategorie) {
      if (cat !== "yelen" && montant > topMontant) { topCategorie = cat; topMontant = montant; }
    }

    const centresInteret = (userRow?.centres_interet ?? []) as string[];

    const suivis: Suivi[] = [];

    if (upcomingRows && upcomingRows.length > 0) {
      const r = upcomingRows[0] as any;
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
