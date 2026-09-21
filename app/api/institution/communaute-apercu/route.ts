import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerBornesCommunaute, calculerCriteresPresence, scorePresencePct, jourStrCommunaute, SEUIL_MIN_ECHANTILLON_COMMUNAUTE, type PeriodeCommunaute } from "@/lib/communauteProAnalytics";

// Yelen Community — Vue d'ensemble V2 (16/09/2026, brief CEO) : le cockpit
// ("comprendre + agir"), pas un 2e écran Performance. Ne renvoie QUE ce qui
// n'est pas déjà disponible côté client via le prop `posts` (déjà chargé
// par CommunauteProHub avec nb_vues/nb_likes/nb_commentaires/nb_partages
// par post) — Publications (état), Meilleurs contenus et Publications
// récentes restent calculés côté frontend à partir de ce prop, jamais
// requêtés une 2e fois ici. Cette route couvre uniquement ce qui exige un
// horodatage événementiel (institution_vues, citoyen_abonnement_events,
// post_likes/comments/impressions) : Abonnés+delta, Engagement/Portée/
// Visites sur la période, la série d'activité jour par jour, et le score
// de présence (partagé avec l'onglet Présence via lib/communauteProAnalytics
// — même définition partout, jamais 2 calculs qui divergent).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "communaute-pro") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }
  const instId = membre.institutionId;

  const periodeParam = req.nextUrl.searchParams.get("periode");
  const periode: PeriodeCommunaute = periodeParam === "7j" || periodeParam === "90j" || periodeParam === "12mois" ? periodeParam : "30j";
  const { debut, fin } = calculerBornesCommunaute(periode);

  const [{ data: instRow }, { data: postsRow }, { data: vuesRows }, { data: eventsRow }] = await Promise.all([
    sb.from("institutions").select("nb_abonnes, logo, banniere, description, adresse, horaires, services, phone, whatsapp").eq("id", instId).maybeSingle(),
    sb.from("posts").select("id, created_at, nb_partages").eq("institution_auteur_id", instId).eq("auteur_type", "institution"),
    sb.from("institution_vues").select("citoyen_id, created_at").eq("institution_id", instId).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
    sb.from("citoyen_abonnement_events").select("type, created_at").eq("institution_id", instId).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
  ]);

  const abonnesTotal = instRow?.nb_abonnes ?? 0;
  const events = eventsRow ?? [];
  const nouveaux = events.filter(e => e.type === "abonne").length;
  const perdus = events.filter(e => e.type === "desabonne").length;
  const abonnesDeltaPeriode = nouveaux - perdus;

  const posts = postsRow ?? [];
  const postIds = posts.map(p => p.id);
  let impressionsRows: { citoyen_id: string | null; created_at: string }[] = [];
  let vuesPostsRows: { citoyen_id: string | null; created_at: string }[] = [];
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
    vuesPostsRows = vD ?? [];
    likesRows = lD ?? [];
    commentsRows = cD ?? [];
  }

  const vuesProfil = vuesRows ?? [];
  const portee = new Set(impressionsRows.map(r => r.citoyen_id).filter((id): id is string => !!id)).size;
  // Partages — même approximation honnête que l'onglet Audience (pas de
  // table post_shares avec horodatage) : attribué aux publications créées
  // pendant la période, jamais réparti arbitrairement jour par jour.
  const partagesPeriode = posts.filter(p => { const c = new Date(p.created_at); return c >= debut && c <= fin; }).reduce((s, p) => s + (p.nb_partages ?? 0), 0);
  const engagementTotal = likesRows.length + commentsRows.length + partagesPeriode;

  const audienceActive = new Set<string>();
  vuesPostsRows.forEach(r => r.citoyen_id && audienceActive.add(r.citoyen_id));
  likesRows.forEach(r => r.citoyen_id && audienceActive.add(r.citoyen_id));
  commentsRows.forEach(r => r.citoyen_id && audienceActive.add(r.citoyen_id));

  // Série d'activité jour par jour — "Publications" est ajoutée côté
  // frontend à partir du prop `posts` déjà chargé (mêmes dates), pas
  // requêté ici une 2e fois.
  const serieParJour = new Map<string, { vues: number; interactions: number; abonnesDelta: number }>();
  for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    serieParJour.set(jourStrCommunaute(d), { vues: 0, interactions: 0, abonnesDelta: 0 });
  }
  for (const v of vuesProfil) { const e = serieParJour.get(jourStrCommunaute(new Date(v.created_at))); if (e) e.vues++; }
  for (const l of likesRows) { const e = serieParJour.get(jourStrCommunaute(new Date(l.created_at))); if (e) e.interactions++; }
  for (const c of commentsRows) { const e = serieParJour.get(jourStrCommunaute(new Date(c.created_at))); if (e) e.interactions++; }
  for (const ev of events) { const e = serieParJour.get(jourStrCommunaute(new Date(ev.created_at))); if (e) e.abonnesDelta += ev.type === "abonne" ? 1 : -1; }

  let cumulAbonnes = abonnesTotal - abonnesDeltaPeriode;
  const activiteSerie = [...serieParJour.entries()].map(([date, v]) => {
    cumulAbonnes += v.abonnesDelta;
    return { date, vues: v.vues, interactions: v.interactions, abonnes: Math.max(0, cumulAbonnes) };
  });

  const criteres = instRow ? calculerCriteresPresence(instRow) : [];

  return NextResponse.json({
    bornes: { debut: debut.toISOString(), fin: fin.toISOString() },
    kpi: {
      abonnes_total: abonnesTotal,
      abonnes_delta_periode: abonnesDeltaPeriode,
      engagement_total: engagementTotal,
      portee: portee >= SEUIL_MIN_ECHANTILLON_COMMUNAUTE ? portee : null,
      visites: vuesProfil.length,
    },
    activite_serie: activiteSerie,
    audience_resume: { abonnes: abonnesTotal, delta_periode: abonnesDeltaPeriode, audience_active: audienceActive.size },
    score_presence: { pct: scorePresencePct(criteres), criteres },
  });
}
