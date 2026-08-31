"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { VILLES_GUINEE } from "@/lib/villes";
import { YelenLoader } from "@/components/YelenLoader";
import { validerFormatPhoneGuinee, normaliserChiffresPhone, versE164Guinee, filtrerSaisiePhone } from "@/lib/phoneGuinee";
import { AuthSecurityBlockedScreen } from "@/components/security/AuthSecurityBlockedScreen";

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

// Message générique pour l'état bloqué/support_only (chantier Auth
// Security 28/08/2026, voir lib/security/authSecurity.ts) — utilisé
// uniquement pour la garde locale avant l'envoi d'une requête.
function messageBlocageActuel(state: "blocked" | "support_only", retryAfterS: number): string {
  if (state === "support_only") return "Contactez le support pour réactiver l'inscription sur cet appareil.";
  return retryAfterS > 0 ? `Accès temporairement protégé. Réessayez dans ${retryAfterS}s.` : "Accès temporairement protégé. Réessayez dans un instant.";
}

export default function InscriptionCitoyen() {
  const router   = useRouter();
  const { theme } = useTheme();
  const C        = T[theme];
  const isDark   = theme === "dark";

  const [step, setStep]     = useState<"info"|"otp">("info");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false); // micro-animation avant redirection
  const [error, setError]   = useState("");
  // Compte déjà existant à ce numéro — message + lien "Se connecter" dédiés
  // (retour Bryan 09/08/2026, message plus humain qu'une simple erreur).
  const [accountExists, setAccountExists] = useState(false);
  // Demande de récupération de compte déjà en cours (retour Bryan
  // 09/08/2026) — même trace locale que app/login/page.tsx, pour éviter
  // qu'un citoyen recrée un compte par erreur en attendant sa récupération.
  const [recoveryPending, setRecoveryPending] = useState<{ phone: string; submittedAt: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [acceptCGU, setAcceptCGU] = useState(false);
  const [form, setForm]     = useState({ prenom: "", nom: "", phone: "", ville: "" });
  const phoneDigitsNormalized = normaliserChiffresPhone(form.phone);
  const phoneValidation = validerFormatPhoneGuinee(form.phone);
  const phoneErreurVisible = phoneValidation.code === "prefixe_inconnu" || phoneValidation.code === "caracteres_invalides";
  const [code, setCode]     = useState(["","","","","",""]);

  // Anti-bot
  const [challenge, setChallenge]   = useState(CHALLENGES[0]);
  const [chalAnswer, setChalAnswer] = useState("");
  const [chalValid, setChalValid]   = useState(false);
  const [honeypot, setHoneypot]     = useState("");
  // État anti-abus piloté par le serveur (chantier Auth Security
  // 28/08/2026) — remplace l'ancien compteur cosmétique local. Alimenté
  // par le champ `security` renvoyé par /api/citoyen/auth/register.
  const [securityState, setSecurityState] = useState<"normal" | "warning" | "blocked" | "support_only">("normal");
  const [securityRetryAfterS, setSecurityRetryAfterS] = useState(0);
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
    try {
      const raw = localStorage.getItem("yelen224_recuperation_pending");
      if (raw) {
        const parsed = JSON.parse(raw) as { phone: string; submittedAt: number };
        if (parsed?.phone && parsed?.submittedAt) setRecoveryPending(parsed);
      }
    } catch {}
  }, []);

  const dismissRecoveryPending = () => {
    try { localStorage.removeItem("yelen224_recuperation_pending"); } catch {}
    setRecoveryPending(null);
  };

  useEffect(() => {
    setChalValid(chalAnswer.trim() === challenge.a);
  }, [chalAnswer, challenge]);

  // Décompte visuel du blocage — purement informatif : la porte réelle
  // reste vérifiée par le serveur à la prochaine requête.
  useEffect(() => {
    if (securityState !== "blocked" || securityRetryAfterS <= 0) return;
    const t = setTimeout(() => setSecurityRetryAfterS(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [securityState, securityRetryAfterS]);

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
    if (loading) return; // garde anti double-clic
    setError("");
    if (honeypot) { await new Promise(r => setTimeout(r, 2000)); return; }
    if (isBotSpeed()) { setError("Comportement inhabituel détecté. Réessayez normalement."); return; }
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    if (!form.prenom.trim()) { setError("Le prénom est obligatoire."); return; }
    if (!form.nom.trim()) { setError("Le nom est obligatoire."); return; }
    if (!form.ville) { setError("Sélectionnez votre ville."); return; }
    if (!acceptCGU) { setError("Acceptez les conditions d'utilisation pour continuer."); return; }
    if (!chalValid) { setError("Répondez correctement à la question de sécurité."); return; }
    if (!phoneValidation.valide) { setError(phoneValidation.message || "Format de numéro invalide."); return; }

    const fullPhone = versE164Guinee(phoneDigitsNormalized);
    localStorage.setItem("inscription_phone",  fullPhone);
    localStorage.setItem("inscription_prenom", form.prenom.trim());
    localStorage.setItem("inscription_nom",    form.nom.trim());
    localStorage.setItem("inscription_ville",  form.ville);
    setStep("otp");
    setTimeout(() => otpRefs[0].current?.focus(), 300);
  };

  // Vérification 100% serveur (retour Bryan 25/07/2026) — la comparaison
  // client à YELEN224_OTP_SIMULE est retirée, même raisonnement que
  // app/login/page.tsx : /api/citoyen/auth/register revalidait déjà le code
  // en entier côté serveur ("ne fait jamais confiance à un état vérifié
  // déclaré par le client"), le check client était redondant et exposait le
  // code en clair dans le bundle JS.
  const handleVerify = async () => {
    if (loading) return; // garde anti double-clic
    setError("");
    setAccountExists(false);
    if (securityState === "blocked" || securityState === "support_only") { setError(messageBlocageActuel(securityState, securityRetryAfterS)); return; }
    const entered = code.join("");
    // Le bouton reste désactivé tant que les 6 chiffres ne sont pas saisis
    // (voir disabled={... code.join("").length < 6} plus bas) — ce garde-fou
    // ne sert plus qu'à ignorer un Entrée prématuré, jamais à afficher un
    // message (retour Bryan 09/08/2026 : bandeau perçu comme "faux").
    if (entered.length < 6) return;
    setLoading(true);
    try {
      const phone  = localStorage.getItem("inscription_phone");
      const prenom = localStorage.getItem("inscription_prenom");
      const nom    = localStorage.getItem("inscription_nom");
      const ville  = localStorage.getItem("inscription_ville");
      const res  = await fetch("/api/citoyen/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: entered, prenom, nom, ...(ville ? { ville } : {}) }),
      });
      const json = await res.json();
      if (json.security?.state) { setSecurityState(json.security.state); setSecurityRetryAfterS(json.security.retryAfterS || 0); }

      if (res.status === 423) {
        setError(json.error || "Accès temporairement protégé.");
        setCode(["","","","","",""]);
        return;
      }

      if (!res.ok || !json.success) {
        if (json.code === "ALREADY_REGISTERED") { setError("Un compte existe déjà avec ce numéro."); setAccountExists(true); return; }
        if (json.code === "INVALID_CODE") {
          setError(json.error || "Code incorrect.");
          setCode(["","","","","",""]); setTimeout(() => otpRefs[0].current?.focus(), 100);
          return;
        }
        setError("Erreur création compte.");
        return;
      }

      if (!json.tokenHash) {
        setError("Impossible d'établir une session sécurisée. Réessayez.");
        return;
      }
      const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: "email" });
      if (sessionError) {
        setError("Impossible d'établir une session sécurisée. Réessayez.");
        return;
      }

      ["inscription_phone","inscription_prenom","inscription_nom","inscription_ville"].forEach(k => localStorage.removeItem(k));
      localStorage.setItem(YELEN224_USER_ID_KEY, json.userId);

      // Micro-animation de succès avant redirection (retour CEO 23/07/2026)
      setSuccess(true);
      await new Promise(r => setTimeout(r, 550));
      router.push("/?welcome=1");
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

  const canSubmit = chalValid && acceptCGU && securityState !== "blocked" && securityState !== "support_only" && !loading && phoneValidation.valide;

  // ── Tokens thème auto ─────────────────────────────────────────────────────
  const inputBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const inputBrd = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const txt1 = isDark ? "#F0EEE8" : "#0d0d1a";
  const txt2 = isDark ? "#6E6E7A" : "#6C6C70";
  const txt3 = isDark ? "#333345" : "#bbb";
  // Bandeaux d'erreur — rouge dédié, le doré reste réservé à la marque/aux
  // actions (retour Bryan 09/08/2026, même correctif que app/login/page.tsx).
  const errBg   = isDark ? "rgba(239,68,68,0.14)" : "#FEE2E2";
  const errBrd  = "#ef4444";
  const errText = isDark ? "#FCA5A5" : "#991B1B";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: C.pageBg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif", color: txt1, overflowX: "hidden", transition: "background-color 0.3s" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{background:${C.pageBg};overflow-x:hidden;transition:background-color 0.3s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glowPulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes popIn{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
        .tap{transition:opacity .1s,transform .1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:.7;transform:scale(.97)}
        input::placeholder{color:${txt3}}
        input:focus,select:focus{border-color:${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}!important;outline:none}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        select option{background:${isDark ? "#12121F" : "#fff"};color:${txt1}}
        .otp-box:focus{border-color:${isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"}!important}
        .pop-in{animation:popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)}
        .step-in{animation:fadeUp 0.3s ease}
      `}</style>

      {/* ── HEADER TIKTOK YELEN ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        backgroundColor: scrolled ? (isDark ? "rgba(8,8,15,0.97)" : "rgba(248,248,251,0.97)") : "transparent",
        backdropFilter: scrolled ? "blur(24px)" : "none",
        borderBottom: scrolled ? `1px solid ${isDark ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.12)"}` : "none",
        transition: "all 0.3s",
        paddingTop: "calc(13px + env(safe-area-inset-top))", paddingBottom: "13px", paddingLeft: "20px", paddingRight: "20px",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}>
        <Link href="/login" className="tap" style={{ color: "#080812", fontSize: "12px", fontWeight: "800", textDecoration: "none", padding: "7px 14px", borderRadius: "20px", background: "#F5A623" }}>
          Connexion
        </Link>
      </header>

      {/* ── HERO ── */}
      <div style={{ position: "relative", height: "220px", background: isDark ? "linear-gradient(160deg,#0F0E1A 0%,#110F1E 60%,#1A1008 100%)" : "#F5A623", overflow: "hidden" }}>
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

        {(securityState === "blocked" || securityState === "support_only") ? (
          <AuthSecurityBlockedScreen state={securityState} retryAfterS={securityRetryAfterS} dark={isDark} onExpire={() => setSecurityState("normal")} />
        ) : (
        <>
        {recoveryPending && step === "info" && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", backgroundColor: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.25)", borderLeft: "3px solid #F5A623", borderRadius: "12px", marginBottom: "18px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: txt1, fontSize: "12.5px", fontWeight: "700", lineHeight: 1.5 }}>
                Une demande de récupération pour {recoveryPending.phone} est déjà en cours (envoyée le {new Date(recoveryPending.submittedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}). Inutile de créer un nouveau compte — un admin la traite sous 48h.
              </div>
            </div>
            <button onClick={dismissRecoveryPending} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", color: txt2, cursor: "pointer", padding: "2px", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {step === "info" && (
          <div key="info" className="step-in">
            {/* Prénom + Nom */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              {[{ key: "prenom", label: "Prénom", ph: "Mamadou" }, { key: "nom", label: "Nom", ph: "Diallo" }].map(f => (
                <div key={f.key}>
                  <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>{f.label} *</div>
                  <input
                    value={form[f.key as "prenom" | "nom"]}
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
              <div style={{ display: "flex", gap: "8px", border: `1px solid ${phoneErreurVisible ? errBrd : inputBrd}`, borderRadius: "14px", overflow: "hidden", transition: "border-color 0.2s" }}>
                <div style={{ background: inputBg, padding: "13px 14px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, borderRight: `1px solid ${inputBrd}` }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623" }}/>
                  <span style={{ color: "#F5A623", fontSize: "14px", fontWeight: "800" }}>+224</span>
                </div>
                <input
                  type="tel" value={form.phone}
                  onChange={e => {
                    const raw = filtrerSaisiePhone(e.target.value);
                    // Plafond à 10 chiffres : 9 chiffres réels + 1 "0" initial toléré.
                    if (raw.replace(/\s/g, "").length <= 10) fc("phone", raw);
                    onKey();
                  }}
                  onKeyDown={e => { onKey(); if (e.key === "Enter") handleSubmitInfo(); }}
                  placeholder="620 000 000"
                  style={{ flex: 1, background: "transparent", border: "none", padding: "13px 14px", color: txt1, fontSize: "15px", fontWeight: "600", letterSpacing: "0.5px" }}
                />
              </div>
              <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px", color: phoneErreurVisible ? errBrd : (phoneValidation.valide ? "#F5A623" : txt2), fontSize: "11px", marginTop: "6px", fontWeight: "600" }}>
                {phoneErreurVisible ? phoneValidation.message : (phoneValidation.valide ? "Numéro valide" : `${phoneDigitsNormalized.length} / 9 chiffres`)}
              </p>
            </div>

            {/* Ville */}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Ville *</div>
              <div style={{ display: "flex", border: `1px solid ${inputBrd}`, borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ background: inputBg, padding: "13px 14px", display: "flex", alignItems: "center", flexShrink: 0, borderRight: `1px solid ${inputBrd}`, color: txt2 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ position: "relative", flex: 1 }}>
                  <select
                    value={form.ville}
                    onChange={e => fc("ville", e.target.value)}
                    style={{ width: "100%", background: "transparent", border: "none", padding: "13px 34px 13px 14px", color: form.ville ? txt1 : txt2, fontSize: "14px", fontWeight: "600", appearance: "none", cursor: "pointer" }}
                  >
                    <option value="">Sélectionner votre ville</option>
                    {VILLES_GUINEE.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: txt2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Challenge */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "7px" }}>Vérification de sécurité *</div>
              <div style={{ background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: "14px", padding: "13px 16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: txt2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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
                    ? <svg key="valid" className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
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
                J&apos;accepte les{" "}
                <Link href="/cgu" onClick={e => e.stopPropagation()} style={{ color: "#F5A623", textDecoration: "none", fontWeight: "700" }}>Conditions d&apos;utilisation</Link>
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
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            <button onClick={handleSubmitInfo} disabled={!canSubmit} className="tap" style={{
              width: "100%", padding: "16px",
              background: canSubmit ? "#F5A623" : inputBg,
              color: canSubmit ? "#080812" : txt2,
              border: canSubmit ? "none" : `1px solid ${inputBrd}`,
              borderRadius: "16px", fontSize: "15px", fontWeight: "900",
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "14px", transition: "all 0.2s",
            }}>
              {loading
                ? <><YelenLoader size={16} color="#080812"/> Vérification…</>
                : <>Continuer <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg></>
              }
            </button>
            <div style={{ textAlign: "center" }}>
              <span style={{ color: txt2, fontSize: "13px" }}>Déjà un compte ? </span>
              <Link href="/login" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none", fontSize: "13px" }}>Se connecter</Link>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div key="otp" className="step-in">
            {/* Récap profil */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: isDark ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.18)", borderRadius: "16px", marginBottom: "22px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "900", color: "#080812", flexShrink: 0 }}>
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

            {/* OTP inputs */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ color: txt2, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Code à 6 chiffres</div>
              <div style={{ display: "flex", gap: "9px", justifyContent: "center" }}>
                {code.map((digit, i) => (
                  <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="otp-box"
                    style={{ width: "46px", height: "56px", textAlign: "center", fontSize: "22px", fontWeight: "900", background: digit ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : inputBg, border: `2px solid ${digit ? txt1 : inputBrd}`, borderRadius: "14px", color: txt1, transition: "all 0.15s" }}
                  />
                ))}
              </div>
            </div>

            {securityState === "warning" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px", padding: "8px 12px", background: isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "10px" }}>
                <span style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: "700" }}>Plusieurs tentatives détectées — quelques essais restants avant blocage temporaire.</span>
              </div>
            )}

            {/* Indice de code retiré (retour Bryan 25/07/2026) — affichait le
                code en clair à l'écran. */}

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: errBg, border: `1px solid ${errBrd}`, borderLeft: `3px solid ${errBrd}`, borderRadius: "12px", marginBottom: "14px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={errBrd} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
                <span style={{ color: errText, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}
            {accountExists && (
              <div style={{ textAlign: "center", marginTop: "-6px", marginBottom: "14px" }}>
                <Link href="/login" style={{ color: "#F5A623", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}>Se connecter avec ce numéro →</Link>
              </div>
            )}

            <button onClick={handleVerify} disabled={loading || code.join("").length < 6} className="tap" style={{
              width: "100%", padding: "16px",
              background: success ? "#22c55e" : !loading && code.join("").length === 6 ? "#F5A623" : inputBg,
              color: success ? "#fff" : !loading && code.join("").length === 6 ? "#080812" : txt2,
              border: "none", borderRadius: "16px", fontSize: "15px", fontWeight: "900",
              cursor: !loading && code.join("").length === 6 ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              marginBottom: "12px", transition: "background 0.25s",
            }}>
              {success
                ? <><svg className="pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Compte créé !</>
                : loading
                ? <><YelenLoader size={16} color="#080812"/> Création du compte…</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Confirmer et créer mon compte
                  </>
              }
            </button>
            <button onClick={() => { setStep("info"); setCode(["","","","","",""]); setError(""); }} className="tap" style={{ width: "100%", padding: "13px", background: "transparent", border: `1px solid ${inputBrd}`, borderRadius: "14px", color: txt2, fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              Modifier les informations
            </button>
          </div>
        )}
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