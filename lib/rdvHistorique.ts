// Constructeur partagé des lignes « RDV passés » (24/10/2026) : extrait, SANS changer
// leur sortie, de api/institution/rdv-historique/route.ts pour être utilisé aussi par
// l'export serveur (api/institution/rdv-historique/export). Une seule logique : la
// ligne exportée est celle de l'écran. Les lectures par identifiants se font par
// paquets (une longue liste d'UUID dépasse la longueur d'URL acceptée par l'API).
import type { SupabaseClient } from "@supabase/supabase-js";
import { lirePaquets } from "@/lib/export/lirePaquets";

export const COLONNES_RDV_HISTORIQUE = "id,objet,date_rdv,heure_rdv,statut,citoyen_id,notes,motif_annulation,presence_status,created_at,institution_id";

export type RdvBrut = {
  id: string; objet: string | null; date_rdv: string; heure_rdv: string; statut: string; citoyen_id: string;
  notes: string | null; motif_annulation: string | null; presence_status: string | null; created_at: string; institution_id: string;
};

export type RdvHistoLigne = RdvBrut & {
  citoyen_nom: string; citoyen_phone: string; reference: string;
  service_nom: string | null; service_prix: number | null;
  derniere_action: string | null; agent_nom: string | null; derniere_action_le: string | null;
};

export type CitoyenBrut = { prenom: string | null; nom: string | null; phone: string | null };
export type RdvHistoAssemble = { ligne: RdvHistoLigne; citoyen: CitoyenBrut | null };

// Nom affiché par les ÉCRANS : repli sur le téléphone. Les exports n'utilisent pas ce
// repli (voir lib/export/telephone.ts).
export function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

// Libellé humain de la dernière action journalisée — même convention que
// lib/journalActivite.ts (action: "rdv_accepte", "rdv_confirme", ...).
export const LABEL_ACTION: Record<string, string> = {
  rdv_accepte: "Accepté",
  rdv_confirme: "Présence confirmée",
  rdv_termine: "Marqué terminé",
  rdv_refuse: "Refusé",
  rdv_absent: "Marqué absent",
};

export async function assemblerRdvHistorique(sb: SupabaseClient, institutionId: string, rdvRaw: RdvBrut[]): Promise<RdvHistoAssemble[]> {
  if (rdvRaw.length === 0) return [];

  const citoyenIds = [...new Set(rdvRaw.map((r) => r.citoyen_id).filter(Boolean))];
  const usersD = await lirePaquets(citoyenIds, async (paquet) => {
    const { data } = await sb.from("users").select("id,nom,prenom,phone").in("id", paquet);
    return (data ?? []) as { id: string; nom: string | null; prenom: string | null; phone: string | null }[];
  });
  const uMap = new Map(usersD.map((u) => [u.id, u]));

  // Service payant éventuel — même rattachement par créneau que l'écran RDV.
  const { data: paidRaw } = await sb
    .from("paid_bookings")
    .select("date_rdv,heure_rdv,paid_services(nom,prix,duree_minutes)")
    .eq("institution_id", institutionId)
    .neq("statut", "annule");
  const paidMap = new Map<string, { nom: string; prix: number; duree_minutes: number }>();
  type PaidRow = { date_rdv: string; heure_rdv: string; paid_services: { nom: string; prix: number; duree_minutes: number } | null };
  ((paidRaw ?? []) as unknown as PaidRow[]).forEach((b) => {
    if (!b.paid_services) return;
    paidMap.set(`${b.date_rdv}|${b.heure_rdv}`, b.paid_services);
  });

  // Traçabilité — dernière action journalisée pour ce RDV (Lots A-D :
  // rdv_accepte/rdv_confirme/rdv_termine/rdv_refuse/rdv_absent, "Agent" =
  // membre_nom réel).
  const rdvIds = rdvRaw.map((r) => r.id);
  const journalRaw = await lirePaquets(rdvIds, async (paquet) => {
    const { data } = await sb
      .from("journal_activite")
      .select("cible_id,action,membre_nom,created_at")
      .eq("institution_id", institutionId)
      .eq("cible_table", "rdv")
      .in("cible_id", paquet)
      .order("created_at", { ascending: false });
    return (data ?? []) as { cible_id: string | null; action: string; membre_nom: string; created_at: string }[];
  });
  // Plus récent d'abord, tous paquets confondus (l'ordre de lecture ne l'assure que par paquet).
  journalRaw.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const traceMap = new Map<string, { action: string; membre_nom: string; created_at: string }>();
  journalRaw.forEach((j) => { if (j.cible_id && !traceMap.has(j.cible_id)) traceMap.set(j.cible_id, j); });

  // Référence Yelen — YL-{année}-{MMJJ}-{séquence du jour, stable, calculée
  // sur TOUS les RDV de ce jour pour cette institution, pas seulement ceux
  // de la page filtrée, pour qu'elle ne change jamais selon les filtres.
  const datesUniques = [...new Set(rdvRaw.map((r) => r.date_rdv))];
  const rangMap = new Map<string, number>();
  for (const date of datesUniques) {
    const { data: jourRaw } = await sb
      .from("rdv").select("id,created_at")
      .eq("institution_id", institutionId).eq("date_rdv", date)
      .order("created_at", { ascending: true });
    ((jourRaw ?? []) as { id: string; created_at: string }[]).forEach((r, i) => rangMap.set(r.id, i + 1));
  }
  function reference(r: { id: string; date_rdv: string }): string {
    const rang = rangMap.get(r.id) ?? 1;
    const [y, m, d] = r.date_rdv.split("-");
    return `YL-${y}-${m}${d}-${String(rang).padStart(4, "0")}`;
  }

  return rdvRaw.map((r) => {
    const u = uMap.get(r.citoyen_id);
    const paid = paidMap.get(`${r.date_rdv}|${r.heure_rdv}`);
    const trace = traceMap.get(r.id);
    return {
      ligne: {
        ...r,
        citoyen_nom: buildNom(u), citoyen_phone: u?.phone ?? "",
        reference: reference(r),
        service_nom: paid?.nom ?? null, service_prix: paid?.prix ?? null,
        derniere_action: trace ? (LABEL_ACTION[trace.action] ?? trace.action) : null,
        agent_nom: trace?.membre_nom ?? null,
        derniere_action_le: trace?.created_at ?? null,
      },
      citoyen: u ? { prenom: u.prenom, nom: u.nom, phone: u.phone } : null,
    };
  });
}
