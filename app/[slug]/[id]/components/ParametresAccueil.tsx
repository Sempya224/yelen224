"use client";

// Accueil de l'écran « Paramètres » (extrait de layout.tsx, refonte visuelle
// 23/10/2026) : en-tête, recherche, carte établissement, apparence, lignes de
// navigation vers les sous-écrans, puis le bloc Session / Zone dangereuse
// fourni par l'appelant (`children`). Affichage seul : aucune donnée ajoutée,
// aucun état résumé (rien de fiable n'est chargé pour PIN, passkeys, push ou
// forfait), cibles et handlers identiques à l'ancien écran.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ThemeMode } from "@/components/ThemeProvider";
import type { ThemeTokens } from "../theme";
import { CarteEtablissement, type EtablissementCarte } from "./CarteEtablissement";

export type CibleParametres =
  | "profil-entreprise" | "parametres-securite" | "parametres-notifications" | "yelen-forfait" | "parametres-legal";

type LigneParametre = {
  cle: string;
  label: string;
  description: string;
  cible: CibleParametres;
  motsCles: string;
  icone: (couleur: string) => ReactNode;
};
type SectionParametres = { cle: string; titre: string; lignes: LigneParametre[] };

const trait = (couleur: string, enfants: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{enfants}</svg>
);

const SECTIONS: SectionParametres[] = [
  {
    cle: "compte", titre: "Compte",
    lignes: [
      {
        cle: "securite", label: "Sécurité du compte", description: "PIN, clés d'accès, double authentification, appareils",
        cible: "parametres-securite", motsCles: "mot de passe 2fa passkey cle d'acces pin totp appareils connexion authentification",
        icone: c => trait(c, <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z"/>),
      },
      {
        cle: "notifications", label: "Notifications", description: "Alertes de l'application et notifications du navigateur",
        cible: "parametres-notifications", motsCles: "push alertes email sms rappels navigateur",
        icone: c => trait(c, <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>),
      },
    ],
  },
  {
    cle: "abonnement", titre: "Abonnement",
    lignes: [
      {
        cle: "forfait", label: "Abonnement et forfait", description: "Votre forfait Yelen et ses options",
        cible: "yelen-forfait", motsCles: "facture factures paiement plan tarif forfait",
        icone: c => trait(c, <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>),
      },
    ],
  },
  {
    cle: "legal", titre: "Légal & confidentialité",
    lignes: [
      {
        cle: "legal", label: "Légal & confidentialité", description: "Conditions d'utilisation et confidentialité",
        cible: "parametres-legal", motsCles: "cgu conditions rgpd donnees personnelles mentions legales",
        icone: c => trait(c, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></>),
      },
    ],
  },
];

const OPTIONS_THEME: { cle: ThemeMode; label: string; icone: (c: string) => ReactNode }[] = [
  { cle: "system", label: "Système", icone: c => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
  { cle: "light", label: "Clair", icone: c => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> },
  { cle: "dark", label: "Sombre", icone: c => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
];

// Mots recherchables des blocs non rendus ici (Session / Zone dangereuse,
// fournis par ParametresTab.tsx) et de l'Apparence.
const MOTS_APPARENCE = "apparence theme clair sombre systeme mode couleur interface";
const MOTS_SESSION = "session deconnexion se deconnecter quitter";
const MOTS_SUPPRESSION = "zone dangereuse supprimer mon compte suppression compte cloturer";

function normaliser(texte: string): string {
  return texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function ParametresAccueil({ C, active, inst, mode, setMode, onOuvrir, children }: {
  C: ThemeTokens;
  /** Écran Paramètres actuellement affiché (KeepMounted garde le composant monté en arrière-plan). */
  active: boolean;
  inst: EtablissementCarte | null;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  onOuvrir: (cible: CibleParametres) => void;
  /** Blocs « Session » et « Zone dangereuse ». */
  children: ReactNode;
}) {
  const [q, setQ] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  // Raccourci « / » : uniquement quand l'écran est affiché et que le focus n'est pas déjà dans un champ.
  useEffect(() => {
    if (!active) return;
    function surTouche(e: globalThis.KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.tagName === "SELECT" || cible.isContentEditable)) return;
      e.preventDefault();
      champ.current?.focus();
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [active]);

  const terme = normaliser(q.trim());
  const recherche = terme.length > 0;
  const correspond = (texte: string) => normaliser(texte).includes(terme);

  const sectionsVisibles = SECTIONS
    .map(s => ({ ...s, lignes: recherche ? s.lignes.filter(l => correspond(`${l.label} ${l.description} ${l.motsCles}`)) : s.lignes }))
    .filter(s => s.lignes.length > 0);
  const apparenceVisible = !recherche || correspond(`Apparence Thème de l'interface ${MOTS_APPARENCE}`);
  const sessionVisible = !recherche || correspond(`Session Se déconnecter ${MOTS_SESSION}`);
  const suppressionVisible = !recherche || correspond(`Zone dangereuse Supprimer mon compte ${MOTS_SUPPRESSION}`);
  const blocFinVisible = sessionVisible || suppressionVisible;
  const nbResultats = sectionsVisibles.reduce((n, s) => n + s.lignes.length, 0)
    + (apparenceVisible ? 1 : 0) + (sessionVisible ? 1 : 0) + (suppressionVisible ? 1 : 0);
  const aucunResultat = recherche && nbResultats === 0;

  function surToucheTheme(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1;
    else return;
    e.preventDefault();
    const suivant = (index + delta + OPTIONS_THEME.length) % OPTIONS_THEME.length;
    setMode(OPTIONS_THEME[suivant].cle);
    radios.current[suivant]?.focus();
  }

  const carteStyle: React.CSSProperties = { backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" };
  const titreSection: React.CSSProperties = { color: C.t2, fontSize: "12px", fontWeight: 500, margin: "0 0 8px", padding: "0 4px" };

  return (
    <div className="yelen-page" style={{ padding: "20px 16px 40px" }}>
      <style>{`
        .prm-row{transition:background-color .14s}
        .prm-row:hover{background-color:${C.bg3}}
        .prm-radio{transition:background-color .14s,border-color .14s}
        .prm-kbd{display:inline-flex}
        @media (max-width:1023px){.prm-kbd{display:none}}
        @media (prefers-reduced-motion: reduce){.prm-row,.prm-radio{transition:none}}
      `}</style>
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div style={{ marginBottom: "12px" }}>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Paramètres</h1>
          <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Gérez votre établissement, votre sécurité et vos préférences</p>
        </div>

        <div role="search" style={{ position: "sticky", top: "calc(var(--header-h, 56px) + env(safe-area-inset-top))", zIndex: 50, backgroundColor: C.bg, padding: "8px 0 12px" }}>
          <div style={{ position: "relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              ref={champ}
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }}
              placeholder="Rechercher un paramètre"
              aria-label="Rechercher un paramètre"
              autoComplete="off"
              spellCheck={false}
              className="yelen-focus-ring"
              style={{ width: "100%", boxSizing: "border-box", height: "44px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "0 44px 0 38px", color: C.t1, fontSize: "14px", fontFamily: "inherit" }}
            />
            {q ? (
              <button type="button" onClick={() => { setQ(""); champ.current?.focus(); }} aria-label="Effacer la recherche" className="tap yelen-focus-ring" style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "8px", color: C.t2, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            ) : (
              <span className="prm-kbd" aria-hidden="true" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", alignItems: "center", justifyContent: "center", minWidth: "20px", height: "20px", padding: "0 5px", boxSizing: "border-box", border: `1px solid ${C.border2}`, borderRadius: "5px", color: C.t2, fontSize: "11px" }}>/</span>
            )}
          </div>
          <div aria-live="polite" role="status" style={{ color: C.t2, fontSize: "12px", padding: recherche ? "6px 4px 0" : 0, height: recherche ? undefined : 0, overflow: "hidden" }}>
            {recherche ? (aucunResultat ? "Aucun résultat" : `${nbResultats} résultat${nbResultats > 1 ? "s" : ""}`) : ""}
          </div>
        </div>

        {aucunResultat && (
          <div style={{ ...carteStyle, padding: "32px 16px", textAlign: "center" }}>
            <p style={{ color: C.t1, fontSize: "14px", fontWeight: 500, margin: "0 0 12px" }}>Aucun paramètre ne correspond</p>
            <button type="button" onClick={() => { setQ(""); champ.current?.focus(); }} className="tap yelen-focus-ring" style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "8px 14px", color: C.t1, fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Effacer la recherche</button>
          </div>
        )}

        <div style={{ marginBottom: "24px" }}>
          <CarteEtablissement C={C} inst={inst} onModifier={() => onOuvrir("profil-entreprise")}/>
        </div>

        {apparenceVisible && (
          <section aria-labelledby="prm-apparence" style={{ marginBottom: "24px" }}>
            <h2 id="prm-apparence" style={titreSection}>Apparence</h2>
            <div style={{ ...carteStyle, padding: "16px" }}>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>Thème de l&apos;interface</div>
              <div style={{ color: C.t2, fontSize: "13px", margin: "2px 0 12px" }}>« Système » suit les réglages de votre appareil</div>
              <div role="radiogroup" aria-label="Thème de l'interface" style={{ display: "flex", gap: "8px" }}>
                {OPTIONS_THEME.map((opt, i) => {
                  const choisi = mode === opt.cle;
                  return (
                    <button
                      key={opt.cle}
                      ref={el => { radios.current[i] = el; }}
                      type="button"
                      role="radio"
                      aria-checked={choisi}
                      tabIndex={choisi ? 0 : -1}
                      onClick={() => setMode(opt.cle)}
                      onKeyDown={e => surToucheTheme(e, i)}
                      className="prm-radio yelen-focus-ring"
                      style={{ flex: 1, minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "0 8px", borderRadius: "10px", backgroundColor: choisi ? `${C.gold}14` : "transparent", border: `1px solid ${choisi ? `${C.gold}60` : C.border2}`, color: choisi ? C.t1 : C.t2, fontSize: "13px", fontWeight: choisi ? 600 : 500, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      {choisi
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                        : opt.icone(C.t2)}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {sectionsVisibles.map(section => (
          <section key={section.cle} aria-labelledby={`prm-${section.cle}`} style={{ marginBottom: "24px" }}>
            <h2 id={`prm-${section.cle}`} style={titreSection}>{section.titre}</h2>
            <div style={carteStyle}>
              {section.lignes.map((ligne, i) => (
                <button
                  key={ligne.cle}
                  type="button"
                  onClick={() => onOuvrir(ligne.cible)}
                  aria-label={`${ligne.label} — ${ligne.description}`}
                  className="prm-row yelen-focus-ring"
                  style={{ width: "100%", minHeight: "64px", display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", background: "none", border: "none", borderBottom: i < section.lignes.length - 1 ? `1px solid ${C.border}` : "none", textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}
                >
                  <span aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${C.gold}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ligne.icone(C.gold)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: C.t1, fontSize: "14px", fontWeight: 500 }}>{ligne.label}</span>
                    <span style={{ display: "block", color: C.t2, fontSize: "13px", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ligne.description}</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </section>
        ))}

        {blocFinVisible && children}

        {!recherche && (
          <div style={{ textAlign: "center", color: C.t2, fontSize: "12px", marginTop: "8px" }}>Yelen224 Pro · Guinée · v5.1 · 2026</div>
        )}
      </div>
    </div>
  );
}
