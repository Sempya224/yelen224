
"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY, YELEN224_OTP_SIMULE } from "@/lib/auth/constants";

// ─── Anti-bot : questions mathématiques + logiques ────────────────────────────
const CHALLENGES = [
  { q: "Combien font 7 + 5 ?", a: "12", type: "math" },
  { q: "Combien font 13 - 6 ?", a: "7", type: "math" },
  { q: "Combien font 4 × 3 ?", a: "12", type: "math" },
  { q: "Combien font 18 ÷ 2 ?", a: "9", type: "math" },
  { q: "Quel est le résultat de 8 + 7 - 3 ?", a: "12", type: "math" },
  { q: "Quelle est la couleur du ciel par temps clair ?", a: "bleu", type: "logic" },
  { q: "Combien de jours y a-t-il dans une semaine ?", a: "7", type: "logic" },
  { q: "Combien font 6 × 4 ÷ 3 ?", a: "8", type: "math" },
  { q: "Combien font 25 - 18 + 4 ?", a: "11", type: "math" },
  { q: "Quel nombre vient après 99 ?", a: "100", type: "logic" },
];

// ─── Détection comportement humain ───────────────────────────────────────────
function useHumanDetection() {
  const [score, setScore] = useState(0);
  const events = useRef({ moves: 0, keys: 0, focus: 0, timeOnPage: 0 });
  const startTime = useRef(Date.now());

  useEffect(() => {
    const onMove = () => { events.current.moves++; if (events.current.moves > 3) setScore(s => Math.min(s + 1, 10)); };
    const onKey  = () => { events.current.keys++;  if (events.current.keys > 2)  setScore(s => Math.min(s + 2, 10)); };
    const onFocus = () => { events.current.focus++; setScore(s => Math.min(s + 1, 10)); };
    const tick = setInterval(() => {
      events.current.timeOnPage = (Date.now() - startTime.current) / 1000;
      if (events.current.timeOnPage > 4) setScore(s => Math.min(s + 1, 10));
    }, 2000);

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onFocus);
      clearInterval(tick);
    };
  }, []);

  return score >= 3; // humain si score >= 3
}

// ─── Honeypot invisible ───────────────────────────────────────────────────────
// Un champ caché — si rempli → bot détecté

// useSearchParams() exige une frontière Suspense en App Router (voir le
// meme correctif applique a app/institution/connexion/page.tsx le 22/07/2026
// - meme bug, jamais detecte avant faute de build Netlify recent).
function LoginCitoyenInner() {
  const router  = useRouter();
  const searchParams = useSearchParams();
  const [loggedOut, setLoggedOut] = useState(searchParams.get("logged_out") === "1");
  const [sessionExpired, setSessionExpired] = useState(searchParams.get("session_expired") === "1");
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";
  const isHuman = useHumanDetection();

  const [step, setStep]       = useState<"phone" | "otp">("phone");
  const [phone, setPhone]     = useState("");
  const [userId, setUserId]   = useState("");
  const [userName, setUserName] = useState("");
  const [code, setCode]       = useState(["","","","","",""]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [scrolled, setScrolled] = useState(false);

  // Anti-bot
  const [challenge, setChallenge]   = useState(CHALLENGES[0]);
  const [chalAnswer, setChalAnswer] = useState("");
  const [chalValid, setChalValid]   = useState(false);
  const [honeypot, setHoneypot]     = useState(""); // doit rester vide
  const [attempts, setAttempts]     = useState(0);
  const [blocked, setBlocked]       = useState(false);
  const [blockTimer, setBlockTimer] = useState(0);
  const [typeSpeed, setTypeSpeed]   = useState<number[]>([]); // vitesse frappe
  const lastKeyTime = useRef<number>(0);

  // OTP refs
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Init challenge aléatoire
  useEffect(() => {
    const idx = Math.floor(Math.random() * CHALLENGES.length);
    setChallenge(CHALLENGES[idx]);
  }, []);

  // Bannières post-déconnexion / session expirée — auto-disparition
  useEffect(() => {
    if (!loggedOut) return;
    const t = setTimeout(() => setLoggedOut(false), 4500);
    return () => clearTimeout(t);
  }, [loggedOut]);
  useEffect(() => {
    if (!sessionExpired) return;
    const t = setTimeout(() => setSessionExpired(false), 4500);
    return () => clearTimeout(t);
  }, [sessionExpired]);

  // Validation challenge (insensible à la casse pour les réponses texte)
  useEffect(() => {
    const norm = chalAnswer.trim().toLowerCase();
    setChalValid(norm === challenge.a.toLowerCase());
  }, [chalAnswer, challenge]);

  // Timer blocage
  useEffect(() => {
    if (!blocked || blockTimer <= 0) { if (blocked && blockTimer === 0) setBlocked(false); return; }
    const t = setTimeout(() => setBlockTimer(b => b - 1), 1000);
    return () => clearTimeout(t);
  }, [blocked, blockTimer]);

  // Scroll header
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Détection vitesse frappe (bots tapent uniformément)
  const onKeyTyped = useCallback(() => {
    const now = Date.now();
    if (lastKeyTime.current) {
      const delta = now - lastKeyTime.current;
      setTypeSpeed(s => [...s.slice(-10), delta]);
    }
    lastKeyTime.current = now;
  }, []);

  // Est-ce que la vitesse de frappe est humaine ?
  const isBotTyping = useCallback(() => {
    if (typeSpeed.length < 4) return false;
    const diffs = typeSpeed.map((v, i) => i > 0 ? Math.abs(v - typeSpeed[i-1]) : 0).slice(1);
    const variance = diffs.reduce((a,b) => a + b, 0) / diffs.length;
    return variance < 10; // variance < 10ms = robot (trop régulier)
  }, [typeSpeed]);

  // ── Étape 1 ─────────────────────────────────────────────────────────────────
  const handlePhone = async () => {
    setError("");

    // Honeypot
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); router.push("/"); return; }
    // Bot comportemental
    if (!isHuman) { setError("Vérification en cours, veuillez interagir avec la page."); return; }
    if (isBotTyping()) { setError("Comportement inhabituel détecté. Réessayez normalement."); return; }

    if (blocked) { setError(`Trop de tentatives. Attendez ${blockTimer}s.`); return; }
    if (!chalValid) { setError("Répondez correctement à la question de sécurité."); return; }

    const cleaned = phone.replace(/\s/g, "");
    if (!cleaned || cleaned.length < 8) { setError("Entrez un numéro valide (minimum 8 chiffres)."); return; }

    const fullPhone = "+224" + cleaned;
    setLoading(true);

    try {
      const res = await fetch("/api/citoyen/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError("Aucun compte trouvé avec ce numéro. Créez votre compte.");
        setLoading(false);
        return;
      }

      const displayName = json.user.prenom ? `${json.user.prenom} ${json.user.nom || ""}`.trim() : "Citoyen";
      setUserId(String(json.user.id));
      setUserName(displayName);
      localStorage.setItem("yelen_login_phone", fullPhone);
      setStep("otp");

      // Nouveau challenge pour OTP
      const idx = Math.floor(Math.random() * CHALLENGES.length);
      setChallenge(CHALLENGES[idx]);
      setChalAnswer("");
      setTimeout(() => otpRefs[0].current?.focus(), 300);
    } catch { setError("Erreur réseau. Réessayez."); }
    finally { setLoading(false); }
  };

  // ── Étape 2 OTP ─────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    setError("");
    if (blocked) { setError(`Bloqué. Attendez ${blockTimer}s.`); return; }
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); return; }

    const entered = code.join("");
    if (entered.length < 6) { setError("Entrez les 6 chiffres du code."); return; }

    // Code de test — À remplacer par vrai SMS Supabase en production
    if (entered !== "123456") {
      const n = attempts + 1;
      setAttempts(n);
      if (n >= 3) { setBlocked(true); setBlockTimer(60); setError("3 échecs. Compte bloqué 60 secondes."); }
      else { setError(`Code incorrect. ${3 - n} essai(s) restant(s).`); }
      // Vider et refocus
      setCode(["","","","","",""]);
      setTimeout(() => otpRefs[0].current?.focus(), 100);
      return;
    }

    setLoading(true);
    try {
      const storedPhone = localStorage.getItem("yelen_login_phone");
      const res = await fetch("/api/citoyen/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: storedPhone, code: entered }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError("Compte introuvable."); return; }

      if (!json.tokenHash) {
        setError("Impossible d'établir une session sécurisée. Réessayez.");
        return;
      }
      const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: "email" });
      if (sessionError) {
        setError("Impossible d'établir une session sécurisée. Réessayez.");
        return;
      }

      localStorage.removeItem("yelen_login_phone");
      localStorage.setItem(YELEN224_USER_ID_KEY, json.userId);

      // Redirect post-login si présent
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      router.push(redirect ? decodeURIComponent(redirect) : "/dashboard");
    } catch { setError("Erreur réseau."); }
    finally { setLoading(false); }
  };

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...code]; n[i] = val.slice(-1); setCode(n);
    if (val && i < 5) otpRefs[i+1].current?.focus();
    if (n.join("").length === 6) setTimeout(handleVerify, 200);
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) { otpRefs[i-1].current?.focus(); }
    if (e.key === "Enter") handleVerify();
  };

  // Tokens
  const inputBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBrd = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const txt1 = isDark ? "#ffffff" : "#0d0d1a";
  const txt2 = isDark ? "#8E8E93" : "#6C6C70";
  const txt3 = isDark ? "#444" : "#bbb";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", overflowX: "hidden" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{overflow-x:hidden;background:${C.pageBg}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        input::placeholder{color:${txt3}}
        input:focus{border-color:rgba(245,166,35,0.5)!important;box-shadow:0 0 0 3px rgba(245,166,35,0.08)!important;outline:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        .otp-input:focus{border-color:#F5A623!important;box-shadow:0 0 0 3px rgba(245,166,35,0.12)!important}
        .error-shake{animation:shake 0.4s ease}
      `}</style>

      {/* ── HEADER TIKTOK YELEN ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        backgroundColor: scrolled ? (isDark ? "rgba(8,8,15,0.97)" : "rgba(248,248,251,0.97)") : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}` : "none",
        transition: "all 0.3s",
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
          <div style={{ width: "30px", height: "30px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(245,166,35,0.3)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "900", color: txt1, letterSpacing: "0.5px" }}>YELEN224</div>
            <div style={{ fontSize: "7px", fontWeight: "700", color: "#F5A623", letterSpacing: "1.5px" }}>CONNEXION</div>
          </div>
        </Link>
        <Link href="/inscription" style={{ color: "#080812", fontSize: "13px", fontWeight: "800", textDecoration: "none", padding: "7px 14px", borderRadius: "20px", background: "#F5A623", border: "none" }} className="tap">
          S'inscrire
        </Link>
      </header>

      {/* ── HERO JAUNE ── */}
      <div style={{ height: "220px", background: "linear-gradient(160deg,#F5A623 0%,#E8960A 50%,#C8740A 100%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "200px", height: "200px", borderRadius: "50%", background: "rgba(255,255,255,0.07)" }}/>
        <div style={{ position: "absolute", bottom: "-40px", left: "-40px", width: "150px", height: "150px", borderRadius: "50%", background: "rgba(0,0,0,0.06)" }}/>
        {/* Drapeau */}
        <div style={{ position: "absolute", top: "16px", right: "20px", display: "flex", opacity: 0.4 }}>
          <div style={{ width: "9px", height: "16px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
          <div style={{ width: "9px", height: "16px", background: "#FCD20F" }}/>
          <div style={{ width: "9px", height: "16px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
        </div>
        <div style={{ position: "absolute", bottom: "28px", left: "24px", right: "24px" }}>
          <div style={{ color: "rgba(0,0,0,0.55)", fontSize: "10px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "5px" }}>
            {step === "phone" ? "Espace citoyen" : "Vérification"}
          </div>
          <h1 style={{ color: "#080812", fontSize: "26px", fontWeight: "900", margin: "0 0 4px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            {step === "phone" ? "Bienvenue" : "Code reçu ?"}
          </h1>
          <div style={{ color: "rgba(0,0,0,0.6)", fontSize: "14px", fontWeight: "600" }}>
            {step === "phone" ? "Connectez-vous à votre compte." : `Envoyé au +224 ${phone}`}
          </div>
        </div>
      </div>

      {/* ── FORMULAIRE ── */}
      <div style={{ padding: "24px 20px 40px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>

        {loggedOut && step === "phone" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: isDark ? "rgba(22,163,74,0.12)" : "#DCFCE7", border: "1px solid #16A34A", borderLeft: "3px solid #16A34A", borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ color: "#15803D", fontSize: "13px", fontWeight: "700" }}>Vous avez été déconnecté avec succès</span>
          </div>
        )}
        {sessionExpired && step === "phone" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderLeft: "3px solid #FFC107", borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span style={{ color: "#856404", fontSize: "13px", fontWeight: "700" }}>Votre session est arrivée à expiration pour protéger votre compte. Reconnectez-vous pour continuer.</span>
          </div>
        )}

        {step === "phone" && (
          <>
            {/* Indicateur humain */}
            {!isHuman && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", marginBottom: "18px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F5A623", animation: "pulse 1.5s infinite", flexShrink: 0 }}/>
                <span style={{ color: txt2, fontSize: "12px" }}>Interaction requise pour activer le formulaire…</span>
              </div>
            )}

            {/* Téléphone */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Numéro de téléphone</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "14px 14px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623" }}/>
                  <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>+224</span>
                </div>
                <input
                  type="tel"
                  placeholder="620 000 000"
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/[^\d\s]/g, "")); onKeyTyped(); }}
                  onKeyDown={e => { onKeyTyped(); if (e.key === "Enter") handlePhone(); }}
                  style={{ flex: 1, background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "14px 16px", color: txt1, fontSize: "16px", fontWeight: "600", letterSpacing: "1px" }}
                  autoFocus
                />
              </div>
            </div>

            {/* Challenge anti-bot */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Vérification de sécurité</div>
              <div style={{ background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "14px", padding: "14px 16px", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "rgba(245,166,35,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ color: "#F5A623", fontSize: "10px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "2px" }}>Question de sécurité</div>
                    <div style={{ color: txt1, fontSize: "14px", fontWeight: "700" }}>{challenge.q}</div>
                  </div>
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={challenge.type === "math" ? "number" : "text"}
                  placeholder="Votre réponse…"
                  value={chalAnswer}
                  onChange={e => { setChalAnswer(e.target.value); onKeyTyped(); }}
                  style={{ width: "100%", background: inputBg, border: `1px solid ${chalValid ? "rgba(245,166,35,0.4)" : inputBrd}`, borderRadius: "14px", padding: "13px 46px 13px 16px", color: txt1, fontSize: "15px", transition: "border-color 0.2s" }}
                />
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", transition: "all 0.2s" }}>
                  {chalValid
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={txt3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
            </div>

            {/* Honeypot invisible pour robots */}
            <div style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
              <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} name="website" />
            </div>

            {/* Erreur */}
            {error && (
              <div className="error-shake" style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderLeft: "3px solid #F5A623", borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: txt1, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            {/* CTA */}
            <button onClick={handlePhone} disabled={loading || !chalValid || blocked} className="tap" style={{
              width: "100%", padding: "16px",
              background: loading || !chalValid || blocked
                ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")
                : "linear-gradient(135deg,#F5A623,#C8940A)",
              color: loading || !chalValid || blocked ? txt2 : "#080812",
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
              cursor: loading || !chalValid || blocked ? "not-allowed" : "pointer",
              boxShadow: chalValid && !loading ? "0 8px 24px rgba(245,166,35,0.3)" : "none",
              transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "14px",
            }}>
              {loading
                ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(8,8,18,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/> Vérification…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17v-.08z"/></svg>
                    Recevoir le code SMS
                  </>
              }
            </button>

            {/* Sécurité */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 14px", background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.03)", border: "1px solid rgba(245,166,35,0.12)", borderRadius: "12px", marginBottom: "20px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ color: txt2, fontSize: "11px" }}>Connexion sécurisée — vos données sont protégées par Yelen224.</span>
            </div>

            <div style={{ textAlign: "center" }}>
              <span style={{ color: txt2, fontSize: "13px" }}>Pas encore de compte ? </span>
              <Link href="/inscription" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none", fontSize: "13px" }}>Créer un compte</Link>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            {/* Profil aperçu */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "16px", marginBottom: "22px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
                {userName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0,2) || "C"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: txt1, fontSize: "14px", fontWeight: "800" }}>{userName}</div>
                <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "600" }}>+224 {phone}</div>
              </div>
              <button onClick={() => { setStep("phone"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "4px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>

            {/* Blocage */}
            {blocked && (
              <div style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderLeft: "3px solid #F5A623", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px" }}>
                <div style={{ color: "#F5A623", fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Compte temporairement bloqué</div>
                <div style={{ color: txt2, fontSize: "13px" }}>Réessayez dans <strong style={{ color: txt1 }}>{blockTimer}s</strong></div>
                {/* Timer visuel */}
                <div style={{ marginTop: "10px", height: "3px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#F5A623", width: `${(blockTimer / 60) * 100}%`, transition: "width 1s linear" }}/>
                </div>
              </div>
            )}

            {/* Inputs OTP */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Code à 6 chiffres</div>
              <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    disabled={blocked}
                    className="otp-input"
                    style={{
                      width: "46px", height: "56px", textAlign: "center",
                      fontSize: "22px", fontWeight: "900",
                      background: digit ? "rgba(245,166,35,0.08)" : inputBg,
                      border: `2px solid ${digit ? "rgba(245,166,35,0.4)" : blocked ? "rgba(245,166,35,0.12)" : inputBrd}`,
                      borderRadius: "14px", color: digit ? "#F5A623" : txt1,
                      opacity: blocked ? 0.4 : 1,
                      transition: "all 0.15s",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Indicateur tentatives */}
            {attempts > 0 && !blocked && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "12px" }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: i < attempts ? "#F5A623" : inputBrd, transition: "background 0.2s" }}/>
                ))}
                <span style={{ color: txt2, fontSize: "11px", marginLeft: "4px" }}>{attempts}/3 tentatives</span>
              </div>
            )}

            {/* Code test info */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.03)", border: "1px solid rgba(245,166,35,0.1)", borderRadius: "10px", marginBottom: "14px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ color: txt2, fontSize: "11px" }}>Code de test : <strong style={{ color: "#F5A623" }}>123456</strong> — À remplacer par SMS réel en production</span>
            </div>

            {/* Erreur */}
            {error && (
              <div className="error-shake" style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderLeft: "3px solid #F5A623", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                <span style={{ color: txt1, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            {/* CTA */}
            <button onClick={handleVerify} disabled={loading || blocked || code.join("").length < 6} className="tap" style={{
              width: "100%", padding: "16px",
              background: loading || blocked || code.join("").length < 6
                ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)")
                : "linear-gradient(135deg,#F5A623,#C8940A)",
              color: loading || blocked || code.join("").length < 6 ? txt2 : "#080812",
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "800",
              cursor: loading || blocked || code.join("").length < 6 ? "not-allowed" : "pointer",
              boxShadow: !loading && !blocked && code.join("").length === 6 ? "0 8px 24px rgba(245,166,35,0.3)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "12px", transition: "all 0.2s",
            }}>
              {loading
                ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(8,8,18,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/> Connexion…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Se connecter
                  </>
              }
            </button>

            <button onClick={() => { setStep("phone"); setCode(["","","","","",""]); setError(""); setAttempts(0); setBlocked(false); }} className="tap" style={{ width: "100%", padding: "13px", background: "transparent", border: `1px solid ${inputBrd}`, borderRadius: "14px", color: txt2, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Modifier le numéro
            </button>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", gap: "0" }}>
            <div style={{ width: "16px", height: "11px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
            <div style={{ width: "16px", height: "11px", background: "#FCD20F" }}/>
            <div style={{ width: "16px", height: "11px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
            <span style={{ color: txt2, fontSize: "10px", marginLeft: "8px", fontWeight: "600", alignSelf: "center" }}>République de Guinée</span>
          </div>
          <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <span style={{ background: "#FE2C55", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "2px 10px", borderRadius: "6px" }}>SEMPYA224</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginCitoyen() {
  return (
    <Suspense fallback={
      <div style={{ height: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F8FB" }}>
        <div style={{ width: "32px", height: "32px", border: "3px solid rgba(245,166,35,0.2)", borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <LoginCitoyenInner/>
    </Suspense>
  );
}

