"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

// ─── Anti-bot ─────────────────────────────────────────────────────────────────
const CHALLENGES = [
  { q: "Combien font 8 + 7 ?",              a: "15" },
  { q: "Combien font 16 - 9 ?",             a: "7"  },
  { q: "Combien font 6 × 3 ?",              a: "18" },
  { q: "Combien font 21 ÷ 3 ?",             a: "7"  },
  { q: "Quel est le double de 8 ?",         a: "16" },
  { q: "Combien font 12 + 9 - 4 ?",         a: "17" },
  { q: "Combien de jours en une semaine ?", a: "7"  },
];

function useIsHuman() {
  const [score, setScore] = useState(0);
  useEffect(() => {
    const inc = (n: number) => setScore(s => Math.min(s + n, 10));
    const onMove  = () => inc(1);
    const onTouch = () => inc(2);
    const onKey   = () => inc(2);
    const t = setTimeout(() => inc(2), 3000);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", onMove); window.removeEventListener("touchmove", onTouch); window.removeEventListener("keydown", onKey); };
  }, []);
  return score >= 3;
}

const VILLES = ["Conakry","Boké","Kindia","Mamou","Labé","Faranah","Kankan","Nzérékoré"];

export default function InscriptionCitoyen() {
  const router   = useRouter();
  const { theme } = useTheme();
  const C        = T[theme];
  const isDark   = theme === "dark";
  const isHuman  = useIsHuman();

  const [step, setStep]     = useState<"info"|"otp">("info");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [acceptCGU, setAcceptCGU] = useState(false);
  const [form, setForm]     = useState({ prenom: "", nom: "", phone: "", ville: "" });
  const [code, setCode]     = useState(["","","","","",""]);

  // Anti-bot
  const [challenge, setChallenge]   = useState(CHALLENGES[0]);
  const [chalAnswer, setChalAnswer] = useState("");
  const [chalValid, setChalValid]   = useState(false);
  const [honeypot, setHoneypot]     = useState("");
  const [attempts, setAttempts]     = useState(0);
  const [blocked, setBlocked]       = useState(false);
  const [blockTimer, setBlockTimer] = useState(0);
  const lastKey = useRef(0);
  const speeds  = useRef<number[]>([]);

  const otpRefs = [
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    const i = Math.floor(Math.random() * CHALLENGES.length);
    setChallenge(CHALLENGES[i]);
  }, []);

  useEffect(() => {
    setChalValid(chalAnswer.trim() === challenge.a);
  }, [chalAnswer, challenge]);

  useEffect(() => {
    if (!blocked || blockTimer <= 0) { if (blocked && blockTimer === 0) setBlocked(false); return; }
    const t = setTimeout(() => setBlockTimer(b => b - 1), 1000);
    return () => clearTimeout(t);
  }, [blocked, blockTimer]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const onKey = useCallback(() => {
    const now = Date.now();
    if (lastKey.current) speeds.current = [...speeds.current.slice(-8), now - lastKey.current];
    lastKey.current = now;
  }, []);

  const isBotSpeed = useCallback(() => {
    if (speeds.current.length < 4) return false;
    const diffs = speeds.current.map((v,i) => i > 0 ? Math.abs(v - speeds.current[i-1]) : 0).slice(1);
    return diffs.reduce((a,b) => a+b, 0) / diffs.length < 8;
  }, []);

  const fc = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmitInfo = async () => {
    setError("");
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); return; }
    if (!isHuman) { setError("Interagissez avec la page pour continuer."); return; }
    if (isBotSpeed()) { setError("Comportement inhabituel détecté. Réessayez normalement."); return; }
    if (blocked) { setError(`Trop de tentatives. Attendez ${blockTimer}s.`); return; }
    if (!form.prenom.trim()) { setError("Le prénom est obligatoire."); return; }
    if (!form.nom.trim()) { setError("Le nom est obligatoire."); return; }
    if (!acceptCGU) { setError("Acceptez les conditions d'utilisation pour continuer."); return; }
    if (!chalValid) { setError("Répondez correctement à la question de sécurité."); return; }
    const cleaned = form.phone.replace(/\s/g, "");
    if (!cleaned || cleaned.length < 8) { setError("Entrez un numéro valide (minimum 8 chiffres)."); return; }

    const fullPhone = "+224" + cleaned;
    setLoading(true);
    try {
      const { data: existing } = await supabase.from("users").select("id").eq("phone", fullPhone).maybeSingle();
      if (existing) { setError("Un compte existe déjà avec ce numéro. Connectez-vous."); return; }
      localStorage.setItem("inscription_phone",  fullPhone);
      localStorage.setItem("inscription_prenom", form.prenom.trim());
      localStorage.setItem("inscription_nom",    form.nom.trim());
      localStorage.setItem("inscription_ville",  form.ville);
      setStep("otp");
      setTimeout(() => otpRefs[0].current?.focus(), 300);
    } catch { setError("Erreur réseau. Réessayez."); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setError("");
    if (blocked) { setError(`Bloqué. Attendez ${blockTimer}s.`); return; }
    const entered = code.join("");
    if (entered.length < 6) { setError("Entrez les 6 chiffres du code."); return; }
    if (entered !== "123456") {
      const n = attempts + 1; setAttempts(n);
      if (n >= 3) { setBlocked(true); setBlockTimer(60); setError("3 échecs. Bloqué 60 secondes."); }
      else { setError(`Code incorrect. ${3 - n} essai(s) restant(s).`); }
      setCode(["","","","","",""]); setTimeout(() => otpRefs[0].current?.focus(), 100);
      return;
    }
    setLoading(true);
    try {
      const phone  = localStorage.getItem("inscription_phone");
      const prenom = localStorage.getItem("inscription_prenom");
      const nom    = localStorage.getItem("inscription_nom");
      const ville  = localStorage.getItem("inscription_ville");
      const { data, error: err } = await supabase
        .from("users")
        .insert({ phone, prenom, nom, name: `${prenom} ${nom}`.trim(), ...(ville ? { ville } : {}) })
        .select("id").single();
      if (err) { setError(err.code === "23505" ? "Ce numéro est déjà enregistré." : "Erreur création compte."); return; }
      ["inscription_phone","inscription_prenom","inscription_nom","inscription_ville"].forEach(k => localStorage.removeItem(k));
      localStorage.setItem(YELEN224_USER_ID_KEY, (data as any).id);
      router.push("/dashboard");
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
    if (e.key === "Backspace" && !code[i] && i > 0) otpRefs[i-1].current?.focus();
    if (e.key === "Enter") handleVerify();
  };

  const canSubmit = chalValid && acceptCGU && !blocked && !loading && isHuman;

  // ── Tokens thème auto ─────────────────────────────────────────────────────
  const inputBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const txt1 = isDark ? "#F0EEE8" : "#0d0d1a";
  const txt2 = isDark ? "#6E6E7A" : "#6C6C70";
  const txt3 = isDark ? "#333345" : "#bbb";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", color: txt1, overflowX: "hidden", transition: "background-color 0.3s" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{background:${C.pageBg};overflow-x:hidden;transition:background-color 0.3s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glowPulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        input::placeholder{color:${txt3}}
        input:focus,select:focus{border-color:rgba(245,166,35,0.45)!important;box-shadow:0 0 0 3px rgba(245,166,35,0.07)!important;outline:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        select option{background:${isDark ? "#12121F" : "#fff"};color:${txt1}}
        .otp-box:focus{border-color:#F5A623!important;box-shadow:0 0 0 3px rgba(245,166,35,0.1)!important}
      `}</style>

      {/* ── HEADER TIKTOK YELEN ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        backgroundColor: scrolled ? (isDark ? "rgba(8,8,15,0.97)" : "rgba(248,248,251,0.97)") : "transparent",
        backdropFilter: scrolled ? "blur(24px)" : "none",
        borderBottom: scrolled ? `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}` : "none",
        transition: "all 0.3s", padding: "13px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
          <div style={{ width: "30px", height: "30px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(245,166,35,0.35)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "900", color: txt1, letterSpacing: "0.5px" }}>YELEN224</div>
            <div style={{ fontSize: "7px", fontWeight: "700", color: "#F5A623", letterSpacing: "1.5px" }}>INSCRIPTION</div>
          </div>
        </Link>
        {/* Stepper compact header */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {["Infos","Vérif"].map((s, i) => {
            const active = (i === 0 && step === "info") || (i === 1 && step === "otp");
            const done   = i === 0 && step === "otp";
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: done ? "#F5A623" : active ? "linear-gradient(135deg,#F5A623,#C8940A)" : inputBg, border: active ? "2px solid #F5A623" : `2px solid ${inputBrd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "900", color: done || active ? "#080812" : txt2, transition: "all 0.3s" }}>
                  {done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : i+1}
                </div>
                <span style={{ color: active ? "#F5A623" : txt2, fontSize: "10px", fontWeight: active ? "800" : "500" }}>{s}</span>
                {i === 0 && <div style={{ width: "16px", height: "1px", background: step === "otp" ? "#F5A623" : inputBrd, transition: "background 0.3s", margin: "0 2px" }}/>}
              </div>
            );
          })}
        </div>
        <Link href="/login" className="tap" style={{ color: "#080812", fontSize: "12px", fontWeight: "800", textDecoration: "none", padding: "7px 14px", borderRadius: "20px", background: "linear-gradient(135deg,#F5A623,#C8940A)", boxShadow: "0 3px 12px rgba(245,166,35,0.25)" }}>
          Connexion
        </Link>
      </header>

      {/* ── HERO ── */}
      <div style={{ position: "relative", height: "220px", background: isDark ? "linear-gradient(160deg,#0F0E1A 0%,#110F1E 60%,#1A1008 100%)" : "linear-gradient(160deg,#F5A623 0%,#E8960A 50%,#C8740A 100%)", overflow: "hidden" }}>
        {isDark && <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(245,166,35,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(245,166,35,0.04) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }}/>}
        {isDark && <div style={{ position: "absolute", top: "-60px", left: "50%", transform: "translateX(-50%)", width: "280px", height: "280px", borderRadius: "50%", background: "radial-gradient(circle,rgba(245,166,35,0.1) 0%,transparent 70%)", pointerEvents: "none" }}/>}
        {/* Cercles déco light */}
        {!isDark && <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "200px", height: "200px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", pointerEvents: "none" }}/>}
        {/* Drapeau */}
        <div style={{ position: "absolute", top: "68px", right: "22px", display: "flex", opacity: isDark ? 0.3 : 0.4 }}>
          <div style={{ width: "9px", height: "16px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
          <div style={{ width: "9px", height: "16px", background: "#FCD20F" }}/>
          <div style={{ width: "9px", height: "16px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
        </div>
        <div style={{ position: "absolute", bottom: "28px", left: "24px", right: "24px" }}>
          {isDark && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "20px", marginBottom: "8px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#F5A623" }}/>
              <span style={{ color: "#F5A623", fontSize: "9px", fontWeight: "800", letterSpacing: "1.5px", textTransform: "uppercase" }}>Espace Citoyen</span>
            </div>
          )}
          <h1 style={{ color: isDark ? txt1 : "#080812", fontSize: "26px", fontWeight: "900", margin: "0 0 5px", lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            {step === "info" ? (isDark ? <>Créer votre <span style={{ color: "#F5A623" }}>compte</span></> : "Créer votre compte") : "Code de vérification"}
          </h1>
          <div style={{ color: isDark ? txt2 : "rgba(0,0,0,0.6)", fontSize: "13px", fontWeight: "500" }}>
            {step === "info" ? "Accédez aux services publics guinéens." : `Envoyé au +224 ${form.phone}`}
          </div>
        </div>
      </div>

      {/* ── FORMULAIRE ── */}
      <div style={{ padding: "22px 20px 48px", maxWidth: "480px", margin: "0 auto", animation: "fadeUp 0.3s ease" }}>

        {step === "info" && (
          <>
            {!isHuman && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "12px", marginBottom: "16px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623", animation: "glowPulse 1.5s infinite", flexShrink: 0 }}/>
                <span style={{ color: txt2, fontSize: "12px" }}>Interaction requise pour activer le formulaire…</span>
              </div>
            )}

            {/* Prénom + Nom */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              {[{ key: "prenom", label: "Prénom", ph: "Mamadou" }, { key: "nom", label: "Nom", ph: "Diallo" }].map(f => (
                <div key={f.key}>
                  <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>{f.label} *</div>
                  <input
                    value={(form as any)[f.key]}
                    onChange={e => { fc(f.key, e.target.value); onKey(); }}
                    placeholder={f.ph}
                    style={{ width: "100%", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "13px 14px", color: txt1, fontSize: "14px", fontWeight: "600", transition: "border-color 0.2s" }}
                  />
                </div>
              ))}
            </div>

            {/* Téléphone */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Téléphone *</div>
              <div style={{ display: "flex", gap: "8px", border: `1px solid ${inputBrd}`, borderRadius: "14px", overflow: "hidden", transition: "border-color 0.2s" }}>
                <div style={{ background: inputBg, padding: "13px 14px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, borderRight: `1px solid ${inputBrd}` }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623" }}/>
                  <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>+224</span>
                </div>
                <input
                  type="tel" value={form.phone}
                  onChange={e => { fc("phone", e.target.value.replace(/[^\d\s]/g,"")); onKey(); }}
                  onKeyDown={e => { onKey(); if (e.key === "Enter") handleSubmitInfo(); }}
                  placeholder="620 000 000"
                  style={{ flex: 1, background: "transparent", border: "none", padding: "13px 14px", color: txt1, fontSize: "15px", fontWeight: "600", letterSpacing: "0.5px" }}
                />
              </div>
            </div>

            {/* Ville */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Ville</div>
              <select
                value={form.ville}
                onChange={e => fc("ville", e.target.value)}
                style={{ width: "100%", background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "13px 14px", color: form.ville ? txt1 : txt2, fontSize: "14px", appearance: "none", cursor: "pointer" }}
              >
                <option value="">Sélectionner une ville (optionnel)</option>
                {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Challenge */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Vérification de sécurité *</div>
              <div style={{ background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "14px", padding: "13px 16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <span style={{ color: txt1, fontSize: "14px", fontWeight: "700" }}>{challenge.q}</span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="number" value={chalAnswer}
                  onChange={e => { setChalAnswer(e.target.value); onKey(); }}
                  placeholder="Votre réponse…"
                  style={{ width: "100%", background: inputBg, border: `1px solid ${chalValid ? "rgba(245,166,35,0.4)" : inputBrd}`, borderRadius: "12px", padding: "13px 46px 13px 16px", color: txt1, fontSize: "15px", transition: "border-color 0.2s" }}
                />
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
                  {chalValid
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={txt3} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
            </div>

            {/* CGU */}
            <div onClick={() => setAcceptCGU(v => !v)} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", background: inputBg, border: `1px solid ${acceptCGU ? "rgba(245,166,35,0.25)" : inputBrd}`, borderRadius: "14px", marginBottom: "18px", cursor: "pointer", transition: "border-color 0.2s" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "6px", background: acceptCGU ? "#F5A623" : "transparent", border: `2px solid ${acceptCGU ? "#F5A623" : inputBrd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", transition: "all 0.15s" }}>
                {acceptCGU && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div style={{ color: txt2, fontSize: "12px", lineHeight: 1.6 }}>
                J'accepte les{" "}
                <Link href="/cgu" onClick={e => e.stopPropagation()} style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions d'utilisation</Link>
                {" "}et la{" "}
                <Link href="/confidentialite" onClick={e => e.stopPropagation()} style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Politique de confidentialité</Link>
                {" "}de Yelen224.
              </div>
            </div>

            {/* Honeypot */}
            <div style={{ position: "absolute", left: "-9999px", top: 0, opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
              <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} name="website"/>
            </div>

            {/* Erreur */}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.2)", borderLeft: "3px solid #F5A623", borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
                <span style={{ color: txt1, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            <button onClick={handleSubmitInfo} disabled={!canSubmit} className="tap" style={{
              width: "100%", padding: "16px",
              background: canSubmit ? "linear-gradient(135deg,#F5A623,#C8940A)" : inputBg,
              color: canSubmit ? "#080812" : txt2,
              border: canSubmit ? "none" : `1px solid ${inputBrd}`,
              borderRadius: "16px", fontSize: "15px", fontWeight: "900",
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? "0 8px 28px rgba(245,166,35,0.28)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "14px", transition: "all 0.2s",
            }}>
              {loading
                ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(8,8,18,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/> Vérification…</>
                : <>Continuer <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg></>
              }
            </button>
            <div style={{ textAlign: "center" }}>
              <span style={{ color: txt2, fontSize: "13px" }}>Déjà un compte ? </span>
              <Link href="/login" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none", fontSize: "13px" }}>Se connecter</Link>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            {/* Récap profil */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "16px", marginBottom: "22px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
                {`${form.prenom[0]||""}${form.nom[0]||""}`.toUpperCase() || "C"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: txt1, fontSize: "14px", fontWeight: "800" }}>{form.prenom} {form.nom}</div>
                <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "600" }}>+224 {form.phone}</div>
              </div>
              <button onClick={() => { setStep("info"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "4px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>

            {/* Blocage */}
            {blocked && (
              <div style={{ padding: "14px 16px", background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "12px", marginBottom: "16px" }}>
                <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "800", marginBottom: "6px" }}>Compte temporairement bloqué</div>
                <div style={{ color: txt2, fontSize: "13px", marginBottom: "8px" }}>Réessayez dans <strong style={{ color: txt1 }}>{blockTimer}s</strong></div>
                <div style={{ height: "3px", background: inputBrd, borderRadius: "2px" }}>
                  <div style={{ height: "100%", background: "#F5A623", width: `${(blockTimer/60)*100}%`, transition: "width 1s linear", borderRadius: "2px" }}/>
                </div>
              </div>
            )}

            {/* OTP inputs */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Code à 6 chiffres</div>
              <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
                {code.map((digit, i) => (
                  <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    disabled={blocked}
                    className="otp-box"
                    style={{ width: "46px", height: "56px", textAlign: "center", fontSize: "22px", fontWeight: "900", background: digit ? (isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.08)") : inputBg, border: `2px solid ${digit ? "rgba(245,166,35,0.4)" : blocked ? "rgba(245,166,35,0.1)" : inputBrd}`, borderRadius: "14px", color: digit ? "#F5A623" : txt1, opacity: blocked ? 0.4 : 1, transition: "all 0.15s" }}
                  />
                ))}
              </div>
            </div>

            {attempts > 0 && !blocked && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "12px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: i < attempts ? "#F5A623" : inputBrd, transition: "background 0.2s" }}/>)}
                <span style={{ color: txt2, fontSize: "11px", marginLeft: "4px" }}>{attempts}/3 tentatives</span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.03)", border: "1px solid rgba(245,166,35,0.1)", borderRadius: "10px", marginBottom: "14px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ color: txt2, fontSize: "11px" }}>Code de test : <strong style={{ color: "#F5A623" }}>123456</strong></span>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: isDark ? "rgba(245,166,35,0.06)" : "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.2)", borderLeft: "3px solid #F5A623", borderRadius: "12px", marginBottom: "14px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
                <span style={{ color: txt1, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            <button onClick={handleVerify} disabled={loading || blocked || code.join("").length < 6} className="tap" style={{
              width: "100%", padding: "16px",
              background: !loading && !blocked && code.join("").length === 6 ? "linear-gradient(135deg,#F5A623,#C8940A)" : inputBg,
              color: !loading && !blocked && code.join("").length === 6 ? "#080812" : txt2,
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "900",
              cursor: !loading && !blocked && code.join("").length === 6 ? "pointer" : "not-allowed",
              boxShadow: !loading && !blocked && code.join("").length === 6 ? "0 8px 28px rgba(245,166,35,0.28)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "12px", transition: "all 0.2s",
            }}>
              {loading
                ? <><div style={{ width: "16px", height: "16px", border: "2px solid rgba(8,8,18,0.2)", borderTopColor: "#080812", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/> Création du compte…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Confirmer et créer mon compte
                  </>
              }
            </button>
            <button onClick={() => { setStep("info"); setCode(["","","","","",""]); setError(""); setAttempts(0); setBlocked(false); }} className="tap" style={{ width: "100%", padding: "13px", background: "transparent", border: `1px solid ${inputBrd}`, borderRadius: "14px", color: txt2, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Modifier les informations
            </button>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: "14px", height: "10px", background: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
            <div style={{ width: "14px", height: "10px", background: "#FCD20F" }}/>
            <div style={{ width: "14px", height: "10px", background: "#009A44", borderRadius: "0 2px 2px 0" }}/>
            <span style={{ color: txt2, fontSize: "10px", marginLeft: "8px", fontWeight: "600" }}>République de Guinée</span>
          </div>
          <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <span style={{ background: "#FE2C55", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "2px 10px", borderRadius: "6px" }}>SEMPYA224</span>
          </a>
        </div>
      </div>
    </div>
  );
}