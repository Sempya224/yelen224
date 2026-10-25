import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { can, type MembreRole } from "@/lib/institutionPermissions";
import { peutVoirDemande } from "@/lib/rdvFiche";
import { T } from "@/app/[slug]/[id]/theme";
import { RdvDetailModal } from "@/app/[slug]/[id]/components/RdvDetailModal";
import { RdvDetailContenu } from "@/app/[slug]/[id]/components/RdvDetailSections";
import { PreparationVisiteModal } from "@/app/[slug]/[id]/components/PreparationVisiteModal";

// Rendu serveur (renderToStaticMarkup) de la fiche « Détails du RDV » : pas de
// DOM, donc ni clic ni défilement — ces tests vérifient ce qui est PRÉSENT dans
// le HTML (pied « Fermer », « Tout voir (N) », masquage des textes libres,
// message d'annulation affiché une seule fois). Le défilement réel, le focus et
// les interactions restent à vérifier dans un navigateur.
type ModalProps = Parameters<typeof RdvDetailModal>[0];
type ContenuProps = Parameters<typeof RdvDetailContenu>[0];
type Rdv = ModalProps["rdv"];

const C = T.dark;
const demain = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

function rdv(over: Partial<Rdv> = {}): Rdv {
  return {
    id: "r1", objet: "[Ouverture de compte]", date_rdv: demain, heure_rdv: "12:00:00", statut: "en_attente",
    citoyen_nom: "awa diallo", citoyen_id: "c1", citoyen_phone: "611234567", reference: "RDV-2026-000042",
    ...over,
  } as Rdv;
}

function contenu(r: Rdv, role: MembreRole, over: Partial<ContenuProps> = {}) {
  return createElement(RdvDetailContenu, {
    C, rdv: r, rdvs: [r], colonnes: r, events: [], journal: [], etatHistorique: "ok", onReessayer: () => {},
    prestationNom: "Ouverture de compte", urgent: false, masquerDemande: !peutVoirDemande(role),
    champs: Object.entries(r.champs_complementaires_reponses ?? {}), prepPertinente: false,
    ...over,
  } as ContenuProps);
}

function fiche(r: Rdv, role: MembreRole, opts: { events?: ContenuProps["events"]; suspendu?: boolean; contenuOver?: Partial<ContenuProps> } = {}): string {
  return renderToStaticMarkup(createElement(RdvDetailModal, {
    C, rdv: r, events: opts.events ?? [], can: (p) => can(role, p), suspendu: opts.suspendu ?? false,
    actionLoading: null, bloqueClavier: false, onClose: () => {}, onAction: () => {},
    children: contenu(r, role, { events: opts.events ?? [], ...opts.contenuOver }),
  } as ModalProps));
}

// Libellés des boutons du composant Button (texte dans <span style="opacity:1">), dans l'ordre du DOM.
const boutons = (html: string) => [...html.matchAll(/<span style="opacity:1">([^<]+)<\/span>/g)].map(m => m[1]);

const ev = (action: string, minutes: number, auteur = "institution", motif: string | null = null) =>
  ({ action, auteur_type: auteur, motif, created_at: new Date(Date.UTC(2026, 9, 21, 8, minutes)).toISOString() });

describe("pied de la fiche", () => {
  it.each([
    ["terminé", rdv({ statut: "termine", presence_status: "present" })],
    ["annulé", rdv({ statut: "annule", annule_par: "citoyen" })],
    ["absent", rdv({ presence_status: "absent" })],
  ])("RDV %s : pied minimal « Fermer », aucune action", (_nom, r) => {
    const html = fiche(r, "admin");
    expect(html).toContain(">Fermer<");
    // Libellés de BOUTONS uniquement : le titre du bandeau peut dire « Client absent ».
    expect(boutons(html)).toEqual(["Fermer"]);
  });

  it("lecture seule (dirigeant) sur un RDV à traiter : « Fermer » et chip, jamais d'action", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "dirigeant");
    expect(html).toContain("Lecture seule");
    expect(html).toContain(">Fermer<");
    expect(boutons(html)).toEqual(["Fermer"]);
  });

  it("admin sur une nouvelle demande : actions présentes, pas de « Fermer » en pied", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "admin");
    expect(boutons(html)).toEqual(["Refuser", "Accepter"]);
    expect(html).not.toContain(">Fermer<");
  });
});

describe("bandeau et en-tête", () => {
  it("le bandeau est dans la zone qui défile, l'en-tête reste au-dessus", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "admin");
    const iScroll = html.indexOf("class=\"yz-scroll\"");
    expect(iScroll).toBeGreaterThan(0);
    expect(html.indexOf("Nouvelle demande à traiter")).toBeGreaterThan(iScroll);
    expect(html.indexOf("<h2")).toBeLessThan(iScroll);
    // Le pied (boutons) vient après la zone qui défile, donc reste fixe.
    expect(html.indexOf("Accepter</span>")).toBeGreaterThan(html.indexOf("Aucun événement pour l"));
  });

  it("un seul élément défile : pas de défilement imbriqué, zone focalisable et nommée", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "admin");
    expect((html.match(/overflow-y:auto/g) ?? []).length).toBe(1); // la règle .yz-scroll, nulle part ailleurs
    expect(html).not.toMatch(/style="[^"]*overflow(-y)?:(auto|scroll)/); // aucun style en ligne qui défile
    expect(html).toMatch(/<div class="yz-scroll" role="region" aria-label="Contenu du rendez-vous" tabindex="0"/);
  });

  it("l'élément qui défile n'a aucun padding (la barre touche le bord de la modale)", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "admin");
    const balise = html.match(/<div class="yz-scroll"[^>]*>/)?.[0] ?? "";
    expect(balise).not.toMatch(/padding/);
    expect(balise).toContain("flex:1");
    expect(balise).toContain("min-height:0");
  });

  it("barre de défilement : toujours visible, fine, curseur gris, rail transparent", () => {
    const html = fiche(rdv(), "admin");
    expect(html).toContain("scrollbar-gutter:stable");
    expect(html).toContain("scrollbar-width:thin");
    expect(html).toMatch(/scrollbar-color:[^;]+ transparent/);
    expect(html).toContain(".yz-scroll::-webkit-scrollbar{width:10px}");
    expect(html).toContain("::-webkit-scrollbar-track{background:transparent}");
    expect(html).toMatch(/::-webkit-scrollbar-thumb\{[^}]*border-radius:8px/);
    expect(html).not.toMatch(/overflow(-y)?:\s*overlay/);
  });

  it("ombres de contenu caché : 12 px, sans événement souris, absentes par défaut (rien ne défile en rendu serveur)", () => {
    const html = fiche(rdv(), "admin");
    const ombres = html.match(/<div aria-hidden="true" style="position:absolute[^"]*"/g) ?? [];
    expect(ombres).toHaveLength(2);
    for (const o of ombres) {
      expect(o).toContain("height:12px");
      expect(o).toContain("pointer-events:none");
      expect(o).toContain("opacity:0");
    }
  });

  it("hauteur : 100dvh moins la marge, en-tête et pied non réductibles", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "admin");
    expect(html).toContain("max-height:calc(100dvh - 48px)");
    expect(html).not.toContain("100svh");
    expect(html).toMatch(/<div style="flex-shrink:0;padding:16px 24px 14px">/); // en-tête
    expect(html).toMatch(/<div style="flex-shrink:0;border-top:[^"]*">/); // pied
  });

  it("échéance : « Répondre avant » avec la règle en info-bulle", () => {
    const html = fiche(rdv({ statut: "nouveau" }), "admin");
    expect(html).toContain("Répondre avant 12:30 PM");
    expect(html).toMatch(/title="[^"]*30 minutes[^"]*"/);
    expect(html).not.toContain("À traiter avant");
  });

  it("référence copiable avec aria-label", () => {
    const html = fiche(rdv(), "admin");
    expect(html).toContain("RDV-2026-000042");
    expect(html).toContain("aria-label=\"Copier la référence RDV-2026-000042\"");
  });

  it("téléphone : bouton « copier » icône avec info-bulle et aria-label", () => {
    const html = fiche(rdv(), "admin");
    expect(html).toContain("aria-label=\"Copier le numéro de téléphone\"");
    expect(html).toContain("title=\"Copier le numéro\"");
  });
});

describe("historique", () => {
  const sept = [
    ev("creation", 0), ev("confirmation", 5), ev("report", 10, "citoyen", "Empêchement"), ev("preparation", 15),
    ev("message", 20), ev("depasse", 25), ev("termine", 30),
  ];
  const compteTemps = (html: string) => (html.match(/<time /g) ?? []).length;

  it("7 événements : 5 visibles et « Tout voir (7) »", () => {
    const html = renderToStaticMarkup(contenu(rdv(), "admin", { events: sept }));
    expect(html).toContain("Tout voir (7)");
    expect(compteTemps(html)).toBe(5);
  });

  it("5 événements ou moins : pas de « Tout voir »", () => {
    const html = renderToStaticMarkup(contenu(rdv(), "admin", { events: sept.slice(0, 4) }));
    expect(html).not.toContain("Tout voir");
    expect(compteTemps(html)).toBe(4);
  });

  it("heures de l'historique en fuseau Conakry, 12 h, quel que soit le fuseau de la machine", () => {
    const html = renderToStaticMarkup(contenu(rdv(), "admin", { events: [ev("creation", 1)] }));
    expect(html).toContain("21 oct., 8:01 AM");
  });

  it("chargement : skeleton ; erreur : message + « Réessayer »", () => {
    expect(renderToStaticMarkup(contenu(rdv(), "admin", { etatHistorique: "chargement" }))).toContain("Chargement de l");
    const e = renderToStaticMarkup(contenu(rdv(), "admin", { etatHistorique: "erreur" }));
    expect(e).toContain("Historique indisponible");
    expect(e).toContain("Réessayer");
  });

  it("RDV annulé par le système : le long message n'apparaît qu'une fois, dans le bandeau", () => {
    const long = "Votre rendez-vous du 21/10/2026 a été annulé — ce n'est pas lié à vous. Vous pouvez réserver un nouveau créneau dès maintenant.";
    const html = fiche(rdv({ statut: "annule" }), "admin", { events: [ev("annulation", 0, "system", long)] });
    // L'apostrophe est échappée par React dans le HTML.
    expect((html.match(/ce n(&#x27;|')est pas lié à vous/g) ?? []).length).toBe(0);
    expect(html).toContain("Annulé automatiquement par Yelen");
    expect((html.match(/Annulé automatiquement par Yelen/g) ?? []).length).toBe(2); // bandeau + une ligne d'historique
  });

  it("RDV annulé par le citoyen : motif court une seule fois (bandeau), libellé d'historique sans motif", () => {
    const html = fiche(rdv({ statut: "annule" }), "admin", { events: [ev("annulation", 0, "citoyen", "Voyage imprévu")] });
    expect((html.match(/Voyage imprévu/g) ?? []).length).toBe(1);
  });
});

describe("demande : confidentialité des textes libres", () => {
  const avecTextes = rdv({
    description_besoin: "Douleur persistante au genou depuis trois semaines",
    champs_complementaires_reponses: { "Numéro de dossier": "DOS-7788", "Allergies": "Pénicilline" },
  });

  it.each(["admin", "superviseur", "dirigeant", "agent"] as const)("%s voit la description et les champs", (role) => {
    const html = renderToStaticMarkup(contenu(avecTextes, role));
    expect(html).toContain("Douleur persistante au genou");
    expect(html).toContain("DOS-7788");
    expect(html).toContain("Pénicilline");
    expect(html).not.toContain("ne sont pas visibles pour votre rôle");
  });

  it("comptable : aucun texte libre dans le HTML, message explicite en gris", () => {
    const html = renderToStaticMarkup(contenu(avecTextes, "comptable"));
    expect(html).not.toContain("Douleur persistante");
    expect(html).not.toContain("DOS-7788");
    expect(html).not.toContain("Pénicilline");
    expect(html).toContain("Les détails de la demande ne sont pas visibles pour votre rôle.");
  });

  it("même chose dans la fiche complète (rôle sans accès)", () => {
    const html = fiche(avecTextes, "comptable");
    expect(html).not.toContain("Pénicilline");
  });

  it("sans détail : texte gris 12 px sans carte dédiée", () => {
    const html = renderToStaticMarkup(contenu(rdv(), "admin"));
    expect(html).toContain("Aucun détail complémentaire fourni.");
    expect(html).toMatch(/<div style="[^"]*font-size:12px[^"]*">Aucun détail complémentaire fourni\./);
    expect(html).not.toMatch(/background-color:[^;"]*;[^"]*padding[^"]*">Aucun détail/);
  });
});

describe("RDV pour un tiers", () => {
  it("bloc « Rendez-vous pour » affiché une seule fois, nom en Nom Propre", () => {
    const html = renderToStaticMarkup(contenu(rdv({ pour_autre: true, nom_autre: "OUMOU BARRY", phone_autre: "624582534" }), "admin"));
    expect((html.match(/Rendez-vous pour/g) ?? []).length).toBe(1);
    expect(html).toContain("Oumou Barry");
    expect(html).toContain("Réservé par");
  });
});

describe("fixture « confirme » (absente de la base de production)", () => {
  const confirme = rdv({ statut: "confirme", presence_status: "present" });
  it("badge « Présent » et « Marquer terminé » actif pour un agent", () => {
    const html = fiche(confirme, "agent");
    expect(html).toContain("Client présent");
    expect(boutons(html)).toEqual(["Marquer terminé"]);
    expect(html).not.toMatch(/disabled=""[^>]*><span style="opacity:1">Marquer terminé/);
  });
  it("lecture seule : aucune action, « Fermer »", () => {
    expect(boutons(fiche(confirme, "dirigeant"))).toEqual(["Fermer"]);
  });
});

describe("absences : alerte rattachée à la ligne, jamais un chip flottant", () => {
  const abs = (id: string, over: Partial<Rdv> = {}) => rdv({ id, statut: "en_attente", presence_status: "absent", date_rdv: "2020-01-01", ...over });
  const ligneAbsences = (html: string) => html.slice(html.indexOf(">Absences<"), html.indexOf(">Annulations par le citoyen<"));

  it("2 absences : valeur en ambre + période « sur vos N derniers RDV », sans chip", () => {
    const liste = [abs("a"), abs("b"), rdv({ id: "c", statut: "termine" })];
    const html = renderToStaticMarkup(contenu(liste[2], "admin", { rdvs: liste }));
    const l = ligneAbsences(html);
    expect(l).toContain(`color:${C.orange};font-weight:600">2</span>`);
    expect(l).toContain("sur vos 3 derniers RDV");
    // Plus de chip flottant « N absences chez vous » (la ligne « Rendez-vous chez vous » reste, c'est un autre libellé).
    expect(html).not.toMatch(/\d+ absences? chez vous/);
  });

  it("1 absence : valeur neutre, pas de période, pas d'ambre", () => {
    const liste = [abs("a"), rdv({ id: "c", statut: "termine" })];
    const l = ligneAbsences(renderToStaticMarkup(contenu(liste[1], "admin", { rdvs: liste })));
    expect(l).not.toContain(C.orange);
    expect(l).not.toContain("derniers RDV");
  });

  it("annulations automatiques et RDV non traités ne gonflent pas le compteur", () => {
    const liste = [
      rdv({ id: "a", statut: "annule", annule_par: "system" }),
      rdv({ id: "b", statut: "en_attente", date_rdv: "2020-01-01" }),
      rdv({ id: "c", statut: "nouveau", date_rdv: "2020-01-01" }),
    ];
    const l = ligneAbsences(renderToStaticMarkup(contenu(liste[0], "admin", { rdvs: liste })));
    expect(l).toMatch(/Absences<\/span><span[^>]*>0<\/span>/);
  });
});

describe("client", () => {
  it("compte supprimé (citoyen_id null) : libellé dédié, ni téléphone ni « Voir le profil »", () => {
    const r = rdv({ citoyen_id: null as unknown as string, citoyen_nom: "Citoyen" });
    const html = renderToStaticMarkup(contenu(r, "admin", { onVoirProfil: () => {} }));
    expect(html).toContain("Compte citoyen supprimé");
    expect(html).not.toContain("Voir le profil");
    expect(html).not.toContain("tel:");
  });
  it("« Voir le profil » : lien 13 px avec flèche", () => {
    const html = renderToStaticMarkup(contenu(rdv(), "admin", { onVoirProfil: () => {} }));
    expect(html).toMatch(/font-size:13px[^"]*">Voir le profil<svg/);
    expect(html).toContain("<polyline points=\"9 18 15 12 9 6\"");
  });
  it("avatar : initiales quand il n'y a pas de photo", () => {
    expect(renderToStaticMarkup(contenu(rdv({ citoyen_photo: null }), "admin"))).toContain(">AD<");
  });
});

describe("« Préparer la venue » : même gabarit de défilement", () => {
  const html = renderToStaticMarkup(createElement(PreparationVisiteModal, {
    C, institutionNom: "Banque Test", masquerDemande: false, onClose: () => {}, onSaved: () => {},
    rdv: { id: "r1", citoyen_nom: "awa diallo", date_rdv: demain, heure_rdv: "15:10:00", prestationNom: "Ouverture de compte", duree_minutes: 30 },
  }));
  it("un seul élément défile, focalisable, nommé, sans padding", () => {
    expect((html.match(/overflow-y:auto/g) ?? []).length).toBe(1);
    const balise = html.match(/<div class="yz-scroll"[^>]*>/)?.[0] ?? "";
    expect(balise).toContain("aria-label=\"Contenu de la préparation\"");
    expect(balise).toContain("tabindex=\"0\"");
    expect(balise).not.toMatch(/padding/);
  });
  it("hauteur en dvh, pied « Enregistrer » après la zone qui défile, heure en 12 h", () => {
    expect(html).toContain("max-height:calc(100dvh - 32px)");
    expect(html).not.toContain("100svh");
    expect(html.indexOf("Enregistrer et informer")).toBeGreaterThan(html.indexOf("yz-scroll\""));
    expect(html).toContain("3:10 PM");
    expect(html).not.toContain("15:10");
  });
});
