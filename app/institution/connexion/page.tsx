"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════
const C = {
  gold:    "#F5A623",
  goldD:   "#C8940A",
  goldL:   "#FDE68A",
  goldBg:  "#FFFBEB",
  goldBg2: "#FEF3C7",
  bg:      "#FFFBEB",
  white:   "#FFFFFF",
  dark:    "#1C1400",
  dark2:   "#3D2E00",
  gray:    "#92836A",
  gray2:   "#C4B896",
  gray3:   "#EDE8D8",
  red:     "#DC2626",
  redL:    "#FEF2F2",
  green:   "#16A34A",
  greenL:  "#F0FDF4",
  border:  "rgba(245,166,35,0.2)",
  shadow:  "0 4px 24px rgba(245,166,35,0.15)",
  shadow2: "0 20px 60px rgba(245,166,35,0.2)",
};

// ═══════════════════════════════════════════════════════════
// DEV CONFIG — retirer avant mise en prod
// ═══════════════════════════════════════════════════════════
const DEV_MODE = true;          // ← passer à false en production
const DEV_OTP  = "123456";      // ← code fictif accepté en dev

// ═══════════════════════════════════════════════════════════
// SECURITY: Math Challenge
// ═══════════════════════════════════════════════════════════
function generateChallenge() {
  const ops = [
    { q: () => { const a = Math.floor(Math.random()*20+5), b = Math.floor(Math.random()*15+3); return { q: `${a} + ${b}`, a: String(a+b) }; } },
    { q: () => { const a = Math.floor(Math.random()*20+15), b = Math.floor(Math.random()*10+2); return { q: `${a} - ${b}`, a: String(a-b) }; } },
    { q: () => { const a = Math.floor(Math.random()*8+2), b = Math.floor(Math.random()*6+2); return { q: `${a} × ${b}`, a: String(a*b) }; } },
    { q: () => { const b = [2,3,4,5][Math.floor(Math.random()*4)], a = b * Math.floor(Math.random()*8+2); return { q: `${a} ÷ ${b}`, a: String(a/b) }; } },
  ];
  return ops[Math.floor(Math.random()*ops.length)].q();
}

type InstPreview = {
  id: string;
  name: string;
  category: string;
  ville: string;
  logo: string | null;
  badge_verifie: boolean;
  moyenne_avis: number;
  nb_avis: number;
  phone: string;
};

type Step = "phone" | "preview" | "otp" | "success";

export default function InstitutionConnexion() {
  const router = useRouter();
  const [step, setStep]         = useState<Step>("phone");
  const [phone, setPhone]       = useState("");
  const [otp, setOtp]           = useState(["","","","","",""]);
  const [inst, setInst]         = useState<InstPreview | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked]   = useState(false);
  const [blockEnd, setBlockEnd] = useState<number>(0);
  const [timer, setTimer]       = useState(0);
  const [resendTimer, setResendTimer] = useState(0);
  const [challenge, setChallenge]     = useState(generateChallenge);
  const [chalAns, setChalAns]         = useState("");
  const [chalOk, setChalOk]           = useState(false);
  const otpRefs = useRef<(HTMLInputElement|null)[]>([]);
  const intervalRef = useRef<NodeJS.Timeout>();

  // Timer bloquage
  useEffect(() => {
    if (!blocked) return;
    intervalRef.current = setInterval(() => {
      const left = Math.ceil((blockEnd - Date.now()) / 1000);
      if (left <= 0) { setBlocked(false); setTimer(0); clearInterval(intervalRef.current); }
      else setTimer(left);
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [blocked, blockEnd]);

  // Timer renvoi
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer(v => Math.max(v-1, 0)), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  useEffect(() => {
    setChalOk(chalAns.trim() === challenge.a);
  }, [chalAns, challenge]);

  // ── ÉTAPE 1 : Chercher institution par numéro ──
  async function handlePhoneSubmit() {
    setError("");
    if (blocked) { setError(`Trop de tentatives. Attendez ${timer}s.`); return; }
    const cleaned = phone.replace(/[\s\-]/g, "");
    if (!cleaned || cleaned.length < 8) { setError("Numéro invalide (minimum 8 chiffres)."); return; }
    if (!chalOk) { setError("Répondez correctement à la question de sécurité."); return; }

    setLoading(true);
    const fullPhone = "+224" + cleaned.replace(/^0/, "");

    const { data, error: dbErr } = await supabase
      .from("institutions")
      .select("id,name,category,ville,logo,badge_verifie,moyenne_avis,nb_avis,phone")
      .eq("phone", fullPhone)
      .maybeSingle();

    if (dbErr || !data) {
      const n = attempts + 1;
      setAttempts(n);
      if (n >= 5) {
        setBlocked(true);
        setBlockEnd(Date.now() + 5 * 60 * 1000);
        setTimer(300);
        setError("Trop de tentatives. Bloqué 5 minutes.");
      } else {
        setError(`Aucun compte trouvé pour ce numéro. ${5-n} tentative(s) restante(s).`);
      }
      setChallenge(generateChallenge());
      setChalAns("");
      setLoading(false);
      return;
    }

    setInst(data as InstPreview);
    localStorage.setItem("yelen_inst_phone", fullPhone);
    setStep("preview");
    setLoading(false);
  }

  // ── ÉTAPE 2 : Envoyer OTP ──
  async function handleSendOtp() {
    setLoading(true);
    setError("");

    if (DEV_MODE) {
      // ─── MODE DEV : pas de vrai SMS, juste simuler l'envoi ───
      // On insère quand même un enregistrement fictif en DB pour cohérence
      await supabase.from("institution_otp").insert({
        phone: inst!.phone,
        code: DEV_OTP,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).maybeSingle(); // ignore l'erreur si RLS bloque

      setStep("otp");
      setResendTimer(60);
      setSuccess(`[DEV] Code fictif : ${DEV_OTP} — SMS désactivé`);
      setLoading(false);
      return;
    }

    // ─── MODE PROD : vraie fonction RPC + NIMBA SMS ───
    try {
      const { data, error: fnErr } = await supabase
        .rpc("generate_institution_otp", { p_phone: inst!.phone });

      if (fnErr) {
        if (fnErr.message.includes("RATE_LIMIT")) {
          setError("Trop de demandes SMS. Attendez 1 heure.");
        } else {
          setError("Erreur envoi. Réessayez.");
        }
        setLoading(false);
        return;
      }

      setStep("otp");
      setResendTimer(60);
      setSuccess(`Code envoyé au ${inst!.phone}`);
    } catch {
      setError("Erreur réseau.");
    }
    setLoading(false);
  }

  // ── ÉTAPE 3 : Vérifier OTP ──
  async function handleVerifyOtp() {
    const code = otp.join("");
    if (code.length < 6) { setError("Entrez les 6 chiffres."); return; }
    if (blocked) { setError(`Bloqué. Attendez ${timer}s.`); return; }

    setLoading(true);
    setError("");

    // ─── MODE DEV : accepter 123456 directement ───
    if (DEV_MODE && code === DEV_OTP) {
      await _createSession();
      return;
    }

    // ─── Vérification en DB (fonctionne aussi en dev si le code réel est saisi) ───
    try {
      // Chercher l'OTP le plus récent valide pour ce numéro
      const { data: otpRow, error: otpErr } = await supabase
        .from("institution_otp")
        .select("id, code, expires_at")
        .eq("phone", inst!.phone)
        .eq("code", code)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpErr || !otpRow) {
        // Essayer aussi via RPC si elle existe
        const { data: valid, error: fnErr } = await supabase
          .rpc("verify_institution_otp", { p_phone: inst!.phone, p_code: code });

        if (fnErr?.message?.includes("MAX_ATTEMPTS")) {
          setBlocked(true);
          setBlockEnd(Date.now() + 5 * 60 * 1000);
          setTimer(300);
          setError("Code invalidé après 5 tentatives. Demandez un nouveau code.");
          setLoading(false);
          return;
        }

        if (!valid) {
          const n = attempts + 1;
          setAttempts(n);
          if (n >= 3) {
            setBlocked(true);
            setBlockEnd(Date.now() + 5 * 60 * 1000);
            setTimer(300);
            setError("Trop d'erreurs. Bloqué 5 minutes.");
          } else {
            setError(`Code incorrect. ${3-n} tentative(s) restante(s).`);
          }
          setLoading(false);
          return;
        }

        await _createSession();
        return;
      }

      // OTP trouvé directement en DB ✅
      // Supprimer l'OTP utilisé
      await supabase.from("institution_otp").delete().eq("id", otpRow.id);
      await _createSession();

    } catch {
      setError("Erreur réseau.");
      setLoading(false);
    }
  }

  // ── Session creation (shared between dev + prod) ──
  async function _createSession() {
    localStorage.setItem("yelen224_institution_id", inst!.id);
    localStorage.setItem("yelen224_inst_name", inst!.name);
    localStorage.setItem("yelen224_inst_auth", "true");
    localStorage.setItem("yelen224_inst_auth_ts", String(Date.now()));

    // Log session (best effort)
    await supabase.from("institution_sessions").insert({
      institution_id: inst!.id,
      phone: inst!.phone,
      user_agent: navigator.userAgent,
      is_active: true,
    }).maybeSingle();

    setStep("success");
    setTimeout(() => router.push(`/institution/${inst!.id}/dashboard`), 1500);
  }

  // OTP input handlers
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const n = [...otp]; n[i] = val.slice(-1); setOtp(n);
    if (val && i < 5) otpRefs.current[i+1]?.focus();
    if (n.every(d => d) && n.join("").length === 6) setTimeout(handleVerifyOtp, 200);
  };
  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i-1]?.focus();
  };

  // ── CSS ──
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    html,body{background:${C.goldBg};overflow-x:hidden}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
    @keyframes successPop{0%{transform:scale(0.8)}60%{transform:scale(1.1)}100%{transform:scale(1)}}
    .tap{transition:opacity .12s,transform .12s;cursor:pointer;touch-action:manipulation;user-select:none}
    .tap:active{opacity:.75;transform:scale(.97)}
    input::placeholder{color:${C.gray2}}
    .inp:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.12)!important;outline:none}
    .otp-inp:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(245,166,35,0.15)!important;outline:none}
    .card-hover{transition:transform 0.2s,box-shadow 0.2s}
    .card-hover:hover{transform:translateY(-2px);box-shadow:${C.shadow2}}
  `;

  const Spinner = () => (
    <div style={{ width: "18px", height: "18px", border: "2.5px solid rgba(28,20,0,0.2)", borderTopColor: C.dark, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }}/>
  );

  return (
    <div style={{ minHeight: "100svh", background: `linear-gradient(160deg, ${C.goldBg} 0%, ${C.goldBg2} 50%, #FFF7E6 100%)`, fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", color: C.dark }}>
      <style>{css}</style>

      {/* Motif décoratif */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: `radial-gradient(${C.gold}12 1px, transparent 1px)`, backgroundSize: "28px 28px", pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "fixed", top: "-100px", right: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: `radial-gradient(circle, ${C.gold}18 0%, transparent 65%)`, pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "fixed", bottom: "-80px", left: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: `radial-gradient(circle, ${C.gold}10 0%, transparent 65%)`, pointerEvents: "none", zIndex: 0 }}/>

      {/* HEADER */}
      <header style={{ position: "relative", zIndex: 10, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, backgroundColor: "rgba(255,251,235,0.8)", backdropFilter: "blur(20px)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div style={{ width: "36px", height: "36px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${C.gold}40` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ color: C.dark, fontSize: "15px", fontWeight: "900", letterSpacing: "0.5px", lineHeight: 1 }}>YELEN224</div>
            <div style={{ color: C.gold, fontSize: "9px", fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase" }}>Espace Institution</div>
          </div>
        </Link>
        <Link href="/institution/inscription" className="tap" style={{ color: C.dark, fontSize: "13px", fontWeight: "700", textDecoration: "none", padding: "8px 16px", borderRadius: "20px", border: `1.5px solid ${C.gold}`, backgroundColor: "transparent" }}>
          S'inscrire
        </Link>
      </header>

      {/* CONTENU */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "440px", margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* ═══ STEP: PHONE ═══ */}
        {step === "phone" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: `linear-gradient(135deg, ${C.gold}25, ${C.gold}10)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: C.shadow }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                  <path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/>
                </svg>
              </div>
              <h1 style={{ color: C.dark, fontSize: "26px", fontWeight: "900", letterSpacing: "-0.6px", marginBottom: "6px" }}>Connexion</h1>
              <p style={{ color: C.gray, fontSize: "14px", lineHeight: 1.6 }}>Accédez à votre tableau de bord institution YELEN224</p>
              {DEV_MODE && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "10px", padding: "5px 12px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderRadius: "20px" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{ color: "#856404", fontSize: "10px", fontWeight: "800" }}>MODE DEV — SMS désactivé</span>
                </div>
              )}
            </div>

            {/* Champ téléphone */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: C.dark2, fontSize: "11px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Numéro de téléphone</label>
              <div style={{ display: "flex", borderRadius: "14px", border: `1.5px solid ${C.border}`, overflow: "hidden", backgroundColor: C.white, boxShadow: "0 2px 8px rgba(245,166,35,0.08)" }}>
                <div style={{ padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", borderRight: `1.5px solid ${C.border}`, backgroundColor: C.goldBg2, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 0 }}>
                    <div style={{ width: "8px", height: "6px", background: "#CE1126", borderRadius: "1px 0 0 1px" }}/>
                    <div style={{ width: "8px", height: "6px", background: "#FCD20F" }}/>
                    <div style={{ width: "8px", height: "6px", background: "#009A44", borderRadius: "0 1px 1px 0" }}/>
                  </div>
                  <span style={{ color: C.gold, fontSize: "15px", fontWeight: "900" }}>+224</span>
                </div>
                <input
                  className="inp"
                  type="tel"
                  placeholder="620 000 000"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
                  style={{ flex: 1, padding: "15px 16px", fontSize: "17px", fontWeight: "700", letterSpacing: "1.5px", border: "none", background: "transparent", color: C.dark, transition: "all 0.2s" }}
                  autoFocus
                />
              </div>
            </div>

            {/* Challenge math */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ color: C.dark2, fontSize: "11px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Vérification de sécurité</label>
              <div style={{ backgroundColor: C.goldBg2, border: `1.5px solid ${C.gold}30`, borderRadius: "12px", padding: "12px 16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${C.gold}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <span style={{ color: C.dark, fontSize: "15px", fontWeight: "700" }}>Combien font <strong style={{ color: C.gold }}>{challenge.q}</strong> ?</span>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  className="inp"
                  type="number"
                  placeholder="Votre réponse…"
                  value={chalAns}
                  onChange={e => setChalAns(e.target.value)}
                  style={{ width: "100%", padding: "13px 46px 13px 16px", borderRadius: "12px", border: `1.5px solid ${chalOk ? C.gold : C.border}`, backgroundColor: chalOk ? `${C.gold}08` : C.white, color: C.dark, fontSize: "15px", fontWeight: "600", transition: "all 0.2s" }}
                />
                <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
                  {chalOk
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gray2} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  }
                </div>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span style={{ color: C.red, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            {/* Bloquage */}
            {blocked && (
              <div style={{ padding: "14px 16px", backgroundColor: `${C.gold}10`, border: `1px solid ${C.gold}30`, borderRadius: "12px", marginBottom: "16px" }}>
                <div style={{ color: C.dark, fontSize: "12px", fontWeight: "800", marginBottom: "6px" }}>Accès temporairement bloqué — {timer}s</div>
                <div style={{ height: "4px", backgroundColor: C.gray3, borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", backgroundColor: C.gold, borderRadius: "2px", width: `${(timer/300)*100}%`, transition: "width 1s linear" }}/>
                </div>
              </div>
            )}

            <button
              onClick={handlePhoneSubmit}
              disabled={loading || blocked || !chalOk}
              className="tap"
              style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: loading || blocked || !chalOk ? C.gray3 : `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: loading || blocked || !chalOk ? C.gray : C.dark, fontSize: "16px", fontWeight: "800", cursor: loading || blocked || !chalOk ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: !loading && !blocked && chalOk ? `0 8px 24px ${C.gold}40` : "none", transition: "all 0.2s", letterSpacing: "-0.2px" }}
            >
              {loading ? <><Spinner/> Recherche…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Trouver mon institution
              </>}
            </button>

            <div style={{ textAlign: "center", marginTop: "20px", color: C.gray, fontSize: "13px" }}>
              Pas encore inscrit ?{" "}
              <Link href="/institution/inscription" style={{ color: C.gold, fontWeight: "700", textDecoration: "none" }}>Créer un compte</Link>
            </div>
          </div>
        )}

        {/* ═══ STEP: PREVIEW INSTITUTION ═══ */}
        {step === "preview" && inst && (
          <div style={{ animation: "scaleIn 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "20px", marginBottom: "16px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ color: C.green, fontSize: "12px", fontWeight: "800" }}>Institution trouvée</span>
              </div>
              <h2 style={{ color: C.dark, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.4px" }}>Confirmer l'identité</h2>
              <p style={{ color: C.gray, fontSize: "13px", marginTop: "4px" }}>Vérifiez que c'est bien votre institution</p>
            </div>

            {/* Card institution */}
            <div className="card-hover" style={{ backgroundColor: C.white, borderRadius: "20px", padding: "20px", border: `2px solid ${C.gold}30`, boxShadow: C.shadow, marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                {inst.logo ? (
                  <img src={inst.logo} alt={inst.name} style={{ width: "64px", height: "64px", borderRadius: "16px", objectFit: "cover", border: `2px solid ${C.gold}30`, flexShrink: 0 }}/>
                ) : (
                  <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, border: `2px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: C.gold, fontSize: "24px", fontWeight: "900" }}>{inst.name.slice(0,2).toUpperCase()}</span>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ color: C.dark, fontSize: "18px", fontWeight: "900" }}>{inst.name}</span>
                    {inst.badge_verifie && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", backgroundColor: C.greenL, color: C.green, fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "10px" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Vérifié
                      </div>
                    )}
                  </div>
                  <div style={{ color: C.gray, fontSize: "13px", marginTop: "2px" }}>{inst.category}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.gray} strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: C.gray, fontSize: "12px" }}>{inst.ville}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "14px", backgroundColor: C.goldBg, borderRadius: "14px" }}>
                {[
                  { label: "Note", value: inst.moyenne_avis > 0 ? inst.moyenne_avis.toFixed(1) : "—" },
                  { label: "Avis", value: String(inst.nb_avis || 0) },
                  { label: "Statut", value: inst.badge_verifie ? "Vérifié" : "Standard" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "900", color: C.dark }}>{s.value}</div>
                    <div style={{ fontSize: "10px", color: C.gray, marginTop: "2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Numéro masqué */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.goldBg2, border: `1px solid ${C.gold}30`, borderRadius: "12px", marginBottom: "20px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.dark, fontSize: "13px", fontWeight: "700" }}>
                  {DEV_MODE
                    ? `[DEV] Code fictif → ${DEV_OTP} (pas de SMS envoyé)`
                    : `Code envoyé au ${inst.phone.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4")}`
                  }
                </div>
                <div style={{ color: C.gray, fontSize: "11px" }}>
                  {DEV_MODE ? "Intégration NIMBA SMS à venir" : "Via SMS sécurisé YELEN224"}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span style={{ color: C.red, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setStep("phone"); setInst(null); setError(""); setChallenge(generateChallenge()); setChalAns(""); }}
                className="tap"
                style={{ flex: 1, padding: "14px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "transparent", color: C.gray, fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
                ← Retour
              </button>
              <button onClick={handleSendOtp} disabled={loading} className="tap"
                style={{ flex: 2, padding: "14px", borderRadius: "12px", border: "none", background: loading ? C.gray3 : `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: loading ? C.gray : C.dark, fontSize: "14px", fontWeight: "800", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: !loading ? `0 6px 20px ${C.gold}40` : "none" }}>
                {loading ? <><Spinner/> Simulation…</> : <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  {DEV_MODE ? "Simuler l'envoi du code" : "Envoyer le code SMS"}
                </>}
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP: OTP ═══ */}
        {step === "otp" && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ width: "68px", height: "68px", borderRadius: "20px", background: `linear-gradient(135deg, ${C.gold}20, ${C.gold}08)`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: C.shadow }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
              <h2 style={{ color: C.dark, fontSize: "22px", fontWeight: "900", marginBottom: "6px" }}>Code de vérification</h2>
              <p style={{ color: C.gray, fontSize: "13px" }}>
                {DEV_MODE
                  ? <>Entrez le code fictif <strong style={{ color: C.gold, fontSize: "16px", letterSpacing: "2px" }}>{DEV_OTP}</strong></>
                  : <>Entrez le code à 6 chiffres envoyé au<br/><strong style={{ color: C.dark }}>{inst?.phone.replace(/(\+224)(\d{2})(\d{3})(\d{4})/, "$1 $2•••$4")}</strong></>
                }
              </p>
            </div>

            {/* Bannière DEV */}
            {DEV_MODE && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: "#FFF3CD", border: "1px solid #FFC107", borderLeft: "3px solid #FFC107", borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div>
                  <div style={{ color: "#856404", fontSize: "12px", fontWeight: "800" }}>Mode développement</div>
                  <div style={{ color: "#856404", fontSize: "11px" }}>Code accepté : <strong style={{ letterSpacing: "1px" }}>{DEV_OTP}</strong> — Aucun SMS envoyé</div>
                </div>
              </div>
            )}

            {success && !DEV_MODE && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ color: C.green, fontSize: "13px", fontWeight: "600" }}>{success}</span>
              </div>
            )}

            {/* OTP inputs */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  className="otp-inp"
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  style={{ width: "52px", height: "62px", textAlign: "center", fontSize: "24px", fontWeight: "800", backgroundColor: d ? `${C.gold}12` : C.white, border: `2px solid ${d ? C.gold : C.border}`, borderRadius: "14px", color: C.dark, transition: "all 0.15s" }}
                />
              ))}
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", marginBottom: "16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span style={{ color: C.red, fontSize: "13px", fontWeight: "600" }}>{error}</span>
              </div>
            )}

            <button onClick={handleVerifyOtp} disabled={loading || otp.join("").length < 6} className="tap"
              style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: loading || otp.join("").length < 6 ? C.gray3 : `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: loading || otp.join("").length < 6 ? C.gray : C.dark, fontSize: "16px", fontWeight: "800", cursor: loading || otp.join("").length < 6 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: !loading && otp.join("").length === 6 ? `0 8px 24px ${C.gold}40` : "none", marginBottom: "14px" }}>
              {loading ? <><Spinner/> Vérification…</> : <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Confirmer le code
              </>}
            </button>

            <div style={{ textAlign: "center" }}>
              {resendTimer > 0 ? (
                <span style={{ color: C.gray, fontSize: "13px" }}>Renvoyer dans {resendTimer}s</span>
              ) : (
                <button onClick={handleSendOtp} className="tap" style={{ background: "none", border: "none", color: C.gold, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  {DEV_MODE ? "Re-simuler l'envoi" : "Renvoyer le code"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP: SUCCESS ═══ */}
        {step === "success" && (
          <div style={{ textAlign: "center", animation: "fadeUp 0.3s ease", padding: "40px 0" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "successPop 0.5s ease", boxShadow: `0 12px 32px ${C.gold}50` }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ color: C.dark, fontSize: "24px", fontWeight: "900", marginBottom: "8px" }}>Connexion réussie !</h2>
            <p style={{ color: C.gray, fontSize: "14px" }}>Redirection vers votre dashboard…</p>
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "24px", height: "24px", border: `3px solid ${C.gold}30`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}