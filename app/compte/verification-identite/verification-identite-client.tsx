"use client";

// Vérification d'identité citoyen par pièce (CIN) — chantier refonte Hero
// Accueil "état vivant" (23/07/2026). Remplace le badge "VÉRIFIÉ" jusqu'ici
// hardcodé (aucune donnée réelle derrière) par un vrai signal : dès que le
// citoyen téléverse sa pièce, le compte passe "vérifié" (décision Bryan :
// auto-vérifié, pas de file d'attente admin pour démarrer). Mirroring du
// flux de téléversement déjà en place dans "Mes documents"
// (app/compte/documents-telecharges/mes-documents-client.tsx).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";

const P = { pointerEvents: "none" as const };
const Ic = {
  Shield: () => <svg style={P} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Check:  () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Alert:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function VerificationIdentiteClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [loading, setLoading] = useState(true);
  const [verifiee, setVerifiee] = useState(false);
  const [soumisLe, setSoumisLe] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => {
      setLoading(true);
      const { data } = await supabase.from("users").select("identite_verifiee,cin_soumis_le").eq("id", id).maybeSingle();
      if (data) {
        setVerifiee(!!data.identite_verifiee);
        setSoumisLe(data.cin_soumis_le ?? null);
      }
      setLoading(false);
    })();
  }, [router]);

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { showToast("Session expirée, reconnectez-vous.", "error"); setBusy(false); return; }
    const fd = new FormData();
    fd.append("accessToken", session.access_token);
    fd.append("file", file);
    const res = await fetch("/api/citoyen/verification-identite/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { showToast(json?.error ?? "Impossible de téléverser ce document.", "error"); return; }
    showToast("Identité vérifiée.");
    setVerifiee(true);
    setSoumisLe(new Date().toISOString());
    setFile(null);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Vérification d'identité"/>
      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto" }}>

        {verifiee ? (
          <div style={{ backgroundColor: card, border: "1px solid rgba(34,197,94,0.3)", borderRadius: "18px", padding: "24px 20px", textAlign: "center" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "#22c55e" }}><Ic.Check/></div>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "800", marginBottom: "6px" }}>Identité vérifiée</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>
              {soumisLe ? `Pièce soumise le ${formatDate(soumisLe)}.` : "Votre pièce a été soumise."}
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "4px 4px 16px" }}>
              <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>
                Soumettez votre pièce d'identité (CIN) pour sécuriser votre compte et faire apparaître le badge "Vérifié" sur votre carte Yelen ID.
              </p>
            </div>

            <div style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "14px", padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ color: "#F5A623" }}><Ic.Alert/></span>
                <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800 }}>Avant d'envoyer votre pièce</span>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 18px", color: t2, fontSize: "12px", lineHeight: 1.6 }}>
                <li>Photo ou scan lisible de votre carte d'identité nationale (CIN), recto suffisant.</li>
                <li>Format PDF, JPG ou PNG, 10 Mo maximum.</li>
                <li>Ce document reste strictement privé — jamais visible par un établissement ni un autre citoyen.</li>
              </ul>
            </div>

            <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "20px", textAlign: "center" }}>
              <div style={{ color: t2, marginBottom: "14px", display: "flex", justifyContent: "center" }}><Ic.Shield/></div>
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ width: "100%", marginBottom: "16px", color: t2, fontSize: "12px" }}/>
              <button
                disabled={!file || busy}
                onClick={handleUpload}
                className="tap"
                style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "12px", border: "none", cursor: "pointer", opacity: !file || busy ? 0.6 : 1 }}
              >
                {busy ? "Envoi…" : "Soumettre ma pièce"}
              </button>
            </div>
          </>
        )}
      </main>

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
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
