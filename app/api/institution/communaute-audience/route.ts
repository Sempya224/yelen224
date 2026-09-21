import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";

// Yelen Community — Audience Intelligence (16/09/2026, brief CEO). Étend
// l'onglet Audience au-delà du simple compteur d'abonnés (croissance,
// démographie, activité, engagement, nouveaux abonnés), en ne s'appuyant
// que sur des données déjà réellement journalisées :
//   - citoyen_abonnements / citoyen_abonnement_events (23/08/2026) —
//     journal COMPLET depuis le lancement de la fonctionnalité (les 2
//     tables sont nées le même jour, aucun abonné antérieur possible sans
//     événement associé — voir app/page.tsx::toggleAbonnement) : la courbe
//     de croissance est donc exacte, pas reconstruite approximativement.
//   - post_impressions / post_vues / post_likes / post_comments —
//     horodatage réel, permet activité par jour/heure et entonnoir
//     d'engagement sans nouvelle table.
//   - users.date_naissance/sexe/ville — démographie des abonnés, jamais
//     exposée à une institution avant ce lot (décision Bryan 16/09/2026).
// Hors périmètre V1 (décision Bryan 16/09/2026) : "Origine de l'audience"
// (profil/publications/recherche/partages) — aucune table ne trace la
// source d'une vue aujourd'hui (institution_vues/post_impressions/
// post_vues n'ont pas de colonne "source"), et l'ajouter suppose de
// modifier aussi le code citoyen qui déclenche ces vues (app/page.tsx,
// fiche institution, recherche, partage) — chantier d'instrumentation
// séparé, pas fait ici. Le frontend affiche un stub honnête à la place.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Lancement réel de citoyen_abonnements/citoyen_abonnement_events — avant
// cette date, la fonctionnalité n'existait pas, donc "0 abonné" est un fait,
// jamais une donnée manquante à combler.
const HISTORIQUE_DEBUT = new Date("2026-08-23T00:00:00.000Z");

// Seuil minimum avant d'afficher un agrégat en pourcentage — même
// discipline que VueEnsembleView::topCategorieLabel (≥3 publications) et
// les favoris citoyen (≥3 mesures) : jamais une fausse précision sur un
// échantillon trop petit.
const SEUIL_MIN_ECHANTILLON = 3;

type Periode = "7j" | "30j" | "90j" | "12mois" | "custom";

function calculerBornes(periode: Periode, fromParam: string | null, toParam: string | null): { debut: Date; fin: Date } {
  const fin = toParam && !isNaN(Date.parse(toParam)) ? new Date(toParam) : new Date();
  if (periode === "custom" && fromParam && !isNaN(Date.parse(fromParam))) {
    return { debut: new Date(fromParam), fin };
  }
  const debut = new Date(fin);
  if (periode === "7j") debut.setUTCDate(debut.getUTCDate() - 7);
  else if (periode === "90j") debut.setUTCDate(debut.getUTCDate() - 90);
  else if (periode === "12mois") debut.setUTCMonth(debut.getUTCMonth() - 12);
  else debut.setUTCDate(debut.getUTCDate() - 30); // 30j par défaut
  return { debut, fin };
}

function jourStr(d: Date): string { return d.toISOString().slice(0, 10); }

const JOURS_LABEL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
// Réordonné Lundi→Dimanche pour l'affichage (brief), getUTCDay() reste 0=Dimanche.
const ORDRE_AFFICHAGE = [1, 2, 3, 4, 5, 6, 0];

function trancheAge(dateNaissance: string): string | null {
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance.getTime())) return null;
  const age = Math.floor((Date.now() - naissance.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age < 18) return null; // donnée aberrante — jamais bucketée à tort
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "communaute-pro") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }
  const instId = membre.institutionId;

  const periodeParam = req.nextUrl.searchParams.get("periode");
  const periode: Periode = periodeParam === "7j" || periodeParam === "90j" || periodeParam === "12mois" || periodeParam === "custom" ? periodeParam : "30j";
  const { debut, fin } = calculerBornes(periode, req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
  const debutEffectif = debut < HISTORIQUE_DEBUT ? HISTORIQUE_DEBUT : debut;

  const [{ data: instRow }, { data: eventsRow }, { data: postsRow }] = await Promise.all([
    sb.from("institutions").select("nb_abonnes").eq("id", instId).maybeSingle(),
    sb.from("citoyen_abonnement_events").select("type, created_at").eq("institution_id", instId).gte("created_at", debutEffectif.toISOString()).lte("created_at", fin.toISOString()).order("created_at", { ascending: true }),
    sb.from("posts").select("id, created_at, nb_partages").eq("institution_auteur_id", instId).eq("auteur_type", "institution"),
  ]);

  const abonnesTotal = instRow?.nb_abonnes ?? 0;
  const events = eventsRow ?? [];
  const posts = postsRow ?? [];
  const postIds = posts.map(p => p.id);

  // ── KPI + courbe de croissance ────────────────────────────────────────
  const nouveauxPeriode = events.filter(e => e.type === "abonne").length;
  const perdusPeriode = events.filter(e => e.type === "desabonne").length;
  const netPeriode = nouveauxPeriode - perdusPeriode;
  // abonnesTotal = valeur live "maintenant" (trigger DB) — on remonte le
  // solde net des événements pour retrouver la valeur exacte au début de
  // la période affichée, jamais une extrapolation. Exact tant que `fin`
  // reste "maintenant" (seul cas exposé par le frontend, pas d'option
  // "Personnalisé" en V1) — un `to` personnalisé dans le passé rendrait ce
  // calcul faux (des événements auraient pu survenir entre `fin` et
  // aujourd'hui), non géré ici volontairement.
  const abonnesDebutPeriode = Math.max(0, abonnesTotal - netPeriode);
  const croissancePct = abonnesDebutPeriode > 0 ? (netPeriode / abonnesDebutPeriode) * 100 : null;

  const serieParJour = new Map<string, { nouveaux: number; perdus: number }>();
  for (let d = new Date(debutEffectif); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    serieParJour.set(jourStr(d), { nouveaux: 0, perdus: 0 });
  }
  for (const e of events) {
    const cle = jourStr(new Date(e.created_at));
    const entree = serieParJour.get(cle);
    if (!entree) continue;
    if (e.type === "abonne") entree.nouveaux++; else entree.perdus++;
  }
  let cumul = abonnesDebutPeriode;
  const croissanceSerie = [...serieParJour.entries()].map(([date, v]) => {
    cumul += v.nouveaux - v.perdus;
    return { date, abonnes: cumul, nouveaux: v.nouveaux, perdus: v.perdus };
  });

  // ── Activité + engagement (posts de l'institution) ─────────────────────
  let impressionsRows: { citoyen_id: string | null; created_at: string }[] = [];
  let vuesRows: { citoyen_id: string | null; created_at: string }[] = [];
  let likesRows: { citoyen_id: string; created_at: string }[] = [];
  let commentsRows: { citoyen_id: string; created_at: string }[] = [];
  if (postIds.length > 0) {
    const [{ data: impD }, { data: vD }, { data: lD }, { data: cD }] = await Promise.all([
      sb.from("post_impressions").select("citoyen_id, created_at").in("post_id", postIds).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
      sb.from("post_vues").select("citoyen_id, created_at").in("post_id", postIds).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
      sb.from("post_likes").select("citoyen_id, created_at").in("post_id", postIds).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
      sb.from("post_comments").select("citoyen_id, created_at").in("post_id", postIds).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
    ]);
    impressionsRows = impD ?? [];
    vuesRows = vD ?? [];
    likesRows = lD ?? [];
    commentsRows = cD ?? [];
  }

  const echantillonActivite = impressionsRows.length + vuesRows.length;
  const activiteParJour = ORDRE_AFFICHAGE.map(jourIdx => ({ jour: JOURS_LABEL[jourIdx], count: 0 }));
  const activiteParHeure = Array.from({ length: 24 }, (_, h) => ({ heure: h, count: 0 }));
  for (const r of [...impressionsRows, ...vuesRows]) {
    const d = new Date(r.created_at);
    const posJour = ORDRE_AFFICHAGE.indexOf(d.getUTCDay());
    if (posJour >= 0) activiteParJour[posJour].count++;
    activiteParHeure[d.getUTCHours()].count++;
  }

  const atteinte = new Set(impressionsRows.map(r => r.citoyen_id).filter((id): id is string => !!id)).size;
  const citoyensActifs = new Set<string>();
  vuesRows.forEach(r => r.citoyen_id && citoyensActifs.add(r.citoyen_id));
  likesRows.forEach(r => r.citoyen_id && citoyensActifs.add(r.citoyen_id));
  commentsRows.forEach(r => r.citoyen_id && citoyensActifs.add(r.citoyen_id));
  // Partages — nb_partages est un compteur sans horodatage individuel
  // (aucune table post_shares n'existe) : on l'attribue aux publications
  // elles-mêmes créées pendant la période, seule lecture honnête possible
  // sans nouvelle instrumentation, jamais une répartition par jour inventée.
  const partagesPeriode = posts.filter(p => {
    const c = new Date(p.created_at);
    return c >= debut && c <= fin;
  }).reduce((s, p) => s + (p.nb_partages ?? 0), 0);
  const tauxEngagement = atteinte >= SEUIL_MIN_ECHANTILLON ? ((likesRows.length + commentsRows.length) / atteinte) * 100 : null;

  // ── Démographie des abonnés actuels (pas filtrée par période — décrit
  // qui suit l'établissement aujourd'hui) ────────────────────────────────
  const { data: abonnesRows } = await sb.from("citoyen_abonnements").select("citoyen_id").eq("institution_id", instId);
  const citoyenIds = (abonnesRows ?? []).map(r => r.citoyen_id);
  const demographie: { localisation: { label: string; pct: number }[] | null; age: { label: string; pct: number }[] | null; genre: { label: string; pct: number }[] | null } = { localisation: null, age: null, genre: null };
  if (citoyenIds.length > 0) {
    const { data: usersRows } = await sb.from("users").select("id, ville, date_naissance, sexe").in("id", citoyenIds);
    const total = citoyenIds.length;

    const villes = (usersRows ?? []).map(u => u.ville).filter((v): v is string => !!v && v.trim() !== "");
    if (villes.length >= SEUIL_MIN_ECHANTILLON) {
      const compte = new Map<string, number>();
      for (const v of villes) compte.set(v, (compte.get(v) ?? 0) + 1);
      const tries = [...compte.entries()].sort((a, b) => b[1] - a[1]);
      const top = tries.slice(0, 3);
      const autres = tries.slice(3).reduce((s, [, n]) => s + n, 0);
      const lignes = top.map(([label, n]) => ({ label, pct: Math.round((n / total) * 100) }));
      if (autres > 0) lignes.push({ label: "Autres", pct: Math.round((autres / total) * 100) });
      demographie.localisation = lignes;
    }

    const tranches = (usersRows ?? []).map(u => u.date_naissance ? trancheAge(u.date_naissance) : null).filter((t): t is string => !!t);
    if (tranches.length >= SEUIL_MIN_ECHANTILLON) {
      const ordreTranches = ["18-24", "25-34", "35-44", "45-54", "55+"];
      const compte = new Map<string, number>();
      for (const t of tranches) compte.set(t, (compte.get(t) ?? 0) + 1);
      demographie.age = ordreTranches.filter(t => compte.has(t)).map(t => ({ label: t, pct: Math.round(((compte.get(t) ?? 0) / total) * 100) }));
    }

    const sexes = (usersRows ?? []).map(u => u.sexe).filter((s): s is string => s === "homme" || s === "femme");
    if (sexes.length >= SEUIL_MIN_ECHANTILLON) {
      const femmes = sexes.filter(s => s === "femme").length;
      const hommes = sexes.filter(s => s === "homme").length;
      const nonRenseigne = total - sexes.length;
      const lignes = [
        { label: "Femmes", pct: Math.round((femmes / total) * 100) },
        { label: "Hommes", pct: Math.round((hommes / total) * 100) },
      ];
      if (nonRenseigne > 0) lignes.push({ label: "Non renseigné", pct: Math.round((nonRenseigne / total) * 100) });
      demographie.genre = lignes;
    }
  }

  // ── Nouveaux abonnés (noms réels — décision Bryan 16/09/2026, même
  // logique que "Mes clients" : relation réelle avec l'établissement) ────
  const { data: recents } = await sb.from("citoyen_abonnements").select("citoyen_id, created_at").eq("institution_id", instId).order("created_at", { ascending: false }).limit(20);
  const idsRecents = [...new Set((recents ?? []).map(r => r.citoyen_id))];
  const { data: usersRecents } = idsRecents.length > 0
    ? await sb.from("users").select("id, nom, prenom, phone").in("id", idsRecents)
    : { data: [] as { id: string; nom: string | null; prenom: string | null; phone: string | null }[] };
  const userMap = new Map((usersRecents ?? []).map(u => [u.id, u]));
  const nouveauxAbonnes = (recents ?? []).map(r => ({
    citoyen_id: r.citoyen_id,
    nom: buildNom(userMap.get(r.citoyen_id)),
    suivi_depuis: r.created_at,
  }));

  return NextResponse.json({
    periode,
    bornes: { debut: debut.toISOString(), fin: fin.toISOString() },
    historique_disponible_depuis: HISTORIQUE_DEBUT.toISOString(),
    kpi: {
      abonnes_total: abonnesTotal,
      nouveaux_periode: nouveauxPeriode,
      perdus_periode: perdusPeriode,
      croissance_nette: netPeriode,
      croissance_pct: croissancePct,
      audience_active: citoyensActifs.size,
      audience_active_pct: abonnesTotal > 0 ? Math.round((citoyensActifs.size / abonnesTotal) * 100) : null,
      portee: atteinte >= SEUIL_MIN_ECHANTILLON ? atteinte : null,
    },
    croissance_serie: croissanceSerie,
    demographie: { suffisant: citoyenIds.length >= SEUIL_MIN_ECHANTILLON, ...demographie },
    activite: {
      suffisant: echantillonActivite >= SEUIL_MIN_ECHANTILLON,
      par_jour: activiteParJour,
      par_heure: activiteParHeure,
    },
    engagement: {
      atteinte,
      active: citoyensActifs.size,
      likes: likesRows.length,
      commentaires: commentsRows.length,
      partages: partagesPeriode,
      ouvertures: vuesRows.length,
      taux_engagement: tauxEngagement,
    },
    nouveaux_abonnes: nouveauxAbonnes,
  });
}
