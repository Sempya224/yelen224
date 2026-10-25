"use client";

// En-tête de l'écran Communication (refonte UI 20/10/2026) : titre,
// description sur une ligne, et UN SEUL bouton primaire « + Créer une
// annonce » en bouton scindé dont le menu garde les entrées existantes.
import type { ThemeTokens } from "../../theme";

export function CommunicationHeader({ C, canPublish, menuOpen, onToggleMenu, onCloseMenu, onNouvelle, onFermeture, onPromotion, onDupliquer, onBrouillon }: {
  C: ThemeTokens; canPublish: boolean; menuOpen: boolean; onToggleMenu: () => void; onCloseMenu: () => void;
  onNouvelle: () => void; onFermeture: () => void; onPromotion: () => void; onDupliquer: () => void; onBrouillon: () => void;
}) {
  const item: React.CSSProperties = { width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: 500, cursor: "pointer" };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "20px" }}>
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px", margin: "0 0 4px" }}>Communication</h1>
        <p style={{ color: C.t3, fontSize: "13.5px", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Tenez vos clients informés des actualités et informations importantes de votre établissement.
        </p>
      </div>
      {canPublish && (
        <div style={{ position: "relative", display: "flex", flexShrink: 0 }} onKeyDown={e => { if (e.key === "Escape") onCloseMenu(); }}>
          <button onClick={onNouvelle} className="tap" style={{ height: "36px", backgroundColor: C.gold, color: "#000", border: "none", borderRadius: "8px 0 0 8px", padding: "0 16px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
            + Créer une annonce
          </button>
          <button onClick={onToggleMenu} aria-label="Autres façons de créer une annonce" aria-haspopup="menu" aria-expanded={menuOpen} className="tap" style={{ height: "36px", backgroundColor: C.gold, color: "#000", border: "none", borderLeft: "1px solid rgba(0,0,0,0.2)", borderRadius: "0 8px 8px 0", padding: "0 10px", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {menuOpen && (
            <>
              <div onClick={onCloseMenu} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
              <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 12px 32px rgba(0,0,0,0.2)", minWidth: "240px", overflow: "hidden" }}>
                <button role="menuitem" onClick={onNouvelle} className="tap" style={item}>Nouvelle annonce</button>
                <div style={{ height: "1px", backgroundColor: C.border }}/>
                <button role="menuitem" onClick={onFermeture} className="tap" style={item}>Fermeture / horaire exceptionnel</button>
                <button role="menuitem" onClick={onPromotion} className="tap" style={item}>Nouvelle promotion</button>
                <div style={{ height: "1px", backgroundColor: C.border }}/>
                <button role="menuitem" onClick={onDupliquer} className="tap" style={item}>Dupliquer une annonce</button>
                <button role="menuitem" onClick={onBrouillon} className="tap" style={item}>Reprendre un brouillon</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
