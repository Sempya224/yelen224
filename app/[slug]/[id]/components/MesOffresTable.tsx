"use client";

// Table enterprise "Mes offres" (chantier "Centre de pilotage des offres",
// 02/08/2026, refonte UI 20/10/2026). Une seule table (>=768px) et des
// cartes empilées en dessous de 768px, jamais les deux en même temps. CTR
// calculé à partir de offre_vues/offre_clics réels (app/api/institution/
// offres/vues), jamais 0% affiché si aucune vue (affiche "—").
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { type Offre, CATEGORIES } from "./MesOffresTab";
import {
  OfferStatusBadge, OfferTypeBadge, OfferThumb, OffresStyles,
  formatCtr, dateCourte, dateHeure, dateRelative,
} from "./MesOffresUi";

type MenuHandlers = {
  onEdit: () => void; onPreview: () => void; onShare: () => void; onDuplicate?: () => void;
  onSuspendre: () => void; onRepublier: () => void; onArchiver: () => void; onSupprimer: () => void;
};

function OffreActionsMenu({ C, offre, isOpen, onToggle, onClose, busy, ...a }: MenuHandlers & {
  C: ThemeTokens; offre: Offre; isOpen: boolean; onToggle: () => void; onClose: () => void; busy: boolean;
}) {
  const publiee = offre.statut === "publiee";
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Menu en position fixed : le conteneur du tableau scrolle (overflow), un
  // menu absolu serait rogné sur les dernières lignes. Fermeture au clic
  // extérieur (mousedown, pas click — voir l'historique mobile du
  // 04/08/2026 sur les calques plein écran), au scroll, au resize et à Échap.
  useEffect(() => {
    if (!isOpen) return;
    const down = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [isOpen, onClose]);

  const item = (color: string, disabled = false): React.CSSProperties => ({
    width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", color: disabled ? C.t3 : color,
    fontSize: "13px", fontWeight: 500, cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button ref={btnRef} type="button" onClick={() => {
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
          onToggle();
        }} className="ofx-btn tap" aria-haspopup="menu" aria-expanded={isOpen} aria-label={`Actions pour l'offre ${offre.titre}`} title="Plus d'actions"
        style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: isOpen ? C.bg3 : "transparent", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={C.t2} stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
      {isOpen && pos && (
        <div role="menu" style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 1200, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", overflow: "hidden", minWidth: "200px", padding: "4px 0" }}>
          {(offre.statut === "brouillon" || offre.statut === "refusee") && (
            <button role="menuitem" type="button" onClick={a.onEdit} disabled={busy} className="ofx-item tap" style={item(C.t1)}>
              {offre.statut === "refusee" ? "Modifier et renvoyer" : "Modifier"}
            </button>
          )}
          <button role="menuitem" type="button" onClick={a.onPreview} disabled={!publiee} className="ofx-item tap" style={item(C.t1, !publiee)}>Prévisualiser</button>
          <button role="menuitem" type="button" onClick={a.onShare} disabled={!publiee} className="ofx-item tap" style={item(C.t1, !publiee)}>Partager</button>
          {a.onDuplicate && (
            <button role="menuitem" type="button" onClick={a.onDuplicate} disabled={busy} className="ofx-item tap" style={item(C.t1)}>Dupliquer</button>
          )}
          <button role="menuitem" type="button" disabled className="ofx-item" style={item(C.t1, true)} title="Bientôt disponible">
            Programmer
            <span style={{ fontSize: "11px", fontWeight: 600, color: C.t2, backgroundColor: C.bg3, borderRadius: "5px", padding: "1px 6px" }}>Bientôt</span>
          </button>
          <div role="separator" style={{ height: "1px", backgroundColor: C.border, margin: "4px 0" }}/>
          {offre.statut === "publiee" && (
            <button role="menuitem" type="button" onClick={a.onSuspendre} disabled={busy} className="ofx-item tap" style={item(C.orange)}>Suspendre</button>
          )}
          {offre.statut === "suspendue" && (
            <button role="menuitem" type="button" onClick={a.onRepublier} disabled={busy} className="ofx-item tap" style={item(C.green)}>Republier (modération)</button>
          )}
          {offre.statut !== "archivee" && (
            <button role="menuitem" type="button" onClick={a.onArchiver} disabled={busy} className="ofx-item tap" style={item(C.t2)}>Archiver</button>
          )}
          {offre.statut === "brouillon" && (
            <button role="menuitem" type="button" onClick={a.onSupprimer} disabled={busy} className="ofx-item tap" style={item(C.red)}>Supprimer</button>
          )}
        </div>
      )}
    </div>
  );
}

type Handlers = {
  onSelect: (id: string) => void;
  onEdit: (o: Offre) => void;
  onPreview: (o: Offre) => void;
  onShare: (o: Offre) => void;
  onDuplicate?: (o: Offre) => void;
  onSuspendre: (id: string) => void;
  onRepublier: (id: string) => void;
  onArchiver: (id: string) => void;
  onSupprimer: (id: string) => void;
};

const COLS: { h: string; right?: boolean; w?: string }[] = [
  { h: "Offre" }, { h: "Catégorie", w: "140px" }, { h: "Statut", w: "120px" },
  { h: "Vues", right: true, w: "80px" }, { h: "Clics", right: true, w: "80px" }, { h: "CTR", right: true, w: "80px" },
  { h: "Expiration", w: "140px" }, { h: "Modifié le", w: "130px" }, { h: "Actions", right: true, w: "76px" },
];

export function MesOffresTable({ items, access, busyId, menuOpenId, setMenuOpenId, vuesParOffre, ...h }: Handlers & {
  items: Offre[]; selectedId?: string | null; access: "full" | "read"; busyId: string | null;
  menuOpenId: string | null; setMenuOpenId: (id: string | null) => void;
  vuesParOffre: Record<string, { vues: number; clics: number }>;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [maintenant] = useState(() => Date.now());

  function menu(o: Offre) {
    if (access !== "full") return <span style={{ color: C.t3 }}>—</span>;
    return (
      <OffreActionsMenu
        C={C} offre={o} isOpen={menuOpenId === o.id}
        onToggle={() => setMenuOpenId(menuOpenId === o.id ? null : o.id)}
        onClose={() => setMenuOpenId(null)}
        onEdit={() => h.onEdit(o)} onPreview={() => h.onPreview(o)} onShare={() => h.onShare(o)}
        onDuplicate={h.onDuplicate ? () => { setMenuOpenId(null); h.onDuplicate?.(o); } : undefined}
        onSuspendre={() => h.onSuspendre(o.id)} onRepublier={() => h.onRepublier(o.id)}
        onArchiver={() => h.onArchiver(o.id)} onSupprimer={() => h.onSupprimer(o.id)}
        busy={busyId === o.id}
      />
    );
  }
  const ouvrir = (id: string) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); h.onSelect(id); } };
  const expiration = (o: Offre) => o.date_expiration
    ? <span title={dateRelative(o.date_expiration, maintenant)}>{dateCourte(o.date_expiration)}</span>
    : <span style={{ color: C.t3, fontSize: "12px" }}>Sans expiration</span>;

  return (
    <>
      <OffresStyles C={C}/>

      <div className="ofx-table" style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}`, overflow: "auto", maxHeight: "68svh", marginBottom: "16px" }}>
        <table style={{ width: "100%", minWidth: "1130px", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>{COLS.map(c => <col key={c.h} style={{ width: c.w }}/>)}</colgroup>
          <thead>
            <tr>
              {COLS.map(c => (
                <th key={c.h} scope="col" style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}`, textAlign: c.right ? "right" : "left", padding: "10px 14px", color: C.t2, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap" }}>{c.h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(o => {
              const vc = vuesParOffre[o.id] ?? { vues: 0, clics: o.nb_clics };
              const catLabel = CATEGORIES.find(c => c.key === o.categorie)?.label ?? o.categorie;
              const td = { padding: "0 14px", height: "64px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" } as const;
              const num = { ...td, textAlign: "right", fontSize: "14px", color: C.t1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;
              return (
                <tr key={o.id} className="ofx-row tap" tabIndex={0} onClick={() => h.onSelect(o.id)} onKeyDown={ouvrir(o.id)} style={{ cursor: "pointer" }}>
                  <td style={{ ...td, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <OfferThumb C={C} image={o.image_url} titre={o.titre}/>
                      <div style={{ minWidth: 0 }}>
                        <div title={o.titre} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.titre}</div>
                        <div style={{ marginTop: "3px" }}><OfferTypeBadge C={C} genre={o.genre}/></div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, color: C.t2, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={catLabel}>{catLabel}</td>
                  <td style={td}><OfferStatusBadge C={C} statut={o.statut}/></td>
                  <td style={num}>{vc.vues}</td>
                  <td style={num}>{o.nb_clics}</td>
                  <td style={{ ...num, color: vc.vues === 0 ? C.t3 : C.t1 }}>{formatCtr(vc.vues, o.nb_clics)}</td>
                  <td style={{ ...td, color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>{expiration(o)}</td>
                  <td style={{ ...td, color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}><span title={dateHeure(o.mis_a_jour_le)}>{dateCourte(o.mis_a_jour_le)}</span></td>
                  <td style={{ ...td, textAlign: "right" }}>{menu(o)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ofx-cards" style={{ flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
        {items.map(o => {
          const vc = vuesParOffre[o.id] ?? { vues: 0, clics: o.nb_clics };
          return (
            <div key={o.id} role="button" tabIndex={0} className="ofx-row tap" onClick={() => h.onSelect(o.id)} onKeyDown={ouvrir(o.id)}
              style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <OfferThumb C={C} image={o.image_url} titre={o.titre}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflowWrap: "anywhere" }}>{o.titre}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                    <OfferTypeBadge C={C} genre={o.genre}/>
                    <OfferStatusBadge C={C} statut={o.statut}/>
                  </div>
                </div>
                {menu(o)}
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "10px", color: C.t2, fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
                <span>{vc.vues} vues</span><span>{o.nb_clics} clics</span><span>CTR {formatCtr(vc.vues, o.nb_clics)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
