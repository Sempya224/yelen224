"use client";

// Espace de travail — désormais un onglet interne du dashboard (menu
// Compte), comme Équipe/Journal/Documents. 5 sections (spec CEO,
// refonte 18/07/2026) : Agenda, Tâches, Documents, Projets, Notes —
// réutilisées depuis ../espace-travail/components.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { AgendaSection } from "../espace-travail/components/AgendaSection";
import { AgendaSidebar } from "../espace-travail/components/AgendaSidebar";
import { TachesSection } from "../espace-travail/components/TachesSection";
import { DocumentsSection } from "../espace-travail/components/DocumentsSection";
import { ProjetsSection } from "../espace-travail/components/ProjetsSection";
import { NotesSection } from "../espace-travail/components/NotesSection";

type Section = "agenda" | "taches" | "documents" | "projets" | "notes";

const SECTIONS: { key: Section; label: string; icon: (col: string) => React.ReactNode }[] = [
  { key: "agenda", label: "Agenda",
    icon: col => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { key: "taches", label: "Tâches",
    icon: col => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="8 12 11 15 16 9"/></svg> },
  { key: "documents", label: "Documents",
    icon: col => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> },
  { key: "projets", label: "Projets",
    icon: col => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> },
  { key: "notes", label: "Notes",
    icon: col => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/></svg> },
];

export function EspaceTravailTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [section, setSection] = useState<Section>("agenda");

  return (
    <div style={{ padding: "16px", paddingBottom: "40px", animation: "fadeUp 0.2s ease" }}>
      <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "4px" }}>Espace de travail</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Organisez l&apos;activité de l&apos;institution au-delà des seuls rendez-vous.</p>

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto" }}>
        {SECTIONS.map(s => {
          const active = section === s.key;
          return (
            <button key={s.key} onClick={() => setSection(s.key)} className="tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "7px", backgroundColor: active ? C.goldL : C.bgCard, border: `1px solid ${active ? C.goldL : C.border}`, borderRadius: "10px", padding: "8px 14px", color: active ? C.goldD : C.t2, fontSize: "13px", fontWeight: active ? "800" : "600", cursor: "pointer", whiteSpace: "nowrap" }}>
              {s.icon(active ? C.goldD : C.t2)}{s.label}
            </button>
          );
        })}
      </div>

      {section === "agenda" ? (
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 75%", minWidth: 0 }}><AgendaSection instId={instId} onToast={onToast}/></div>
          <AgendaSidebar instId={instId}/>
        </div>
      ) : null}
      {section === "taches" && <TachesSection instId={instId} onToast={onToast}/>}
      {section === "documents" && <DocumentsSection instId={instId} onToast={onToast}/>}
      {section === "projets" && <ProjetsSection instId={instId} onToast={onToast}/>}
      {section === "notes" && <NotesSection instId={instId} onToast={onToast}/>}

      {/* Les 3 sections ci-dessus référencent l'animation "espace-spin"
          pour leur cercle de chargement — définie ici (et non dans
          chaque section) car c'est ce composant qui est toujours monté
          quand l'une d'elles s'affiche. Perdue par erreur lors de la
          suppression de l'ancien écran autonome (page.tsx), qui la
          définissait ; le cercle restait figé (bordure visible, aucune
          rotation) faute de keyframes déclarés. */}
      <style>{`@keyframes espace-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
