"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";

const P = { pointerEvents: "none" as const };
const IcDown = () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

// Contenu réel de "Télécharger mes données" — déplacé depuis l'écran
// Confidentialité (18/07/2026) : cette carte apparaissait en double avec
// l'entrée déjà présente dans Paramètres, qui pointe vers cet écran.
// Confidentialité ne garde qu'un texte de renvoi vers ici (un seul point
// de vérité pour l'action elle-même).
export function MesDonneesClient() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function telechargerDonnees() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); return; }
      const res = await fetch("/api/citoyen/donnees/export", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) { showToast("Impossible de générer votre export.", "error"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `yelen224-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast("Export téléchargé.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Télécharger mes données"/>
      <main style={{ padding: "16px 16px 40px" }}>
        <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "20px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "rgba(245,166,35,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", marginBottom: "16px" }}><IcDown/></div>
          <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Télécharger mes données</div>
          <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "20px" }}>
            Télécharger une copie de toutes les informations enregistrées dans votre compte : profil, rendez-vous, avis, messages, notifications et appareils de sécurité.
          </div>
          <button disabled={busy} className="tap" style={{
            width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800,
            fontSize: "15px", padding: "15px", borderRadius: "14px", border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1,
          }} onClick={telechargerDonnees}>
            {busy ? "Génération…" : "Exporter mes données"}
          </button>
        </div>
      </main>

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 999, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
