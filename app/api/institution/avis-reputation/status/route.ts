import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import {
  TAILLE_FENETRE, MIN_AVIS_POUR_SCORE, NOTE_POSITIVE_MIN, NOTE_NEGATIVE_MAX,
  extraireServiceDepuisObjet, estAnnuleParInstitution, calculerSignaux,
  calculerScoreReputation, genererRecommandationsIA, type StatService,
} from "@/lib/reputationScore";

// avis/rdv/rdv_events/signalements n'ont aucune policy RLS exploitable
// depuis ce contexte (mêmes raisons que rdv/events/route.ts et
// avis/repondre/route.ts) — passerelle service_role, tout est filtré par
// authInstId avant retour.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Fenêtre de données chargée pour calculer les signaux "période" (annulation
// institution, réclamations) — au-delà, on considère que ces signaux
// n'apportent plus rien de pertinent pour une fenêtre d'avis récente.
// Simplification assumée : si les 30 derniers avis d'une institution
// s'étalent sur plus de 120 jours (institution à très faible volume), les
// signaux annulation/réclamations peuvent sous-compter les RDV les plus
// anciens de la fenêtre — acceptable pour ce lot, à revisiter si besoin.
const PERIODE_DONNEES_JOURS = 120;
const JOURS_EVOLUTION = 30;

// Anti-spam pour l'alerte "Danger critique" (Lot F) — pas de cron/job
// planifié dans ce projet, donc détection opportuniste à chaque chargement
// de l'écran par l'institution : n'insère une nouvelle alerte que si aucune
// n'a déjà été créée pour cette institution dans les 7 derniers jours.
const ALERTE_ANTI_SPAM_JOURS = 7;

type AvisRow = {
  id: string; note: number; commentaire: string | null; titre: string | null;
  reponse_institution: string | null; reponse_le: string | null; rdv_id: string | null; created_at: string;
};

function finDeJournee(d: Date): Date {
  const f = new Date(d);
  f.setHours(23, 59, 59, 999);
  return f;
}
function toISODateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "avis-reputation") === "none") {
    return NextResponse.json({ error: "Accès non autorisé pour votre rôle" }, { status: 403 });
  }
  const authInstId = membre.institutionId;

  const { data: avisRaw, error: errAvis } = await sb
    .from("avis")
    .select("id,note,commentaire,titre,reponse_institution,reponse_le,rdv_id,created_at")
    .eq("institution_id", authInstId)
    .eq("brouillon", false)
    .eq("masque", false)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (errAvis) return NextResponse.json({ error: errAvis.message }, { status: 500 });
  const avis: AvisRow[] = avisRaw ?? [];

  if (avis.length < MIN_AVIS_POUR_SCORE) {
    return NextResponse.json({
      score: null, niveau: null, phrase: "Pas encore assez d'avis pour calculer un score fiable.",
      alerteAdmin: false, signaux: null, evolution: [], mois: { positifs: 0, negatifs: 0, sansCommentaire: 0, total: 0 },
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, services: [], recommandations: [], citations: [],
      avisCount: avis.length, minAvisRequis: MIN_AVIS_POUR_SCORE,
    });
  }

  const rdvIdsAvis = [...new Set(avis.map(a => a.rdv_id).filter((x): x is string => !!x))];
  const { data: rdvAvisData } = rdvIdsAvis.length
    ? await sb.from("rdv").select("id,objet").eq("institution_id", authInstId).in("id", rdvIdsAvis)
    : { data: [] as { id: string; objet: string | null }[] };
  const objetParRdv = new Map((rdvAvisData ?? []).map(r => [r.id, r.objet]));

  const debutPeriode = new Date();
  debutPeriode.setDate(debutPeriode.getDate() - PERIODE_DONNEES_JOURS);

  const { data: rdvPeriodeData } = await sb
    .from("rdv")
    .select("id,statut,created_at")
    .eq("institution_id", authInstId)
    .gte("created_at", debutPeriode.toISOString());
  const rdvPeriode = rdvPeriodeData ?? [];

  const rdvAnnulesIds = rdvPeriode.filter(r => r.statut === "annule").map(r => r.id);
  const { data: eventsData } = rdvAnnulesIds.length
    ? await sb.from("rdv_events").select("rdv_id,auteur_type,action").in("rdv_id", rdvAnnulesIds).eq("action", "annulation")
    : { data: [] as { rdv_id: string; auteur_type: string; action: string }[] };
  const rdvIdsAnnulesParCitoyen = new Set((eventsData ?? []).filter(e => e.auteur_type === "citoyen").map(e => e.rdv_id));

  const { data: reclamationsData } = await sb
    .from("signalements")
    .select("id,created_at")
    .eq("institution_id", authInstId)
    .eq("statut", "resolu")
    .gte("created_at", debutPeriode.toISOString());
  const reclamations = reclamationsData ?? [];

  function signauxEtScoreAuJour(borneHaute: Date) {
    const avisAsOf = avis.filter(a => new Date(a.created_at) <= borneHaute);
    const fenetre = avisAsOf.slice(0, TAILLE_FENETRE);
    if (fenetre.length < MIN_AVIS_POUR_SCORE) return null;

    const borneBasse = new Date(fenetre[fenetre.length - 1].created_at);
    const rdvFenetre = rdvPeriode.filter(r => {
      const t = new Date(r.created_at);
      return t >= borneBasse && t <= borneHaute;
    });
    const nbRdvAnnulesInstitution = rdvFenetre.filter(r => r.statut === "annule" && estAnnuleParInstitution(r.id, rdvIdsAnnulesParCitoyen)).length;
    const nbReclamationsResolues = reclamations.filter(s => {
      const t = new Date(s.created_at);
      return t >= borneBasse && t <= borneHaute;
    }).length;

    const signaux = calculerSignaux({
      avisFenetre: fenetre,
      nbRdvAnnulesInstitutionPeriode: nbRdvAnnulesInstitution,
      nbRdvTotalPeriode: rdvFenetre.length,
      nbReclamationsResoluesPeriode: nbReclamationsResolues,
    });
    return { ...calculerScoreReputation(signaux), signaux };
  }

  const resultatCourant = signauxEtScoreAuJour(new Date());
  if (!resultatCourant) {
    return NextResponse.json({
      score: null, niveau: null, phrase: "Pas encore assez d'avis pour calculer un score fiable.",
      alerteAdmin: false, signaux: null, evolution: [], mois: { positifs: 0, negatifs: 0, sansCommentaire: 0, total: 0 },
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, services: [], recommandations: [], citations: [],
      avisCount: avis.length, minAvisRequis: MIN_AVIS_POUR_SCORE,
    });
  }

  if (resultatCourant.alerteAdmin) {
    const seuilAntiSpam = new Date();
    seuilAntiSpam.setDate(seuilAntiSpam.getDate() - ALERTE_ANTI_SPAM_JOURS);
    const { data: alerteRecente } = await sb
      .from("signalements")
      .select("id")
      .eq("institution_id", authInstId)
      .eq("type_signaleur", "system")
      .gte("created_at", seuilAntiSpam.toISOString())
      .limit(1)
      .maybeSingle();

    // Insert non-bloquant : une erreur ici ne doit jamais faire échouer le
    // chargement de l'écran (même esprit que enregistrerAction() dans
    // lib/journalActivite.ts). Aucune fermeture automatique — ceci ne fait
    // que remonter le dossier à un admin Yelen pour examen humain.
    if (!alerteRecente) {
      await sb.from("signalements").insert({
        institution_id: authInstId,
        type_signaleur: "system",
        type_cible: "institution",
        motif: "Alerte réputation automatique",
        description: `Score de santé du compte à ${resultatCourant.score}/100 (zone critique). ${resultatCourant.phrase} Recommandation : examiner le dossier de l'établissement (avis récents, annulations, réclamations).`,
        statut: "en_cours",
        priorite: "haute",
      });
    }
  }

  const evolution: { date: string; score: number }[] = [];
  for (let i = JOURS_EVOLUTION - 1; i >= 0; i--) {
    const jour = new Date();
    jour.setDate(jour.getDate() - i);
    const r = signauxEtScoreAuJour(finDeJournee(jour));
    if (r) evolution.push({ date: toISODateOnly(jour), score: r.score });
  }

  const now = new Date();
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  const avisMois = avis.filter(a => new Date(a.created_at) >= debutMois);
  const mois = {
    positifs: avisMois.filter(a => a.note >= NOTE_POSITIVE_MIN).length,
    negatifs: avisMois.filter(a => a.note <= NOTE_NEGATIVE_MAX).length,
    sansCommentaire: avisMois.filter(a => !a.commentaire).length,
    total: avisMois.length,
  };

  const distribution: Record<"5" | "4" | "3" | "2" | "1", number> = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  for (const a of avis) {
    const k = String(Math.max(1, Math.min(5, Math.round(a.note)))) as keyof typeof distribution;
    distribution[k]++;
  }

  const servicesMap = new Map<string, { nbAvis: number; nbNegatifs: number; sommeNotes: number }>();
  for (const a of avisMois) {
    const objet = a.rdv_id ? objetParRdv.get(a.rdv_id) ?? null : null;
    const service = extraireServiceDepuisObjet(objet ?? null);
    if (!service) continue;
    const entry = servicesMap.get(service) ?? { nbAvis: 0, nbNegatifs: 0, sommeNotes: 0 };
    entry.nbAvis++;
    entry.sommeNotes += a.note;
    if (a.note <= NOTE_NEGATIVE_MAX) entry.nbNegatifs++;
    servicesMap.set(service, entry);
  }
  const services: StatService[] = [...servicesMap.entries()]
    .map(([service, v]) => ({ service, nbAvis: v.nbAvis, nbNegatifs: v.nbNegatifs, noteMoyenne: Math.round((v.sommeNotes / v.nbAvis) * 10) / 10 }))
    .sort((a, b) => b.nbAvis - a.nbAvis);

  const tauxAnnulationInstitutionMoisPct = (() => {
    const rdvMois = rdvPeriode.filter(r => new Date(r.created_at) >= debutMois);
    if (rdvMois.length === 0) return 0;
    const annulesInst = rdvMois.filter(r => r.statut === "annule" && estAnnuleParInstitution(r.id, rdvIdsAnnulesParCitoyen)).length;
    return (annulesInst / rdvMois.length) * 100;
  })();
  const nbReclamationsResoluesMois = reclamations.filter(s => new Date(s.created_at) >= debutMois).length;

  const recommandations = genererRecommandationsIA({
    avisNegatifsMois: avisMois.filter(a => a.note <= NOTE_NEGATIVE_MAX),
    servicesMois: services,
    tauxAnnulationInstitutionMoisPct,
    nbReclamationsResoluesMois,
  });

  const citations = avis.filter(a => a.note >= NOTE_POSITIVE_MIN && a.commentaire && a.commentaire.trim()).slice(0, 5)
    .map(a => ({ note: a.note, commentaire: a.commentaire, created_at: a.created_at }));

  return NextResponse.json({
    score: resultatCourant.score, niveau: resultatCourant.niveau, phrase: resultatCourant.phrase,
    alerteAdmin: resultatCourant.alerteAdmin, signaux: resultatCourant.signaux,
    evolution, mois, distribution, services, recommandations, citations,
  });
}

export async function POST() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
