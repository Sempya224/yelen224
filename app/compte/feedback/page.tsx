"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { YelenLoader } from "@/components/YelenLoader";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });

// Écran "Envoyer un feedback" (24/08/2026, demande Bryan) — rendu calqué
// délibérément sur le flux "Send feedback" de WhatsApp (2 écrans : bottom
// sheet d'intro puis formulaire), teinté #F5A623. Header maison (Annuler /
// titre / Envoyer en texte) plutôt que CompteHeader — CompteHeader
// (composant partagé des ~29 écrans /compte/*) n'expose qu'une action
// icône à droite, pas un bouton texte activable/désactivé selon le
// contenu du champ, nécessaire ici pour la fidélité au rendu demandé.
export default function FeedbackPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const C = T[theme];

  const [introOpen, setIntroOpen] = useState(true);
  const [message, setMessage] = useState("");
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [capturePreview, setCapturePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  useEffect(() => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!uid) router.push("/login");
  }, []);

  const hasContent = message.trim().length > 0 || !!captureFile;

  function handleAnnuler() {
    if (hasContent) setConfirmAbandon(true);
    else router.back();
  }

  async function handleEnvoyer() {
    setError("");
    if (message.trim().length < 10) { setError("Décrivez le problème en au moins 10 caractères."); return; }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Session expirée, reconnectez-vous."); setSending(false); return; }

      const form = new FormData();
      form.set("accessToken", session.access_token);
      form.set("message", message.trim());
      if (captureFile) form.set("file", captureFile);

      const res = await fetch("/api/citoyen/feedback", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setError(json?.error || "Erreur lors de l'envoi. Réessayez."); setSending(false); return; }

      setSent(true);
      setTimeout(() => router.back(), 1400);
    } catch {
      setError("Une erreur est survenue.");
      setSending(false);
    }
  }

  const inputStyle = {
    width: "100%",
    backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f9f9fb",
    border: `1px solid ${C.borderCard}`,
    borderRadius: "10px",
    padding: "14px",
    color: C.text,
    fontSize: "14px",
    fontFamily: "inherit",
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        textarea:focus { outline: none; border-color: #F5A623 !important; box-shadow: 0 0 0 3px rgba(245,166,35,0.12) !important; }
        .tap { transition: transform 0.1s, opacity 0.1s; cursor: pointer; touch-action: manipulation; }
        .tap:active { opacity: 0.65; transform: scale(0.97); }
      `}</style>

      <div className={inter.variable} style={{ minHeight: "100vh", backgroundColor: C.pageBg, color: C.text, fontFamily: "var(--font-inter), -apple-system, sans-serif" }}>

        {/* ── HEADER (texte, façon WhatsApp) ── */}
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: C.pageBg, borderBottom: `1px solid ${C.borderCard}`, paddingTop: "env(safe-area-inset-top)" }}>
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
            <button onClick={handleAnnuler} className="tap" style={{ justifySelf: "start", background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: "15px", fontWeight: 500 }}>Annuler</button>
            <div style={{ fontSize: "15px", fontWeight: 800, color: C.text, whiteSpace: "nowrap" }}>Envoyer un feedback</div>
            <button
              onClick={handleEnvoyer}
              disabled={message.trim().length === 0 || sending}
              className="tap"
              style={{ justifySelf: "end", background: "none", border: "none", padding: 0, fontSize: "15px", fontWeight: 700, color: (message.trim().length === 0 || sending) ? C.textFaint : "#F5A623", cursor: (message.trim().length === 0 || sending) ? "default" : "pointer" }}
            >
              {sending ? <YelenLoader size={16}/> : "Envoyer"}
            </button>
          </div>
        </header>

        <div style={{ padding: "20px 20px 60px" }}>

          {sent && (
            <div style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "12px", padding: "14px 18px", display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", animation: "fadeUp 0.2s ease" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ color: "#22c55e", fontWeight: 700, fontSize: "13.5px" }}>Feedback envoyé, merci !</span>
            </div>
          )}

          <p style={{ fontSize: "12.5px", color: C.textSubtle, lineHeight: 1.6, marginBottom: "18px" }}>
            Pour d&apos;autres soucis comme le spam ou les arnaques, obtenez de l&apos;aide ou contactez le support depuis le <a href="/compte/aide" style={{ color: "#F5A623", fontWeight: 600, textDecoration: "none" }}>Centre d&apos;aide</a>.
          </p>

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={7}
            placeholder="Décrivez le problème technique"
            style={{ ...inputStyle, resize: "none", lineHeight: 1.6, marginBottom: "24px" }}
          />

          <label style={{ display: "block", fontSize: "11px", color: C.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "10px" }}>
            Captures d&apos;écran (optionnel)
          </label>
          <div style={{ backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "14px", padding: "16px" }}>
            {capturePreview ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-24 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capturePreview} alt="" style={{ width: "72px", height: "72px", borderRadius: "10px", objectFit: "cover", border: `1px solid ${C.borderCard}` }}/>
                <button
                  onClick={() => { setCaptureFile(null); setCapturePreview(null); }}
                  aria-label="Supprimer la capture"
                  style={{ position: "absolute", top: "-8px", right: "-8px", backgroundColor: "#ef4444", border: "none", color: "#fff", width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                ><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ajouter une capture d'écran"
                className="tap"
                style={{ width: "72px", height: "72px", borderRadius: "10px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "#f2f2f7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSubtle, cursor: "pointer" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/><path d="M16 8h4M18 6v4"/></svg>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCaptureFile(file);
                setCapturePreview(URL.createObjectURL(file));
              }}
              style={{ display: "none" }}
            />
          </div>
          <p style={{ fontSize: "11px", color: C.textFaint, marginTop: "10px", lineHeight: 1.5 }}>
            {capturePreview ? "Appuyez sur la capture pour la supprimer." : "JPG, PNG — max 5MB."}
          </p>

          {error && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "12px 16px", color: "#ef4444", fontSize: "13px", marginTop: "18px" }}>
              {error}
            </div>
          )}

          <p style={{ fontSize: "11px", color: C.textFaint, textAlign: "center", lineHeight: 1.6, marginTop: "24px" }}>
            En envoyant, vous autorisez Yelen à consulter les informations techniques associées pour vous aider à résoudre ce problème. <a href="/confidentialite" style={{ color: "#F5A623", textDecoration: "none" }}>En savoir plus</a>
          </p>
        </div>
      </div>

      {/* ── BOTTOM SHEET D'INTRO ── */}
      {introOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto", backgroundColor: C.cardBg, borderTopLeftRadius: "24px", borderTopRightRadius: "24px", padding: "24px 24px calc(24px + env(safe-area-inset-bottom))", animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1)", position: "relative" }}>
            <button
              onClick={() => router.back()}
              aria-label="Fermer"
              className="tap"
              style={{ position: "absolute", top: "18px", right: "18px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", border: "none", color: C.textSubtle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
              <div style={{ width: "72px", height: "72px", borderRadius: "20px", backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>
              </div>
            </div>

            <h2 style={{ fontSize: "20px", fontWeight: 800, color: C.text, textAlign: "center", margin: "0 0 22px", lineHeight: 1.3 }}>
              Envoyez un feedback pour nous aider à résoudre les problèmes techniques
            </h2>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
              </div>
              <p style={{ fontSize: "13.5px", color: C.textMuted, lineHeight: 1.6, margin: 0 }}>Signalez les problèmes comme les blocages, plantages ou fonctionnalités cassées.</p>
            </div>
            <div style={{ display: "flex", gap: "12px", marginBottom: "22px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: theme === "dark" ? "rgba(255,255,255,0.06)" : "#f2f2f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              </div>
              <p style={{ fontSize: "13.5px", color: C.textMuted, lineHeight: 1.6, margin: 0 }}>Ajoutez des détails et des captures d&apos;écran pour nous aider à comprendre votre retour.</p>
            </div>

            <p style={{ fontSize: "12px", color: C.textFaint, lineHeight: 1.6, textAlign: "center", marginBottom: "20px" }}>
              Pour d&apos;autres soucis comme le spam ou les arnaques, obtenez de l&apos;aide ou contactez le support depuis le <a href="/compte/aide" style={{ color: "#F5A623", fontWeight: 600, textDecoration: "none" }}>Centre d&apos;aide</a>.
            </p>

            <button
              onClick={() => setIntroOpen(false)}
              className="tap"
              style={{ width: "100%", backgroundColor: "#F5A623", border: "none", borderRadius: "14px", padding: "15px", color: "#080812", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {/* ── CONFIRMATION ABANDON ── */}
      {confirmAbandon && (
        <div onClick={() => setConfirmAbandon(false)} style={{ position: "fixed", inset: 0, zIndex: 9700, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.cardBg, borderRadius: "20px", padding: "22px", maxWidth: "360px", width: "100%", border: `1px solid ${C.borderCard}` }}>
            <div style={{ color: C.text, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>Abandonner ce feedback ?</div>
            <div style={{ color: C.textMuted, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>Le texte saisi sera perdu.</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmAbandon(false)} className="tap" style={{ flex: 1, padding: "12px", borderRadius: "10px", border: `1px solid ${C.borderCard}`, background: "none", color: C.text, fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>Continuer l&apos;édition</button>
              <button onClick={() => router.back()} className="tap" style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>Abandonner</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
