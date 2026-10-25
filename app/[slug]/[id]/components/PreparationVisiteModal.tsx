"use client";

// Popup "Préparer la venue" (chantier 13/10/2026, refonte UI 21/10/2026) :
// l'institution indique où accueillir le citoyen, peut lui transmettre des
// consignes, puis déclenche une notification réelle. Seul l'affichage a été
// refondu — la route PATCH /api/institution/rdv/preparer-visite, les champs
// enregistrés et la notification n'ont pas changé. Le contenu est monté sous
// une clé (id du RDV) : l'état initial vient des props au montage, sans
// effet de synchronisation — le poll de 30 s du dashboard reconstruit l'objet
// `rdv` à chaque rendu sans jamais effacer la saisie en cours.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { heureAmPm } from "@/lib/heure";
import { ajouterPhrase, contientPhrase, horodatageCourt } from "@/lib/rdvFiche";
import { type ThemeTokens, toUiTokens } from "../theme";
import { buildMessagePreparation } from "@/lib/rdvPreparationMessage";
import { nomPropre } from "./ClockInShiftUi";
import { useVerrouillageDefilement, ZoneDefilement } from "./ZoneDefilement";

// Mêmes bornes que la route (slice(0, 100) / slice(0, 300)).
const GUICHET_MAX = 100;
const INSTRUCTIONS_MAX = 300;

export interface PreparationVisiteRdv {
  id: string;
  citoyen_nom: string;
  date_rdv: string;
  heure_rdv: string;
  prestationNom: string;
  duree_minutes?: number | null;
  guichet?: string | null;
  instructions_accueil?: string | null;
  preparation_confirmee_le?: string | null;
  // Contexte de la demande (déjà en mémoire dans le dashboard) — lecture seule.
  est_payant?: boolean;
  booking_payant_id?: string | null;
  pour_autre?: boolean;
  nom_autre?: string | null;
  description_besoin?: string | null;
  champs_complementaires_reponses?: Record<string, string> | null;
  date_depart?: string | null;
}

type Patch = { guichet: string; instructions_accueil: string | null; preparation_confirmee_le: string | null };

// « Jeudi 22 oct. » — jour de la semaine capitalisé, mois abrégé.
function dateCourteRdv(dateRdv: string): string {
  const [y, m, d] = dateRdv.split("-").map(Number);
  if (!y || !m || !d) return "";
  const t = new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Suggestion de lieu : elle remplit le champ tel quel ; la saisie libre reste possible. Seul
// « Guichet » est proposé : le modèle de message serveur ("Présentez-vous à : {lieu}.") ne se
// lit bien que pour un lieu physique.
const LIEUX_SUGGERES = ["Guichet"];
// Consignes d'insertion rapide : la phrase insérée est le libellé lui-même, sans point final
// (elles sont chaînées avec « · » — voir SEPARATEUR_CONSIGNES).
const CONSIGNES_SUGGEREES = [
  { label: "Apportez votre pièce d'identité", phrase: "Apportez votre pièce d'identité" },
  { label: "Venez avec votre dossier complet", phrase: "Venez avec votre dossier complet" },
  { label: "Arrivez 10 minutes avant", phrase: "Arrivez 10 minutes avant" },
];

function dateDepartLongue(dateDepart: string): string {
  const [y, m, d] = dateDepart.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function Pastille({ C, label, actif, desactive, titre, onClick }: { C: ThemeTokens; label: string; actif?: boolean; desactive?: boolean; titre?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={desactive} aria-pressed={actif} title={titre} className="tap"
      style={{ height: "28px", padding: "0 10px", borderRadius: "8px", border: `1px solid ${actif ? C.gold : C.border2}`, backgroundColor: actif ? `${C.gold}1f` : "transparent", color: actif ? C.t1 : C.t2, fontSize: "12px", cursor: desactive ? "not-allowed" : "pointer", opacity: desactive ? 0.5 : 1, font: "inherit", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

function RangeePastilles({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>{children}</div>;
}

// « La demande du client » — repliée par défaut, lecture seule.
function DemandeClient({ C, description, champs }: { C: ThemeTokens; description: string | null; champs: [string, string][] }) {
  const [ouvert, setOuvert] = useState(false);
  const panneauId = useId();
  if (!description && champs.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "12px", marginBottom: "16px" }}>
      <button type="button" onClick={() => setOuvert(v => !v)} aria-expanded={ouvert} aria-controls={panneauId} className="tap"
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 14px", background: "none", border: "none", color: C.t1, fontSize: "14px", fontWeight: 500, cursor: "pointer", font: "inherit" }}>
        <span>La demande du client</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: ouvert ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {ouvert && (
        <div id={panneauId} style={{ padding: "0 14px 12px", borderTop: `1px solid ${C.border}` }}>
          {description && (
            <div style={{ paddingTop: "10px" }}>
              <div style={{ color: C.t2, fontSize: "12px", marginBottom: "2px" }}>Description du besoin</div>
              <div style={{ color: C.t1, fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{description}</div>
            </div>
          )}
          {champs.map(([label, valeur], i) => (
            <div key={label + i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", paddingTop: "10px" }}>
              <span style={{ color: C.t2, fontSize: "12px", flexShrink: 0 }}>{label}</span>
              <span style={{ color: C.t1, fontSize: "14px", textAlign: "right", overflowWrap: "anywhere" }}>{valeur}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FOCUSABLES = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function Contenu({ rdv, institutionNom, masquerDemande, C, onClose, onSaved }: {
  rdv: PreparationVisiteRdv;
  institutionNom: string;
  masquerDemande: boolean;
  C: ThemeTokens;
  onClose: () => void;
  onSaved: (patch: Patch) => void;
}) {
  const ui = toUiTokens(C);
  const titreId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const guichetRef = useRef<HTMLInputElement>(null);
  const declencheur = useRef<HTMLElement | null>(null);

  const dejaInforme = !!rdv.preparation_confirmee_le;
  const dejaPrepare = !!(rdv.guichet || rdv.instructions_accueil);
  const guichetInitial = rdv.guichet || "";
  const instructionsInitiales = rdv.instructions_accueil || "";

  const [guichet, setGuichet] = useState(guichetInitial);
  const [instructions, setInstructions] = useState(instructionsInitiales);
  // Défaut inchangé pour une première information ; décochée si le client a déjà été informé.
  const [notifier, setNotifier] = useState(!dejaInforme);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmerFermeture, setConfirmerFermeture] = useState(false);
  // La page derrière ne défile pas tant que la modale est ouverte (compteur partagé avec la fiche RDV).
  useVerrouillageDefilement();

  const guichetPropre = guichet.trim();
  const peutEnregistrer = guichetPropre.length > 0;
  const modifie = guichet !== guichetInitial || instructions !== instructionsInitiales;
  const description = masquerDemande ? null : (rdv.description_besoin || null);
  const champs = masquerDemande ? [] : Object.entries(rdv.champs_complementaires_reponses || {}).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim().length > 0);
  // Un RDV payant a toujours un code de confirmation (paid_bookings.confirmation_code NOT NULL) ; sa valeur n'est jamais lue ici.
  const aCodeConfirmation = !!rdv.est_payant && !!rdv.booking_payant_id;
  const beneficiaire = rdv.pour_autre && rdv.nom_autre ? nomPropre(rdv.nom_autre) : null;
  const departLong = rdv.date_depart ? dateDepartLongue(rdv.date_depart) : "";
  const contextuelles: { label: string; phrase: string }[] = [
    ...(aCodeConfirmation ? [{ label: "Présentez votre code de confirmation", phrase: "Présentez votre code de confirmation" }] : []),
    ...(beneficiaire ? [{ label: `Venir avec ${beneficiaire} et sa pièce d'identité`, phrase: `Venir avec ${beneficiaire} et sa pièce d'identité` }] : []),
    ...(departLong ? [{ label: "Rappeler la date de départ", phrase: `Départ prévu le ${departLong}` }] : []),
  ];
  function inserer(phrase: string) {
    const r = ajouterPhrase(instructions, phrase, INSTRUCTIONS_MAX);
    if (r.ajoute) setInstructions(r.texte);
  }
  function choisirLieu(valeur: string) {
    setGuichet(valeur.slice(0, GUICHET_MAX));
    guichetRef.current?.focus();
  }
  const apercu = buildMessagePreparation({ institutionNom, guichet: guichetPropre || "…", instructions });

  function demanderFermeture() {
    if (saving) return;
    if (modifie) setConfirmerFermeture(true);
    else onClose();
  }

  // Focus initial sur « Lieu ou mode d'accueil » ; restitué au déclencheur (le bouton
  // du pied de la fiche) à la fermeture.
  useEffect(() => {
    declencheur.current = document.activeElement as HTMLElement | null;
    guichetRef.current?.focus();
    return () => { declencheur.current?.focus?.(); };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); demanderFermeture(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLES));
      if (f.length === 0) return;
      const premier = f[0];
      const dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleSave() {
    if (!peutEnregistrer || saving) return;
    setSaving(true);
    setErreur(null);
    try {
      const res = await fetch("/api/institution/rdv/preparer-visite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rdv_id: rdv.id, guichet: guichetPropre, instructions: instructions.trim(), notifier }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErreur(json?.error || "Impossible d'enregistrer pour le moment."); return; }
      onSaved({
        guichet: json.guichet,
        instructions_accueil: json.instructions_accueil,
        // La route ne renvoie une date que si le client vient d'être informé ;
        // sinon la valeur en base reste celle d'avant — on la conserve ici
        // plutôt que d'effacer la date de la dernière information.
        preparation_confirmee_le: json.preparation_confirmee_le ?? rdv.preparation_confirmee_le ?? null,
      });
      onClose();
    } catch {
      setErreur("Impossible d'enregistrer pour le moment.");
    } finally {
      setSaving(false);
    }
  }

  const sousTitre = [nomPropre(rdv.citoyen_nom), [dateCourteRdv(rdv.date_rdv), heureAmPm(rdv.heure_rdv)].filter(Boolean).join(", "), rdv.prestationNom, rdv.duree_minutes ? `${rdv.duree_minutes} min` : ""].filter(Boolean).join(" · ");
  const champ = { width: "100%", height: "40px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "0 12px", fontSize: "14px", color: C.t1, boxSizing: "border-box" as const, fontFamily: "inherit" };

  return (
    <div onClick={demanderFermeture} role="presentation"
      style={{ position: "fixed", inset: 0, zIndex: 1300, backgroundColor: "rgba(0,0,0,0.68)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", animation: "fadeIn 0.2s ease" }}>
      <style>{`
        .prep-champ:focus{outline:none;border-color:${C.gold}!important;box-shadow:0 0 0 3px ${C.gold}33}
        .prep-champ:read-only{opacity:.7}
      `}</style>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titreId} onClick={e => e.stopPropagation()}
        style={{ display: "flex", flexDirection: "column", backgroundColor: C.bgCard, borderRadius: "16px", border: `1px solid ${C.border2}`, width: "100%", maxWidth: "560px", maxHeight: "calc(100dvh - 32px)", overflow: "hidden" }}>

        {/* ── En-tête fixe ── */}
        <div style={{ flexShrink: 0, padding: "20px 24px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 id={titreId} style={{ margin: 0, color: C.t1, fontSize: "20px", fontWeight: 600, lineHeight: 1.3 }}>{dejaPrepare ? "Modifier la préparation" : "Préparer la venue"}</h2>
            <div style={{ marginTop: "4px", color: C.t2, fontSize: "13px", lineHeight: 1.5, overflowWrap: "anywhere" }}>{sousTitre}</div>
          </div>
          <button type="button" onClick={demanderFermeture} aria-label="Fermer" className="tap"
            style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "8px", border: `1px solid ${C.border}`, backgroundColor: "transparent", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── Corps ── */}
        <ZoneDefilement C={C} label="Contenu de la préparation">
        <div style={{ padding: "6px 24px 20px" }}>
          <DemandeClient C={C} description={description} champs={champs}/>

          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="prep-guichet" style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500, marginBottom: "6px" }}>
              Lieu ou mode d&apos;accueil <span aria-hidden="true" style={{ color: C.red }}>*</span>
            </label>
            <input id="prep-guichet" ref={guichetRef} className="prep-champ" required aria-required="true"
              value={guichet} onChange={e => setGuichet(e.target.value)} readOnly={saving} maxLength={GUICHET_MAX}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleSave(); } }}
              placeholder="ex : guichet 3, porte Nord, 2e étage" style={champ}/>
            <RangeePastilles>
              {LIEUX_SUGGERES.map(l => <Pastille key={l} C={C} label={l} actif={guichetPropre === l} desactive={saving} onClick={() => choisirLieu(l)}/>)}
            </RangeePastilles>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="prep-instructions" style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500, marginBottom: "6px" }}>
              Consignes pour le client <span style={{ color: C.t2, fontWeight: 400 }}>(optionnel)</span>
            </label>
            <textarea id="prep-instructions" className="prep-champ" value={instructions} onChange={e => setInstructions(e.target.value)} readOnly={saving} maxLength={INSTRUCTIONS_MAX} rows={3}
              placeholder="ex : apportez votre pièce d'identité et votre dossier complet"
              style={{ ...champ, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }}/>
            {departLong && <div style={{ marginTop: "6px", color: C.t2, fontSize: "12px" }}>Séjour : départ prévu le {departLong}.</div>}
            <RangeePastilles>
              {[...CONSIGNES_SUGGEREES, ...contextuelles].map(c => {
                const presente = contientPhrase(instructions, c.phrase);
                const place = ajouterPhrase(instructions, c.phrase, INSTRUCTIONS_MAX).ajoute;
                return (
                  <Pastille key={c.phrase} C={C} label={c.label} actif={presente} desactive={saving || (!presente && !place)}
                    titre={!presente && !place ? `Limite de ${INSTRUCTIONS_MAX} caractères atteinte` : undefined}
                    onClick={() => inserer(c.phrase)}/>
                );
              })}
            </RangeePastilles>
            <div style={{ marginTop: "4px", textAlign: "right", color: C.t2, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{instructions.length}/{INSTRUCTIONS_MAX}</div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: saving ? "default" : "pointer", marginBottom: dejaInforme ? "4px" : "12px" }}>
            <input type="checkbox" checked={notifier} onChange={e => setNotifier(e.target.checked)} disabled={saving} style={{ width: "16px", height: "16px", accentColor: C.gold, cursor: "inherit" }}/>
            <span style={{ color: C.t1, fontSize: "14px" }}>Informer le client maintenant</span>
          </label>
          {dejaInforme && rdv.preparation_confirmee_le && (
            <div style={{ color: C.t2, fontSize: "12px", marginBottom: "12px", paddingLeft: "26px" }}>
              Dernière information envoyée : {horodatageCourt(rdv.preparation_confirmee_le)}
              {!notifier && modifie ? ". Le client ne sera pas prévenu de ces changements." : ""}
            </div>
          )}

          {notifier && (
            <div style={{ marginBottom: "4px" }}>
              <div style={{ color: C.t2, fontSize: "12px", marginBottom: "6px" }}>Message envoyé au client</div>
              <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", color: C.t1, fontSize: "14px", lineHeight: 1.6, overflowWrap: "anywhere" }}>{apercu}</div>
            </div>
          )}

          {erreur && (
            <div role="alert" style={{ marginTop: "12px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: "10px", padding: "10px 12px", color: C.red, fontSize: "13px" }}>{erreur}</div>
          )}
        </div>
        </ZoneDefilement>

        {/* ── Pied fixe ── */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "14px 24px" }}>
          {confirmerFermeture ? (
            <div role="alertdialog" aria-label="Abandonner les modifications ?" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ color: C.t1, fontSize: "14px" }}>Abandonner les modifications ?</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => setConfirmerFermeture(false)}>Continuer à modifier</Button>
                <Button tokens={ui} className="tap" variant="danger" size="md" onClick={onClose}>Abandonner</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <span aria-live="polite" style={{ color: C.t2, fontSize: "12px", flex: "1 1 160px" }}>{peutEnregistrer ? "" : "Indiquez où accueillir le client."}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button tokens={ui} className="tap" variant="secondary" size="md" disabled={saving} onClick={demanderFermeture}>Annuler</Button>
                <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!peutEnregistrer} loading={saving} onClick={handleSave}>
                  {saving ? "Enregistrement…" : notifier ? "Enregistrer et informer" : "Enregistrer"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PreparationVisiteModal({ rdv, institutionNom, masquerDemande, C, onClose, onSaved }: {
  rdv: PreparationVisiteRdv | null;
  institutionNom: string;
  // Mêmes règles que la fiche RDV : la demande n est visible que pour certains rôles.
  masquerDemande: boolean;
  C: ThemeTokens;
  onClose: () => void;
  onSaved: (patch: Patch) => void;
}) {
  if (!rdv) return null;
  return <Contenu key={rdv.id} rdv={rdv} institutionNom={institutionNom} masquerDemande={masquerDemande} C={C} onClose={onClose} onSaved={onSaved}/>;
}
