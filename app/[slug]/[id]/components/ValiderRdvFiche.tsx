"use client";

// Fiche de validation (Mission B, étape B2). Composant de PRÉSENTATION : il reçoit
// la réservation, les contrôles déjà calculés et deux emplacements (`alertes`,
// `pied`) que ValiderRdvTab.tsx remplit avec ses états et ses actions. Aucun
// appel réseau ici. Question posée à l'agent, en 3 secondes : est-ce la bonne
// personne, le bon rendez-vous, combien encaisser, et que puis-je faire ?
//
// Disposition : en-tête fixe (fermer, référence, badge d'état), une seule zone
// de défilement au milieu, pied fixe. Deux colonnes dès 1024 px (Client à
// gauche), une colonne en dessous. Rien n'affirme une confiance sans donnée : le
// badge « Client vérifié » n'apparaît que si `identite_verifiee` est vrai.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";
import { DEVISE_LABEL } from "@/lib/devise";
import type { CheckInStatus } from "@/lib/rdvGating";
import { heureAmPm, heureDepuisHorodatage, libelleDateRelativeRdv } from "@/lib/heure";
import { nomPropre, type Controle } from "./ValiderRdvUi";

// Réservation telle que renvoyée par GET /api/institution/paid-bookings/valider.
export type BookingFound = {
  id: string;
  confirmation_code: string;
  // Tout statut est accepté : un statut non géré (ex. « rembourse ») a un repli neutre.
  statut: string;
  rdv_lie: boolean;
  date_rdv: string;
  heure_rdv: string;
  // Chambre d'hôtel : présent uniquement pour une réservation de chambre.
  date_depart: string | null;
  traite_le: string | null;
  montant_declare_citoyen: number | null;
  // Montant figé à la déclaration du citoyen / tarif actuel du service : peuvent différer.
  montant_declare: number | null;
  prix_courant: number | null;
  declare_le: string | null;
  pour_autre: boolean;
  nom_autre: string | null;
  phone_autre: string | null;
  service_nom: string;
  service_prix: number;
  service_duree: number;
  citoyen_prenom: string | null;
  citoyen_nom: string | null;
  citoyen_phone: string | null;
  citoyen_photo_url: string | null;
  // true seulement si users.identite_verifiee est vrai ; null = inconnu (badge masqué).
  identite_verifiee: boolean | null;
  // Mêmes compteurs que la fiche « Détails du RDV » (statsClient) ; null = indisponible.
  historique: { total: number; termines: number; absences: number; annulations_citoyen: number; premier_rdv: string | null; tronque: boolean } | null;
  recu_id: string | null;
  reference: string | null;
  guichet: string | null;
  instructions_accueil: string | null;
  // Absents (pas vides) pour les rôles qui ne voient pas la demande du client.
  description_besoin?: string | null;
  champs_complementaires?: Record<string, unknown> | null;
  droits: { traiter: boolean; annuler_validation: boolean };
  etablissement_suspendu: boolean | null;
};

// ── Logique pure (testée dans ValiderRdvFiche.test.ts) ───────────────────

export type Ton = "succes" | "info" | "attention" | "danger" | "neutre";

function gnf(n: number): string {
  return `${n.toLocaleString("fr-FR")} ${DEVISE_LABEL}`;
}

export function libelleStatut(statut: string): string {
  switch (statut) {
    case "en_attente": return "En attente";
    case "confirme": return "Paiement validé";
    case "no_show": return "Absent";
    case "annule": return "Annulé";
    case "termine": return "Déjà traitée";
    default: return "Statut inconnu";
  }
}

// Badge d'état UNIQUE de l'en-tête. Tout statut non géré (ex. « rembourse ») : repli neutre.
export function badgeEtat(b: Pick<BookingFound, "statut" | "service_prix" | "declare_le">): { label: string; ton: Ton } {
  switch (b.statut) {
    case "en_attente":
      return b.service_prix > 0 && !b.declare_le ? { label: "En attente de déclaration", ton: "attention" } : { label: "À encaisser", ton: "info" };
    case "confirme": return { label: "Paiement validé", ton: "succes" };
    case "no_show": return { label: "Absent", ton: "neutre" };
    case "annule": return { label: "Annulé", ton: "danger" };
    case "termine": return { label: "Déjà traitée", ton: "neutre" };
    default: return { label: "Statut inconnu", ton: "neutre" };
  }
}

export type Situation = { ton: Ton; titre: string; detail: string };

// Bandeau de situation : une phrase de titre, une phrase de détail, teinte selon
// l'urgence. Ordre de priorité : déjà traitée, établissement suspendu, journée
// terminée, citoyen en avance, déclaration attendue, lecture seule, prêt.
export function situationFiche(b: BookingFound, ctx: { maintenant: Date; checkIn: CheckInStatus }): Situation {
  if (b.statut !== "en_attente") {
    const ton = badgeEtat(b).ton;
    const heure = b.traite_le ? heureDepuisHorodatage(b.traite_le) : "";
    const titre = b.statut === "confirme" ? "Paiement validé" : b.statut === "no_show" ? "Client marqué absent"
      : b.statut === "annule" ? "Réservation annulée" : b.statut === "termine" ? "Réservation déjà traitée" : "Statut non géré par cet écran";
    return { ton, titre, detail: heure ? `Traité à ${heure}. Aucune action d'encaissement n'est possible.` : "Aucune action d'encaissement n'est possible." };
  }
  if (b.etablissement_suspendu) {
    return { ton: "danger", titre: "Établissement suspendu", detail: "Aucun traitement n'est possible tant que la mesure n'est pas levée." };
  }
  if (ctx.checkIn === "CHECK_IN_EXPIRED") {
    return { ton: "danger", titre: "Rendez-vous expiré", detail: "La journée du rendez-vous est terminée : plus aucune action n'est possible depuis cet écran." };
  }
  if (ctx.checkIn === "CHECK_IN_NOT_YET_AVAILABLE") {
    const relatif = b.date_depart ? `Arrivée prévue le ${dateComplete(b.date_rdv)}` : libelleDateRelativeRdv(b.date_rdv, b.heure_rdv, ctx.maintenant);
    return { ton: "attention", titre: "Le citoyen est en avance", detail: `${relatif}. La validation s'ouvre 10 minutes avant l'heure prévue.` };
  }
  if (b.service_prix > 0 && !b.declare_le) {
    return { ton: "attention", titre: "En attente de la déclaration du citoyen", detail: "Il doit confirmer depuis son application avant que vous puissiez encaisser." };
  }
  if (!b.droits.traiter) {
    return { ton: "neutre", titre: "Lecture seule", detail: "Votre rôle ne permet pas de traiter cette réservation." };
  }
  const montant = b.service_prix > 0 ? montantEncaisse(b) : null;
  return {
    ton: "succes",
    titre: montant !== null ? `Prêt à encaisser ${gnf(montant)}` : "Prêt à confirmer",
    detail: "Vérifiez la personne au guichet, encaissez en espèces, puis validez.",
  };
}

// Montant à encaisser : montant déclaré par le citoyen s'il existe, sinon prix actuel.
export function montantEncaisse(b: Pick<BookingFound, "declare_le" | "montant_declare" | "service_prix">): number {
  return b.declare_le && b.montant_declare !== null ? b.montant_declare : b.service_prix;
}

// « jeudi 6 août 2026 » : jour de la semaine et année. Date murale lue en UTC pour ne
// jamais glisser d'un jour selon le fuseau de la machine.
export function dateComplete(dateRdv: string): string {
  const d = new Date(`${dateRdv}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateRdv;
  return d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function nombreNuits(arrivee: string, depart: string): number {
  return Math.round((new Date(`${depart}T00:00:00Z`).getTime() - new Date(`${arrivee}T00:00:00Z`).getTime()) / 86400000);
}

function moisAnnee(dateRdv: string): string {
  const d = new Date(`${dateRdv}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });
}

function initiales(nom: string): string {
  return nom.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function couleursTon(C: ThemeTokens, ton: Ton): { color: string; bg: string } {
  switch (ton) {
    case "succes": return { color: C.green, bg: C.greenL };
    case "info": return { color: C.blue, bg: C.blueL };
    case "attention": return { color: C.orange, bg: C.orangeL };
    case "danger": return { color: C.red, bg: C.redL };
    default: return { color: C.t2, bg: C.bg3 };
  }
}

// ── Présentation ─────────────────────────────────────────────────────────

const CSS = (C: ThemeTokens) => `
  .vf-root{position:fixed;inset:0;z-index:900;background:${C.bg};display:flex;flex-direction:column;animation:fadeIn .2s ease}
  .vf-head{flex:none;background:${C.bgCard};border-bottom:1px solid ${C.border};box-shadow:0 2px 10px rgba(0,0,0,.10);padding:calc(env(safe-area-inset-top) + 10px) 16px 10px;position:relative;z-index:2}
  .vf-head-in{max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .vf-body{flex:1;min-height:0;overflow-y:scroll}
  .vf-top{max-width:1120px;margin:0 auto;padding:16px 16px 0}
  .vf-grid{max-width:1120px;margin:0 auto;padding:16px;display:grid;grid-template-columns:1fr;gap:16px}
  .vf-col{display:flex;flex-direction:column;gap:16px;min-width:0}
  .vf-foot{flex:none;background:${C.bgCard};border-top:1px solid ${C.border};box-shadow:0 -2px 10px rgba(0,0,0,.10);padding:12px 16px calc(env(safe-area-inset-bottom) + 12px);position:relative;z-index:2;max-height:55vh;overflow-y:auto}
  .vf-foot-in{max-width:1120px;margin:0 auto}
  .vf-btn:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
  .vf-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
  @media(max-width:639px){.vf-actions{flex-direction:column-reverse;align-items:stretch}.vf-actions>*{width:100%}}
  @media(min-width:1024px){
    .vf-top{padding:24px 32px 0}
    .vf-grid{padding:24px 32px;grid-template-columns:360px 1fr;gap:24px;align-items:start}
    .vf-foot{max-height:none;overflow:visible}
  }
  @media(prefers-reduced-motion:reduce){.vf-root{animation:none}}
`;

function Section({ C, id, titre, droite, children }: { C: ThemeTokens; id: string; titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" }}>
        <h2 id={id} style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: 0 }}>{titre}</h2>
        {droite}
      </div>
      {children}
    </section>
  );
}

function SectionRepliable({ C, id, titre, resume, ouvert, onToggle, children }: {
  C: ThemeTokens; id: string; titre: string; resume: ReactNode; ouvert: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" }}>
      <button type="button" className="vf-btn tap" aria-expanded={ouvert} aria-controls={`${id}-corps`} onClick={onToggle}
        style={{ width: "100%", background: "none", border: "none", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", textAlign: "left" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={id} style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: 0 }}>{titre}</h2>
          <div style={{ marginTop: "4px" }}>{resume}</div>
        </div>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: ouvert ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {ouvert && <div id={`${id}-corps`} style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>{children}</div>}
    </section>
  );
}

function Ligne({ C, label, children }: { C: ThemeTokens; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "12px", padding: "6px 0", alignItems: "baseline" }}>
      <div style={{ width: "112px", flexShrink: 0, color: C.t3, fontSize: "12.5px" }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, color: C.t1, fontSize: "13.5px", fontWeight: 500, overflowWrap: "anywhere", whiteSpace: "pre-line" }}>{children}</div>
    </div>
  );
}

function AvatarFiche({ C, nom, photoUrl, taille }: { C: ThemeTokens; nom: string; photoUrl: string | null; taille: number }) {
  const ini = initiales(nom);
  return (
    <div aria-hidden="true" style={{ width: taille, height: taille, position: "relative", borderRadius: Math.round(taille * 0.3), overflow: "hidden", flexShrink: 0, backgroundColor: photoUrl || ini ? C.gold : C.bg3, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {photoUrl ? (
        <Image src={photoUrl} alt="" fill sizes={`${taille}px`} style={{ objectFit: "cover" }}/>
      ) : ini ? (
        <span style={{ color: "#000", fontSize: Math.round(taille * 0.36), fontWeight: 700 }}>{ini}</span>
      ) : (
        <svg width={Math.round(taille * 0.5)} height={Math.round(taille * 0.5)} viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      )}
    </div>
  );
}

function IconeCopier({ copie, couleur }: { copie: boolean; couleur: string }) {
  return copie
    ? <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    : <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
}

// Contrôle de vérification : icône ET texte, jamais la couleur seule.
function LigneControle({ controle, C }: { controle: Controle; C: ThemeTokens }) {
  const couleur = controle.etat === "ok" ? C.green : controle.etat === "echec" ? C.red : controle.etat === "attention" ? C.orange : C.t3;
  const fond = controle.etat === "ok" ? C.greenL : controle.etat === "echec" ? C.redL : controle.etat === "attention" ? C.orangeL : C.bg3;
  const etatTexte = controle.etat === "ok" ? "Conforme" : controle.etat === "echec" ? "Non conforme" : controle.etat === "attention" ? "À vérifier" : "Sans objet";
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 0" }}>
      <span aria-hidden="true" style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: fond, border: `1px solid ${couleur}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
        {controle.etat === "ok" ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : controle.etat === "na" ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ) : controle.etat === "attention" ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="3" strokeLinecap="round"><line x1="12" y1="6" x2="12" y2="13"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500 }}>{controle.label} <span style={{ color: couleur, fontWeight: 600 }}>· {etatTexte}</span></div>
        <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, marginTop: "1px" }}>{controle.detail}</div>
      </div>
    </li>
  );
}

// Piège de focus pour une boîte de dialogue : le focus entre dans le conteneur à
// l'ouverture, Tab et Maj+Tab y restent, Échap appelle `onEscape`, et le focus
// revient à l'élément précédent à la fermeture. Écoute posée sur le conteneur
// lui-même : une modale ouverte par-dessus (autre sous-arbre du DOM) ne déclenche
// donc pas l'Échap de la fiche.
const FOCALISABLES = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function useFocusTrap(racine: RefObject<HTMLElement | null>, onEscape: () => void) {
  const escape = useRef(onEscape);
  useEffect(() => { escape.current = onEscape; });
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const zone: HTMLElement = el;
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focalisables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCALISABLES)).filter((n) => n.offsetParent !== null);
    (focalisables()[0] ?? el).focus();
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); escape.current(); return; }
      if (e.key !== "Tab") return;
      const liste = focalisables();
      if (liste.length === 0) { e.preventDefault(); return; }
      const premier = liste[0], dernier = liste[liste.length - 1], actif = document.activeElement;
      if (e.shiftKey && (actif === premier || !zone.contains(actif))) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && (actif === dernier || !zone.contains(actif))) { e.preventDefault(); premier.focus(); }
    };
    el.addEventListener("keydown", surTouche);
    return () => { el.removeEventListener("keydown", surTouche); precedent?.focus(); };
  }, [racine]);
}

export function FicheValidation({ C, booking: b, maintenant, controles, checkIn, onClose, onEscape, occupe, alertes, pied }: {
  C: ThemeTokens; booking: BookingFound; maintenant: Date; controles: Controle[]; checkIn: CheckInStatus;
  // `occupe` : une action est en cours, la fiche ne peut pas être fermée (le résultat serait perdu).
  onClose: () => void; onEscape: () => void; occupe: boolean; alertes?: ReactNode; pied?: ReactNode;
}) {
  const racine = useRef<HTMLDivElement>(null);
  useFocusTrap(racine, onEscape);
  const [paiementOuvert, setPaiementOuvert] = useState(true);
  const [demandeOuverte, setDemandeOuverte] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);

  async function copier(valeur: string, cle: string) {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(cle);
      setTimeout(() => setCopie((c) => (c === cle ? null : c)), 1500);
    } catch { /* presse-papiers indisponible : le texte reste sélectionnable à la main */ }
  }

  const etat = badgeEtat(b);
  const couleurEtat = couleursTon(C, etat.ton);
  const sit = situationFiche(b, { maintenant, checkIn });
  const couleurSit = couleursTon(C, sit.ton);

  const titulaire = `${b.citoyen_prenom ?? ""} ${b.citoyen_nom ?? ""}`.trim();
  const nomPrincipal = b.pour_autre ? (b.nom_autre?.trim() ? nomPropre(b.nom_autre) : "Bénéficiaire non renseigné") : (titulaire ? nomPropre(titulaire) : "Citoyen enregistré");
  const tel = b.pour_autre ? b.phone_autre : b.citoyen_phone;
  const payant = b.service_prix > 0;
  const aEncaisser = montantEncaisse(b);
  const declare = !!b.declare_le && b.montant_declare !== null;
  const ecart = declare && b.prix_courant !== null ? b.prix_courant - (b.montant_declare as number) : 0;
  const champs = Object.entries(b.champs_complementaires ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim().length > 0);
  const aDemande = !!b.description_besoin || champs.length > 0;
  const libelleMontant = b.statut === "confirme" ? "Encaissé" : b.statut === "en_attente" ? "À encaisser" : "Montant";
  const heureDeclaration = b.declare_le ? heureDepuisHorodatage(b.declare_le) : "";
  const quand = b.date_depart ? `Arrivée le ${dateComplete(b.date_rdv)}` : libelleDateRelativeRdv(b.date_rdv, b.heure_rdv, maintenant);

  return (
    <div ref={racine} tabIndex={-1} className="vf-root" role="dialog" aria-modal="true" aria-labelledby="vf-titre" style={{ outline: "none" }}>
      <style>{CSS(C)}</style>

      <header className="vf-head">
        <div className="vf-head-in">
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onClose} disabled={occupe}
            icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>}>
            Fermer
          </Button>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h1 id="vf-titre" style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>Fiche de validation</h1>
              {b.reference && (
                <button type="button" className="vf-btn tap" onClick={() => copier(b.reference as string, "ref")} aria-label={`Copier la référence ${b.reference}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "2px 8px", color: C.t2, fontSize: "12px", fontFamily: "monospace", cursor: "pointer" }}>
                  {b.reference}<IconeCopier copie={copie === "ref"} couleur={copie === "ref" ? C.green : C.t3}/>
                </button>
              )}
            </div>
            <div style={{ color: C.t2, fontSize: "12.5px", marginTop: "2px" }}>{quand}</div>
          </div>
          <Badge label={etat.label} color={couleurEtat.color} bg={couleurEtat.bg}/>
        </div>
      </header>

      <div className="vf-body">
        <div className="vf-top">
          <div role="status" aria-live="polite" style={{ backgroundColor: couleurSit.bg, border: `1px solid ${couleurSit.color}33`, borderRadius: "12px", padding: "14px 16px", marginBottom: "14px" }}>
            <div style={{ color: couleurSit.color, fontSize: "15px", fontWeight: 600 }}>{sit.titre}</div>
            <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, marginTop: "2px" }}>{sit.detail}</div>
          </div>
          {alertes}
        </div>

        <div className="vf-grid">
          {/* Colonne gauche — Client */}
          <div className="vf-col">
            <Section C={C} id="vf-client" titre={b.pour_autre ? "Bénéficiaire" : "Client"}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <AvatarFiche C={C} nom={b.pour_autre ? (b.nom_autre ?? "") : titulaire} photoUrl={b.pour_autre ? null : b.citoyen_photo_url} taille={64}/>
                <div style={{ minWidth: 0 }}>
                  {b.pour_autre && <div style={{ color: C.t3, fontSize: "12px" }}>Rendez-vous pour</div>}
                  <div style={{ color: C.t1, fontSize: "18px", fontWeight: 600, lineHeight: 1.25, overflowWrap: "anywhere" }}>{nomPrincipal}</div>
                  {b.pour_autre && <div style={{ color: C.t2, fontSize: "12.5px", marginTop: "2px", overflowWrap: "anywhere" }}>Réservé par {titulaire ? nomPropre(titulaire) : "un compte Yelen"}</div>}
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "12px" }}>
                {b.pour_autre
                  ? <Badge label="Identité du tiers non vérifiée" color={C.orange} bg={C.orangeL}/>
                  : b.identite_verifiee === true ? <Badge label="Client vérifié" color={C.green} bg={C.greenL}/> : null}
              </div>

              <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ color: C.t3, fontSize: "12.5px", marginBottom: "6px" }}>Téléphone</div>
                {tel ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <a href={`tel:${tel}`} className="vf-btn" style={{ color: C.t1, fontSize: "15px", fontWeight: 500, fontVariantNumeric: "tabular-nums", textDecoration: "underline", textUnderlineOffset: "3px" }}>{tel}</a>
                    <button type="button" className="vf-btn tap" onClick={() => copier(tel, "tel")} aria-label={`Copier le numéro ${tel}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "3px 8px", color: copie === "tel" ? C.green : C.t2, fontSize: "12.5px", cursor: "pointer" }}>
                      <IconeCopier copie={copie === "tel"} couleur={copie === "tel" ? C.green : C.t3}/>{copie === "tel" ? "Copié" : "Copier"}
                    </button>
                    <a href={`tel:${tel}`} className="vf-btn tap" style={{ display: "inline-flex", alignItems: "center", gap: "5px", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "3px 10px", color: C.t1, fontSize: "12.5px", textDecoration: "none" }}>
                      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      Appeler
                    </a>
                  </div>
                ) : (
                  <div style={{ color: C.t2, fontSize: "13.5px" }}>Non renseigné</div>
                )}
                {b.pour_autre && b.citoyen_phone && (
                  <div style={{ color: C.t3, fontSize: "12px", marginTop: "8px" }}>Titulaire du compte : {b.citoyen_phone}</div>
                )}
              </div>

              <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ color: C.t3, fontSize: "12.5px", marginBottom: "6px" }}>Historique chez vous</div>
                {b.historique === null ? (
                  <div role="status" style={{ color: C.t2, fontSize: "13.5px" }}>Historique indisponible</div>
                ) : b.historique.total === 0 ? (
                  <div style={{ color: C.t1, fontSize: "13.5px" }}>Aucun rendez-vous enregistré</div>
                ) : (
                  <>
                    <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {b.historique.total} rendez-vous · {b.historique.termines} terminé{b.historique.termines > 1 ? "s" : ""} · {b.historique.absences} absence{b.historique.absences > 1 ? "s" : ""}
                    </div>
                    {b.historique.premier_rdv && <div style={{ color: C.t3, fontSize: "12px", marginTop: "3px" }}>Client depuis {moisAnnee(b.historique.premier_rdv)}</div>}
                    {b.historique.tronque && <div style={{ color: C.t3, fontSize: "12px", marginTop: "3px" }}>Calculé sur les 1 000 derniers rendez-vous de ce client.</div>}
                  </>
                )}
                {b.pour_autre && <div style={{ color: C.t3, fontSize: "12px", marginTop: "6px" }}>Historique du titulaire du compte, pas du bénéficiaire.</div>}
              </div>
            </Section>
          </div>

          {/* Colonne droite — Réservation, Demande, Paiement, Vérifications */}
          <div className="vf-col">
            <Section C={C} id="vf-resa" titre="Réservation">
              <Ligne C={C} label="Service">{b.service_nom}</Ligne>
              {b.date_depart ? (
                <>
                  <Ligne C={C} label="Arrivée">{dateComplete(b.date_rdv)}</Ligne>
                  <Ligne C={C} label="Départ">{dateComplete(b.date_depart)}</Ligne>
                  <Ligne C={C} label="Nuits">{nombreNuits(b.date_rdv, b.date_depart)}</Ligne>
                </>
              ) : (
                <>
                  <Ligne C={C} label="Date">{dateComplete(b.date_rdv)}</Ligne>
                  <Ligne C={C} label="Heure">{heureAmPm(b.heure_rdv) || b.heure_rdv}</Ligne>
                  {b.service_duree > 0 && <Ligne C={C} label="Durée prévue">{b.service_duree} min</Ligne>}
                </>
              )}
              {b.reference && <Ligne C={C} label="Référence"><span style={{ fontFamily: "monospace" }}>{b.reference}</span></Ligne>}
              {b.guichet && <Ligne C={C} label="Guichet">{b.guichet}</Ligne>}
              {b.instructions_accueil && <Ligne C={C} label="Instructions">{b.instructions_accueil}</Ligne>}
            </Section>

            {aDemande && (
              <SectionRepliable C={C} id="vf-demande" titre="Demande du client" ouvert={demandeOuverte} onToggle={() => setDemandeOuverte((v) => !v)}
                resume={<span style={{ color: C.t2, fontSize: "12.5px" }}>{demandeOuverte ? "Lecture seule" : "Afficher le détail de la demande (lecture seule)"}</span>}>
                {b.description_besoin && <p style={{ color: C.t1, fontSize: "13.5px", lineHeight: 1.6, margin: "0 0 8px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{b.description_besoin}</p>}
                {champs.map(([cle, valeur]) => <Ligne key={cle} C={C} label={cle}>{valeur}</Ligne>)}
              </SectionRepliable>
            )}

            <SectionRepliable C={C} id="vf-paiement" titre="Paiement" ouvert={paiementOuvert} onToggle={() => setPaiementOuvert((v) => !v)}
              resume={payant ? (
                <span style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: C.t3, fontSize: "12.5px" }}>{libelleMontant}</span>
                  <span style={{ color: C.t1, fontSize: "22px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{gnf(aEncaisser)}</span>
                </span>
              ) : <span style={{ color: C.t2, fontSize: "13px" }}>Service sans paiement</span>}>
              {payant ? (
                <>
                  {!declare && <div style={{ color: C.t3, fontSize: "12.5px", marginBottom: "8px" }}>Prix actuel, non figé : le citoyen n&apos;a pas encore déclaré de montant.</div>}
                  <Ligne C={C} label="Mode">Espèces, paiement sur place</Ligne>
                  <Ligne C={C} label="Déclaration">
                    {b.declare_le ? `Le citoyen déclare avoir remis ${gnf(b.montant_declare ?? b.service_prix)}${heureDeclaration ? ` à ${heureDeclaration}` : ""}` : "Pas encore déclarée par le citoyen"}
                  </Ligne>
                  {declare && b.prix_courant !== null && ecart !== 0 && (
                    <div role="status" style={{ marginTop: "10px", padding: "10px 12px", backgroundColor: C.orangeL, border: `1px solid ${C.orange}40`, borderRadius: "8px", color: C.t1, fontSize: "13px", lineHeight: 1.5 }}>
                      Le montant déclaré ({gnf(b.montant_declare as number)}) diffère du prix actuel ({gnf(b.prix_courant)}) : écart de {ecart > 0 ? "+" : "−"}{gnf(Math.abs(ecart))}. Vous encaissez le montant déclaré.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: C.t2, fontSize: "13.5px" }}>Aucun encaissement pour ce service.</div>
              )}
            </SectionRepliable>

            <Section C={C} id="vf-verifs" titre="Vérifications">
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {controles.map((c) => <LigneControle key={c.id} controle={c} C={C}/>)}
              </ul>
            </Section>
          </div>
        </div>
      </div>

      {pied && <div className="vf-foot"><div className="vf-foot-in">{pied}</div></div>}
    </div>
  );
}

// ── Pied : zone d'action ─────────────────────────────────────────────────

// Phrase du résultat d'une action : « Paiement validé · 2 000 GNF · 2:58 PM ».
export function libelleResultat(b: Pick<BookingFound, "service_prix" | "declare_le" | "montant_declare">, action: string, heure: string): string {
  const h = heure ? ` · ${heure}` : "";
  if (action === "confirme") return b.service_prix > 0 ? `Paiement validé · ${gnf(montantEncaisse(b))}${h}` : `Présence confirmée${h}`;
  if (action === "no_show") return `Client marqué absent${h}`;
  if (action === "annule") return `Réservation annulée${h}`;
  return `Action enregistrée${h}`;
}

function Message({ C, ton, role, children }: { C: ThemeTokens; ton: Ton; role: "alert" | "status"; children: ReactNode }) {
  const t = couleursTon(C, ton);
  return (
    <div role={role} style={{ marginBottom: "10px", padding: "10px 12px", backgroundColor: t.bg, border: `1px solid ${t.color}40`, borderRadius: "8px", color: C.t1, fontSize: "13px", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// Pied fixe : un seul bouton primaire (or), actions secondaires, états d'erreur et
// de résultat. Le bouton d'encaissement est désactivé AVEC sa raison affichée ;
// l'encaissement passe par une confirmation légère (service payant).
export function PiedAction({ C, booking: b, blocage, expire, occupe, verificationReseau, resultatInconnu, montantObsolete, sessionExpiree,
  actionError, actionSuccess, avertissements, peutAnnulerValidation, confirmation, heureResultat, telechargementRecu,
  onDemanderConfirmation, onRetourConfirmation, onConfirmer, onAbsent, onAnnulerReservation, onAnnulerValidation,
  onRafraichir, onAutre, onFermer, onRecu }: {
  C: ThemeTokens; booking: BookingFound; blocage: string | null; expire: boolean; occupe: boolean;
  verificationReseau: boolean; resultatInconnu: boolean; montantObsolete: boolean; sessionExpiree: boolean;
  actionError: string | null; actionSuccess: string | null; avertissements: string[]; peutAnnulerValidation: boolean;
  confirmation: boolean; heureResultat: string; telechargementRecu: boolean;
  onDemanderConfirmation: () => void; onRetourConfirmation: () => void; onConfirmer: () => void | Promise<void>;
  onAbsent: () => void; onAnnulerReservation: () => void; onAnnulerValidation: () => void;
  onRafraichir: () => void | Promise<void>; onAutre: () => void; onFermer: () => void; onRecu: () => void | Promise<void>;
}) {
  const ui = toUiTokens(C);
  const payant = b.service_prix > 0;
  const montant = montantEncaisse(b);

  // Résultat d'une action : l'agent lit, puis choisit lui-même la suite.
  if (actionSuccess) {
    return (
      <div>
        <div role="status" aria-live="polite" style={{ color: C.t1, fontSize: "15px", fontWeight: 600, marginBottom: avertissements.length > 0 ? "10px" : "12px" }}>
          {libelleResultat(b, actionSuccess, heureResultat)}
        </div>
        {avertissements.map((a) => <Message key={a} C={C} ton="attention" role="alert">{a}</Message>)}
        <div className="vf-actions">
          {actionSuccess === "confirme" && b.recu_id && (
            <Button tokens={ui} className="tap" variant="secondary" size="md" loading={telechargementRecu} onClick={onRecu}>Télécharger le reçu</Button>
          )}
          <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={onFermer}>Fermer</Button>
          <Button tokens={ui} className="tap" variant="primary" size="md" onClick={onAutre}>Valider un autre rendez-vous</Button>
        </div>
      </div>
    );
  }

  // Réservation déjà traitée : « Fermer » et, si le droit et le jour le permettent, « Annuler la validation ».
  if (b.statut !== "en_attente") {
    return (
      <div className="vf-actions">
        {peutAnnulerValidation && <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={onAnnulerValidation}>Annuler la validation</Button>}
        <Button tokens={ui} className="tap" variant="primary" size="md" onClick={onFermer}>Fermer</Button>
      </div>
    );
  }

  const raison = expire ? "La journée du rendez-vous est terminée : aucune action n'est possible depuis cet écran." : blocage;
  const bloqueTout = expire || sessionExpiree || verificationReseau || resultatInconnu;
  const secondaireBloque = occupe || expire || sessionExpiree || verificationReseau || resultatInconnu || !b.droits.traiter || b.etablissement_suspendu === true;

  return (
    <div>
      {actionError && <Message C={C} ton="danger" role="alert">{actionError}</Message>}
      {verificationReseau && <Message C={C} ton="neutre" role="status">Résultat inconnu : vérification en cours…</Message>}
      {resultatInconnu && (
        <Message C={C} ton="attention" role="alert">
          Résultat inconnu : la connexion a été coupée et l&apos;état n&apos;a pas pu être relu. Vérifiez la réservation avant de recommencer, pour ne pas encaisser deux fois.
          <div style={{ marginTop: "8px" }}><Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onRafraichir}>Vérifier l&apos;état</Button></div>
        </Message>
      )}
      {montantObsolete && (
        <div style={{ marginBottom: "10px" }}><Button tokens={ui} className="tap" variant="secondary" size="md" onClick={onRafraichir}>Recharger la fiche</Button></div>
      )}

      {confirmation ? (
        <div role="group" aria-label="Confirmation de l'encaissement">
          <div style={{ color: C.t1, fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Confirmer l&apos;encaissement de {gnf(montant)} en espèces</div>
          <div style={{ color: C.t2, fontSize: "13px", marginBottom: "12px" }}>Validez uniquement après avoir reçu le montant. Cette action enregistre le paiement et génère le reçu.</div>
          <div className="vf-actions">
            <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={occupe} onClick={onRetourConfirmation}>Retour</Button>
            <Button tokens={ui} className="tap" variant="primary" size="md" loading={occupe} disabled={bloqueTout || blocage !== null} onClick={onConfirmer}>Confirmer l&apos;encaissement</Button>
          </div>
        </div>
      ) : (
        <>
          {raison && <div id="vf-raison" role="status" style={{ color: C.t2, fontSize: "13px", marginBottom: "8px", textAlign: "right" }}>Validation impossible : {raison.charAt(0).toLowerCase()}{raison.slice(1)}</div>}
          <div className="vf-actions">
            <Button tokens={ui} className="tap" variant="danger-ghost" size="md" disabled={secondaireBloque} onClick={onAnnulerReservation}>Annuler la réservation</Button>
            <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={secondaireBloque} onClick={onAbsent}>Marquer comme absent</Button>
            <Button tokens={ui} className="tap" variant="primary" size="md" loading={occupe} disabled={bloqueTout || blocage !== null}
              onClick={payant ? onDemanderConfirmation : onConfirmer}
              style={raison ? { backgroundColor: C.bg3, borderColor: C.border2, color: C.t3 } : undefined}
              icon={!raison ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : undefined}>
              {payant ? `Valider le paiement · ${gnf(montant)}` : "Confirmer gratuitement"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
