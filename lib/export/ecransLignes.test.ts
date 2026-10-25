import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculerHashContenu, type EnveloppeExport } from "./canonique";
import { lirePaquets } from "./lirePaquets";
import { genererCsv, neutraliserFormule, neutraliserTelephone, type InfosDocument } from "./rendus";
import { masquerTelephone, nomClientPourExport, telephoneExporte } from "./telephone";
import {
  construireLignesHistoriqueFinancier, construireLignesPaiements, construireLignesRdv, lireDemandeExport,
  reordonnerParIdentifiants, resumerSelection,
} from "./ecransLignes";
import { MEMBRE_ROLES, can, type MembreRole } from "@/lib/institutionPermissions";
import { assemblerRdvHistorique, type RdvBrut } from "@/lib/rdvHistorique";
import { assemblerPaiements, type BookingRow, type PaiementAssemble } from "@/lib/paiementsListe";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("masquerTelephone", () => {
  it("garde l'indicatif et les deux derniers chiffres", () => {
    expect(masquerTelephone("+224612345678")).toBe("+224 ******* 78");
    expect(masquerTelephone("+224 612 34 56 78")).toBe("+224 ******* 78");
  });
  it("sans indicatif : seuls les deux derniers chiffres restent", () => {
    expect(masquerTelephone("612345678")).toBe("******* 78");
  });
  it("vide ou absent : chaîne vide", () => {
    expect(masquerTelephone("")).toBe("");
    expect(masquerTelephone(null)).toBe("");
    expect(masquerTelephone(undefined)).toBe("");
  });
  it("numéro trop court : tout est masqué", () => {
    expect(masquerTelephone("+22412")).not.toMatch(/12/);
  });
  it("ne laisse jamais plus de deux chiffres du numéro national", () => {
    const masque = masquerTelephone("+224655443322");
    expect(masque.replace(/^\+224/, "").replace(/\D/g, "")).toBe("22");
  });
});

describe("telephoneExporte / nomClientPourExport", () => {
  it("clair : valeur brute ; sinon masquée", () => {
    expect(telephoneExporte("+224612345678", true)).toBe("+224612345678");
    expect(telephoneExporte("+224612345678", false)).toBe("+224 ******* 78");
    expect(telephoneExporte(null, true)).toBe("");
  });
  it("repli du nom : jamais le téléphone", () => {
    expect(nomClientPourExport(null, "Client")).toBe("Client");
    expect(nomClientPourExport({ prenom: null, nom: null }, "Citoyen")).toBe("Citoyen");
    expect(nomClientPourExport({ prenom: "Awa", nom: "Bah" }, "Client")).toBe("Awa Bah");
    expect(nomClientPourExport({ prenom: "Awa", nom: null }, "Client")).toBe("Awa");
  });
});

describe("permission export.telephone_clair", () => {
  it("clair pour admin, superviseur, agent ; masqué pour dirigeant et comptable", () => {
    const attendu: Record<MembreRole, boolean> = { admin: true, superviseur: true, agent: true, dirigeant: false, comptable: false };
    for (const role of MEMBRE_ROLES) expect(can(role, "export.telephone_clair")).toBe(attendu[role]);
  });
});

describe("lireDemandeExport", () => {
  it("refuse écran inconnu, corps invalide, liste vide, id mal formé", () => {
    expect("erreur" in lireDemandeExport(null)).toBe(true);
    expect("erreur" in lireDemandeExport({ ecran: "autre", ids: [uuid(1)] })).toBe(true);
    expect("erreur" in lireDemandeExport({ ecran: "paiements", ids: [] })).toBe(true);
    expect("erreur" in lireDemandeExport({ ecran: "paiements", ids: ["x"] })).toBe(true);
    expect("erreur" in lireDemandeExport({ ecran: "paiements" })).toBe(true);
  });
  it("accepte 5000 identifiants, refuse 5001 (jamais coupé en silence)", () => {
    const ids = Array.from({ length: 5001 }, (_, i) => uuid(i));
    expect("erreur" in lireDemandeExport({ ecran: "rdv_passes", ids: ids.slice(0, 5000) })).toBe(false);
    expect("erreur" in lireDemandeExport({ ecran: "rdv_passes", ids })).toBe(true);
  });
  it("dédoublonne les identifiants", () => {
    const r = lireDemandeExport({ ecran: "rdv_accueil", ids: [uuid(1), uuid(1), uuid(2)] });
    expect("ids" in r && r.ids).toEqual([uuid(1), uuid(2)]);
  });
});

describe("identifiants d'un autre établissement", () => {
  it("les identifiants sans ligne lue sont absents, l'ordre de l'écran est conservé", () => {
    const lues = [{ id: uuid(3) }, { id: uuid(1) }];
    const r = reordonnerParIdentifiants(lues, [uuid(1), uuid(2), uuid(3)], l => l.id);
    expect(r.map(l => l.id)).toEqual([uuid(1), uuid(3)]);
    expect(resumerSelection(3, 2)).toContain("1 identifiant ignoré");
    expect(resumerSelection(2, 2)).not.toContain("ignoré");
  });
});

describe("lirePaquets", () => {
  it("découpe par paquets de 100, sans doublon, ordre conservé", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(i));
    const tailles: number[] = [];
    const r = await lirePaquets([...ids, ...ids.slice(0, 10)], async p => { tailles.push(p.length); return p; });
    expect(tailles).toEqual([100, 100, 50]);
    expect(r).toEqual(ids);
  });
  it("liste vide : aucun appel", async () => {
    let appels = 0;
    expect(await lirePaquets([], async () => { appels++; return []; })).toEqual([]);
    expect(appels).toBe(0);
  });
});

// ── Modèles de lignes ──────────────────────────────────────────────────────
function paiement(surcharge: Partial<PaiementAssemble["ligne"]> = {}, citoyen: PaiementAssemble["citoyen"] = { prenom: "Awa", nom: "Bah", phone: "+224612345678" }): PaiementAssemble {
  return {
    ligne: {
      id: uuid(1), reference: "PB-1", statut: "confirme", date_rdv: "2026-10-20", heure_rdv: "09:30", montant: 125000,
      montant_declare_citoyen: null, declare_le: null, traite_le: null, methode_paiement: null, created_at: "2026-10-19T10:00:00Z",
      service_nom: "Consultation", citoyen_nom: "Awa Bah", citoyen_phone: "+224612345678", citoyen_photo_url: null,
      recu_id: null, recu_statut: null, recu_disponible_le: null, agent_nom: "Mamadou", ...surcharge,
    },
    citoyen,
  };
}

describe("construireLignes*", () => {
  it("Paiements : 8 colonnes, montant numérique, statut en libellé, pas de téléphone", () => {
    const m = construireLignesPaiements([paiement()]);
    expect(m.colonnes).toHaveLength(8);
    expect(m.lignes[0].montant).toBe(125000);
    expect(m.lignes[0].statut).toBe("Confirmé");
    expect(JSON.stringify(m.lignes)).not.toContain("612345678");
  });
  it("Historique financier : téléphone masqué ou clair selon le droit", () => {
    expect(construireLignesHistoriqueFinancier([paiement()], { telephoneClair: false }).lignes[0].telephone).toBe("+224 ******* 78");
    expect(construireLignesHistoriqueFinancier([paiement()], { telephoneClair: true }).lignes[0].telephone).toBe("+224612345678");
  });
  it("citoyen introuvable : repli « Citoyen »/« Client », jamais le téléphone", () => {
    const p = paiement({ citoyen_nom: "+224699999999" }, null);
    expect(construireLignesPaiements([p]).lignes[0].citoyen).toBe("Citoyen");
    expect(construireLignesHistoriqueFinancier([p], { telephoneClair: true }).lignes[0].client).toBe("Client");
  });
  it("RDV : 11 colonnes, masque appliqué", () => {
    const item = {
      ligne: {
        id: uuid(1), objet: "Visa", date_rdv: "2026-10-20", heure_rdv: "14:00", statut: "termine", citoyen_id: uuid(9), notes: null,
        motif_annulation: null, presence_status: null, created_at: "2026-10-19T10:00:00Z", institution_id: uuid(5),
        citoyen_nom: "Awa Bah", citoyen_phone: "+224612345678", reference: "YL-2026-1020-0001", service_nom: null, service_prix: null,
        derniere_action: null, agent_nom: null, derniere_action_le: null,
      },
      citoyen: { prenom: "Awa", nom: "Bah", phone: "+224612345678" },
    };
    const m = construireLignesRdv([item], { telephoneClair: false });
    expect(m.colonnes).toHaveLength(11);
    expect(m.lignes[0].telephone).toBe("+224 ******* 78");
    expect(m.lignes[0].service_objet).toBe("Visa");
  });
  it("neutralise les formules dans les noms", () => {
    const m = construireLignesPaiements([paiement({}, { prenom: "=CMD()", nom: null, phone: null })]);
    expect(String(m.lignes[0].citoyen).startsWith("'")).toBe(true);
  });
});

describe("neutraliserTelephone", () => {
  it("numéros (clairs ou masqués) sans apostrophe", () => {
    expect(neutraliserTelephone("+224 612 34 56 78")).toBe("+224 612 34 56 78");
    expect(neutraliserTelephone("+224 ******** 78")).toBe("+224 ******** 78");
    expect(neutraliserTelephone("+224612345678")).toBe("+224612345678");
  });
  it("toute autre valeur dangereuse garde l'apostrophe", () => {
    expect(neutraliserTelephone("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(neutraliserTelephone("=1+1")).toBe("'=1+1");
    expect(neutraliserTelephone("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutraliserTelephone("+224 12; =1+1")).toBe("'+224 12; =1+1");
    expect(neutraliserTelephone("+224 12\n=1")).toBe("'+224 12\n=1");
    expect(neutraliserTelephone("+224 12\n")).toBe("'+224 12\n");
  });
  it("les autres colonnes gardent l'apostrophe, même pour un numéro", () => {
    expect(neutraliserFormule("+224 612 34 56 78")).toBe("'+224 612 34 56 78");
  });
  it("le hash signé change avec la valeur exportée", () => {
    const env = (tel: string): EnveloppeExport => ({
      reference: "YL-EXP-2026-00000009", type: "rdv_passes", format: "csv", institution_id: uuid(5), auteur_id: null, role: "admin",
      filtres: {}, nb_lignes: 1, version_gabarit: "rdv-passes-1", cree_le: "2026-10-25T10:00:00.000Z", lignes: [{ telephone: tel }],
    });
    expect(calculerHashContenu(env(neutraliserTelephone("+224 612 34 56 78") ?? ""))).not.toBe(calculerHashContenu(env(neutraliserFormule("+224 612 34 56 78") ?? "")));
  });
});

describe("altération détectée", () => {
  it("le hash change si le téléphone masqué est remplacé par la valeur claire", () => {
    const lignesDe = (clair: boolean) => construireLignesHistoriqueFinancier([paiement()], { telephoneClair: clair }).lignes;
    const env = (lignes: EnveloppeExport["lignes"]): EnveloppeExport => ({
      reference: "YL-EXP-2026-00000009", type: "historique_financier", format: "csv", institution_id: uuid(5), auteur_id: null,
      role: "comptable", filtres: {}, nb_lignes: lignes.length, version_gabarit: "historique-financier-1",
      cree_le: "2026-10-25T10:00:00.000Z", lignes,
    });
    expect(calculerHashContenu(env(lignesDe(false)))).not.toBe(calculerHashContenu(env(lignesDe(true))));
  });
  it("le CSV du téléphone masqué ne contient pas le numéro complet", () => {
    const modele = construireLignesHistoriqueFinancier([paiement()], { telephoneClair: false });
    const infos: InfosDocument = {
      reference: "YL-EXP-2026-00000009", etablissement: "ECOBANK", creeLe: "2026-10-25T10:00:00.000Z", auteur: "Awa", role: "Comptable",
      filtresLisibles: "Sélection", nbLignes: 1, tronque: false, hash: "a".repeat(64), versionGabarit: "historique-financier-1",
      filtresSignes: {}, libelleNombre: "Nombre de paiements",
    };
    expect(genererCsv(modele, infos)).not.toContain("612345678");
  });
});

// ── Non-régression des assembleurs (faux client Supabase chaînable) ────────
type Ligne = Record<string, unknown>;
function fauxClient(tables: Record<string, Ligne[]>): SupabaseClient {
  function requete(nom: string) {
    let lignes = tables[nom] ?? [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { lignes = lignes.filter(l => l[c] === v); return q; },
      neq: (c: string, v: unknown) => { lignes = lignes.filter(l => l[c] !== v); return q; },
      in: (c: string, vs: unknown[]) => { lignes = lignes.filter(l => vs.includes(l[c])); return q; },
      order: () => q,
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => Promise.resolve({ data: lignes, error: null }).then(ok),
    };
    return q;
  }
  return { from: requete } as unknown as SupabaseClient;
}

describe("assemblerRdvHistorique", () => {
  it("au-delà de 100 citoyens : tous les noms sont résolus, références stables, champs écran inchangés", async () => {
    const inst = uuid(5000);
    const n = 230;
    const rdv: RdvBrut[] = Array.from({ length: n }, (_, i) => ({
      id: uuid(i + 1), objet: "Objet", date_rdv: "2026-10-20", heure_rdv: "09:00", statut: "termine", citoyen_id: uuid(1000 + i),
      notes: null, motif_annulation: null, presence_status: null, created_at: `2026-10-19T10:${String(i % 60).padStart(2, "0")}:00Z`,
      institution_id: inst,
    }));
    const users = rdv.map((r, i) => ({ id: r.citoyen_id, nom: `Nom${i}`, prenom: `Prenom${i}`, phone: `+22461000${String(i).padStart(4, "0")}` }));
    const sb = fauxClient({
      users, paid_bookings: [],
      journal_activite: [{ cible_id: uuid(1), cible_table: "rdv", institution_id: inst, action: "rdv_confirme", membre_nom: "Agent A", created_at: "2026-10-20T08:00:00Z" }],
      rdv: rdv.map(r => ({ id: r.id, created_at: r.created_at, institution_id: r.institution_id, date_rdv: r.date_rdv })),
    });
    const r = await assemblerRdvHistorique(sb, inst, rdv);
    expect(r).toHaveLength(n);
    expect(r[229].ligne.citoyen_nom).toBe("Prenom229 Nom229");
    expect(r[229].citoyen?.phone).toBe("+224610000229");
    expect(r[0].ligne.reference).toBe("YL-2026-1020-0001");
    expect(r[0].ligne.derniere_action).toBe("Présence confirmée");
    expect(r[0].ligne.agent_nom).toBe("Agent A");
    expect(r[1].ligne.derniere_action).toBeNull();
  });
  it("citoyen introuvable : l'écran garde le repli « Citoyen » et l'export reçoit null", async () => {
    const inst = uuid(5000);
    const rdv: RdvBrut[] = [{
      id: uuid(1), objet: null, date_rdv: "2026-10-20", heure_rdv: "09:00", statut: "annule", citoyen_id: uuid(2), notes: null,
      motif_annulation: null, presence_status: null, created_at: "2026-10-19T10:00:00Z", institution_id: inst,
    }];
    const r = await assemblerRdvHistorique(fauxClient({ users: [], paid_bookings: [], journal_activite: [], rdv: [] }), inst, rdv);
    expect(r[0].ligne.citoyen_nom).toBe("Citoyen");
    expect(r[0].ligne.citoyen_phone).toBe("");
    expect(r[0].citoyen).toBeNull();
  });
});

describe("assemblerPaiements", () => {
  it("au-delà de 100 réservations : noms, reçus et agents résolus, champs écran inchangés", async () => {
    const n = 150;
    const rows: BookingRow[] = Array.from({ length: n }, (_, i) => ({
      id: uuid(i + 1), confirmation_code: `PB-${i}`, statut: "confirme", date_rdv: "2026-10-20", heure_rdv: "09:00", montant_paye: 1000 + i,
      montant_declare_citoyen: null, declare_le: null, traite_le: null, methode_paiement: null, created_at: "2026-10-19T10:00:00Z",
      citoyen_id: uuid(1000 + i), service_id: null, paid_services: { nom: "Service X" },
    }));
    const sb = fauxClient({
      users: rows.map((r, i) => ({ id: r.citoyen_id, nom: `N${i}`, prenom: `P${i}`, phone: `+2246100${String(i).padStart(5, "0")}`, photo_url: null })),
      recus: [{ id: "recu-1", paid_booking_id: uuid(140), statut: "disponible", membre_nom: "Comptable Z", disponible_le: "2026-10-20T00:00:00Z" }],
    });
    const r = await assemblerPaiements(sb, rows);
    expect(r).toHaveLength(n);
    expect(r[149].ligne.citoyen_nom).toBe("P149 N149");
    expect(r[149].ligne.montant).toBe(1149);
    expect(r[139].ligne.recu_id).toBe("recu-1");
    expect(r[139].ligne.agent_nom).toBe("Comptable Z");
    expect(r[0].ligne.recu_id).toBeNull();
    expect(r[0].ligne.service_nom).toBe("Service X");
  });
  it("citoyen absent : « Citoyen » à l'écran, null pour l'export", async () => {
    const rows: BookingRow[] = [{
      id: uuid(1), confirmation_code: "PB-0", statut: "annule", date_rdv: "2026-10-20", heure_rdv: "09:00", montant_paye: null,
      montant_declare_citoyen: null, declare_le: null, traite_le: null, methode_paiement: null, created_at: "2026-10-19T10:00:00Z",
      citoyen_id: null, service_id: null, paid_services: null,
    }];
    const r = await assemblerPaiements(fauxClient({ users: [], recus: [] }), rows);
    expect(r[0].ligne.citoyen_nom).toBe("Citoyen");
    expect(r[0].ligne.service_nom).toBe("Service");
    expect(r[0].ligne.montant).toBe(0);
    expect(r[0].citoyen).toBeNull();
  });
});
