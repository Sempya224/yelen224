import { createClient } from "@supabase/supabase-js";

// Rapports — "Executive Report Center" (refonte niveau US, brief CEO
// 06/08/2026, instruction #10). Même philosophie que financeAggregation.ts
// (source de vérité = paid_bookings.montant_paye, jamais paid_services.prix
// en direct) mais événement daté sur `traite_le` (moment réel de
// l'encaissement) avec repli sur `created_at` pour les réservations
// antérieures à la migration `paid_bookings.traite_le` (05/08/2026, chantier
// Centre de validation) qui n'ont pas cette colonne renseignée — jamais la
// date de création de la réservation quand la vraie date de paiement est
// connue, pour ne pas dater un revenu au mauvais jour.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export type PointSerie = { label: string; montant: number; ventes: number };
export type KpiPeriode = { montant: number; nb: number; delta: number | null };
export type ServiceRapport = {
  id: string;
  nom: string;
  categorie: string;
  nb: number;
  montant: number;
  delta: number | null;
  partCA: number;
  dureeMinutes: number | null;
};
export type CategorieRepartition = { categorie: string; montant: number; pct: number };

export type RapportExecutif = {
  genere_le: string;
  kpi: { aujourdhui: KpiPeriode; semaine: KpiPeriode; mois: KpiPeriode; annee: KpiPeriode };
  sparklines: { aujourdhui: number[]; semaine: number[]; mois: number[]; annee: number[] };
  evolution: { jour: PointSerie[]; semaine: PointSerie[]; mois: PointSerie[]; annee: PointSerie[] };
  top_services: ServiceRapport[];
  repartition_categories: CategorieRepartition[];
  activite_jour: PointSerie[];
  meilleur_jour_semaine: { jour: string; montant: number } | null;
  resume: string[];
};

// null => aucune comparaison affichable (jamais de "+Infinity%" quand la
// période précédente est à zéro) — même convention que paiements/route.ts.
function variationPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

type Booking = {
  id: string;
  montant_paye: number;
  created_at: string;
  traite_le: string | null;
  service_id: string;
  service_nom: string;
  service_categorie: string;
  service_duree: number | null;
};

const JOURS_SEMAINE = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const JOURS_COMPLETS: Record<string, string> = { Dim: "dimanche", Lun: "lundi", Mar: "mardi", Mer: "mercredi", Jeu: "jeudi", Ven: "vendredi", Sam: "samedi" };
const MOIS_ANNEE = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export async function calculerRapportExecutif(institutionId: string): Promise<RapportExecutif> {
  const now = new Date();
  const finCourant = new Date(now.getTime() + 1);
  const debutAnneePrec = new Date(now.getFullYear() - 1, 0, 1);

  const { data: raw } = await sb
    .from("paid_bookings")
    .select("id,montant_paye,created_at,traite_le,service_id,paid_services(nom,categorie,duree_minutes)")
    .eq("institution_id", institutionId)
    .in("statut", ["confirme", "termine"])
    .gte("created_at", debutAnneePrec.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);

  type BookingRow = {
    id: string; montant_paye: number | null; created_at: string; traite_le: string | null; service_id: string;
    paid_services: { nom: string | null; categorie: string | null; duree_minutes: number | null } | null;
  };
  const bookings: Booking[] = ((raw ?? []) as unknown as BookingRow[]).map((b) => ({
    id: b.id,
    montant_paye: b.montant_paye ?? 0,
    created_at: b.created_at,
    traite_le: b.traite_le,
    service_id: b.service_id,
    service_nom: b.paid_services?.nom ?? "Service",
    service_categorie: b.paid_services?.categorie || "Non catégorisé",
    service_duree: b.paid_services?.duree_minutes ?? null,
  }));

  function dateEvenement(b: Booking): Date {
    return new Date(b.traite_le ?? b.created_at);
  }

  // Bornes de périodes (semaine = dimanche→samedi, même convention que
  // financeAggregation.ts).
  const debutJour = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const debutHier = new Date(debutJour); debutHier.setDate(debutHier.getDate() - 1);
  const debutSemaine = new Date(debutJour); debutSemaine.setDate(debutSemaine.getDate() - debutSemaine.getDay());
  const finSemaine = new Date(debutSemaine); finSemaine.setDate(finSemaine.getDate() + 7);
  const debutSemainePrec = new Date(debutSemaine); debutSemainePrec.setDate(debutSemainePrec.getDate() - 7);
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const debutMoisPrec = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const debutAnnee = new Date(now.getFullYear(), 0, 1);
  const finAnnee = new Date(now.getFullYear() + 1, 0, 1);

  function sommePeriode(depuis: Date, avant: Date): { montant: number; nb: number } {
    const dans = bookings.filter(b => { const d = dateEvenement(b); return d >= depuis && d < avant; });
    return { montant: dans.reduce((s, b) => s + b.montant_paye, 0), nb: dans.length };
  }

  const auj = sommePeriode(debutJour, finCourant);
  const hier = sommePeriode(debutHier, debutJour);
  const sem = sommePeriode(debutSemaine, finCourant);
  const semPrec = sommePeriode(debutSemainePrec, debutSemaine);
  const mois = sommePeriode(debutMois, finCourant);
  const moisPrec = sommePeriode(debutMoisPrec, debutMois);
  const annee = sommePeriode(debutAnnee, finCourant);
  const anneePrec = sommePeriode(debutAnneePrec, debutAnnee);

  const kpi = {
    aujourdhui: { montant: auj.montant, nb: auj.nb, delta: variationPct(auj.montant, hier.montant) },
    semaine: { montant: sem.montant, nb: sem.nb, delta: variationPct(sem.montant, semPrec.montant) },
    mois: { montant: mois.montant, nb: mois.nb, delta: variationPct(mois.montant, moisPrec.montant) },
    annee: { montant: annee.montant, nb: annee.nb, delta: variationPct(annee.montant, anneePrec.montant) },
  };

  // Séries pour le graphique principal (toggle Jour/Semaine/Mois/Année) —
  // chaque case future de la période en cours vaut légitimement 0 (donnée
  // réelle : rien n'a encore été vendu), jamais tronquée.
  const evolutionJour: PointSerie[] = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, montant: 0, ventes: 0 }));
  const evolutionSemaine: PointSerie[] = JOURS_SEMAINE.map(l => ({ label: l, montant: 0, ventes: 0 }));
  const joursDansMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const evolutionMois: PointSerie[] = Array.from({ length: joursDansMois }, (_, i) => ({ label: String(i + 1), montant: 0, ventes: 0 }));
  const evolutionAnnee: PointSerie[] = MOIS_ANNEE.map(l => ({ label: l, montant: 0, ventes: 0 }));

  for (const b of bookings) {
    const d = dateEvenement(b);
    if (d >= debutJour && d < finCourant) {
      const h = d.getHours();
      evolutionJour[h].montant += b.montant_paye; evolutionJour[h].ventes += 1;
    }
    if (d >= debutSemaine && d < finSemaine) {
      const j = d.getDay();
      evolutionSemaine[j].montant += b.montant_paye; evolutionSemaine[j].ventes += 1;
    }
    if (d >= debutMois && d < finMois) {
      const i = d.getDate() - 1;
      evolutionMois[i].montant += b.montant_paye; evolutionMois[i].ventes += 1;
    }
    if (d >= debutAnnee && d < finAnnee) {
      const m = d.getMonth();
      evolutionAnnee[m].montant += b.montant_paye; evolutionAnnee[m].ventes += 1;
    }
  }

  const joursAvecVentesSemaine = evolutionSemaine.filter(p => p.ventes > 0);
  const meilleurJour = joursAvecVentesSemaine.length > 0
    ? joursAvecVentesSemaine.reduce((max, p) => (p.montant > max.montant ? p : max))
    : null;

  // Top services (scope année en cours, même périmètre que l'ancien
  // "Top services (cette année)") + évolution vs même service l'année
  // précédente. Part du CA calculée sur le total de TOUS les services de
  // l'année, pas seulement le top 10 affiché.
  type Agg = { nom: string; categorie: string; duree: number | null; nb: number; montant: number };
  const anneeByService = new Map<string, Agg>();
  const anneePrecByService = new Map<string, number>();
  for (const b of bookings) {
    const d = dateEvenement(b);
    if (d >= debutAnnee && d < finAnnee) {
      const cur = anneeByService.get(b.service_id) ?? { nom: b.service_nom, categorie: b.service_categorie, duree: b.service_duree, nb: 0, montant: 0 };
      cur.nb += 1; cur.montant += b.montant_paye;
      anneeByService.set(b.service_id, cur);
    } else if (d >= debutAnneePrec && d < debutAnnee) {
      anneePrecByService.set(b.service_id, (anneePrecByService.get(b.service_id) ?? 0) + b.montant_paye);
    }
  }
  const totalMontantAnnee = [...anneeByService.values()].reduce((s, a) => s + a.montant, 0);
  const top_services: ServiceRapport[] = [...anneeByService.entries()]
    .map(([id, a]) => ({
      id, nom: a.nom, categorie: a.categorie, nb: a.nb, montant: a.montant,
      delta: variationPct(a.montant, anneePrecByService.get(id) ?? 0),
      partCA: totalMontantAnnee > 0 ? Math.round((a.montant / totalMontantAnnee) * 1000) / 10 : 0,
      dureeMinutes: a.duree,
    }))
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 10);

  const catMap = new Map<string, number>();
  for (const a of anneeByService.values()) catMap.set(a.categorie, (catMap.get(a.categorie) ?? 0) + a.montant);
  const repartition_categories: CategorieRepartition[] = [...catMap.entries()]
    .map(([categorie, montant]) => ({ categorie, montant, pct: totalMontantAnnee > 0 ? Math.round((montant / totalMontantAnnee) * 1000) / 10 : 0 }))
    .sort((a, b) => b.montant - a.montant);

  // Résumé — synthèse 100% déterministe (règles/seuils, zéro appel LLM,
  // conforme à la philosophie du projet), scope "cette semaine" pour rester
  // cohérent d'une phrase à l'autre.
  const resume: string[] = [];
  if (sem.nb === 0 && semPrec.nb === 0) {
    resume.push("Aucune activité enregistrée cette semaine pour l'instant.");
  } else {
    if (kpi.semaine.delta !== null) {
      resume.push(`Les revenus ${kpi.semaine.delta >= 0 ? "progressent" : "reculent"} de ${Math.abs(kpi.semaine.delta)}% cette semaine par rapport à la semaine précédente.`);
    }
    const semaineByService = new Map<string, { nom: string; montant: number }>();
    for (const b of bookings) {
      const d = dateEvenement(b);
      if (d < debutSemaine || d >= finSemaine) continue;
      const cur = semaineByService.get(b.service_id) ?? { nom: b.service_nom, montant: 0 };
      cur.montant += b.montant_paye;
      semaineByService.set(b.service_id, cur);
    }
    const topServiceSemaine = [...semaineByService.values()].sort((a, b) => b.montant - a.montant)[0] ?? null;
    if (topServiceSemaine && sem.montant > 0) {
      const pct = Math.round((topServiceSemaine.montant / sem.montant) * 1000) / 10;
      resume.push(`Le service « ${topServiceSemaine.nom} » représente ${pct}% des recettes cette semaine.`);
    }
    if (meilleurJour) {
      resume.push(`Le ${JOURS_COMPLETS[meilleurJour.label] ?? meilleurJour.label} est le jour le plus actif cette semaine.`);
    }

    const idsSemaine = bookings.filter(b => { const d = dateEvenement(b); return d >= debutSemaine && d < finSemaine; }).map(b => b.id);
    let anomalies = 0;
    if (idsSemaine.length > 0) {
      const { data: recusLies } = await sb.from("recus").select("paid_booking_id").in("paid_booking_id", idsSemaine).eq("statut", "disponible");
      const avecRecu = new Set((recusLies ?? []).map((r) => r.paid_booking_id));
      anomalies = idsSemaine.filter(id => !avecRecu.has(id)).length;
    }
    resume.push(anomalies > 0
      ? `${anomalies} paiement${anomalies > 1 ? "s" : ""} confirmé${anomalies > 1 ? "s" : ""} cette semaine sans reçu généré — à vérifier.`
      : "Aucune anomalie détectée cette semaine.");
  }

  return {
    genere_le: now.toISOString(),
    kpi,
    sparklines: {
      aujourdhui: evolutionJour.map(p => p.montant),
      semaine: evolutionSemaine.map(p => p.montant),
      mois: evolutionMois.map(p => p.montant),
      annee: evolutionAnnee.map(p => p.montant),
    },
    evolution: { jour: evolutionJour, semaine: evolutionSemaine, mois: evolutionMois, annee: evolutionAnnee },
    top_services,
    repartition_categories,
    activite_jour: evolutionJour,
    meilleur_jour_semaine: meilleurJour ? { jour: meilleurJour.label, montant: meilleurJour.montant } : null,
    resume,
  };
}
