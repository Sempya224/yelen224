"use client";

// Petits helpers partagés entre page.tsx et les composants d'onglet
// (components/*Tab.tsx). Extraits ici car un fichier `page.tsx` de l'App
// Router Next.js ne peut exporter que les noms réservés (default, metadata,
// generateStaticParams, ...) — tout export supplémentaire fait échouer la
// vérification de type des routes générées (`.next/types/**/page.ts`),
// confirmé en pratique lors du chantier Centre d'Analyse (04/08/2026).
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "./theme";

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}j`;
  if (d < 30) return `${Math.floor(d / 7)}sem`;
  return `${Math.floor(d / 30)}mois`;
}

// date_rdv vient de Postgres au format "YYYY-MM-DD" — parsé manuellement
// dans le fuseau local sans réinterprétation UTC.
export function parseLocalDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(dateStr);
}

export function SectionHeader({ label, accent, action, onAction, badge }: { label: string; accent: string; action?: string; onAction?: () => void; badge?: number }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "3px", height: "18px", background: accent, borderRadius: "2px", flexShrink: 0 }}/>
        <span className="yelen-h2" style={{ color: C.t1 }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ backgroundColor: accent, color: accent === C.gold ? "#000" : "#fff", fontSize: "9px", fontWeight: "900", padding: "2px 7px", borderRadius: "20px" }}>{badge}</span>
        )}
      </div>
      {action && <button onClick={onAction} style={{ background: "none", border: "none", color: accent, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{action}</button>}
    </div>
  );
}
