import { createClient } from "@supabase/supabase-js";

// Agrégations financières comptable — calculées exclusivement sur
// paid_bookings.montant_paye (jamais paid_services.prix en direct, voir
// écart corrigé en migration 20260722000001 : le prix n'était pas figé au
// moment de la vente). Source de vérité = état courant de paid_bookings,
// pas le ledger transactions_financieres (qui ne fait qu'y ajouter une
// piste d'audit détaillée, cf. lib/transactionsFinancieres.ts).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export type PeriodeStats = {
  montant_encaisse: number;
  nb_paiements: number;
  montant_en_attente: number;
  montant_rembourse: number;
  nb_services_realises: number;
  panier_moyen: number;
};

export type ServiceRentable = { nom: string; montant: number; nb: number };
export type AlerteFinanciere = { type: "annule" | "en_attente" | "rembourse"; label: string; count: number };

export type FinanceAccueil = {
  aujourdhui: PeriodeStats;
  semaine: PeriodeStats;
  mois: PeriodeStats;
  annee: PeriodeStats;
  graphique_journalier: { date: string; montant: number }[];
  top_services: ServiceRentable[];
  alertes: AlerteFinanciere[];
};

type Booking = {
  statut: string;
  montant_paye: number | null;
  created_at: string;
  service_id: string;
  service_nom: string;
};

function statsPourPeriode(bookings: Booking[], depuis: Date): PeriodeStats {
  const dansPeriode = bookings.filter(b => new Date(b.created_at) >= depuis);
  const confirmes = dansPeriode.filter(b => b.statut === "confirme" || b.statut === "termine");
  const enAttente = dansPeriode.filter(b => b.statut === "en_attente");
  const rembourses = dansPeriode.filter(b => b.statut === "rembourse");
  const montantEncaisse = confirmes.reduce((s, b) => s + (b.montant_paye ?? 0), 0);
  return {
    montant_encaisse: montantEncaisse,
    nb_paiements: confirmes.length,
    montant_en_attente: enAttente.reduce((s, b) => s + (b.montant_paye ?? 0), 0),
    montant_rembourse: rembourses.reduce((s, b) => s + (b.montant_paye ?? 0), 0),
    nb_services_realises: confirmes.length,
    panier_moyen: confirmes.length > 0 ? Math.round(montantEncaisse / confirmes.length) : 0,
  };
}

export async function calculerFinanceAccueil(institutionId: string): Promise<FinanceAccueil> {
  const { data: raw } = await sb
    .from("paid_bookings")
    .select("statut,montant_paye,created_at,service_id,paid_services(nom)")
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false })
    .limit(2000);

  const bookings: Booking[] = (raw ?? []).map((b: any) => ({
    statut: b.statut,
    montant_paye: b.montant_paye,
    created_at: b.created_at,
    service_id: b.service_id,
    service_nom: b.paid_services?.nom ?? "Service",
  }));

  const now = new Date();
  const debutJour = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const debutSemaine = new Date(debutJour); debutSemaine.setDate(debutSemaine.getDate() - debutSemaine.getDay());
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  const debutAnnee = new Date(now.getFullYear(), 0, 1);

  const graphMap = new Map<string, number>();
  for (const b of bookings) {
    if (b.statut !== "confirme" && b.statut !== "termine") continue;
    if (new Date(b.created_at) < debutMois) continue;
    const jour = b.created_at.slice(0, 10);
    graphMap.set(jour, (graphMap.get(jour) ?? 0) + (b.montant_paye ?? 0));
  }
  const graphique_journalier = [...graphMap.entries()].map(([date, montant]) => ({ date, montant })).sort((a, b) => a.date.localeCompare(b.date));

  const topMap = new Map<string, ServiceRentable>();
  for (const b of bookings) {
    if (b.statut !== "confirme" && b.statut !== "termine") continue;
    const entry = topMap.get(b.service_nom) ?? { nom: b.service_nom, montant: 0, nb: 0 };
    entry.montant += b.montant_paye ?? 0;
    entry.nb += 1;
    topMap.set(b.service_nom, entry);
  }
  const top_services = [...topMap.values()].sort((a, b) => b.montant - a.montant).slice(0, 5);

  const alertes: AlerteFinanciere[] = [
    { type: "annule" as const, label: "Paiements annulés (30 derniers jours)", count: bookings.filter(b => b.statut === "annule" && new Date(b.created_at) >= new Date(now.getTime() - 30 * 86400000)).length },
    { type: "en_attente" as const, label: "Paiements en attente", count: bookings.filter(b => b.statut === "en_attente").length },
    { type: "rembourse" as const, label: "Remboursements (30 derniers jours)", count: bookings.filter(b => b.statut === "rembourse" && new Date(b.created_at) >= new Date(now.getTime() - 30 * 86400000)).length },
  ].filter(a => a.count > 0);

  return {
    aujourdhui: statsPourPeriode(bookings, debutJour),
    semaine: statsPourPeriode(bookings, debutSemaine),
    mois: statsPourPeriode(bookings, debutMois),
    annee: statsPourPeriode(bookings, debutAnnee),
    graphique_journalier,
    top_services,
    alertes,
  };
}
