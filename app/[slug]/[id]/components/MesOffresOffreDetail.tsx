"use client";

// Pop plein écran "détail de l'offre" — déclenché au clic sur une ligne
// de la table (desktop) ou une carte (mobile) de la liste des offres déjà
// créées (retour Bryan 04/08/2026 : la liste n'avait plus aucun effet
// visible au clic depuis le retrait de l'aperçu latéral). Réutilise le
// même aperçu smartphone en direct que le formulaire de création
// (OffreFicheContenu), ici sur les vraies données enregistrées — "très
// explicite sur l'offre", stats réelles + toutes les actions.
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";
import { OffreFicheContenu } from "@/components/OffreFicheOverlay";
import { type Offre } from "./MesOffresTab";
import { APP_URL } from "@/lib/config";

function statutStyle(C: ThemeTokens, statut: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    brouillon:             { label: "Brouillon",       color: C.t2,     bg: C.bg3 },
    en_attente_validation: { label: "En modération",   color: C.orange, bg: C.orangeL },
    publiee:               { label: "Publiée",         color: C.green,  bg: C.greenL },
    refusee:               { label: "Refusée",         color: C.red,    bg: C.redL },
    suspendue:             { label: "Suspendue",       color: C.orange, bg: C.orangeL },
    archivee:              { label: "Archivée",        color: C.t3,     bg: C.bg3 },
  };
  return map[statut] ?? { label: statut, color: C.t2, bg: C.bg3 };
}

function ctrLabel(vues: number, clics: number): string {
  if (vues === 0) return "—";
  return `${((clics / vues) * 100).toFixed(1)}%`;
}

function actionBtnStyle(C: ThemeTokens, variant: "primaire" | "neutre" | "danger" | "attention" = "neutre", disabled = false): React.CSSProperties {
  const palette = {
    primaire: { bg: `linear-gradient(135deg,${C.gold},${C.goldD})`, border: "none", color: "#080812" },
    neutre:   { bg: C.bgCard2, border: `1px solid ${C.border}`, color: C.t1 },
    danger:   { bg: C.redL, border: `1px solid ${C.red}30`, color: C.red },
    attention:{ bg: C.orangeL, border: `1px solid ${C.orange}30`, color: C.orange },
  }[variant];
  return {
    background: palette.bg, border: palette.border, color: disabled ? C.t3 : palette.color,
    fontWeight: 700, fontSize: "13px", padding: "11px 16px", borderRadius: "10px",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flex: 1, minWidth: "120px",
  };
}

export function MesOffresOffreDetail({
  offre, vues, busy, onClose, onEdit, onShare, onPreview, onSuspendre, onRepublier, onArchiver, onSupprimer, onToast,
}: {
  offre: Offre; vues: number; busy: boolean;
  onClose: () => void; onEdit: () => void; onShare: () => void; onPreview: () => void;
  onSuspendre: () => void; onRepublier: () => void; onArchiver: () => void; onSupprimer: () => void;
  onToast: (msg: string, color?: string) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const isDark = theme === "dark";
  const publiee = offre.statut === "publiee";
  const si = statutStyle(C, offre.statut);

  async function copierLien() {
    try {
      await navigator.clipboard.writeText(`${APP_URL}/offres/${offre.id}`);
      onToast("Lien copié.", C.green);
    } catch {}
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 550, background: C.bg, display: "flex", flexDirection: "column" }}>
      <header style={{ flexShrink: 0, background: `${C.bgCard}F5`, backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}`, padding: "env(safe-area-inset-top) 16px 0" }}>
        <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <span/>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>Détail de l&apos;offre</div>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "9px", background: C.bgCard2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.t1, cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
            <span style={{ color: si.color, backgroundColor: si.bg, fontSize: "10.5px", fontWeight: 800, padding: "4px 11px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}>{si.label}</span>
            <span style={{ display: "inline-block", background: OFFRE_GENRE_COULEURS[offre.genre as OffreGenre]?.bg ?? C.bg3, color: OFFRE_GENRE_COULEURS[offre.genre as OffreGenre]?.texte ?? C.t2, fontSize: "10px", fontWeight: 800, padding: "4px 11px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {OFFRE_GENRE_LABELS[offre.genre as OffreGenre] || offre.genre}
            </span>
          </div>

          {offre.statut === "en_attente_validation" && (
            <div style={{ background: C.orangeL, border: `1px solid ${C.orange}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", color: C.orange, fontSize: "12.5px", lineHeight: 1.5 }}>
              En cours de validation{offre.soumis_le ? ` — envoyée le ${new Date(offre.soumis_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}. L&apos;équipe Yelen vérifie chaque offre avant publication.
            </div>
          )}
          {offre.statut === "refusee" && offre.motif_refus && (
            <div style={{ background: C.redL, border: `1px solid ${C.red}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", color: C.red, fontSize: "12.5px", lineHeight: 1.5 }}>
              <strong>Motif du refus :</strong> {offre.motif_refus}
            </div>
          )}

          {/* Stats réelles — mêmes chiffres que la table (offre_vues/clics) */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            {[
              { label: "Vues", value: vues },
              { label: "Clics", value: offre.nb_clics },
              { label: "CTR", value: ctrLabel(vues, offre.nb_clics) },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "12px", textAlign: "center" }}>
                <div style={{ color: C.t1, fontSize: "18px", fontWeight: 900 }}>{s.value}</div>
                <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "3px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Aperçu smartphone — même contenu que celui vu par le citoyen */}
          <div style={{ width: "270px", maxWidth: "100%", margin: "0 auto 24px", height: "500px", borderRadius: "38px", border: `8px solid ${isDark ? "#000" : "#1a1a1a"}`, overflow: "hidden", position: "relative", background: C.bg, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "90px", height: "18px", background: isDark ? "#000" : "#1a1a1a", borderRadius: "0 0 12px 12px", zIndex: 2 }}/>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", paddingTop: "18px" }}>
              <OffreFicheContenu offre={offre} isDark={isDark} card={C.bgCard} t1={C.t1} t2={C.t2} t3={C.t3} brd={C.border} populaire={false}/>
            </div>
          </div>
        </div>
      </main>

      <footer style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.bgCard, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", maxWidth: "560px", margin: "0 auto" }}>
          {(offre.statut === "brouillon" || offre.statut === "refusee") && (
            <button onClick={onEdit} disabled={busy} className="tap" style={actionBtnStyle(C, "primaire", busy)}>
              {offre.statut === "refusee" ? "Modifier et renvoyer" : "Modifier"}
            </button>
          )}
          {publiee && (
            <>
              <button onClick={onShare} disabled={busy} className="tap" style={actionBtnStyle(C, "neutre", busy)}>Partager</button>
              <button onClick={copierLien} className="tap" style={actionBtnStyle(C, "neutre")}>Copier le lien</button>
              <button onClick={onPreview} className="tap" style={actionBtnStyle(C, "neutre")}>Voir le portail public</button>
              <button onClick={onSuspendre} disabled={busy} className="tap" style={actionBtnStyle(C, "attention", busy)}>Suspendre</button>
            </>
          )}
          {offre.statut === "suspendue" && (
            <button onClick={onRepublier} disabled={busy} className="tap" style={actionBtnStyle(C, "primaire", busy)}>Republier (modération)</button>
          )}
          {offre.statut !== "archivee" && (
            <button onClick={onArchiver} disabled={busy} className="tap" style={actionBtnStyle(C, "neutre", busy)}>Archiver</button>
          )}
          {offre.statut === "brouillon" && (
            <button onClick={onSupprimer} disabled={busy} className="tap" style={actionBtnStyle(C, "danger", busy)}>Supprimer</button>
          )}
        </div>
      </footer>
    </div>
  );
}
