// Décomposition d'affichage du texte composite `rdv.objet` (jamais d'écriture).
// Le texte est produit par app/rdv/[id]/page.tsx :
//   `[${service}]` + (payant ? ` ${montant} sur place` : "") + (tiers ? ` — Pour ${nom} (${tél})` : "")
// Si le format ne correspond pas (hôtel, ancien format, texte libre…), on
// renvoie `reconnu: false` et l'appelant affiche le texte d'origine tel quel.

export type ParsedAppointmentLabel = {
  reconnu: boolean;
  brut: string;
  service: string | null;
  montant: string | null;      // « 2 000 GNF », tel qu'écrit (espaces normalisés)
  lieu: string | null;         // « Sur place »
  beneficiaireNom: string | null;
  beneficiaireTel: string | null;
};

const ESPACES = /[\s  ]+/g;
// [service] (montant devise sur place)? (— Pour nom (tél))?
const FORMAT = /^\[([^\]]+)\](?:\s+([\d\s  .,]*\d)\s*([A-Za-z]{2,4})\s+sur place)?(?:\s+[—–-]\s+Pour\s+(.+?)\s*\(([^)]*)\))?\s*$/;

export function estAbsent(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  const t = String(v).trim().toLowerCase();
  return t === "" || t === "null" || t === "undefined";
}

export function parseAppointmentLabel(objet: string | null | undefined): ParsedAppointmentLabel {
  const brut = (objet ?? "").trim();
  const vide: ParsedAppointmentLabel = { reconnu: false, brut, service: null, montant: null, lieu: null, beneficiaireNom: null, beneficiaireTel: null };
  if (!brut) return vide;
  const m = brut.match(FORMAT);
  if (!m) return vide;
  const [, service, montant, devise, nom, tel] = m;
  return {
    reconnu: true,
    brut,
    service: service.trim(),
    montant: montant ? `${montant.replace(ESPACES, " ").trim()} ${devise.toUpperCase()}` : null,
    lieu: montant ? "Sur place" : null,
    beneficiaireNom: nom ? nom.trim() : null,
    beneficiaireTel: tel ? tel.trim() : null,
  };
}

// Téléphone : espaces multiples réduits, puis regroupement 3-2-2-2 pour un
// numéro guinéen à 9 chiffres ; format non reconnu → texte normalisé tel quel.
export function formatTelephone(brut: string | null | undefined): string {
  if (estAbsent(brut)) return "";
  const normalise = String(brut).replace(ESPACES, " ").trim();
  const chiffres = normalise.replace(/\D/g, "");
  if (/^[\d\s]+$/.test(normalise) && chiffres.length === 9) return `${chiffres.slice(0, 3)} ${chiffres.slice(3, 5)} ${chiffres.slice(5, 7)} ${chiffres.slice(7, 9)}`;
  if (/^\+?224[\d\s]+$/.test(normalise) && chiffres.length === 12) return `+224 ${chiffres.slice(3, 6)} ${chiffres.slice(6, 8)} ${chiffres.slice(8, 10)} ${chiffres.slice(10, 12)}`;
  return normalise;
}

// Exemples réels (échantillon de 15 lignes fourni le 20/10/2026) — servent de
// jeu de test manuel / documentation du parseur ; aucune écriture en base.
export const OBJET_EXEMPLES: { objet: string; attendu: Partial<ParsedAppointmentLabel> }[] = [
  { objet: "[Consulting Gestion Depargne] 2 000 GNF sur place", attendu: { reconnu: true, service: "Consulting Gestion Depargne", montant: "2 000 GNF", lieu: "Sur place" } },
  { objet: "[Achevron Guinea Luxyre] 960 000 GNF sur place", attendu: { reconnu: true, service: "Achevron Guinea Luxyre", montant: "960 000 GNF" } },
  { objet: "[Chambre & Toillete] 70 000 GNF sur place", attendu: { reconnu: true, service: "Chambre & Toillete", montant: "70 000 GNF" } },
  { objet: "[Chambre De Luxe] 720 000 GNF sur place", attendu: { reconnu: true, service: "Chambre De Luxe", montant: "720 000 GNF" } },
  { objet: "[Ouverture de compte]", attendu: { reconnu: true, service: "Ouverture de compte", montant: null } },
  { objet: "[Demande de crédit]", attendu: { reconnu: true, service: "Demande de crédit", montant: null } },
  { objet: "[Ouverture de compte] — Pour Oumou Barry (624582534)", attendu: { reconnu: true, beneficiaireNom: "Oumou Barry", beneficiaireTel: "624582534" } },
  { objet: "[Consulting Gestion Depargne] 2 000 GNF sur place — Pour Sidiboss Sow (624852368)", attendu: { reconnu: true, montant: "2 000 GNF", beneficiaireNom: "Sidiboss Sow", beneficiaireTel: "624852368" } },
  { objet: "[Ouverture de compte] — Pour Oumar Sow (611  34 45 67)", attendu: { reconnu: true, beneficiaireNom: "Oumar Sow", beneficiaireTel: "611  34 45 67" } },
  { objet: "[Consulting Gestion Depargne] 2 000 GNF sur place — Pour Oumou Sow (623 45 67 78)", attendu: { reconnu: true, beneficiaireNom: "Oumou Sow", beneficiaireTel: "623 45 67 78" } },
  { objet: "[SERVICE PAYANT] Ouverture de compte — détail", attendu: { reconnu: false } },
  { objet: "Séjour du 3 au 6 nov. (jusqu'au 6)", attendu: { reconnu: false } },
];
