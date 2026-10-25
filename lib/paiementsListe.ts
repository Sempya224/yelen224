// Constructeur partagé des lignes « Paiements » (24/10/2026) : extrait, SANS changer
// leur sortie, de api/institution/paiements/route.ts pour être utilisé aussi par
// l'export serveur (api/institution/paiements/export). Les lectures par identifiants
// se font par paquets (une longue liste d'UUID dépasse la longueur d'URL acceptée).
import type { SupabaseClient } from "@supabase/supabase-js";
import { lirePaquets } from "@/lib/export/lirePaquets";

export const COLONNES_PAIEMENTS = "id,confirmation_code,statut,date_rdv,heure_rdv,montant_paye,montant_declare_citoyen,declare_le,traite_le,methode_paiement,created_at,citoyen_id,service_id,paid_services(nom)";

export type BookingRow = {
  id: string; confirmation_code: string; statut: string; date_rdv: string; heure_rdv: string;
  montant_paye: number | null; montant_declare_citoyen: number | null; declare_le: string | null; traite_le: string | null;
  methode_paiement: string | null; created_at: string; citoyen_id: string | null; service_id: string | null;
  paid_services: { nom: string | null } | null;
};

export type PaiementLigne = {
  id: string; reference: string; statut: string; date_rdv: string; heure_rdv: string; montant: number;
  montant_declare_citoyen: number | null; declare_le: string | null; traite_le: string | null; methode_paiement: string | null;
  created_at: string; service_nom: string; citoyen_nom: string; citoyen_phone: string; citoyen_photo_url: string | null;
  recu_id: string | null; recu_statut: string | null; recu_disponible_le: string | null; agent_nom: string | null;
};

export type PaiementAssemble = { ligne: PaiementLigne; citoyen: { prenom: string | null; nom: string | null; phone: string | null } | null };

// Nom affiché par les ÉCRANS : repli sur le téléphone. Les exports n'utilisent pas ce
// repli (voir lib/export/telephone.ts).
export function buildNom(u: { nom: string | null; prenom: string | null; phone: string | null } | undefined): string {
  if (!u) return "Citoyen";
  const parts = [u.prenom, u.nom].filter(Boolean).join(" ");
  return parts || u.phone || "Citoyen";
}

export async function assemblerPaiements(sb: SupabaseClient, rawRows: BookingRow[]): Promise<PaiementAssemble[]> {
  type UserRow = { id: string; nom: string | null; prenom: string | null; phone: string | null; photo_url: string | null };
  const cids = [...new Set(rawRows.map((b) => b.citoyen_id).filter((id): id is string => !!id))];
  const usersD = await lirePaquets(cids, async (paquet) => {
    const { data } = await sb.from("users").select("id,nom,prenom,phone,photo_url").in("id", paquet);
    return (data ?? []) as UserRow[];
  });
  const uBrut = new Map(usersD.map((u) => [u.id, u]));

  // Reçu Yelen (Lot D/3) — jointure par paid_booking_id. recuMap garde
  // l'objet complet (pas seulement l'id "disponible") pour que la Timeline
  // mini et le badge reçu (Lot 3) distinguent généré/en attente/archivé
  // sans requête supplémentaire.
  const bookingIds = rawRows.map((b) => b.id);
  const recusD = await lirePaquets(bookingIds, async (paquet) => {
    const { data } = await sb.from("recus").select("id,paid_booking_id,statut,membre_nom,disponible_le").in("paid_booking_id", paquet);
    return (data ?? []) as { id: string; paid_booking_id: string; statut: string; membre_nom: string; disponible_le: string | null }[];
  });
  const recuMap = new Map<string, { id: string; statut: string; membre_nom: string; disponible_le: string | null }>();
  recusD.forEach(r => recuMap.set(r.paid_booking_id, { id: r.id, statut: r.statut, membre_nom: r.membre_nom, disponible_le: r.disponible_le }));

  return rawRows.map((b) => {
    const recu = recuMap.get(b.id) ?? null;
    const u = uBrut.get(b.citoyen_id ?? "");
    return {
      ligne: {
        id: b.id,
        reference: b.confirmation_code,
        statut: b.statut,
        date_rdv: b.date_rdv,
        heure_rdv: b.heure_rdv,
        montant: b.montant_paye ?? 0,
        montant_declare_citoyen: b.montant_declare_citoyen,
        declare_le: b.declare_le,
        traite_le: b.traite_le,
        methode_paiement: b.methode_paiement,
        created_at: b.created_at,
        service_nom: b.paid_services?.nom ?? "Service",
        citoyen_nom: u ? buildNom(u) : "Citoyen",
        citoyen_phone: u?.phone ?? "",
        citoyen_photo_url: u?.photo_url ?? null,
        recu_id: recu?.statut === "disponible" ? recu.id : null,
        recu_statut: recu?.statut ?? null,
        recu_disponible_le: recu?.disponible_le ?? null,
        agent_nom: recu?.membre_nom ?? null,
      },
      citoyen: u ? { prenom: u.prenom, nom: u.nom, phone: u.phone } : null,
    };
  });
}
