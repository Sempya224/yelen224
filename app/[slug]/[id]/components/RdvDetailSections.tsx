"use client";

// Contenu de la fiche « Détails du RDV » (refonte phase 1, étape 3) : Demande
// et Quand et où à gauche, Client et Historique à droite. Les règles (dédoublon
// de l'historique, indicateurs, confidentialité) vivent dans lib/rdvFiche.ts ;
// ce fichier ne fait que les afficher. Les sous-composants sont définis au
// niveau module (jamais dans un composant parent : perte de focus à chaque
// rendu).
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { DEVISE_LABEL } from "@/lib/devise";
import { heureDepuisHorodatage } from "@/lib/heure";
import {
  autresRdvMemeHeure, construireHistorique, horodatageCourt, LIMITE_LISTE_RDV, nuitsSejour, plageHoraire, statsClient,
  type HistoriqueColonnes, type HistoriqueEntree, type HistoriqueEvent, type HistoriqueJournal, type RdvStat,
} from "@/lib/rdvFiche";
import type { ThemeTokens } from "../theme";
import type { RDV } from "../layout";
import { nomPropre } from "./ClockInShiftUi";
import { formatTelephone } from "./rdv/parseAppointmentLabel";

// ─── Données d'historique ───────────────────────────────────────────────

export type EtatHistorique = "chargement" | "ok" | "erreur";
type Resultat = { cle: string; events: HistoriqueEvent[]; journal: HistoriqueJournal[]; etat: "ok" | "erreur" };

// Charge rdv_events (tout membre) et journal_activite (rôles ayant l'onglet
// Journal seulement). Aucun setState synchrone dans l'effet : l'état
// « chargement » se déduit du décalage entre la clé demandée et la clé du
// dernier résultat reçu.
export function useRdvHistorique(rdvId: string | null, avecJournal: boolean) {
  const [essai, setEssai] = useState(0);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const cle = rdvId ? `${rdvId}|${avecJournal ? 1 : 0}|${essai}` : "";

  useEffect(() => {
    if (!rdvId) return;
    let annule = false;
    (async () => {
      try {
        const [rEvents, rJournal] = await Promise.all([
          fetch(`/api/institution/rdv/events?rdv_id=${encodeURIComponent(rdvId)}`),
          avecJournal ? fetch(`/api/institution/journal?cible_ids=${encodeURIComponent(rdvId)}&limit=30`) : Promise.resolve(null),
        ]);
        const jEvents = rEvents.ok ? await rEvents.json().catch(() => null) : null;
        const jJournal = rJournal && rJournal.ok ? await rJournal.json().catch(() => null) : null;
        const echec = !rEvents.ok || jEvents === null || (avecJournal && (!rJournal || !rJournal.ok || jJournal === null));
        if (annule) return;
        setResultat({
          cle,
          events: (jEvents?.entrees ?? []) as HistoriqueEvent[],
          journal: (jJournal?.entrees ?? []) as HistoriqueJournal[],
          etat: echec ? "erreur" : "ok",
        });
      } catch {
        if (!annule) setResultat({ cle, events: [], journal: [], etat: "erreur" });
      }
    })();
    return () => { annule = true; };
  }, [rdvId, avecJournal, cle]);

  const courant = resultat && resultat.cle === cle ? resultat : null;
  const etat: EtatHistorique = !rdvId ? "ok" : courant ? courant.etat : "chargement";
  return {
    events: courant?.events ?? [],
    journal: courant?.journal ?? [],
    etat,
    reessayer: () => setEssai(n => n + 1),
  };
}

// ─── Briques d'affichage ────────────────────────────────────────────────

function Carte({ C, children }: { C: ThemeTokens; children: ReactNode }) {
  return <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "4px 16px" }}>{children}</div>;
}

function Section({ C, titre, droite, children }: { C: ThemeTokens; titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, color: C.t1, fontSize: "14px", fontWeight: 600 }}>{titre}</h3>
        {droite}
      </div>
      {children}
    </section>
  );
}

function Ligne({ C, label, children, dernier }: { C: ThemeTokens; label: string; children: ReactNode; dernier?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "10px 0", borderBottom: dernier ? "none" : `1px solid ${C.border}` }}>
      <span style={{ color: C.t2, fontSize: "12px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.t1, fontSize: "14px", textAlign: "right", minWidth: 0, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{children}</span>
    </div>
  );
}

function Pastille({ couleur, children }: { couleur: string; children: ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${couleur}1c`, color: couleur, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
}

// Photo, sinon initiales — y compris quand l'image échoue au chargement
// (URL expirée, fichier supprimé) : jamais un carré vide.
function Avatar({ C, nom, photo }: { C: ThemeTokens; nom: string; photo: string | null | undefined }) {
  const [enErreur, setEnErreur] = useState(false);
  const afficherPhoto = !!photo && !enErreur;
  return (
    <div aria-hidden="true" style={{ width: "48px", height: "48px", position: "relative", borderRadius: "50%", overflow: "hidden", backgroundColor: C.bg3, color: C.t2, fontSize: "16px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {afficherPhoto ? <Image src={photo} alt="" fill sizes="48px" style={{ objectFit: "cover" }} onError={() => setEnErreur(true)}/> : initiales(nom)}
    </div>
  );
}

function BoutonTexte({ C, onClick, children, expanded }: { C: ThemeTokens; onClick: () => void; children: ReactNode; expanded?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="tap" aria-expanded={expanded}
      style={{ background: "none", border: "none", padding: 0, color: C.t2, fontSize: "12px", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
      {children}
    </button>
  );
}

function Description({ C, texte }: { C: ThemeTokens; texte: string }) {
  const [ouvert, setOuvert] = useState(false);
  const long = texte.length > 220 || texte.split("\n").length > 4;
  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ color: C.t2, fontSize: "12px", marginBottom: "4px" }}>Description du besoin</div>
      <div className={long && !ouvert ? "rdvs-clamp4" : undefined} style={{ color: C.t1, fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{texte}</div>
      {long && <div style={{ marginTop: "4px" }}><BoutonTexte C={C} expanded={ouvert} onClick={() => setOuvert(v => !v)}>{ouvert ? "Voir moins" : "Voir plus"}</BoutonTexte></div>}
    </div>
  );
}

function dateLongue(dateRdv: string): string {
  const [y, m, d] = dateRdv.split("-").map(Number);
  if (!y || !m || !d) return "—";
  const t = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function moisAnnee(dateRdv: string): string {
  const [y, m, d] = dateRdv.split("-").map(Number);
  if (!y || !m) return "";
  return new Date(y, m - 1, d || 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

// ─── Colonne gauche : Demande + Quand et où ────────────────────────────

function Demande({ C, rdv, prestationNom, urgent, masquerDemande, champs }: {
  C: ThemeTokens; rdv: RDV; prestationNom: string; urgent: boolean; masquerDemande: boolean; champs: [string, string][];
}) {
  const sejour = !!(rdv.date_depart || rdv.ville_depart || rdv.pays_depart);
  const nuits = rdv.date_depart ? nuitsSejour(rdv.date_rdv, rdv.date_depart) : null;
  const provenance = [rdv.ville_depart, rdv.pays_depart].filter(Boolean).join(", ");
  // Contenu sous la ligne « service » : sans lui, pas de séparateur (sinon double trait avec la bordure de la carte).
  const aDuContenu = (!masquerDemande && (!!rdv.description_besoin || champs.length > 0)) || sejour;
  return (
    <Section C={C} titre="Demande">
      <Carte C={C}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "12px 0", borderBottom: aDuContenu ? `1px solid ${C.border}` : "none" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t2, fontSize: "12px", marginBottom: "2px" }}>{rdv.est_payant ? "Service payant" : "Prestation"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ color: C.t1, fontSize: "14px", fontWeight: 600, overflowWrap: "anywhere" }}>{prestationNom}</span>
              {urgent && <Pastille couleur={C.red}>Urgent</Pastille>}
            </div>
          </div>
          {rdv.est_payant
            ? <span style={{ color: C.t1, fontSize: "14px", fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{(rdv.service_payant_prix ?? 0).toLocaleString("fr-FR")} {DEVISE_LABEL}</span>
            : <Pastille couleur={C.green}>Gratuit</Pastille>}
        </div>

        {!masquerDemande && (
          <>
            {rdv.description_besoin && <Description C={C} texte={rdv.description_besoin}/>}
            {champs.map(([label, valeur], i) => <Ligne key={label + i} C={C} label={label} dernier={i === champs.length - 1 && !sejour}>{valeur}</Ligne>)}
          </>
        )}

        {sejour && (
          <>
            {rdv.date_depart && <Ligne C={C} label="Séjour">{dateLongue(rdv.date_rdv)} → {dateLongue(rdv.date_depart)}{nuits ? ` · ${pluriel(nuits, "nuit", "nuits")}` : ""}</Ligne>}
            {provenance && <Ligne C={C} label="Provenance" dernier>{provenance}</Ligne>}
          </>
        )}
      </Carte>
      {(masquerDemande || !aDuContenu) && (
        <div style={{ marginTop: "8px", color: C.t2, fontSize: "12px" }}>
          {masquerDemande ? "Les détails de la demande ne sont pas visibles pour votre rôle." : "Aucun détail complémentaire fourni."}
        </div>
      )}
    </Section>
  );
}

function QuandOu({ C, rdv, autres, prepPertinente }: { C: ThemeTokens; rdv: RDV; autres: number; prepPertinente: boolean }) {
  const informe = rdv.preparation_confirmee_le ? heureDepuisHorodatage(rdv.preparation_confirmee_le) : "";
  const accueil = rdv.guichet
    ? `${rdv.guichet}${rdv.preparation_confirmee_le ? ` · client informé à ${informe}` : " · client pas encore informé"}`
    : null;
  const lignes: { label: string; valeur: ReactNode }[] = [
    { label: "Date", valeur: dateLongue(rdv.date_rdv) },
    { label: "Heure", valeur: plageHoraire(rdv.heure_rdv, rdv.duree_minutes) },
  ];
  if (rdv.duree_minutes) lignes.push({ label: "Durée prévue", valeur: `${rdv.duree_minutes} min` });
  if (accueil) lignes.push({ label: "Accueil", valeur: accueil });
  else if (prepPertinente) lignes.push({ label: "Accueil", valeur: <span style={{ color: C.t2 }}>Lieu non renseigné</span> });
  if (rdv.instructions_accueil) lignes.push({ label: "Consignes d'accueil", valeur: rdv.instructions_accueil });
  if (rdv.motif_report) lignes.push({ label: "Motif de report", valeur: rdv.motif_report });
  if (autres > 0) lignes.push({ label: "Même créneau", valeur: `${pluriel(autres, "autre RDV", "autres RDV")} à la même heure` });
  return (
    <Section C={C} titre="Quand et où">
      <Carte C={C}>
        {lignes.map((l, i) => <Ligne key={l.label} C={C} label={l.label} dernier={i === lignes.length - 1}>{l.valeur}</Ligne>)}
      </Carte>
    </Section>
  );
}

// ─── Colonne droite : Client + Historique ──────────────────────────────

function Client({ C, rdv, rdvs, onVoirProfil }: { C: ThemeTokens; rdv: RDV; rdvs: readonly RDV[]; onVoirProfil?: () => void }) {
  // citoyen_id NULL = compte supprimé (migration 20261018000009).
  const supprime = !rdv.citoyen_id;
  const nom = supprime ? "Compte citoyen supprimé" : nomPropre(rdv.citoyen_nom);
  const tel = formatTelephone(rdv.citoyen_phone);
  const telBrut = (rdv.citoyen_phone ?? "").replace(/[^\d+]/g, "");
  const stats = statsClient(rdvs as readonly RdvStat[], rdv.citoyen_id);
  const [copie, setCopie] = useState(false);

  async function copier() {
    try { await navigator.clipboard.writeText(tel || rdv.citoyen_phone || ""); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch { /* presse-papiers indisponible : sans effet */ }
  }

  return (
    <Section C={C} titre="Client">
      <Carte C={C}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
          <Avatar C={C} nom={supprime ? "?" : rdv.citoyen_nom} photo={supprime ? null : rdv.citoyen_photo}/>
          <div style={{ minWidth: 0 }}>
            {rdv.pour_autre && <div style={{ color: C.t2, fontSize: "12px" }}>Réservé par</div>}
            <div style={{ color: supprime ? C.t2 : C.t1, fontSize: "14px", fontWeight: 600, overflowWrap: "anywhere" }}>{nom}</div>
            {tel && !supprime && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px", flexWrap: "wrap" }}>
                <a href={`tel:${telBrut}`} style={{ color: C.t1, fontSize: "14px", fontVariantNumeric: "tabular-nums", textDecoration: "underline" }}>{tel}</a>
                <button type="button" onClick={copier} className="tap" aria-label="Copier le numéro de téléphone" title={copie ? "Copié" : "Copier le numéro"}
                  style={{ width: "24px", height: "24px", borderRadius: "6px", border: `1px solid ${C.border}`, background: "none", color: copie ? C.green : C.t2, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  {copie
                    ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    : <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                </button>
              </div>
            )}
            {!supprime && onVoirProfil && (
              <button type="button" onClick={onVoirProfil} className="tap"
                style={{ marginTop: "4px", background: "none", border: "none", padding: 0, color: C.gold, fontSize: "13px", fontWeight: 500, cursor: "pointer", font: "inherit", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                Voir le profil
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
          </div>
        </div>

        {rdv.pour_autre && (
          <div style={{ padding: "10px 0", borderBottom: stats ? `1px solid ${C.border}` : "none" }}>
            <div style={{ color: C.t2, fontSize: "12px", marginBottom: "2px" }}>Rendez-vous pour</div>
            <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>
              {rdv.nom_autre ? nomPropre(rdv.nom_autre) : "—"}{rdv.phone_autre ? ` · ${formatTelephone(rdv.phone_autre)}` : ""}
            </div>
          </div>
        )}

        {stats && (
          <>
            <Ligne C={C} label="Rendez-vous chez vous">{stats.total}</Ligne>
            <Ligne C={C} label="Terminés">{stats.termines}</Ligne>
            {/* Valeur en ambre à partir de 2, avec la période du calcul. Factuel : jamais de note ni de score. */}
            <Ligne C={C} label="Absences">
              {stats.absences >= 2 ? (
                <>
                  <span style={{ color: C.orange, fontWeight: 600 }}>{stats.absences}</span>
                  <span style={{ display: "block", color: C.t2, fontSize: "12px", fontWeight: 400 }}>sur vos {stats.taillePeriode} derniers RDV</span>
                </>
              ) : stats.absences}
            </Ligne>
            <Ligne C={C} label="Annulations par le citoyen">{stats.annulationsCitoyen}</Ligne>
            {stats.premierRdv && <Ligne C={C} label="Client depuis" dernier={!stats.tronque && stats.annulationsOrigineInconnue === 0}>{moisAnnee(stats.premierRdv)}</Ligne>}
            {(stats.tronque || stats.annulationsOrigineInconnue > 0) && (
              <div style={{ padding: "8px 0 10px", display: "flex", flexDirection: "column", gap: "2px" }}>
                {stats.annulationsOrigineInconnue > 0 && <span style={{ color: C.t2, fontSize: "12px" }}>{pluriel(stats.annulationsOrigineInconnue, "annulation d'origine non enregistrée", "annulations d'origine non enregistrée")}.</span>}
                {stats.tronque && <span style={{ color: C.t2, fontSize: "12px" }}>Calculé sur vos {LIMITE_LISTE_RDV} derniers RDV.</span>}
              </div>
            )}
          </>
        )}
      </Carte>
    </Section>
  );
}

const TAILLE_APERCU = 5;

function Historique({ C, entrees, etat, onReessayer }: { C: ThemeTokens; entrees: HistoriqueEntree[]; etat: EtatHistorique; onReessayer: () => void }) {
  const [toutVoir, setToutVoir] = useState(false);
  const visibles = toutVoir ? entrees : entrees.slice(0, TAILLE_APERCU);
  return (
    <Section C={C} titre="Historique">
      {etat === "chargement" ? (
        <div role="status" aria-label="Chargement de l'historique" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[0, 1, 2].map(i => <div key={i} className="rdvs-skel" style={{ height: "38px", borderRadius: "8px", backgroundColor: C.bg3 }}/>)}
        </div>
      ) : etat === "erreur" ? (
        <div role="alert" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: C.t2, fontSize: "14px" }}>Historique indisponible</span>
          <BoutonTexte C={C} onClick={onReessayer}>Réessayer</BoutonTexte>
        </div>
      ) : entrees.length === 0 ? (
        <div style={{ color: C.t2, fontSize: "14px" }}>Aucun événement pour l&apos;instant.</div>
      ) : (
        <>
          <Carte C={C}>
            {visibles.map((h, i) => (
              <div key={`${h.type}-${h.at}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", padding: "10px 0", borderBottom: i < visibles.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "14px" }}>{h.label}</div>
                  {(h.acteur || h.detail) && <div style={{ color: C.t2, fontSize: "12px", marginTop: "1px", overflowWrap: "anywhere" }}>{[h.acteur, h.detail].filter(Boolean).join(" · ")}</div>}
                </div>
                <time dateTime={h.at} style={{ color: C.t2, fontSize: "12px", whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{horodatageCourt(h.at)}</time>
              </div>
            ))}
          </Carte>
          {entrees.length > TAILLE_APERCU && (
            <div style={{ marginTop: "8px" }}>
              <BoutonTexte C={C} expanded={toutVoir} onClick={() => setToutVoir(v => !v)}>{toutVoir ? "Voir moins" : `Tout voir (${entrees.length})`}</BoutonTexte>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ─── Assemblage ────────────────────────────────────────────────────────

export function RdvDetailContenu({ C, rdv, rdvs, colonnes, events, journal, etatHistorique, onReessayer, prestationNom, urgent, masquerDemande, champs, prepPertinente, onVoirProfil }: {
  C: ThemeTokens;
  rdv: RDV;
  rdvs: readonly RDV[];
  colonnes: HistoriqueColonnes;
  events: HistoriqueEvent[];
  journal: HistoriqueJournal[];
  etatHistorique: EtatHistorique;
  onReessayer: () => void;
  prestationNom: string;
  urgent: boolean;
  masquerDemande: boolean;
  champs: [string, string][];
  prepPertinente: boolean;
  onVoirProfil?: () => void;
}) {
  const entrees = construireHistorique(colonnes, events, journal);
  const autres = autresRdvMemeHeure(rdvs as readonly RdvStat[], rdv);
  return (
    <>
      <style>{`
        .rdvs-clamp4{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
        @keyframes rdvsPulse{0%,100%{opacity:1}50%{opacity:.5}}
        .rdvs-skel{animation:rdvsPulse 1.2s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.rdvs-skel{animation:none}}
      `}</style>
      <div>
        <Demande C={C} rdv={rdv} prestationNom={prestationNom} urgent={urgent} masquerDemande={masquerDemande} champs={champs}/>
        <QuandOu C={C} rdv={rdv} autres={autres} prepPertinente={prepPertinente}/>
      </div>
      <div>
        <Client C={C} rdv={rdv} rdvs={rdvs} onVoirProfil={onVoirProfil}/>
        <Historique C={C} entrees={entrees} etat={etatHistorique} onReessayer={onReessayer}/>
      </div>
    </>
  );
}

