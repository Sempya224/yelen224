"use client";

// Barre d'enregistrement sticky façon Stripe/Cloudflare (refonte
// ProfilEntrepriseTab, 19/10/2026) + indicateur de statut permanent. Aucune
// logique de sauvegarde ici : relaie `onSave`/`onCancel` et reflète le statut
// calculé par `useDirtyForm` (clean / dirty / saving / saved / error).
// Raccourci Ctrl/Cmd + S actif tant qu'il y a quelque chose à enregistrer.
// `onCancel` réapplique le snapshot enregistré côté appelant (aucun appel
// réseau). Les animations respectent prefers-reduced-motion.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import type { DirtyStatus } from "./useDirtyForm";

function IconCheck({ color }: { color: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>;
}

function tempsEcoule(depuis: Date, maintenant: number): string {
  const minutes = Math.floor((maintenant - depuis.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.floor(minutes / 60)} h`;
}

const MOTION_CSS = `
  @keyframes ylBarOut { to { opacity: 0; transform: translateY(24px); } }
  @media (prefers-reduced-motion: reduce) {
    .yl-savebar, .yl-field { animation: none !important; transition: none !important; }
  }
`;

export function SaveBar({ status, count, onSave, onCancel }: {
  status: DirtyStatus;
  count: number;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const actionable = status === "dirty" || status === "error";

  // Avertit avant de quitter l'onglet/fenêtre (fermeture, rechargement) tant
  // que des modifications ne sont pas enregistrées. Ne couvre pas un
  // changement d'onglet interne au dashboard (état local du parent, pas de
  // routeur interceptable depuis ce composant).
  useEffect(() => {
    if (!actionable && status !== "saving") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [actionable, status]);

  useEffect(() => {
    if (!actionable) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); onSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actionable, onSave]);

  if (status === "clean") return null;

  const saved = status === "saved";
  const error = status === "error";
  const accent = saved ? C.green : error ? C.red : C.gold;
  const message = saved ? "Modifications enregistrées"
    : error ? "Échec de l'enregistrement"
    : status === "saving" ? "Enregistrement en cours…"
    : `${count} modification${count > 1 ? "s" : ""} non enregistrée${count > 1 ? "s" : ""}`;

  return (
    <div className="yl-savebar" style={{
      position: "sticky", bottom: "16px", zIndex: 50, display: "flex", alignItems: "center",
      gap: "16px", width: "fit-content", maxWidth: "100%", flexWrap: "wrap",
      padding: "10px 10px 10px 16px", margin: "24px auto 0",
      backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderLeft: `4px solid ${accent}`,
      borderRadius: "14px", boxShadow: "0 12px 32px rgba(0,0,0,0.24)",
      animation: saved ? "fadeUp 0.2s ease, ylBarOut 0.25s ease 2.25s forwards" : "fadeUp 0.2s ease",
    }}>
      <style>{MOTION_CSS}</style>
      <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: C.t1, fontSize: "12.5px", fontWeight: "600", whiteSpace: "nowrap" }}>
        {saved ? <IconCheck color={C.green}/> : <span aria-hidden style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: accent }}/>}
        {message}
      </span>
      {!saved && (
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" disabled={status === "saving"} onClick={onCancel}>
            Annuler
          </Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" loading={status === "saving"} onClick={onSave} title="Ctrl + S">
            {status === "saving" ? "Enregistrement…" : error ? "Réessayer" : "Enregistrer"}
            {!error && status !== "saving" && <span aria-hidden style={{ marginLeft: "8px", opacity: 0.6, fontSize: "10.5px", fontWeight: "600" }}>Ctrl+S</span>}
          </Button>
        </div>
      )}
    </div>
  );
}

// Statut permanent près du titre : texte + icône/point, jamais la couleur seule.
export function FormStatusIndicator({ status, count, lastSavedAt }: {
  status: DirtyStatus; count: number; lastSavedAt: Date | null;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastSavedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, [lastSavedAt]);

  const dirty = status === "dirty" || status === "error";
  let label: string;
  let color = C.t3;
  if (status === "saving") label = "Enregistrement…";
  else if (dirty) { label = `Modifications non enregistrées (${count})`; color = status === "error" ? C.red : C.gold; }
  else { label = "Tous les changements sont enregistrés"; color = C.green; }

  return (
    <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 12px", marginBottom: "20px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color, fontSize: "12px", fontWeight: "600" }}>
        {status === "saving" ? <span aria-hidden style={{ display: "flex" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.55"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg></span>
          : dirty ? <span aria-hidden style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: color }}/>
          : <IconCheck color={color}/>}
        {label}
      </span>
      {lastSavedAt && !dirty && status !== "saving" && (
        <span style={{ color: C.t3, fontSize: "11.5px" }}>Dernière mise à jour : {tempsEcoule(lastSavedAt, now)}</span>
      )}
    </div>
  );
}
