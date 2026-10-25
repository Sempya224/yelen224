"use client";

// Espace de travail — désormais un onglet interne du dashboard (menu
// Compte), comme Équipe/Journal/Documents. 5 sections (spec CEO,
// refonte 18/07/2026) : Agenda, Tâches, Documents, Projets, Notes —
// réutilisées depuis ../espace-travail/components.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { ClockStyles, ClockTabs } from "./ClockInShiftUi";
import { AgendaSection } from "../espace-travail/components/AgendaSection";
import { AgendaSidebar } from "../espace-travail/components/AgendaSidebar";
import { TachesSection } from "../espace-travail/components/TachesSection";
import { DocumentsSection } from "../espace-travail/components/DocumentsSection";
import { ProjetsSection } from "../espace-travail/components/ProjetsSection";
import { NotesSection } from "../espace-travail/components/NotesSection";

type Section = "agenda" | "taches" | "documents" | "projets" | "notes";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "agenda", label: "Agenda" }, { key: "taches", label: "Tâches" }, { key: "documents", label: "Documents" },
  { key: "projets", label: "Projets" }, { key: "notes", label: "Notes" },
];

export function EspaceTravailTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [section, setSection] = useState<Section>("agenda");

  // Section synchronisée avec l'URL (?section=…) : ?tab= est déjà pris par
  // l'onglet principal du dashboard. Lecture une fois au montage, puis
  // history.replaceState à chaque changement (sans Suspense ni navigation).
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const p = new URLSearchParams(window.location.search).get("section");
        const s = SECTIONS.find(x => x.key === p);
        if (s) setSection(s.key);
      } catch {}
    });
  }, []);
  function changerSection(k: string) {
    const s = SECTIONS.find(x => x.key === k);
    if (!s) return;
    setSection(s.key);
    try {
      const u = new URL(window.location.href);
      if (s.key === "agenda") u.searchParams.delete("section"); else u.searchParams.set("section", s.key);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {}
  }

  return (
    <div style={{ maxWidth: "1440px", margin: "0 auto", padding: "24px 24px 40px", animation: "fadeUp 0.2s ease" }}>
      <ClockStyles C={C}/>
      <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Espace de travail</h1>
      <p style={{ color: C.t2, fontSize: "13.5px", margin: "0 0 20px" }}>Organisez l&apos;activité de l&apos;institution au-delà des seuls rendez-vous.</p>

      <ClockTabs C={C} active={section} onChange={changerSection} idPrefix="espace-tab" ariaLabel="Sections de l'espace de travail"
        tabs={SECTIONS.map(s => ({ key: s.key, label: s.label }))}/>

      {section === "agenda" ? (
        <div className="agx-layout" role="tabpanel" id="espace-tab-panel-agenda" aria-labelledby="espace-tab-agenda">
          <style>{`.agx-layout{display:flex;flex-direction:column;gap:20px}@media(min-width:1280px){.agx-layout{flex-direction:row;align-items:flex-start}}`}</style>
          <div style={{ flex: "1 1 0", minWidth: 0 }}><AgendaSection instId={instId} onToast={onToast}/></div>
          <AgendaSidebar instId={instId} onVoirTaches={() => changerSection("taches")}/>
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
