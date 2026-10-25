"use client";

// Panneaux de l'écran "Conditions et informations" (refonte 24/10/2026).
// Composant dédié : FieldCard (ConditionsInformationsTab.tsx) reste intact
// car partagé avec ConfigurationHotelTab.tsx. Aucun appel réseau ici — la
// sauvegarde est déléguée à `onSave` (handler PUT resté dans l'écran).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { dateHeureCourte, dateJourConakry } from "@/lib/heure";
import { inputFieldStyle } from "./FormField";

const HAUTEUR_MAX_TEXTAREA = 360;

export type PanneauTexteProps = {
  C: ThemeTokens;
  field: string;
  title: string;
  description: string;
  placeholder: string;
  savedValue: string;
  savedDate: string | null;
  /** Renvoie un message d'erreur, ou null si l'enregistrement a réussi. */
  onSave: (value: string) => Promise<string | null>;
  onDirtyChange: (field: string, dirty: boolean) => void;
};

const ICONE_CRAYON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);

// Plafond appliqué côté serveur (api/institution/profile, TEXTE_PUBLIC_MAX).
const MAX_CARACTERES = 5000;

function nombreCaracteres(n: number): string {
  return `${n} / ${MAX_CARACTERES} caractères`;
}

export function PanneauTexte({ C, field, title, description, placeholder, savedValue, savedDate, onSave, onDirtyChange }: PanneauTexteProps) {
  const uid = useId();
  const idTitre = `${uid}-titre`;
  const idTexte = `${uid}-texte`;
  const idCompteur = `${uid}-compteur`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(savedValue);
  const [prevSaved, setPrevSaved] = useState(savedValue);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [apercu, setApercu] = useState(false);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const refTextarea = useRef<HTMLTextAreaElement>(null);

  // Synchronise le brouillon avec la valeur enregistrée qui change de
  // l'extérieur — seulement si le brouillon n'a pas été modifié.
  if (savedValue !== prevSaved) {
    setPrevSaved(savedValue);
    if (draft === prevSaved) setDraft(savedValue);
  }

  const dirty = editing && draft !== savedValue;
  const tropLong = draft.length > MAX_CARACTERES;

  useEffect(() => {
    onDirtyChange(field, dirty);
    return () => onDirtyChange(field, false);
  }, [field, dirty, onDirtyChange]);

  // Hauteur automatique, plafonnée puis défilement interne.
  useLayoutEffect(() => {
    const el = refTextarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, HAUTEUR_MAX_TEXTAREA)}px`;
  }, [draft, editing, apercu]);

  const renseigne = savedValue.trim().length > 0;
  const dateTexte = savedDate ? dateHeureCourte(savedDate) : "";

  const demarrerEdition = () => { setDraft(savedValue); setErreur(null); setSucces(false); setEditing(true); };
  const quitterEdition = () => { setDraft(savedValue); setErreur(null); setApercu(false); setEditing(false); };
  const annuler = () => { if (dirty) setConfirmerAnnulation(true); else quitterEdition(); };

  const enregistrer = async () => {
    setSaving(true);
    setErreur(null);
    setSucces(false);
    const message = await onSave(draft);
    setSaving(false);
    if (message) { setErreur(message); return; }
    setApercu(false);
    setEditing(false);
    setSucces(true);
  };

  const texteApercu = editing ? draft : savedValue;

  return (
    <Card tokens={toCardTokens(C)} padding="20px" className="ci-panel">
      <section role="group" aria-labelledby={idTitre}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <h2 id={idTitre} style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0, letterSpacing: "-0.2px" }}>{title}</h2>
            <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, margin: "4px 0 0" }}>{description}</p>
            <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5, margin: "6px 0 0" }}>
              {renseigne
                ? `Visible publiquement · Renseigné${dateTexte ? ` · mis à jour le ${dateTexte}` : ""}`
                : "Non renseigné · vos clients voient un message par défaut"}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              className="ci-btn yelen-focus-ring"
              aria-pressed={apercu}
              onClick={() => setApercu(v => !v)}
              style={{ ["--yelen-focus" as string]: C.gold, height: "32px", padding: "0 12px", borderRadius: "8px", border: `1px solid ${C.border}`, backgroundColor: apercu ? C.bg3 : C.bgCard, color: C.t1, fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >{apercu ? "Masquer l'aperçu" : "Voir comme un client"}</button>
            {!editing && (
              <Button tokens={toUiTokens(C)} className="ci-btn" variant="secondary" size="sm" icon={ICONE_CRAYON} onClick={demarrerEdition}>Modifier</Button>
            )}
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          {apercu ? (
            <div>
              <p style={{ color: C.t2, fontSize: "12px", margin: "0 0 8px" }}>Aperçu : tel que le client le lit dans la fiche.</p>
              <div style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px 16px" }}>
                {texteApercu.trim() ? (
                  <p style={{ color: C.t1, fontSize: "14px", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "75ch" }}>{texteApercu}</p>
                ) : (
                  <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: 0 }}>Cet établissement n&apos;a pas encore renseigné cette section.</p>
                )}
                {texteApercu.trim() && (
                  <p style={{ color: C.t2, fontSize: "12px", margin: "10px 0 0" }}>
                    {dirty ? "Brouillon non enregistré : pas encore visible publiquement." : savedDate ? `Mis à jour le ${dateJourConakry(savedDate)}` : ""}
                  </p>
                )}
              </div>
            </div>
          ) : editing ? (
            <div>
              <label htmlFor={idTexte} style={{ display: "block", color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>Texte de « {title} »</label>
              <textarea
                id={idTexte}
                ref={refTextarea}
                className="yelen-focus-ring"
                value={draft}
                onChange={e => { setDraft(e.target.value); setSucces(false); }}
                rows={5}
                placeholder={placeholder}
                aria-describedby={idCompteur}
                disabled={saving}
                style={{ ...inputFieldStyle(C), ["--yelen-focus" as string]: C.gold, resize: "none", lineHeight: 1.6, minHeight: "120px", maxHeight: `${HAUTEUR_MAX_TEXTAREA}px`, overflowY: "auto", boxSizing: "border-box" }}
              />
              <p id={idCompteur} style={{ color: tropLong ? C.red : C.t2, fontSize: "12px", fontWeight: tropLong ? 600 : 400, margin: "6px 0 0", textAlign: "right" }}>
                {nombreCaracteres(draft.length)}{tropLong ? " · trop long, raccourcissez le texte" : ""}
              </p>
            </div>
          ) : renseigne ? (
            <p style={{ color: C.t1, fontSize: "14px", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "75ch" }}>{savedValue}</p>
          ) : (
            <p style={{ color: C.t2, fontSize: "14px", lineHeight: 1.6, margin: 0 }}>Non renseigné</p>
          )}
        </div>

        {erreur && (
          <div role="alert" style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", backgroundColor: C.redL, border: `1px solid ${C.red}`, borderRadius: "10px", padding: "10px 12px" }}>
            <span style={{ color: C.t1, fontSize: "13px", lineHeight: 1.5 }}>{erreur}</span>
            <Button tokens={toUiTokens(C)} className="ci-btn" variant="secondary" size="sm" loading={saving} onClick={enregistrer}>Réessayer</Button>
          </div>
        )}

        <div role="status" aria-live="polite" style={{ color: C.green, fontSize: "13px", fontWeight: 600, marginTop: succes ? "12px" : 0 }}>
          {succes ? "Enregistré. Le texte est visible publiquement." : ""}
        </div>

        {editing && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
            <Button tokens={toUiTokens(C)} className="ci-btn" variant="secondary" size="sm" disabled={saving} onClick={annuler}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="ci-btn" variant="primary" size="sm" disabled={!dirty || tropLong} loading={saving} onClick={enregistrer}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        )}
      </section>

      <ConfirmModal
        open={confirmerAnnulation}
        onClose={() => setConfirmerAnnulation(false)}
        onConfirm={() => { setConfirmerAnnulation(false); quitterEdition(); }}
        tokens={toUiTokens(C)}
        level={1}
        title="Abandonner les modifications ?"
        description="Le texte modifié ne sera pas enregistré."
        confirmLabel="Abandonner"
        cancelLabel="Continuer à modifier"
      />
    </Card>
  );
}

// Petite fenêtre de choix "Contacter le support" — composant dédié (aucune
// primitive partagée ne convient : ConfirmModal impose Confirmer/Annuler).
// Même comportement d'accessibilité que components/ui/ConfirmModal.tsx :
// role="dialog" + aria-modal + aria-labelledby, focus envoyé dans le panneau
// à l'ouverture et restitué au déclencheur à la fermeture, Tab piégé dans le
// panneau, Échap et clic extérieur ferment.
function FenetreSupport({ C, open, onClose, onChoisir, hrefSupport }: { C: ThemeTokens; open: boolean; onClose: () => void; onChoisir: () => void; hrefSupport: string }) {
  const idTitre = useId();
  const refPanneau = useRef<HTMLDivElement>(null);
  const refDeclencheur = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    refDeclencheur.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => refPanneau.current?.focus(), 30);
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !refPanneau.current) return;
      const focalisables = refPanneau.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])");
      if (focalisables.length === 0) { e.preventDefault(); return; }
      const premier = focalisables[0];
      const dernier = focalisables[focalisables.length - 1];
      const actif = document.activeElement;
      if (e.shiftKey && (actif === premier || actif === refPanneau.current)) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && actif === dernier) { e.preventDefault(); premier.focus(); }
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", surTouche);
      refDeclencheur.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const carte: React.CSSProperties = {
    ["--yelen-focus" as string]: C.gold,
    display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
    backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "14px 16px",
  };

  return (
    <div role="presentation" onClick={onClose} className="ci-fenetre-fond"
      style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <style>{`
        .ci-fenetre-fond{animation:ci-fondu .15s ease}
        .ci-fenetre{animation:ci-fondu .15s ease}
        @keyframes ci-fondu{from{opacity:0}to{opacity:1}}
        @media (prefers-reduced-motion:reduce){.ci-fenetre-fond,.ci-fenetre{animation:none}}
      `}</style>
      <div ref={refPanneau} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={idTitre} className="ci-fenetre"
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "420px", maxHeight: "86svh", overflowY: "auto", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "14px", boxShadow: C.shadow, padding: "20px", outline: "none" }}>
        <h2 id={idTitre} style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 14px" }}>Contacter le support</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <a href={hrefSupport} target="_blank" rel="noopener noreferrer" className="yelen-focus-ring" style={carte} onClick={onChoisir}>
            <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 600 }}>Écrire au support Yelen</span>
            <span style={{ display: "block", color: C.t2, fontSize: "12.5px", lineHeight: 1.5, marginTop: "2px" }}>Ouvre le support Yelen dans un nouvel onglet.</span>
          </a>
          <a href="/contact" target="_blank" rel="noopener noreferrer" className="yelen-focus-ring" style={carte} onClick={onChoisir}>
            <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 600 }}>Formulaire de contact</span>
            <span style={{ display: "block", color: C.t2, fontSize: "12.5px", lineHeight: 1.5, marginTop: "2px" }}>Écrivez à Yelen depuis le formulaire de contact, dans un nouvel onglet.</span>
          </a>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
          <Button tokens={toUiTokens(C)} className="ci-btn" variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}

// Pied d'écran "Avant de publier". Les deux premières phrases sont le texte
// validé par Bryan (mention de responsabilité en cours de validation
// juridique : ne pas la reformuler). La 3e vient de sa consigne du
// 24/10/2026 (Yelen n'écrit pas le contenu mais peut le modifier ou le
// refuser s'il enfreint ses politiques). Fond et bordure : motif ambre déjà
// utilisé par GuideStatutsDocuments (${C.gold}0F / ${C.gold}30).
export function PiedAvantPublier({ C, hrefSupport }: { C: ThemeTokens; hrefSupport: string }) {
  const [ouvert, setOuvert] = useState(false);
  // Stable : FenetreSupport l'a en dépendance d'effet (focus piégé).
  const fermer = useCallback(() => setOuvert(false), []);
  return (
    <>
      <style>{`@media (max-width:640px){.ci-support-btn{width:100%}}`}</style>
      <section aria-labelledby="ci-pied-titre"
        style={{ marginTop: "24px", backgroundColor: `${C.gold}0F`, border: `1px solid ${C.gold}30`, borderRadius: "14px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px 20px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2 id="ci-pied-titre" style={{ color: C.t1, fontSize: "15px", fontWeight: 600, margin: "0 0 4px" }}>Avant de publier</h2>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
            Ces textes sont visibles par vos clients dès l&apos;enregistrement. Vous restez responsable de leur contenu et de leur exactitude.
          </p>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: "6px 0 0" }}>
            Yelen n&apos;écrit pas ce contenu, mais peut le modifier ou le refuser s&apos;il enfreint ses politiques.
          </p>
        </div>
        <button type="button" aria-haspopup="dialog" className="ci-btn ci-support-btn yelen-focus-ring" onClick={() => setOuvert(true)}
          style={{ ["--yelen-focus" as string]: C.gold, height: "32px", padding: "0 12px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "12px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
          Contacter le support
        </button>
      </section>
      <FenetreSupport C={C} open={ouvert} onClose={fermer} onChoisir={fermer} hrefSupport={hrefSupport}/>
    </>
  );
}

export function PanneauSkeleton({ C }: { C: ThemeTokens }) {
  const barre = (largeur: string, hauteur: string): React.CSSProperties => ({ width: largeur, height: hauteur, borderRadius: "6px", backgroundColor: C.bg3 });
  return (
    <Card tokens={toCardTokens(C)} padding="20px">
      <div className="ci-skeleton" aria-hidden="true">
        <div style={barre("40%", "16px")}/>
        <div style={{ ...barre("65%", "12px"), marginTop: "10px" }}/>
        <div style={{ ...barre("100%", "12px"), marginTop: "20px" }}/>
        <div style={{ ...barre("85%", "12px"), marginTop: "8px" }}/>
      </div>
    </Card>
  );
}
