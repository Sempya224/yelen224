import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

// Communication — Statistiques V2 (17/09/2026, brief CEO). Ne couvre que ce
// qui est réellement traçable avec un horodatage par événement :
// annonce_vues / annonce_likes / annonce_commentaires (citoyen_id +
// created_at réels). Décision Bryan 17/09/2026 : "Clics"/"Ouvertures" et
// "Comment les citoyens découvrent vos annonces" (source) sont hors
// périmètre — `annonces.nb_clics` n'est jamais incrémenté pour les
// annonces (vérifié : aucun code d'écriture, contrairement à nb_clics des
// offres qui lui est réel), et aucune colonne "source" n'existe nulle
// part. Les ajouter serait un chantier d'instrumentation séparé.
// Partages (nb_partages) reste un compteur sans horodatage individuel :
// attribué à la période de création de l'annonce elle-même, même
// approximation honnête déjà utilisée pour Yelen Community.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Periode = "7j" | "30j" | "90j" | "annee";
const SEUIL_MIN_ECHANTILLON = 3;

function calculerBornes(periode: Periode) {
  const fin = new Date();
  const debut = new Date(fin);
  if (periode === "7j") debut.setUTCDate(debut.getUTCDate() - 7);
  else if (periode === "90j") debut.setUTCDate(debut.getUTCDate() - 90);
  else if (periode === "annee") { debut.setUTCMonth(0, 1); debut.setUTCHours(0, 0, 0, 0); }
  else debut.setUTCDate(debut.getUTCDate() - 30);
  const dureeMs = fin.getTime() - debut.getTime();
  const finPrec = new Date(debut.getTime() - 1);
  const debutPrec = new Date(debut.getTime() - dureeMs);
  return { debut, fin, debutPrec, finPrec };
}

function jourStr(d: Date): string { return d.toISOString().slice(0, 10); }

function estActive(a: { statut: string; date_expiration: string | null }): boolean {
  if (a.statut === "archivee") return false;
  if (a.date_expiration && new Date(a.date_expiration) < new Date()) return false;
  return a.statut === "publiee";
}

function deltaPct(courant: number, precedent: number): number | null {
  if (precedent > 0) return Math.round(((courant - precedent) / precedent) * 1000) / 10;
  return null; // pas de base de comparaison — jamais un % fabriqué à partir de 0
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const instId = membre.institutionId;

  const periodeParam = req.nextUrl.searchParams.get("periode");
  const periode: Periode = periodeParam === "7j" || periodeParam === "90j" || periodeParam === "annee" ? periodeParam : "30j";
  const { debut, fin, debutPrec, finPrec } = calculerBornes(periode);

  const { data: annoncesRow } = await sb.from("annonces")
    .select("id, titre, type, statut, date_expiration, date_publication, created_at, nb_partages")
    .eq("institution_id", instId);
  const annonces = annoncesRow ?? [];
  const ids = annonces.map(a => a.id);

  let vuesRows: { annonce_id: string; citoyen_id: string | null; created_at: string }[] = [];
  let likesRows: { annonce_id: string; citoyen_id: string; created_at: string }[] = [];
  let commentsRows: { annonce_id: string; citoyen_id: string; created_at: string }[] = [];
  if (ids.length > 0) {
    const [{ data: vD }, { data: lD }, { data: cD }] = await Promise.all([
      sb.from("annonce_vues").select("annonce_id, citoyen_id, created_at").in("annonce_id", ids).gte("created_at", debutPrec.toISOString()).lte("created_at", fin.toISOString()),
      sb.from("annonce_likes").select("annonce_id, citoyen_id, created_at").in("annonce_id", ids).gte("created_at", debutPrec.toISOString()).lte("created_at", fin.toISOString()),
      sb.from("annonce_commentaires").select("annonce_id, citoyen_id, created_at").in("annonce_id", ids).gte("created_at", debutPrec.toISOString()).lte("created_at", fin.toISOString()),
    ]);
    vuesRows = vD ?? []; likesRows = lD ?? []; commentsRows = cD ?? [];
  }

  const dansPeriode = (iso: string, d1: Date, d2: Date) => { const t = new Date(iso).getTime(); return t >= d1.getTime() && t <= d2.getTime(); };
  const vuesCourant = vuesRows.filter(r => dansPeriode(r.created_at, debut, fin));
  const vuesPrec = vuesRows.filter(r => dansPeriode(r.created_at, debutPrec, finPrec));
  const likesCourant = likesRows.filter(r => dansPeriode(r.created_at, debut, fin));
  const likesPrec = likesRows.filter(r => dansPeriode(r.created_at, debutPrec, finPrec));
  const commentsCourant = commentsRows.filter(r => dansPeriode(r.created_at, debut, fin));
  const commentsPrec = commentsRows.filter(r => dansPeriode(r.created_at, debutPrec, finPrec));
  const partagesCourant = annonces.filter(a => dansPeriode(a.created_at, debut, fin)).reduce((s, a) => s + (a.nb_partages ?? 0), 0);
  const partagesPrec = annonces.filter(a => dansPeriode(a.created_at, debutPrec, finPrec)).reduce((s, a) => s + (a.nb_partages ?? 0), 0);

  const citoyensTouches = (rows: { citoyen_id: string | null }[]) => new Set(rows.map(r => r.citoyen_id).filter((id): id is string => !!id)).size;

  const interactionsCourant = likesCourant.length + commentsCourant.length + partagesCourant;
  const interactionsPrec = likesPrec.length + commentsPrec.length + partagesPrec;
  const activesMaintenant = annonces.filter(estActive).length;

  const tauxCourant = vuesCourant.length > 0 ? Math.round((interactionsCourant / vuesCourant.length) * 1000) / 10 : null;
  const tauxPrec = vuesPrec.length > 0 ? Math.round((interactionsPrec / vuesPrec.length) * 1000) / 10 : null;

  // Série jour par jour (période courante uniquement)
  const serieParJour = new Map<string, { vues: number; citoyens: Set<string>; interactions: number }>();
  for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    serieParJour.set(jourStr(d), { vues: 0, citoyens: new Set(), interactions: 0 });
  }
  for (const r of vuesCourant) { const e = serieParJour.get(jourStr(new Date(r.created_at))); if (e) { e.vues++; if (r.citoyen_id) e.citoyens.add(r.citoyen_id); } }
  for (const r of likesCourant) { const e = serieParJour.get(jourStr(new Date(r.created_at))); if (e) e.interactions++; }
  for (const r of commentsCourant) { const e = serieParJour.get(jourStr(new Date(r.created_at))); if (e) e.interactions++; }
  const serie = [...serieParJour.entries()].map(([date, v]) => ({ date, vues: v.vues, citoyens_touches: v.citoyens.size, interactions: v.interactions }));

  // Détail par annonce (période courante) — alimente la table + les "Top annonces"
  const annoncesDetail = annonces.map(a => {
    const vA = vuesCourant.filter(r => r.annonce_id === a.id);
    const lA = likesCourant.filter(r => r.annonce_id === a.id).length;
    const cA = commentsCourant.filter(r => r.annonce_id === a.id).length;
    const pA = dansPeriode(a.created_at, debut, fin) ? (a.nb_partages ?? 0) : 0;
    const interactionsA = lA + cA + pA;
    return {
      id: a.id, titre: a.titre, type: a.type, statut: estActive(a) ? "publiee" : (a.statut === "archivee" ? "archivee" : (a.date_expiration && new Date(a.date_expiration) < new Date() ? "terminee" : a.statut)),
      vues: vA.length, citoyens_touches: citoyensTouches(vA), interactions: interactionsA,
      taux_interaction: vA.length > 0 ? Math.round((interactionsA / vA.length) * 1000) / 10 : null,
    };
  });

  return NextResponse.json({
    bornes: { debut: debut.toISOString(), fin: fin.toISOString() },
    kpi: {
      vues: { valeur: vuesCourant.length, delta_pct: deltaPct(vuesCourant.length, vuesPrec.length) },
      citoyens_touches: { valeur: citoyensTouches(vuesCourant), delta_pct: deltaPct(citoyensTouches(vuesCourant), citoyensTouches(vuesPrec)) },
      interactions: { valeur: interactionsCourant, delta_pct: deltaPct(interactionsCourant, interactionsPrec) },
      annonces_actives: { valeur: activesMaintenant },
      taux_interaction: { valeur: tauxCourant, delta_pct: tauxCourant !== null && tauxPrec !== null ? deltaPct(tauxCourant, tauxPrec) : null },
    },
    engagement: { likes: likesCourant.length, commentaires: commentsCourant.length, partages: partagesCourant },
    serie,
    annonces: annoncesDetail,
    echantillon_suffisant: vuesCourant.length >= SEUIL_MIN_ECHANTILLON,
  });
}
