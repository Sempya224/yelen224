"use client";

// Table enterprise "Mes offres" (chantier "Centre de pilotage des offres",
// 02/08/2026) — remplace la liste de cartes simple. Une seule table
// (miniature, titre, catégorie, statut, vues, clics, CTR, expiration,
// modifié le, actions en icônes), scroll horizontal contenu sur petit écran
// plutôt qu'une deuxième liste en cartes en dessous (retrait 04/08/2026,
// retour Bryan : la variante cartes mobile s'affichait en double sous la
// table au lieu de la remplacer). CTR calculé à partir de offre_vues/
// offre_clics réels (app/api/institution/offres/vues), jamais 0% affiché
// si aucune vue (affiche "—").
import { useEffect, useRef } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";
import { type Offre, CATEGORIES } from "./MesOffresTab";

function offreGradient(seed: string): string {
  const OFFRE_PALETTE = [
    "linear-gradient(135deg,#F5A623,#C8740A)", "linear-gradient(135deg,#2563EB,#1E3A8A)",
    "linear-gradient(135deg,#DC2626,#7F1D1D)", "linear-gradient(135deg,#16A34A,#14532D)",
    "linear-gradient(135deg,#9333EA,#581C87)", "linear-gradient(135deg,#0D9488,#134E4A)",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return OFFRE_PALETTE[h % OFFRE_PALETTE.length];
}

function OffreCoverMini({ logo, image, titre, size = 40 }: { logo: string | null; image?: string | null; titre: string; size?: number }) {
  const visuel = image || logo;
  return (
    <div style={{ width: `${size}px`, height: `${size}px`, position: "relative", borderRadius: "12px", flexShrink: 0, overflow: "hidden", background: offreGradient(titre), display: "flex", alignItems: "center", justifyContent: "center" }}>
      {visuel ? (
        <Image src={visuel} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }}/>
      ) : (
        <span style={{ color: "#fff", fontWeight: 900, fontSize: `${Math.round(size * 0.34)}px` }}>{titre.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function squareBtn(C: ThemeTokens): React.CSSProperties {
  return { width: "32px", height: "32px", borderRadius: "9px", backgroundColor: C.bgCard2, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
}

function OffreActionsMenu({ offre, isOpen, onToggle, onClose, onEdit, onPreview, onShare, onSuspendre, onRepublier, onArchiver, onSupprimer, busy }: {
  offre: Offre; isOpen: boolean; onToggle: () => void; onClose: () => void;
  onEdit: () => void; onPreview: () => void; onShare: () => void;
  onSuspendre: () => void; onRepublier: () => void; onArchiver: () => void; onSupprimer: () => void;
  busy: boolean;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const publiee = offre.statut === "publiee";
  const ref = useRef<HTMLDivElement>(null);

  // Détection de clic/tap extérieur par écouteur document (retour Bryan
  // 04/08/2026 : le calque invisible plein écran précédent — même pattern
  // que les popovers du header avant leur correctif du 01/08/2026 — pouvait
  // rester bloqué si son propre onClick ne se déclenchait pas (fréquent sur
  // mobile si le doigt bouge légèrement pendant le tap, le navigateur
  // interprète alors le geste comme un défilement et pas un clic) : ce
  // calque couvrait tout l'écran en permanence et bloquait alors
  // définitivement toute interaction jusqu'au rechargement. mousedown (pas
  // click) pour fermer dès l'appui, avant qu'un éventuel geste de défilement
  // ne supprime l'événement click qui aurait suivi.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  return (
    <div ref={ref} style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button onClick={onToggle} className="tap" title="Plus d'actions" style={squareBtn(C)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={C.t2} stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
      {isOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", overflow: "hidden", minWidth: "190px", animation: "fadeUp 0.15s ease" }}>
            {(offre.statut === "brouillon" || offre.statut === "refusee") && (
              <button onClick={onEdit} disabled={busy} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                {offre.statut === "refusee" ? "Modifier et renvoyer" : "Modifier"}
              </button>
            )}
            <button onClick={onPreview} disabled={!publiee} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: publiee ? C.t1 : C.t3, fontSize: "12.5px", fontWeight: 700, cursor: publiee ? "pointer" : "default" }}>
              Prévisualiser
            </button>
            <button onClick={onShare} disabled={!publiee} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: publiee ? C.t1 : C.t3, fontSize: "12.5px", fontWeight: 700, cursor: publiee ? "pointer" : "default" }}>
              Partager
            </button>
            <div style={{ height: "1px", backgroundColor: C.border }}/>
            {offre.statut === "publiee" && (
              <button onClick={onSuspendre} disabled={busy} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.orange, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                Suspendre
              </button>
            )}
            {offre.statut === "suspendue" && (
              <button onClick={onRepublier} disabled={busy} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.green, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                Republier (modération)
              </button>
            )}
            {offre.statut !== "archivee" && (
              <button onClick={onArchiver} disabled={busy} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                Archiver
              </button>
            )}
            {offre.statut === "brouillon" && (
              <button onClick={onSupprimer} disabled={busy} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.red, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                Supprimer
              </button>
            )}
        </div>
      )}
    </div>
  );
}

const STATUT_INFO: Record<string, { label: string; colorKey: "t2" | "orange" | "green" | "red" | "t3" }> = {
  brouillon:             { label: "Brouillon",       colorKey: "t2" },
  en_attente_validation: { label: "En modération",   colorKey: "orange" },
  publiee:               { label: "Publiée",         colorKey: "green" },
  refusee:               { label: "Refusée",         colorKey: "red" },
  suspendue:             { label: "Suspendue",        colorKey: "orange" },
  archivee:              { label: "Archivée",         colorKey: "t3" },
};

function statutStyle(C: ThemeTokens, statut: string) {
  const info = STATUT_INFO[statut] ?? { label: statut, colorKey: "t2" as const };
  const colorMap: Record<string, { c: string; bg: string }> = {
    t2: { c: C.t2, bg: C.bg3 }, orange: { c: C.orange, bg: C.orangeL },
    green: { c: C.green, bg: C.greenL }, red: { c: C.red, bg: C.redL }, t3: { c: C.t3, bg: C.bg3 },
  };
  return { label: info.label, ...colorMap[info.colorKey] };
}

function ctrLabel(vues: number, clics: number): string {
  if (vues === 0) return "—";
  return `${((clics / vues) * 100).toFixed(1)}%`;
}

function formatDateCourte(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

type Handlers = {
  onSelect: (id: string) => void;
  onEdit: (o: Offre) => void;
  onPreview: (o: Offre) => void;
  onShare: (o: Offre) => void;
  onSuspendre: (id: string) => void;
  onRepublier: (id: string) => void;
  onArchiver: (id: string) => void;
  onSupprimer: (id: string) => void;
};

export function MesOffresTable({ items, selectedId, access, busyId, menuOpenId, setMenuOpenId, vuesParOffre, ...h }: Handlers & {
  items: Offre[]; selectedId: string | null; access: "full" | "read"; busyId: string | null;
  menuOpenId: string | null; setMenuOpenId: (id: string | null) => void;
  vuesParOffre: Record<string, { vues: number; clics: number }>;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  return (
    <>
      <style>{`
        .offres-row:hover{background-color:${C.bgCard2}}
      `}</style>

      <div style={{ backgroundColor: C.bgCard, borderRadius: "20px", border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: "auto", marginBottom: "16px" }}>
        <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Offre", "Catégorie", "Statut", "Vues", "Clics", "CTR", "Expiration", "Modifié le", "Actions"].map((h2, i) => (
                <th key={h2} style={{ textAlign: i === 0 ? "left" : "center", padding: "12px 16px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h2}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(o => {
              const si = statutStyle(C, o.statut);
              const vc = vuesParOffre[o.id] ?? { vues: 0, clics: o.nb_clics };
              const catLabel = CATEGORIES.find(c => c.key === o.categorie)?.label ?? o.categorie;
              return (
                <tr key={o.id} className="offres-row tap" onClick={() => h.onSelect(o.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", backgroundColor: selectedId === o.id ? `${C.gold}0D` : "transparent" }}>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
                      <OffreCoverMini logo={o.partenaire_logo} image={o.image_url} titre={o.titre}/>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "220px" }}>{o.titre}</div>
                        <div style={{ display: "inline-block", background: OFFRE_GENRE_COULEURS[o.genre as OffreGenre]?.bg ?? C.bg3, color: OFFRE_GENRE_COULEURS[o.genre as OffreGenre]?.texte ?? C.t2, fontSize: "8.5px", fontWeight: 800, padding: "2px 7px", borderRadius: "20px", marginTop: "3px" }}>
                          {OFFRE_GENRE_LABELS[o.genre as OffreGenre] || o.genre}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center", color: C.t2, fontSize: "12px" }}>{catLabel}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <span style={{ color: si.c, backgroundColor: si.bg, fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px" }}>{si.label}</span>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center", color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{vc.vues}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>{o.nb_clics}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", color: C.t2, fontSize: "12.5px" }}>{ctrLabel(vc.vues, o.nb_clics)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", color: C.t2, fontSize: "11.5px" }}>{formatDateCourte(o.date_expiration)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center", color: C.t2, fontSize: "11.5px" }}>{formatDateCourte(o.mis_a_jour_le)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    {access === "full" ? (
                      <OffreActionsMenu
                        offre={o} isOpen={menuOpenId === o.id}
                        onToggle={() => setMenuOpenId(menuOpenId === o.id ? null : o.id)}
                        onClose={() => setMenuOpenId(null)}
                        onEdit={() => h.onEdit(o)}
                        onPreview={() => h.onPreview(o)}
                        onShare={() => h.onShare(o)}
                        onSuspendre={() => h.onSuspendre(o.id)}
                        onRepublier={() => h.onRepublier(o.id)}
                        onArchiver={() => h.onArchiver(o.id)}
                        onSupprimer={() => h.onSupprimer(o.id)}
                        busy={busyId === o.id}
                      />
                    ) : <span style={{ color: C.t3 }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
