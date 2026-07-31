"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const CODE_FICTIF = "123456";

export default function InstitutionVerification() {
  const router = useRouter();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus premier champ
  useEffect(() => {
    setTimeout(() => inputs.current[0]?.focus(), 400);
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError("");
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = "";
      setCode(newCode);
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      inputs.current[5]?.focus();
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleVerify = async () => {
    setError("");
    const entered = code.join("");

    if (entered.length < 6) {
      setError("Entrez les 6 chiffres du code.");
      triggerShake();
      return;
    }

    if (entered !== CODE_FICTIF) {
      setError("Code incorrect.");
      triggerShake();
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 50);
      return;
    }

    setLoading(true);

    try {
      const phone = localStorage.getItem("institution_phone");
      if (!phone) {
        setError("Session expirée. Recommencez l'inscription.");
        setLoading(false);
        return;
      }

      // Vérifier si le numéro existe déjà
      const { data: existing } = await supabase
        .from("institutions")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (existing) {
        setError("Ce numéro est déjà enregistré. Connectez-vous.");
        triggerShake();
        setLoading(false);
        return;
      }

      // Créer le compte
      const { data, error: insertError } = await supabase
        .from("institutions")
        .insert({ phone, statut: "en_attente" })
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (typeof window !== "undefined") {
        localStorage.setItem("institutionId", data.id);
      }

      setSuccess(true);
      setTimeout(() => router.push("/institution/profil"), 1500);
    } catch (err) {
      console.error(err);
      setError("Erreur réseau. Vérifiez votre connexion et réessayez.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const filledCount = code.filter(Boolean).length;
  const progress = (filledCount / 6) * 100;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

        body { background: #F5A623; }

        .root {
          min-height: 100vh;
          min-height: 100dvh;
          background: #F5A623;
          font-family: 'DM Sans', sans-serif;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* ─── TikTok-style Hero ─── */
        .hero {
          position: relative;
          height: 260px;
          background: #1A1A2E;
          overflow: hidden;
          flex-shrink: 0;
        }

        .hero-grain {
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
          background-size: 200px;
          pointer-events: none;
          z-index: 1;
        }

        .hero-ring {
          position: absolute;
          border-radius: 50%;
          border: 2px solid rgba(245,166,35,0.15);
          animation: ringPulse 4s ease-in-out infinite;
        }
        .hero-ring:nth-child(2) { width: 300px; height: 300px; top: -80px; right: -60px; animation-delay: 0s; }
        .hero-ring:nth-child(3) { width: 200px; height: 200px; top: -20px; right: -10px; animation-delay: 1s; border-color: rgba(245,166,35,0.25); }
        .hero-ring:nth-child(4) { width: 120px; height: 120px; top: 30px; right: 30px; animation-delay: 2s; border-color: rgba(245,166,35,0.4); }

        @keyframes ringPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.6; }
        }

        .hero-dot-grid {
          position: absolute;
          bottom: 0; left: 0;
          width: 160px; height: 160px;
          background-image: radial-gradient(circle, rgba(245,166,35,0.3) 1px, transparent 1px);
          background-size: 18px 18px;
          z-index: 1;
        }

        .hero-content {
          position: relative;
          z-index: 2;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 0 24px 28px;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(245,166,35,0.15);
          border: 1px solid rgba(245,166,35,0.3);
          border-radius: 20px;
          padding: 4px 12px;
          margin-bottom: 14px;
          width: fit-content;
        }

        .hero-badge-dot {
          width: 6px; height: 6px;
          background: #F5A623;
          border-radius: 50%;
          animation: blink 1.5s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        .hero-badge-text {
          color: #F5A623;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: 'DM Sans', sans-serif;
        }

        .hero-title {
          font-family: 'Syne', sans-serif;
          font-weight: 900;
          font-size: 42px;
          line-height: 1;
          color: #F5A623;
          letter-spacing: -1px;
        }

        .hero-title span {
          color: #fff;
          display: block;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 4px;
          margin-top: 4px;
          font-family: 'DM Sans', sans-serif;
        }

        /* ─── Curved connector ─── */
        .curve {
          background: #1A1A2E;
          height: 32px;
          position: relative;
          flex-shrink: 0;
        }
        .curve::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 32px;
          background: #F5A623;
          border-radius: 32px 32px 0 0;
        }

        /* ─── Card Body ─── */
        .body {
          background: #F5A623;
          flex: 1;
          padding: 28px 24px 40px;
          display: flex;
          flex-direction: column;
        }

        .section-label {
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: #1A1A2E;
          line-height: 1.2;
          margin-bottom: 6px;
        }

        .section-sub {
          font-size: 14px;
          color: rgba(26,26,46,0.6);
          margin-bottom: 6px;
          font-weight: 400;
        }


        /* ─── OTP Inputs ─── */
        .otp-row {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-bottom: 20px;
          transition: transform 0.08s;
        }

        .otp-row.shake {
          animation: shakeX 0.4s ease;
        }

        @keyframes shakeX {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }

        .otp-input {
          width: 46px;
          height: 58px;
          text-align: center;
          font-size: 24px;
          font-weight: 800;
          font-family: 'Syne', sans-serif;
          background: rgba(26,26,46,0.08);
          border: 2.5px solid transparent;
          border-radius: 14px;
          color: #1A1A2E;
          outline: none;
          transition: all 0.15s ease;
          caret-color: #1A1A2E;
          -webkit-appearance: none;
        }

        .otp-input.filled {
          background: #1A1A2E;
          border-color: #1A1A2E;
          color: #F5A623;
        }

        .otp-input:focus {
          background: rgba(26,26,46,0.12);
          border-color: #1A1A2E;
          transform: scale(1.06);
          box-shadow: 0 4px 16px rgba(26,26,46,0.2);
        }

        .otp-input.filled:focus {
          background: #1A1A2E;
          transform: scale(1.06);
        }

        /* ─── Progress bar ─── */
        .progress-wrap {
          height: 4px;
          background: rgba(26,26,46,0.12);
          border-radius: 99px;
          margin-bottom: 16px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: #1A1A2E;
          border-radius: 99px;
          transition: width 0.25s ease;
        }

        /* ─── Error ─── */
        .error-box {
          background: #fff;
          border-left: 4px solid #E53E3E;
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: slideDown 0.2s ease;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .error-icon { font-size: 16px; flex-shrink: 0; }
        .error-text { font-size: 13px; color: #1A1A2E; font-weight: 500; }

        /* ─── Success ─── */
        .success-overlay {
          position: fixed;
          inset: 0;
          background: #1A1A2E;
          z-index: 100;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }

        .success-icon {
          width: 80px; height: 80px;
          background: #F5A623;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes popIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .success-text {
          font-family: 'Syne', sans-serif;
          color: #F5A623;
          font-size: 22px;
          font-weight: 800;
        }

        .success-sub {
          color: rgba(245,166,35,0.6);
          font-size: 14px;
        }

        /* ─── CTA Button ─── */
        .cta-btn {
          width: 100%;
          height: 58px;
          background: #1A1A2E;
          color: #F5A623;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 700;
          font-family: 'Syne', sans-serif;
          letter-spacing: 0.5px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: transform 0.12s, box-shadow 0.12s;
          margin-top: auto;
          -webkit-appearance: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .cta-btn:active:not(:disabled) {
          transform: scale(0.97);
        }

        .cta-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .cta-btn.ready {
          box-shadow: 0 8px 24px rgba(26,26,46,0.3);
        }

        .spinner {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(245,166,35,0.3);
          border-top-color: #F5A623;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ─── Back link ─── */
        .back-link {
          text-align: center;
          margin-top: 20px;
        }

        .back-link a {
          color: rgba(26,26,46,0.5);
          font-size: 13px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-weight: 500;
          padding: 8px 0;
        }

        /* Mobile safe area */
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .body { padding-bottom: calc(40px + env(safe-area-inset-bottom)); }
        }
      `}</style>

      {success && (
        <div className="success-overlay">
          <div className="success-icon">✓</div>
          <div className="success-text">Compte créé !</div>
          <div className="success-sub">Redirection en cours…</div>
        </div>
      )}

      <div className="root">
        {/* ─── HERO TikTok ─── */}
        <div className="hero">
          <div className="hero-grain" />
          <div className="hero-ring" />
          <div className="hero-ring" />
          <div className="hero-ring" />
          <div className="hero-dot-grid" />
          <div className="hero-content">
            <div className="hero-badge">
              <div className="hero-badge-dot" />
              <span className="hero-badge-text">Institution</span>
            </div>
            <div className="hero-title">
              YELEN<br />224
              <span>Vérification</span>
            </div>
          </div>
        </div>

        {/* ─── Courbe de transition ─── */}
        <div className="curve" />

        {/* ─── Corps ─── */}
        <div className="body">
          <div className="section-label">Entrez votre code</div>
          <p className="section-sub">Code reçu par SMS sur votre numéro.</p>

          {/* Barre de progression */}
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>

          {/* OTP */}
          <div className={`otp-row${shake ? " shake" : ""}`}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                className={`otp-input${digit ? " filled" : ""}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                autoComplete={i === 0 ? "one-time-code" : "off"}
              />
            ))}
          </div>

          {/* Erreur */}
          {error && (
            <div className="error-box">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          )}

          {/* Bouton */}
          <button
            className={`cta-btn${filledCount === 6 && !loading ? " ready" : ""}`}
            onClick={handleVerify}
            disabled={loading || filledCount < 6}
          >
            {loading ? (
              <><div className="spinner" /> Vérification…</>
            ) : (
              <>Confirmer le code →</>
            )}
          </button>

          {/* Retour */}
          <div className="back-link">
            <a href="/institution/inscription">← Modifier le numéro</a>
          </div>
        </div>
      </div>
    </>
  );
}